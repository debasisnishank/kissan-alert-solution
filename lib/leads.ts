import { query } from "$db/client.ts";

export interface FarmerLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  username: string;
  language: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  farmCount: number;
  totalArea: number;
  primaryCrop: string;
  district: string;
  avgHealthScore: number;
  activeAlerts: number;
  engagementScore: number;
  segment: string;
}

export interface FarmLead {
  id: string;
  farmName: string;
  farmerName: string;
  farmerPhone: string;
  district: string;
  state: string;
  village: string;
  areaHectares: number;
  soilType: string;
  waterSource: string;
  isVerified: boolean;
  currentCrop: string;
  cropSeason: string;
  healthScore: number;
  activeAlerts: number;
  lastObservation: string | null;
  engagementScore: number;
  segment: string;
}

function calcEngagement(
  loginCount: number,
  farmCount: number,
  hasRecentLogin: boolean,
  hasAlerts: boolean,
  hasObservations: boolean,
): number {
  let score = 0;
  score += Math.min(loginCount * 2, 30);
  score += Math.min(farmCount * 10, 30);
  if (hasRecentLogin) score += 20;
  if (hasAlerts) score += 10;
  if (hasObservations) score += 10;
  return Math.min(score, 100);
}

function assignFarmerSegment(
  engagementScore: number,
  totalArea: number,
  isActive: boolean,
  avgHealth: number,
  loginCount: number,
): string {
  if (!isActive) return "inactive";
  if (engagementScore >= 70 && totalArea >= 5) return "high_value";
  if (avgHealth < 40 && avgHealth > 0) return "at_risk";
  if (loginCount === 0) return "dormant";
  if (engagementScore >= 40) return "engaged";
  return "new_lead";
}

function assignFarmSegment(
  healthScore: number,
  areaHectares: number,
  isVerified: boolean,
  hasAlerts: boolean,
  hasRecentObs: boolean,
): string {
  if (healthScore < 40 && healthScore > 0) return "at_risk";
  if (areaHectares >= 10 && isVerified) return "high_value";
  if (hasAlerts) return "needs_attention";
  if (!hasRecentObs) return "no_data";
  if (healthScore >= 70) return "healthy";
  return "moderate";
}

