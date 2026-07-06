import { z } from "zod";

// GeoJSON schemas
export const PointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]), // [lng, lat]
});

export const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const GeoJSONSchema = z.union([PointSchema, PolygonSchema]);

// User & Auth
export const UserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  visitable: z.string().optional(),
  phone: z.string(),
  username: z.string().optional(),
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  role: z.enum([
    "farmer",
    "extension_officer",
    "admin",
    "tenant_admin",
    "researcher",
    "service_provider",
  ]),
  language: z.string().default("en"),
  isActive: z.boolean().default(true),
  avatarUrl: z.string().url().optional(),
  forcePasswordChange: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// Tenant
export const TenantSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  config: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;

// Farm
export const FarmSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  farmerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  polygon: PolygonSchema,
  areaHectares: z.number().positive(),
  centerPoint: PointSchema,
  district: z.string().optional(),
  state: z.string().optional(),
  village: z.string().optional(),
  agroClimaticZone: z.string().optional(),
  soilType: z.string().optional(),
  waterSource: z.string().optional(),
  ownershipType: z.enum(["owned", "leased", "shared"]).default("owned"),
  isVerified: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Farm = z.infer<typeof FarmSchema>;

// Crop Declaration
export const CropDeclarationSchema = z.object({
  id: z.string().uuid(),
  farmId: z.string().uuid(),
  cropType: z.string(),
  variety: z.string().optional(),
  sowingDate: z.date(),
  expectedHarvestDate: z.date().optional(),
  irrigationType: z.string(),
  season: z.enum(["kharif", "rabi", "zaid"]),
  year: z.number().int(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
});

export type CropDeclaration = z.infer<typeof CropDeclarationSchema>;

// Farm Observation Time Series
export const FarmObservationSchema = z.object({
  id: z.string().uuid(),
  farmId: z.string().uuid(),
  observationDate: z.date(),
  source: z.string(),
  ndvi: z.number().min(-1).max(1).optional(),
  evi: z.number().min(-1).max(1).optional(),
  ndwi: z.number().min(-1).max(1).optional(),
  sarBackscatter: z.number().optional(),
  rainfall24h: z.number().optional(),
  rainfall72h: z.number().optional(),
  rainfall7d: z.number().optional(),
  lstDay: z.number().optional(),
  lstNight: z.number().optional(),
  soilMoistureProxy: z.number().optional(),
  healthScore: z.number().min(0).max(100).optional(),
  anomalyScore: z.number().optional(),
  stageEstimate: z.string().optional(),
  cloudCoverPct: z.number().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type FarmObservation = z.infer<typeof FarmObservationSchema>;

// Alert
export const AlertSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  farmId: z.string().uuid(),
  type: z.enum([
    "weather",
    "pest",
    "disease",
    "weed",
    "nutrient",
    "irrigation",
    "harvest",
    "market",
    "scheme",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  triggerData: z.record(z.unknown()).optional(),
  status: z.enum(["active", "acknowledged", "resolved", "dismissed"]).default(
    "active",
  ),
  expiresAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Alert = z.infer<typeof AlertSchema>;

// Advisory Message
export const AdvisoryMessageSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid(),
  language: z.string(),
  title: z.string(),
  message: z.string(),
  actions: z.array(z.object({
    label: z.string(),
    type: z.enum(["link", "action"]),
    value: z.string(),
  })).optional(),
  audioUrl: z.string().url().optional(),
  createdAt: z.date(),
});

export type AdvisoryMessage = z.infer<typeof AdvisoryMessageSchema>;

// Satellite Product Catalog
export const SatelliteProductSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  productId: z.string(),
  acquisitionTime: z.date(),
  cloudCoverPct: z.number().min(0).max(100).optional(),
  boundingBox: z.object({
    minLon: z.number(),
    minLat: z.number(),
    maxLon: z.number(),
    maxLat: z.number(),
  }),
  orbitNumber: z.number().optional(),
  processingLevel: z.string().optional(),
  cogUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type SatelliteProduct = z.infer<typeof SatelliteProductSchema>;

// Expert Ticket
export const ExpertTicketSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  farmerId: z.string().uuid(),
  farmId: z.string().uuid().optional(),
  subject: z.string().max(200),
  description: z.string(),
  category: z.enum(["pest", "disease", "nutrient", "irrigation", "general"]),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).default("open"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  assignedTo: z.string().uuid().optional(),
  resolvedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ExpertTicket = z.infer<typeof ExpertTicketSchema>;

// Marketplace
export const ServiceProviderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  userId: z.string().uuid(),
  businessName: z.string(),
  serviceTypes: z.array(z.string()),
  coverageDistricts: z.array(z.string()),
  kycStatus: z.enum(["pending", "verified", "rejected"]).default("pending"),
  rating: z.number().min(0).max(5).optional(),
  totalBookings: z.number().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ServiceProvider = z.infer<typeof ServiceProviderSchema>;

export const BookingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  farmerId: z.string().uuid(),
  providerId: z.string().uuid(),
  farmId: z.string().uuid(),
  serviceType: z.string(),
  scheduledDate: z.date(),
  status: z.enum([
    "pending",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
  ]).default("pending"),
  notes: z.string().optional(),
  totalAmount: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Booking = z.infer<typeof BookingSchema>;

// Market Prices
export const MarketPriceSchema = z.object({
  id: z.string().uuid(),
  crop: z.string(),
  variety: z.string().optional(),
  mandiName: z.string(),
  district: z.string(),
  state: z.string(),
  priceDate: z.date(),
  minPrice: z.number(),
  maxPrice: z.number(),
  modalPrice: z.number(),
  unit: z.string().default("quintal"),
  source: z.string(),
  createdAt: z.date(),
});

export type MarketPrice = z.infer<typeof MarketPriceSchema>;

// Scheme
export const SchemeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  nameLocal: z.record(z.string()).optional(),
  description: z.string(),
  descriptionLocal: z.record(z.string()).optional(),
  type: z.enum(["subsidy", "loan", "insurance", "training", "other"]),
  eligibilityCriteria: z.record(z.unknown()),
  documentsRequired: z.array(z.string()),
  applicationUrl: z.string().url().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Scheme = z.infer<typeof SchemeSchema>;

// Session/Auth types
export interface Session {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  expiresAt: Date;
}

export interface AuthState {
  session: Session | null;
  user: User | null;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// Job Queue types
export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: unknown;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}
