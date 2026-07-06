/**
 * Dynamic Configuration System
 * Loads configuration from database with fallback to defaults
 */

import { queryOne } from "$db/client.ts";

interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  features: {
    aiAnalysis: boolean;
    voiceAlerts: boolean;
    smsAlerts: boolean;
    marketplace: boolean;
    schemes: boolean;
  };
  crops: Array<{
    code: string;
    name: string;
    nameLocal: Record<string, string>;
    seasons: string[];
    stages: Array<{ name: string; daysRange: [number, number] }>;
  }>;
  languages: string[];
  defaultLanguage: string;
}

interface CropConfig {
  code: string;
  name: string;
  nameLocal: Record<string, string>;
  seasons: string[];
  stages: Array<{
    name: string;
    nameLocal: Record<string, string>;
    daysRange: [number, number];
    ndviRange: [number, number];
  }>;
  waterRequirement: "low" | "medium" | "high";
  growthDays: number;
}

// Default crop configurations
const DEFAULT_CROPS: CropConfig[] = [
  {
    code: "wheat",
    name: "Wheat",
    nameLocal: { hi: "गेहूं", mr: "गहू", pa: "ਕਣਕ", gu: "ઘઉં" },
    seasons: ["rabi"],
    stages: [
      {
        name: "Germination",
        nameLocal: { hi: "अंकुरण" },
        daysRange: [0, 15],
        ndviRange: [0.1, 0.3],
      },
      {
        name: "Tillering",
        nameLocal: { hi: "कल्ले निकलना" },
        daysRange: [15, 40],
        ndviRange: [0.3, 0.5],
      },
      {
        name: "Stem Extension",
        nameLocal: { hi: "तना वृद्धि" },
        daysRange: [40, 60],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Heading",
        nameLocal: { hi: "बाली निकलना" },
        daysRange: [60, 75],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Grain Filling",
        nameLocal: { hi: "दाना भरना" },
        daysRange: [75, 100],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Maturity",
        nameLocal: { hi: "परिपक्वता" },
        daysRange: [100, 130],
        ndviRange: [0.2, 0.4],
      },
    ],
    waterRequirement: "medium",
    growthDays: 130,
  },
  {
    code: "rice",
    name: "Rice",
    nameLocal: { hi: "चावल", mr: "तांदूळ", ta: "அரிசி", te: "బియ్యం" },
    seasons: ["kharif"],
    stages: [
      {
        name: "Nursery",
        nameLocal: { hi: "नर्सरी" },
        daysRange: [0, 25],
        ndviRange: [0.2, 0.4],
      },
      {
        name: "Transplanting",
        nameLocal: { hi: "रोपाई" },
        daysRange: [25, 35],
        ndviRange: [0.3, 0.5],
      },
      {
        name: "Tillering",
        nameLocal: { hi: "कल्ले निकलना" },
        daysRange: [35, 60],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Panicle Initiation",
        nameLocal: { hi: "बाली आना" },
        daysRange: [60, 80],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Flowering",
        nameLocal: { hi: "फूल आना" },
        daysRange: [80, 100],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Grain Filling",
        nameLocal: { hi: "दाना भरना" },
        daysRange: [100, 120],
        ndviRange: [0.4, 0.6],
      },
      {
        name: "Maturity",
        nameLocal: { hi: "परिपक्वता" },
        daysRange: [120, 140],
        ndviRange: [0.2, 0.4],
      },
    ],
    waterRequirement: "high",
    growthDays: 140,
  },
  {
    code: "soybean",
    name: "Soybean",
    nameLocal: { hi: "सोयाबीन", mr: "सोयाबीन" },
    seasons: ["kharif"],
    stages: [
      {
        name: "Emergence",
        nameLocal: { hi: "अंकुरण" },
        daysRange: [0, 15],
        ndviRange: [0.1, 0.3],
      },
      {
        name: "Vegetative",
        nameLocal: { hi: "वनस्पति वृद्धि" },
        daysRange: [15, 45],
        ndviRange: [0.4, 0.7],
      },
      {
        name: "Flowering",
        nameLocal: { hi: "फूल आना" },
        daysRange: [45, 65],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Pod Formation",
        nameLocal: { hi: "फली बनना" },
        daysRange: [65, 85],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Seed Filling",
        nameLocal: { hi: "बीज भरना" },
        daysRange: [85, 100],
        ndviRange: [0.4, 0.6],
      },
      {
        name: "Maturity",
        nameLocal: { hi: "परिपक्वता" },
        daysRange: [100, 120],
        ndviRange: [0.2, 0.4],
      },
    ],
    waterRequirement: "medium",
    growthDays: 120,
  },
  {
    code: "cotton",
    name: "Cotton",
    nameLocal: { hi: "कपास", mr: "कापूस", gu: "કપાસ", te: "పత్తి" },
    seasons: ["kharif"],
    stages: [
      {
        name: "Emergence",
        nameLocal: { hi: "अंकुरण" },
        daysRange: [0, 15],
        ndviRange: [0.1, 0.3],
      },
      {
        name: "Vegetative",
        nameLocal: { hi: "वनस्पति वृद्धि" },
        daysRange: [15, 50],
        ndviRange: [0.4, 0.6],
      },
      {
        name: "Squaring",
        nameLocal: { hi: "कली आना" },
        daysRange: [50, 70],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Flowering",
        nameLocal: { hi: "फूल आना" },
        daysRange: [70, 100],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Boll Development",
        nameLocal: { hi: "डोडा बनना" },
        daysRange: [100, 140],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Boll Opening",
        nameLocal: { hi: "डोडा खुलना" },
        daysRange: [140, 180],
        ndviRange: [0.3, 0.5],
      },
    ],
    waterRequirement: "medium",
    growthDays: 180,
  },
  {
    code: "maize",
    name: "Maize",
    nameLocal: { hi: "मक्का", mr: "मका", pa: "ਮੱਕੀ" },
    seasons: ["kharif", "rabi"],
    stages: [
      {
        name: "Emergence",
        nameLocal: { hi: "अंकुरण" },
        daysRange: [0, 10],
        ndviRange: [0.1, 0.3],
      },
      {
        name: "Vegetative",
        nameLocal: { hi: "वनस्पति वृद्धि" },
        daysRange: [10, 45],
        ndviRange: [0.4, 0.7],
      },
      {
        name: "Tasseling",
        nameLocal: { hi: "नर फूल" },
        daysRange: [45, 60],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Silking",
        nameLocal: { hi: "मादा फूल" },
        daysRange: [60, 70],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Grain Filling",
        nameLocal: { hi: "दाना भरना" },
        daysRange: [70, 95],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Maturity",
        nameLocal: { hi: "परिपक्वता" },
        daysRange: [95, 110],
        ndviRange: [0.2, 0.4],
      },
    ],
    waterRequirement: "medium",
    growthDays: 110,
  },
  {
    code: "groundnut",
    name: "Groundnut",
    nameLocal: { hi: "मूंगफली", mr: "भुईमूग", gu: "મગફળી", te: "వేరుశనగ" },
    seasons: ["kharif", "rabi"],
    stages: [
      {
        name: "Emergence",
        nameLocal: { hi: "अंकुरण" },
        daysRange: [0, 15],
        ndviRange: [0.1, 0.3],
      },
      {
        name: "Vegetative",
        nameLocal: { hi: "वनस्पति वृद्धि" },
        daysRange: [15, 35],
        ndviRange: [0.4, 0.6],
      },
      {
        name: "Flowering",
        nameLocal: { hi: "फूल आना" },
        daysRange: [35, 55],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Pegging",
        nameLocal: { hi: "खूंटी बनना" },
        daysRange: [55, 75],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Pod Development",
        nameLocal: { hi: "फली विकास" },
        daysRange: [75, 100],
        ndviRange: [0.5, 0.7],
      },
      {
        name: "Maturity",
        nameLocal: { hi: "परिपक्वता" },
        daysRange: [100, 120],
        ndviRange: [0.3, 0.5],
      },
    ],
    waterRequirement: "medium",
    growthDays: 120,
  },
  {
    code: "sugarcane",
    name: "Sugarcane",
    nameLocal: { hi: "गन्ना", mr: "ऊस", ta: "கரும்பு" },
    seasons: ["annual"],
    stages: [
      {
        name: "Germination",
        nameLocal: { hi: "अंकुरण" },
        daysRange: [0, 45],
        ndviRange: [0.1, 0.3],
      },
      {
        name: "Tillering",
        nameLocal: { hi: "कल्ले निकलना" },
        daysRange: [45, 120],
        ndviRange: [0.4, 0.6],
      },
      {
        name: "Grand Growth",
        nameLocal: { hi: "तीव्र वृद्धि" },
        daysRange: [120, 270],
        ndviRange: [0.6, 0.8],
      },
      {
        name: "Maturity",
        nameLocal: { hi: "परिपक्वता" },
        daysRange: [270, 360],
        ndviRange: [0.4, 0.6],
      },
    ],
    waterRequirement: "high",
    growthDays: 360,
  },
];

