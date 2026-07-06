import { execute, query, queryOne } from "$db/client.ts";
import type { CropDeclaration, Farm } from "$utils/types.ts";
import { z } from "zod";
import { generateCalendarEventsForCrop } from "$lib/calendar.ts";

// Input validation schemas
export const CreateFarmInput = z.object({
  name: z.string().min(1).max(200),
  polygon: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
  district: z.string().optional(),
  state: z.string().optional(),
  village: z.string().optional(),
  soilType: z.string().optional(),
  waterSource: z.string().optional(),
  ownershipType: z.enum(["owned", "leased", "shared"]).default("owned"),
});

export const CreateCropInput = z.object({
  farmId: z.string().uuid(),
  cropType: z.string(),
  variety: z.string().optional(),
  sowingDate: z.string().transform((s) => new Date(s)),
  expectedHarvestDate: z.string().transform((s) => new Date(s)).optional(),
  irrigationType: z.string(),
  season: z.enum(["kharif", "rabi", "zaid"]),
  year: z.number().int(),
});

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

export async function createFarm(
  tenantId: string,
  farmerId: string,
  input: z.infer<typeof CreateFarmInput>,
): Promise<Farm> {
  const polygonGeoJSON = JSON.stringify(input.polygon);

  const result = await queryOne<{ id: string }>(
    `INSERT INTO farms (
      tenant_id, farmer_id, name, polygon, area_hectares, center_point,
      district, state, village, soil_type, water_source, ownership_type
    ) VALUES (
      $1, $2, $3,
      ST_GeomFromGeoJSON($4),
      ST_Area(ST_Transform(ST_GeomFromGeoJSON($4), 32643)) / 10000,
      ST_Centroid(ST_GeomFromGeoJSON($4)),
      $5, $6, $7, $8, $9, $10
    ) RETURNING id`,
    [
      tenantId,
      farmerId,
      input.name,
      polygonGeoJSON,
      input.district || null,
      input.state || null,
      input.village || null,
      input.soilType || null,
      input.waterSource || null,
      input.ownershipType,
    ],
  );

  if (!result) throw new Error("Failed to create farm");

  const farm = await getFarmById(result.id, tenantId);
  if (!farm) throw new Error("Failed to fetch created farm");

  return farm;
}

export async function getFarmById(
  id: string,
  tenantId: string,
): Promise<Farm | null> {
  const result = await queryOne<FarmRow>(
    `SELECT 
      id, tenant_id, farmer_id, name,
      ST_AsGeoJSON(polygon) as polygon_geojson,
      area_hectares,
      ST_AsGeoJSON(center_point) as center_point_geojson,
      district, state, village, agro_climatic_zone,
      soil_type, water_source, ownership_type, is_verified,
      created_at, updated_at
     FROM farms WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (!result) return null;
  return rowToFarm(result);
}

export async function getFarmsByFarmer(
  farmerId: string,
  tenantId: string,
): Promise<Farm[]> {
  const results = await query<FarmRow>(
    `SELECT 
      id, tenant_id, farmer_id, name,
      ST_AsGeoJSON(polygon) as polygon_geojson,
      area_hectares,
      ST_AsGeoJSON(center_point) as center_point_geojson,
      district, state, village, agro_climatic_zone,
      soil_type, water_source, ownership_type, is_verified,
      created_at, updated_at
     FROM farms WHERE farmer_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [farmerId, tenantId],
  );

  return results.map(rowToFarm);
}

