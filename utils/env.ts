function getEnv(key: string, defaultValue?: string): string {
  const value = Deno.env.get(key);
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getBoolEnv(key: string, defaultValue = false): boolean {
  const value = Deno.env.get(key);
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

function getIntEnv(key: string, defaultValue: number): number {
  const value = Deno.env.get(key);
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

export const env = {
  APP_ENV: getEnv("APP_ENV", "development"),
  APP_URL: getEnv("APP_URL", "http://localhost:8000"),
  APP_SECRET: getEnv("APP_SECRET", "dev-secret-key-change-in-production"),
  IS_DEV: getEnv("APP_ENV", "development") === "development",

  DATABASE_URL: getEnv(
    "DATABASE_URL",
    "postgres://compass:compass@localhost:5432/compass",
  ),
  DATABASE_POOL_SIZE: getIntEnv("DATABASE_POOL_SIZE", 20),

  // Sarvam AI for translation/TTS
  SARVAM_API_KEY: getEnv("SARVAM_API_KEY", ""),
  SARVAM_API_URL: getEnv("SARVAM_API_URL", "https://api.sarvam.ai/v1"),

  // Gemini AI for analysis, called via Vertex AI (IAM auth, no API key)
  GEMINI_MODEL: getEnv("GEMINI_MODEL", "gemini-2.0-flash"),
  GOOGLE_CLOUD_PROJECT: getEnv("GOOGLE_CLOUD_PROJECT", "kissan-alert-501602"),
  VERTEX_AI_LOCATION: getEnv("VERTEX_AI_LOCATION", "global"),

  // Satellite Data APIs (Copernicus - free)
  COPERNICUS_CLIENT_ID: getEnv("COPERNICUS_CLIENT_ID", ""),
  COPERNICUS_CLIENT_SECRET: getEnv("COPERNICUS_CLIENT_SECRET", ""),

  // Market Price APIs
  DATA_GOV_API_KEY: getEnv("DATA_GOV_API_KEY", ""),

  // Maps
  OLA_MAPS_API_KEY: getEnv("OLA_MAPS_API_KEY", ""),

  // Feature flags
  MOCK_SATELLITE_DATA: getBoolEnv("MOCK_SATELLITE_DATA", false),
  ENABLE_SMS_OTP: getBoolEnv("ENABLE_SMS_OTP", false),
  ENABLE_VOICE_ALERTS: getBoolEnv("ENABLE_VOICE_ALERTS", true),

  DEFAULT_TENANT_ID: getEnv("DEFAULT_TENANT_ID", "default"),

  // YouTube API (for video reels)
  YOUTUBE_API_KEY: getEnv("YOUTUBE_API_KEY", ""),

  // Facebook Videos (optional - only if enabled)
  FACEBOOK_PAGE_ACCESS_TOKEN: getEnv("FACEBOOK_PAGE_ACCESS_TOKEN", ""),
  FACEBOOK_PAGE_IDS: getEnv("FACEBOOK_PAGE_IDS", ""), // comma-separated

  // Firebase Cloud Messaging (server-side push)
  FCM_PROJECT_ID: getEnv("FCM_PROJECT_ID", ""),
  FCM_SERVICE_ACCOUNT_EMAIL: getEnv("FCM_SERVICE_ACCOUNT_EMAIL", ""),
  FCM_PRIVATE_KEY: getEnv("FCM_PRIVATE_KEY", ""),
};