export async function getFarmerLeads(
  tenantId: string,
  segment?: string,
): Promise<FarmerLead[]> {
  const rows = await query<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    username: string;
    language: string;
    is_active: boolean;
    created_at: Date;
    last_login_at: Date | null;
    login_count: number;
    farm_count: number;
    total_area: number;
    primary_crop: string;
    district: string;
    avg_health: number;
    active_alerts: number;
    has_recent_obs: boolean;
  }>(
    `SELECT
       u.id, u.name, u.phone, u.email, u.username, u.language, u.is_active,
       u.created_at, u.last_login_at, COALESCE(u.login_count, 0)::int as login_count,
       COUNT(DISTINCT f.id)::int as farm_count,
       COALESCE(SUM(f.area_hectares), 0) as total_area,
       COALESCE(
         (SELECT fc2.crop_type FROM farm_crops fc2
          JOIN farms f2 ON fc2.farm_id = f2.id
          WHERE f2.farmer_id = u.id AND fc2.is_active = true
          LIMIT 1), 'N/A'
       ) as primary_crop,
       COALESCE(
         (SELECT f3.district FROM farms f3 WHERE f3.farmer_id = u.id LIMIT 1), ''
       ) as district,
       COALESCE(
         (SELECT AVG(fo.health_score)
          FROM farm_observations fo
          JOIN farms f4 ON fo.farm_id = f4.id
          WHERE f4.farmer_id = u.id AND fo.observation_date >= NOW() - INTERVAL '30 days'), 0
       ) as avg_health,
       (SELECT COUNT(*)::int FROM alerts a
        JOIN farms f5 ON a.farm_id = f5.id
        WHERE f5.farmer_id = u.id AND a.expires_at > NOW()) as active_alerts,
       EXISTS(
         SELECT 1 FROM farm_observations fo2
         JOIN farms f6 ON fo2.farm_id = f6.id
         WHERE f6.farmer_id = u.id AND fo2.observation_date >= NOW() - INTERVAL '14 days'
       ) as has_recent_obs
     FROM users u
     LEFT JOIN farms f ON f.farmer_id = u.id AND f.is_active = true
     WHERE u.tenant_id = $1 AND u.role = 'farmer'
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    [tenantId],
  );

  const leads = rows.map((r) => {
    const engScore = calcEngagement(
      Number(r.login_count),
      Number(r.farm_count),
      r.last_login_at
        ? (Date.now() - new Date(r.last_login_at).getTime()) <
          14 * 24 * 60 * 60 * 1000
        : false,
      Number(r.active_alerts) > 0,
      r.has_recent_obs,
    );
    const seg = assignFarmerSegment(
      engScore,
      Number(r.total_area),
      r.is_active,
      Number(r.avg_health),
      Number(r.login_count),
    );
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      username: r.username,
      language: r.language,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
      lastLoginAt: r.last_login_at
        ? new Date(r.last_login_at).toISOString()
        : null,
      loginCount: Number(r.login_count),
      farmCount: Number(r.farm_count),
      totalArea: Number(r.total_area),
      primaryCrop: r.primary_crop,
      district: r.district,
      avgHealthScore: Number(r.avg_health),
      activeAlerts: Number(r.active_alerts),
      engagementScore: engScore,
      segment: seg,
    };
  });

  if (segment && segment !== "all") {
    return leads.filter((l) => l.segment === segment);
  }
  return leads;
}

export async function getFarmLeads(
  tenantId: string,
  segment?: string,
): Promise<FarmLead[]> {
  const rows = await query<{
    id: string;
    farm_name: string;
    farmer_name: string;
    farmer_phone: string;
    district: string;
    state: string;
    village: string;
    area_hectares: number;
    soil_type: string;
    water_source: string;
    is_verified: boolean;
    current_crop: string;
    crop_season: string;
    health_score: number;
    active_alerts: number;
    last_obs_date: Date | null;
    farmer_login_count: number;
  }>(
    `SELECT
       f.id, f.name as farm_name, u.name as farmer_name, u.phone as farmer_phone,
       COALESCE(f.district, '') as district,
       COALESCE(f.state, '') as state,
       COALESCE(f.village, '') as village,
       f.area_hectares,
       COALESCE(f.soil_type, '') as soil_type,
       COALESCE(f.water_source, '') as water_source,
       f.is_verified,
       COALESCE(
         (SELECT fc.crop_type FROM farm_crops fc
          WHERE fc.farm_id = f.id AND fc.is_active = true LIMIT 1), 'N/A'
       ) as current_crop,
       COALESCE(
         (SELECT fc.season FROM farm_crops fc
          WHERE fc.farm_id = f.id AND fc.is_active = true LIMIT 1), ''
       ) as crop_season,
       COALESCE(
         (SELECT fo.health_score FROM farm_observations fo
          WHERE fo.farm_id = f.id ORDER BY fo.observation_date DESC LIMIT 1), 0
       ) as health_score,
       (SELECT COUNT(*)::int FROM alerts a
        WHERE a.farm_id = f.id AND a.expires_at > NOW()) as active_alerts,
       (SELECT MAX(fo.observation_date) FROM farm_observations fo
        WHERE fo.farm_id = f.id) as last_obs_date,
       COALESCE(u.login_count, 0)::int as farmer_login_count
     FROM farms f
     JOIN users u ON f.farmer_id = u.id
     WHERE f.tenant_id = $1 AND f.is_active = true
     ORDER BY f.created_at DESC`,
    [tenantId],
  );

  const leads = rows.map((r) => {
    const hasRecentObs = r.last_obs_date
      ? (Date.now() - new Date(r.last_obs_date).getTime()) <
        14 * 24 * 60 * 60 * 1000
      : false;
    const engScore = calcEngagement(
      Number(r.farmer_login_count),
      1,
      hasRecentObs,
      Number(r.active_alerts) > 0,
      hasRecentObs,
    );
    const seg = assignFarmSegment(
      Number(r.health_score),
      Number(r.area_hectares),
      r.is_verified,
      Number(r.active_alerts) > 0,
      hasRecentObs,
    );
    return {
      id: r.id,
      farmName: r.farm_name,
      farmerName: r.farmer_name,
      farmerPhone: r.farmer_phone,
      district: r.district,
      state: r.state,
      village: r.village,
      areaHectares: Number(r.area_hectares),
      soilType: r.soil_type,
      waterSource: r.water_source,
      isVerified: r.is_verified,
      currentCrop: r.current_crop,
      cropSeason: r.crop_season,
      healthScore: Number(r.health_score),
      activeAlerts: Number(r.active_alerts),
      lastObservation: r.last_obs_date
        ? new Date(r.last_obs_date).toISOString()
        : null,
      engagementScore: engScore,
      segment: seg,
    };
  });

  if (segment && segment !== "all") {
    return leads.filter((l) => l.segment === segment);
  }
  return leads;
}

export function farmerLeadsToCSV(leads: FarmerLead[]): string {
  const header =
    "Name,Phone,Email,Username,Language,District,Farms,Total Area (ha),Primary Crop,Avg Health,Active Alerts,Login Count,Last Login,Engagement Score,Segment,Status,Joined";
  const rows = leads.map((l) =>
    [
      `"${l.name}"`,
      l.phone,
      l.email || "",
      l.username,
      l.language,
      `"${l.district}"`,
      l.farmCount,
      l.totalArea.toFixed(1),
      `"${l.primaryCrop}"`,
      l.avgHealthScore.toFixed(0),
      l.activeAlerts,
      l.loginCount,
      l.lastLoginAt || "",
      l.engagementScore,
      l.segment,
      l.isActive ? "active" : "inactive",
      l.createdAt.split("T")[0],
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export function farmLeadsToCSV(leads: FarmLead[]): string {
  const header =
    "Farm Name,Farmer Name,Farmer Phone,District,State,Village,Area (ha),Soil Type,Water Source,Verified,Current Crop,Season,Health Score,Active Alerts,Last Observation,Engagement Score,Segment";
  const rows = leads.map((l) =>
    [
      `"${l.farmName}"`,
      `"${l.farmerName}"`,
      l.farmerPhone,
      `"${l.district}"`,
      `"${l.state}"`,
      `"${l.village}"`,
      l.areaHectares.toFixed(1),
      `"${l.soilType}"`,
      `"${l.waterSource}"`,
      l.isVerified ? "yes" : "no",
      `"${l.currentCrop}"`,
      l.cropSeason,
      l.healthScore.toFixed(0),
      l.activeAlerts,
      l.lastObservation?.split("T")[0] || "",
      l.engagementScore,
      l.segment,
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