export async function listFarms(
  tenantId: string,
  options: { limit?: number; offset?: number; district?: string } = {},
): Promise<{ farms: Farm[]; total: number }> {
  const { limit = 50, offset = 0, district } = options;

  let whereClause = "tenant_id = $1";
  const params: unknown[] = [tenantId];

  if (district) {
    params.push(district);
    whereClause += ` AND district = $${params.length}`;
  }

  const [countResult, results] = await Promise.all([
    queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM farms WHERE ${whereClause}`,
      params,
    ),
    query<FarmRow>(
      `SELECT 
        id, tenant_id, farmer_id, name,
        ST_AsGeoJSON(polygon) as polygon_geojson,
        area_hectares,
        ST_AsGeoJSON(center_point) as center_point_geojson,
        district, state, village, agro_climatic_zone,
        soil_type, water_source, ownership_type, is_verified,
        created_at, updated_at
       FROM farms WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);

  return {
    farms: results.map(rowToFarm),
    total: Number(countResult?.count ?? 0),
  };
}

export async function updateFarm(
  id: string,
  tenantId: string,
  input: Partial<z.infer<typeof CreateFarmInput>>,
): Promise<Farm | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.polygon !== undefined) {
    const polygonGeoJSON = JSON.stringify(input.polygon);
    updates.push(`polygon = ST_GeomFromGeoJSON($${paramIndex++})`);
    values.push(polygonGeoJSON);
    updates.push(
      `area_hectares = ST_Area(ST_Transform(ST_GeomFromGeoJSON($${
        paramIndex - 1
      }), 32643)) / 10000`,
    );
    updates.push(
      `center_point = ST_Centroid(ST_GeomFromGeoJSON($${paramIndex - 1}))`,
    );
  }
  if (input.district !== undefined) {
    updates.push(`district = $${paramIndex++}`);
    values.push(input.district);
  }
  if (input.state !== undefined) {
    updates.push(`state = $${paramIndex++}`);
    values.push(input.state);
  }
  if (input.village !== undefined) {
    updates.push(`village = $${paramIndex++}`);
    values.push(input.village);
  }
  if (input.soilType !== undefined) {
    updates.push(`soil_type = $${paramIndex++}`);
    values.push(input.soilType);
  }
  if (input.waterSource !== undefined) {
    updates.push(`water_source = $${paramIndex++}`);
    values.push(input.waterSource);
  }
  if (input.ownershipType !== undefined) {
    updates.push(`ownership_type = $${paramIndex++}`);
    values.push(input.ownershipType);
  }

  if (updates.length === 0) return getFarmById(id, tenantId);

  updates.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  await execute(
    `UPDATE farms SET ${
      updates.join(", ")
    } WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
    values,
  );

  return getFarmById(id, tenantId);
}

export async function deleteFarm(
  id: string,
  tenantId: string,
): Promise<boolean> {
  const result = await execute(
    `DELETE FROM farms WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return result > 0;
}

// Crop Declarations
interface CropRow {
  id: string;
  farm_id: string;
  crop_type: string;
  variety: string | null;
  sowing_date: Date;
  expected_harvest_date: Date | null;
  irrigation_type: string;
  season: string;
  year: number;
  is_active: boolean;
  created_at: Date;
}

function rowToCrop(row: CropRow): CropDeclaration {
  return {
    id: row.id,
    farmId: row.farm_id,
    cropType: row.crop_type,
    variety: row.variety ?? undefined,
    sowingDate: row.sowing_date,
    expectedHarvestDate: row.expected_harvest_date ?? undefined,
    irrigationType: row.irrigation_type,
    season: row.season as CropDeclaration["season"],
    year: row.year,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function createCropDeclaration(
  input: z.infer<typeof CreateCropInput>,
): Promise<CropDeclaration> {
  // Deactivate previous declarations for same farm
  await execute(
    `UPDATE crop_declarations SET is_active = false WHERE farm_id = $1 AND is_active = true`,
    [input.farmId],
  );

  const result = await queryOne<{ id: string }>(
    `INSERT INTO crop_declarations (
      farm_id, crop_type, variety, sowing_date, expected_harvest_date,
      irrigation_type, season, year
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      input.farmId,
      input.cropType,
      input.variety || null,
      input.sowingDate,
      input.expectedHarvestDate || null,
      input.irrigationType,
      input.season,
      input.year,
    ],
  );

  if (!result) throw new Error("Failed to create crop declaration");

  const crop = await getCropById(result.id);
  if (!crop) throw new Error("Failed to fetch created crop declaration");

  // Auto-generate calendar events for this crop
  try {
    await generateCalendarEventsForCrop({
      farmId: input.farmId,
      cropId: result.id,
      cropType: input.cropType,
      sowingDate: new Date(input.sowingDate),
    });
    console.log(
      `[Farm] Generated calendar events for crop ${input.cropType} on farm ${input.farmId}`,
    );
  } catch (error) {
    // Don't fail the crop creation if calendar generation fails
    console.error("[Farm] Failed to generate calendar events:", error);
  }

  return crop;
}

export async function getCropById(id: string): Promise<CropDeclaration | null> {
  const result = await queryOne<CropRow>(
    `SELECT id, farm_id, crop_type, variety, sowing_date, expected_harvest_date,
            irrigation_type, season, year, is_active, created_at
     FROM crop_declarations WHERE id = $1`,
    [id],
  );

  if (!result) return null;
  return rowToCrop(result);
}

export async function getActiveCropByFarm(
  farmId: string,
): Promise<CropDeclaration | null> {
  const result = await queryOne<CropRow>(
    `SELECT id, farm_id, crop_type, variety, sowing_date, expected_harvest_date,
            irrigation_type, season, year, is_active, created_at
     FROM crop_declarations WHERE farm_id = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [farmId],
  );

  if (!result) return null;
  return rowToCrop(result);
}

export async function getCropHistory(
  farmId: string,
): Promise<CropDeclaration[]> {
  const results = await query<CropRow>(
    `SELECT id, farm_id, crop_type, variety, sowing_date, expected_harvest_date,
            irrigation_type, season, year, is_active, created_at
     FROM crop_declarations WHERE farm_id = $1
     ORDER BY created_at DESC`,
    [farmId],
  );

  return results.map(rowToCrop);
}
