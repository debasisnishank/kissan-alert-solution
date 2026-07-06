import { execute, query, queryOne } from "$db/client.ts";
import type { AdvisoryMessage, Alert } from "$utils/types.ts";
import { onAlertCreated } from "$lib/farm-events.ts";

interface AlertRow {
  id: string;
  tenant_id: string;
  farm_id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  confidence: number | null;
  trigger_data: Record<string, unknown> | null;
  status: string;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    farmId: row.farm_id,
    type: row.type as Alert["type"],
    severity: row.severity as Alert["severity"],
    title: row.title,
    description: row.description,
    confidence: row.confidence ?? undefined,
    triggerData: row.trigger_data ?? undefined,
    status: row.status as Alert["status"],
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAlert(data: {
  tenantId: string;
  farmId: string;
  type: Alert["type"];
  severity: Alert["severity"];
  title: string;
  description: string;
  confidence?: number;
  triggerData?: Record<string, unknown>;
  expiresAt?: Date;
}): Promise<Alert> {
  const result = await queryOne<{ id: string }>(
    `INSERT INTO alerts (
      tenant_id, farm_id, type, severity, title, description,
      confidence, trigger_data, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      data.tenantId,
      data.farmId,
      data.type,
      data.severity,
      data.title,
      data.description,
      data.confidence ?? null,
      data.triggerData ? JSON.stringify(data.triggerData) : null,
      data.expiresAt ?? null,
    ],
  );

  if (!result) throw new Error("Failed to create alert");

  const alert = await getAlertById(result.id, data.tenantId);
  if (!alert) throw new Error("Failed to fetch created alert");

  // Auto-notify farm owner (non-blocking)
  onAlertCreated(data.farmId, {
    type: data.type,
    severity: data.severity,
    title: data.title,
    description: data.description,
  }).catch(() => {});

  return alert;
}

export async function getAlertById(
  id: string,
  tenantId: string,
): Promise<Alert | null> {
  const result = await queryOne<AlertRow>(
    `SELECT id, tenant_id, farm_id, type, severity, title, description,
            confidence, trigger_data, status, expires_at, created_at, updated_at
     FROM alerts WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (!result) return null;
  return rowToAlert(result);
}

export async function getAlertsByFarm(
  farmId: string,
  tenantId: string,
  options: {
    status?: Alert["status"];
    type?: Alert["type"];
    limit?: number;
  } = {},
): Promise<Alert[]> {
  const { status, type, limit = 50 } = options;

  let whereClause = "farm_id = $1 AND tenant_id = $2";
  const params: unknown[] = [farmId, tenantId];

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }
  if (type) {
    params.push(type);
    whereClause += ` AND type = $${params.length}`;
  }

  // Filter out expired alerts
  whereClause += ` AND (expires_at IS NULL OR expires_at > NOW())`;

  params.push(limit);

  const results = await query<AlertRow>(
    `SELECT id, tenant_id, farm_id, type, severity, title, description,
            confidence, trigger_data, status, expires_at, created_at, updated_at
     FROM alerts WHERE ${whereClause}
     ORDER BY 
       CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return results.map(rowToAlert);
}

export async function getActiveAlertsByTenant(
  tenantId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{ alerts: Alert[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  const [countResult, results] = await Promise.all([
    queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM alerts 
       WHERE tenant_id = $1 AND status = 'active' 
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [tenantId],
    ),
    query<AlertRow>(
      `SELECT id, tenant_id, farm_id, type, severity, title, description,
              confidence, trigger_data, status, expires_at, created_at, updated_at
       FROM alerts 
       WHERE tenant_id = $1 AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY 
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
  ]);

  return {
    alerts: results.map(rowToAlert),
    total: Number(countResult?.count ?? 0),
  };
}

export async function updateAlertStatus(
  id: string,
  tenantId: string,
  status: Alert["status"],
): Promise<Alert | null> {
  await execute(
    `UPDATE alerts SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
    [status, id, tenantId],
  );

  return getAlertById(id, tenantId);
}

// Advisory Messages (Localized)
interface AdvisoryRow {
  id: string;
  alert_id: string;
  language: string;
  title: string;
  message: string;
  actions: { label: string; type: "link" | "action"; value: string }[] | null;
  audio_url: string | null;
  created_at: Date;
}

function rowToAdvisory(row: AdvisoryRow): AdvisoryMessage {
  return {
    id: row.id,
    alertId: row.alert_id,
    language: row.language,
    title: row.title,
    message: row.message,
    actions: row.actions ?? undefined,
    audioUrl: row.audio_url ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createAdvisoryMessage(data: {
  alertId: string;
  language: string;
  title: string;
  message: string;
  actions?: { label: string; type: "link" | "action"; value: string }[];
  audioUrl?: string;
}): Promise<AdvisoryMessage> {
  const result = await queryOne<{ id: string }>(
    `INSERT INTO advisory_messages (alert_id, language, title, message, actions, audio_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (alert_id, language) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       actions = EXCLUDED.actions,
       audio_url = EXCLUDED.audio_url
     RETURNING id`,
    [
      data.alertId,
      data.language,
      data.title,
      data.message,
      data.actions ? JSON.stringify(data.actions) : "[]",
      data.audioUrl ?? null,
    ],
  );

  if (!result) throw new Error("Failed to create advisory message");

  const advisory = await getAdvisoryMessage(data.alertId, data.language);
  if (!advisory) throw new Error("Failed to fetch created advisory message");

  return advisory;
}

export async function getAdvisoryMessage(
  alertId: string,
  language: string,
): Promise<AdvisoryMessage | null> {
  // Try exact language match first, then fall back to English
  const result = await queryOne<AdvisoryRow>(
    `SELECT id, alert_id, language, title, message, actions, audio_url, created_at
     FROM advisory_messages
     WHERE alert_id = $1 AND (language = $2 OR language = 'en')
     ORDER BY CASE WHEN language = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [alertId, language],
  );

  if (!result) return null;
  return rowToAdvisory(result);
}

export async function getAdvisoryMessages(
  alertId: string,
): Promise<AdvisoryMessage[]> {
  const results = await query<AdvisoryRow>(
    `SELECT id, alert_id, language, title, message, actions, audio_url, created_at
     FROM advisory_messages WHERE alert_id = $1`,
    [alertId],
  );

  return results.map(rowToAdvisory);
}

// Alert with localized message
export interface AlertWithAdvisory extends Alert {
  advisory?: AdvisoryMessage;
}

export async function getAlertsWithAdvisory(
  farmId: string,
  tenantId: string,
  language: string,
  options: { status?: Alert["status"]; limit?: number } = {},
): Promise<AlertWithAdvisory[]> {
  const alerts = await getAlertsByFarm(farmId, tenantId, options);

  const alertsWithAdvisory: AlertWithAdvisory[] = [];
  for (const alert of alerts) {
    const advisory = await getAdvisoryMessage(alert.id, language);
    alertsWithAdvisory.push({
      ...alert,
      advisory: advisory ?? undefined,
    });
  }

  return alertsWithAdvisory;
}
