import { query, queryOne } from "$db/client.ts";
import type { FarmObservation } from "$utils/types.ts";
import { onObservationUpdated, onSoilUpdate } from "$lib/farm-events.ts";

interface ObservationRow {
  id: string;
  farm_id: string;
  observation_date: Date;
  source: string;
  ndvi: number | null;
  evi: number | null;
  ndwi: number | null;
  sar_backscatter: number | null;
  rainfall_24h: number | null;
  rainfall_72h: number | null;
  rainfall_7d: number | null;
  lst_day: number | null;
  lst_night: number | null;
  soil_moisture_proxy: number | null;
  health_score: number | null;
  anomaly_score: number | null;
  stage_estimate: string | null;
  cloud_cover_pct: number | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function rowToObservation(row: ObservationRow): FarmObservation {
  return {
    id: row.id,
    farmId: row.farm_id,
    observationDate: row.observation_date,
    source: row.source,
    ndvi: row.ndvi ?? undefined,
    evi: row.evi ?? undefined,
    ndwi: row.ndwi ?? undefined,
    sarBackscatter: row.sar_backscatter ?? undefined,
    rainfall24h: row.rainfall_24h ?? undefined,
    rainfall72h: row.rainfall_72h ?? undefined,
    rainfall7d: row.rainfall_7d ?? undefined,
    lstDay: row.lst_day ?? undefined,
    lstNight: row.lst_night ?? undefined,
    soilMoistureProxy: row.soil_moisture_proxy ?? undefined,
    healthScore: row.health_score ?? undefined,
    anomalyScore: row.anomaly_score ?? undefined,
    stageEstimate: row.stage_estimate ?? undefined,
    cloudCoverPct: row.cloud_cover_pct ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getObservationsByFarm(
  farmId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    source?: string;
    limit?: number;
  } = {},
): Promise<FarmObservation[]> {
  const { startDate, endDate, source, limit = 365 } = options;

  let whereClause = "farm_id = $1";
  const params: unknown[] = [farmId];

  if (startDate) {
    params.push(startDate);
    whereClause += ` AND observation_date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    whereClause += ` AND observation_date <= $${params.length}`;
  }
  if (source) {
    params.push(source);
    whereClause += ` AND source = $${params.length}`;
  }

  params.push(limit);

  const results = await query<ObservationRow>(
    `SELECT id, farm_id, observation_date, source, ndvi, evi, ndwi, sar_backscatter,
            rainfall_24h, rainfall_72h, rainfall_7d, lst_day, lst_night,
            soil_moisture_proxy, health_score, anomaly_score, stage_estimate,
            cloud_cover_pct, metadata, created_at
     FROM farm_observations
     WHERE ${whereClause}
     ORDER BY observation_date DESC
     LIMIT $${params.length}`,
    params,
  );

  return results.map(rowToObservation);
}

export async function getLatestObservation(
  farmId: string,
): Promise<FarmObservation | null> {
  const result = await queryOne<ObservationRow>(
    `SELECT id, farm_id, observation_date, source, ndvi, evi, ndwi, sar_backscatter,
            rainfall_24h, rainfall_72h, rainfall_7d, lst_day, lst_night,
            soil_moisture_proxy, health_score, anomaly_score, stage_estimate,
            cloud_cover_pct, metadata, created_at
     FROM farm_observations
     WHERE farm_id = $1
     ORDER BY observation_date DESC
     LIMIT 1`,
    [farmId],
  );

  if (!result) return null;
  return rowToObservation(result);
}

export async function upsertObservation(data: {
  farmId: string;
  observationDate: Date;
  source: string;
  ndvi?: number;
  evi?: number;
  ndwi?: number;
  sarBackscatter?: number;
  rainfall24h?: number;
  rainfall72h?: number;
  rainfall7d?: number;
  lstDay?: number;
  lstNight?: number;
  soilMoistureProxy?: number;
  healthScore?: number;
  anomalyScore?: number;
  stageEstimate?: string;
  cloudCoverPct?: number;
  metadata?: Record<string, unknown>;
}): Promise<FarmObservation> {
  const result = await queryOne<{ id: string }>(
    `INSERT INTO farm_observations (
      farm_id, observation_date, source, ndvi, evi, ndwi, sar_backscatter,
      rainfall_24h, rainfall_72h, rainfall_7d, lst_day, lst_night,
      soil_moisture_proxy, health_score, anomaly_score, stage_estimate,
      cloud_cover_pct, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (farm_id, observation_date, source) DO UPDATE SET
      ndvi = COALESCE(EXCLUDED.ndvi, farm_observations.ndvi),
      evi = COALESCE(EXCLUDED.evi, farm_observations.evi),
      ndwi = COALESCE(EXCLUDED.ndwi, farm_observations.ndwi),
      sar_backscatter = COALESCE(EXCLUDED.sar_backscatter, farm_observations.sar_backscatter),
      rainfall_24h = COALESCE(EXCLUDED.rainfall_24h, farm_observations.rainfall_24h),
      rainfall_72h = COALESCE(EXCLUDED.rainfall_72h, farm_observations.rainfall_72h),
      rainfall_7d = COALESCE(EXCLUDED.rainfall_7d, farm_observations.rainfall_7d),
      lst_day = COALESCE(EXCLUDED.lst_day, farm_observations.lst_day),
      lst_night = COALESCE(EXCLUDED.lst_night, farm_observations.lst_night),
      soil_moisture_proxy = COALESCE(EXCLUDED.soil_moisture_proxy, farm_observations.soil_moisture_proxy),
      health_score = COALESCE(EXCLUDED.health_score, farm_observations.health_score),
      anomaly_score = COALESCE(EXCLUDED.anomaly_score, farm_observations.anomaly_score),
      stage_estimate = COALESCE(EXCLUDED.stage_estimate, farm_observations.stage_estimate),
      cloud_cover_pct = COALESCE(EXCLUDED.cloud_cover_pct, farm_observations.cloud_cover_pct),
      metadata = COALESCE(EXCLUDED.metadata, farm_observations.metadata)
    RETURNING id`,
    [
      data.farmId,
      data.observationDate,
      data.source,
      data.ndvi ?? null,
      data.evi ?? null,
      data.ndwi ?? null,
      data.sarBackscatter ?? null,
      data.rainfall24h ?? null,
      data.rainfall72h ?? null,
      data.rainfall7d ?? null,
      data.lstDay ?? null,
      data.lstNight ?? null,
      data.soilMoistureProxy ?? null,
      data.healthScore ?? null,
      data.anomalyScore ?? null,
      data.stageEstimate ?? null,
      data.cloudCoverPct ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ],
  );

  if (!result) throw new Error("Failed to upsert observation");

  const [observation] = await getObservationsByFarm(data.farmId, { limit: 1 });
  if (!observation) throw new Error("Failed to fetch created observation");

  // Fire notification events (non-blocking)
  onObservationUpdated(data.farmId, {
    ndvi: data.ndvi,
    healthScore: data.healthScore,
    source: data.source,
  }).catch(() => {});

  if (data.soilMoistureProxy) {
    onSoilUpdate(data.farmId, {
      soilMoisture: data.soilMoistureProxy,
    }).catch(() => {});
  }

  return observation;
}

// Statistics and aggregations
export async function getFarmHealthStats(farmId: string): Promise<{
  latestNdvi: number | null;
  avgNdvi30d: number | null;
  ndviTrend: "improving" | "stable" | "declining" | null;
  totalRainfall7d: number | null;
  healthScore: number | null;
  lastObservationDate: Date | null;
}> {
  const result = await queryOne<{
    latest_ndvi: number | null;
    avg_ndvi_30d: number | null;
    avg_ndvi_recent: number | null;
    avg_ndvi_prior: number | null;
    total_rainfall_7d: number | null;
    health_score: number | null;
    last_observation_date: Date | null;
  }>(
    `WITH recent AS (
      SELECT ndvi, health_score, observation_date, rainfall_24h
      FROM farm_observations
      WHERE farm_id = $1 AND observation_date >= NOW() - INTERVAL '30 days'
      ORDER BY observation_date DESC
    ),
    latest AS (
      SELECT ndvi, health_score, observation_date
      FROM recent LIMIT 1
    ),
    recent_15 AS (
      SELECT AVG(ndvi) as avg FROM recent WHERE observation_date >= NOW() - INTERVAL '15 days'
    ),
    prior_15 AS (
      SELECT AVG(ndvi) as avg FROM recent WHERE observation_date < NOW() - INTERVAL '15 days'
    )
    SELECT 
      (SELECT ndvi FROM latest) as latest_ndvi,
      (SELECT AVG(ndvi) FROM recent) as avg_ndvi_30d,
      (SELECT avg FROM recent_15) as avg_ndvi_recent,
      (SELECT avg FROM prior_15) as avg_ndvi_prior,
      (SELECT SUM(rainfall_24h) FROM recent WHERE observation_date >= NOW() - INTERVAL '7 days') as total_rainfall_7d,
      (SELECT health_score FROM latest) as health_score,
      (SELECT observation_date FROM latest) as last_observation_date`,
    [farmId],
  );

  if (!result) {
    return {
      latestNdvi: null,
      avgNdvi30d: null,
      ndviTrend: null,
      totalRainfall7d: null,
      healthScore: null,
      lastObservationDate: null,
    };
  }

  // Convert string/numeric values to proper numbers (PostgreSQL returns NUMERIC as strings)
  const latestNdvi = result.latest_ndvi != null
    ? Number(result.latest_ndvi)
    : null;
  const avgNdvi30d = result.avg_ndvi_30d != null
    ? Number(result.avg_ndvi_30d)
    : null;
  const avgNdviRecent = result.avg_ndvi_recent != null
    ? Number(result.avg_ndvi_recent)
    : null;
  const avgNdviPrior = result.avg_ndvi_prior != null
    ? Number(result.avg_ndvi_prior)
    : null;
  const totalRainfall7d = result.total_rainfall_7d != null
    ? Number(result.total_rainfall_7d)
    : null;
  const healthScore = result.health_score != null
    ? Number(result.health_score)
    : null;

  let ndviTrend: "improving" | "stable" | "declining" | null = null;
  if (avgNdviRecent !== null && avgNdviPrior !== null) {
    const diff = avgNdviRecent - avgNdviPrior;
    if (diff > 0.05) ndviTrend = "improving";
    else if (diff < -0.05) ndviTrend = "declining";
    else ndviTrend = "stable";
  }

  return {
    latestNdvi,
    avgNdvi30d,
    ndviTrend,
    totalRainfall7d,
    healthScore,
    lastObservationDate: result.last_observation_date,
  };
}