// Cache for configs
const configCache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get crop configuration
 */
export function getCropConfig(cropCode: string): CropConfig | undefined {
  return DEFAULT_CROPS.find((c) => c.code === cropCode);
}

/**
 * Get all crop configurations
 */
export function getAllCropConfigs(): CropConfig[] {
  return DEFAULT_CROPS;
}

/**
 * Get crop stage based on days after sowing
 */
export function getCropStage(
  cropCode: string,
  daysAfterSowing: number,
): { name: string; nameLocal: Record<string, string> } | null {
  const crop = getCropConfig(cropCode);
  if (!crop) return null;

  for (const stage of crop.stages) {
    if (
      daysAfterSowing >= stage.daysRange[0] &&
      daysAfterSowing < stage.daysRange[1]
    ) {
      return { name: stage.name, nameLocal: stage.nameLocal };
    }
  }

  // Return last stage if beyond all ranges
  const lastStage = crop.stages[crop.stages.length - 1];
  return { name: lastStage.name, nameLocal: lastStage.nameLocal };
}

/**
 * Get expected NDVI range for crop stage
 */
export function getExpectedNDVIRange(
  cropCode: string,
  daysAfterSowing: number,
): [number, number] | null {
  const crop = getCropConfig(cropCode);
  if (!crop) return null;

  for (const stage of crop.stages) {
    if (
      daysAfterSowing >= stage.daysRange[0] &&
      daysAfterSowing < stage.daysRange[1]
    ) {
      return stage.ndviRange;
    }
  }

  return [0.2, 0.5]; // default range
}

