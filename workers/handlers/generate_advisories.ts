import { query, queryOne } from "$db/client.ts";
import { generateAdvisories } from "$ai/advisory.ts";
import type { Farm } from "$utils/types.ts";

interface GenerateAdvisoriesPayload {
  farmId?: string;
  tenantId: string;
  languages?: string[];
}

interface FarmRow {
  id: string;
  tenant_id: string;
  farmer_id: string;
  name: string;
  polygon_geojson: string;
  area_hectares: number;
  center_point_geojson: string | null;
  district: string | null;
  state: string | null;
  village: string | null;
  agro_climatic_zone: string | null;
  soil_type: string | null;
  water_source: string | null;
  ownership_type: string;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToFarm(row: FarmRow): Farm {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    farmerId: row.farmer_id,
    name: row.name,
    polygon: JSON.parse(row.polygon_geojson),
    areaHectares: Number(row.area_hectares),
    centerPoint: row.center_point_geojson
      ? JSON.parse(row.center_point_geojson)
      : { type: "Point", coordinates: [0, 0] },
    district: row.district ?? undefined,
    state: row.state ?? undefined,
    village: row.village ?? undefined,
    agroClimaticZone: row.agro_climatic_zone ?? undefined,
    soilType: row.soil_type ?? undefined,
    waterSource: row.water_source ?? undefined,
    ownershipType: row.ownership_type as Farm["ownershipType"],
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function handleGenerateAdvisories(
  payload: GenerateAdvisoriesPayload,
): Promise<{
  farmsProcessed: number;
  alertsGenerated: number;
}> {
  console.log(`[JOB] Generating advisories for tenant: ${payload.tenantId}`);

  const languages = payload.languages || ["en", "hi"];
  let farmsProcessed = 0;
  let alertsGenerated = 0;

  if (payload.farmId) {
    // Process single farm
    const farm = await queryOne<FarmRow>(
      `SELECT 
        id, tenant_id, farmer_id, name,
        ST_AsGeoJSON(polygon) as polygon_geojson,
        area_hectares,
        ST_AsGeoJSON(center_point) as center_point_geojson,
        district, state, village, agro_climatic_zone,
        soil_type, water_source, ownership_type, is_verified,
        created_at, updated_at
       FROM farms WHERE id = $1 AND tenant_id = $2`,
      [payload.farmId, payload.tenantId],
    );

    if (!farm) {
      throw new Error(`Farm not found: ${payload.farmId}`);
    }

    const alerts = await generateAdvisories(rowToFarm(farm), languages);
    farmsProcessed = 1;
    alertsGenerated = alerts.length;
  } else {
    // Process all farms in tenant
    const farms = await query<FarmRow>(
      `SELECT 
        id, tenant_id, farmer_id, name,
        ST_AsGeoJSON(polygon) as polygon_geojson,
        area_hectares,
        ST_AsGeoJSON(center_point) as center_point_geojson,
        district, state, village, agro_climatic_zone,
        soil_type, water_source, ownership_type, is_verified,
        created_at, updated_at
       FROM farms WHERE tenant_id = $1`,
      [payload.tenantId],
    );

    for (const farmRow of farms) {
      try {
        const alerts = await generateAdvisories(rowToFarm(farmRow), languages);
        farmsProcessed++;
        alertsGenerated += alerts.length;
      } catch (error) {
        console.error(
          `Failed to generate advisories for farm ${farmRow.id}:`,
          error,
        );
      }
    }
  }

  console.log(
    `[JOB] Advisory generation complete: ${alertsGenerated} alerts for ${farmsProcessed} farms`,
  );

  return {
    farmsProcessed,
    alertsGenerated,
  };
}