/**
 * Get tenant configuration from database
 */
export async function getTenantConfig(
  tenantId: string,
): Promise<TenantConfig | null> {
  const cacheKey = `tenant:${tenantId}`;
  const cached = configCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data as TenantConfig;
  }

  const tenant = await queryOne<{
    id: string;
    name: string;
    slug: string;
    config: Record<string, unknown>;
  }>(
    `SELECT id, name, slug, config FROM tenants WHERE id = $1`,
    [tenantId],
  );

  if (!tenant) return null;

  const config: TenantConfig = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    features: {
      aiAnalysis:
        (tenant.config?.features as Record<string, boolean>)?.aiAnalysis ??
          true,
      voiceAlerts:
        (tenant.config?.features as Record<string, boolean>)?.voiceAlerts ??
          true,
      smsAlerts:
        (tenant.config?.features as Record<string, boolean>)?.smsAlerts ??
          false,
      marketplace:
        (tenant.config?.features as Record<string, boolean>)?.marketplace ??
          true,
      schemes: (tenant.config?.features as Record<string, boolean>)?.schemes ??
        true,
    },
    crops: (tenant.config?.crops as CropConfig[]) || DEFAULT_CROPS.map((c) => ({
      code: c.code,
      name: c.name,
      nameLocal: c.nameLocal,
      seasons: c.seasons,
      stages: c.stages.map((s) => ({ name: s.name, daysRange: s.daysRange })),
    })),
    languages: (tenant.config?.languages as string[]) || ["en", "hi"],
    defaultLanguage: (tenant.config?.defaultLanguage as string) || "en",
  };

  configCache.set(cacheKey, { data: config, expiry: Date.now() + CACHE_TTL });
  return config;
}

/**
 * Get crop labels for UI (localized)
 */
export function getCropLabels(language = "en"): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const crop of DEFAULT_CROPS) {
    labels[crop.code] = crop.nameLocal[language] || crop.name;
  }
  labels["none"] = language === "hi" ? "कोई फसल नहीं" : "No Crop";
  return labels;
}

/**
 * Get stage labels for UI (localized)
 */
export function getStageLabels(
  cropCode: string,
  language = "en",
): Record<string, string> {
  const crop = getCropConfig(cropCode);
  if (!crop) return {};

  const labels: Record<string, string> = {};
  for (const stage of crop.stages) {
    labels[stage.name] = stage.nameLocal[language] || stage.name;
  }
  return labels;
}

export type { CropConfig, TenantConfig };
