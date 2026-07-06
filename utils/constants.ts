export const SITE_NAME = "Compass";
export const SITE_DESCRIPTION =
  "Field-level digital advisory system for Indian agriculture";
export const SITE_LOCALE = "en-IN";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
] as const;

export const DEFAULT_LANGUAGE = "en";

// Comprehensive list of crops grown in India, organized by category
export const CROP_CATEGORIES = [
  {
    id: "cereals",
    name: "Cereals & Millets",
    nameHi: "अनाज और बाजरा",
    crops: [
      { id: "rice", name: "Rice/Paddy", nameHi: "धान" },
      { id: "wheat", name: "Wheat", nameHi: "गेहूं" },
      { id: "maize", name: "Maize/Corn", nameHi: "मक्का" },
      { id: "barley", name: "Barley", nameHi: "जौ" },
      { id: "jowar", name: "Sorghum/Jowar", nameHi: "ज्वार" },
      { id: "bajra", name: "Pearl Millet/Bajra", nameHi: "बाजरा" },
      { id: "ragi", name: "Finger Millet/Ragi", nameHi: "रागी" },
      { id: "oats", name: "Oats", nameHi: "जई" },
      { id: "foxtail_millet", name: "Foxtail Millet", nameHi: "कंगनी" },
      { id: "little_millet", name: "Little Millet", nameHi: "कुटकी" },
      { id: "barnyard_millet", name: "Barnyard Millet", nameHi: "सांवा" },
      { id: "kodo_millet", name: "Kodo Millet", nameHi: "कोदो" },
    ],
  },
  {
    id: "pulses",
    name: "Pulses & Legumes",
    nameHi: "दालें",
    crops: [
      { id: "chickpea", name: "Chickpea/Gram", nameHi: "चना" },
      { id: "pigeon_pea", name: "Pigeon Pea/Arhar", nameHi: "अरहर" },
      { id: "mung_bean", name: "Mung Bean/Moong", nameHi: "मूंग" },
      { id: "urad", name: "Black Gram/Urad", nameHi: "उड़द" },
      { id: "lentil", name: "Lentil/Masoor", nameHi: "मसूर" },
      { id: "field_pea", name: "Field Pea/Matar", nameHi: "मटर" },
      { id: "kidney_bean", name: "Kidney Bean/Rajma", nameHi: "राजमा" },
      { id: "cowpea", name: "Cowpea/Lobia", nameHi: "लोबिया" },
      { id: "moth_bean", name: "Moth Bean", nameHi: "मोठ" },
      { id: "horse_gram", name: "Horse Gram/Kulthi", nameHi: "कुलथी" },
    ],
  },
  {
    id: "oilseeds",
    name: "Oilseeds",
    nameHi: "तिलहन",
    crops: [
      { id: "soybean", name: "Soybean", nameHi: "सोयाबीन" },
      { id: "groundnut", name: "Groundnut/Peanut", nameHi: "मूंगफली" },
      { id: "mustard", name: "Mustard/Sarson", nameHi: "सरसों" },
      { id: "sunflower", name: "Sunflower", nameHi: "सूरजमुखी" },
      { id: "sesame", name: "Sesame/Til", nameHi: "तिल" },
      { id: "castor", name: "Castor", nameHi: "अरंडी" },
      { id: "linseed", name: "Linseed/Flax", nameHi: "अलसी" },
      { id: "safflower", name: "Safflower", nameHi: "कुसुम" },
      { id: "niger", name: "Niger Seed", nameHi: "रामतिल" },
      { id: "rapeseed", name: "Rapeseed", nameHi: "तोरिया" },
    ],
  },
  {
    id: "cash_crops",
    name: "Cash Crops",
    nameHi: "नकदी फसलें",
    crops: [
      { id: "cotton", name: "Cotton", nameHi: "कपास" },
      { id: "sugarcane", name: "Sugarcane", nameHi: "गन्ना" },
      { id: "jute", name: "Jute", nameHi: "जूट" },
      { id: "tobacco", name: "Tobacco", nameHi: "तंबाकू" },
      { id: "tea", name: "Tea", nameHi: "चाय" },
      { id: "coffee", name: "Coffee", nameHi: "कॉफी" },
      { id: "rubber", name: "Rubber", nameHi: "रबड़" },
      { id: "coconut", name: "Coconut", nameHi: "नारियल" },
      { id: "arecanut", name: "Arecanut/Betel Nut", nameHi: "सुपारी" },
    ],
  },
  {
    id: "spices",
    name: "Spices & Condiments",
    nameHi: "मसाले",
    crops: [
      { id: "turmeric", name: "Turmeric", nameHi: "हल्दी" },
      { id: "ginger", name: "Ginger", nameHi: "अदरक" },
      { id: "chilli", name: "Chilli/Pepper", nameHi: "मिर्च" },
      { id: "coriander", name: "Coriander", nameHi: "धनिया" },
      { id: "cumin", name: "Cumin/Jeera", nameHi: "जीरा" },
      { id: "fenugreek", name: "Fenugreek/Methi", nameHi: "मेथी" },
      { id: "fennel", name: "Fennel/Saunf", nameHi: "सौंफ" },
      { id: "cardamom", name: "Cardamom", nameHi: "इलायची" },
      { id: "black_pepper", name: "Black Pepper", nameHi: "काली मिर्च" },
      { id: "clove", name: "Clove", nameHi: "लौंग" },
      { id: "garlic", name: "Garlic", nameHi: "लहसुन" },
      { id: "ajwain", name: "Carom/Ajwain", nameHi: "अजवाइन" },
    ],
  },
  {
    id: "vegetables",
    name: "Vegetables",
    nameHi: "सब्जियां",
    crops: [
      { id: "potato", name: "Potato", nameHi: "आलू" },
      { id: "onion", name: "Onion", nameHi: "प्याज" },
      { id: "tomato", name: "Tomato", nameHi: "टमाटर" },
      { id: "brinjal", name: "Brinjal/Eggplant", nameHi: "बैंगन" },
      { id: "okra", name: "Okra/Lady Finger", nameHi: "भिंडी" },
      { id: "cabbage", name: "Cabbage", nameHi: "पत्ता गोभी" },
      { id: "cauliflower", name: "Cauliflower", nameHi: "फूल गोभी" },
      { id: "carrot", name: "Carrot", nameHi: "गाजर" },
      { id: "radish", name: "Radish", nameHi: "मूली" },
      { id: "spinach", name: "Spinach", nameHi: "पालक" },
      { id: "bottle_gourd", name: "Bottle Gourd/Lauki", nameHi: "लौकी" },
      { id: "bitter_gourd", name: "Bitter Gourd/Karela", nameHi: "करेला" },
      { id: "ridge_gourd", name: "Ridge Gourd/Turai", nameHi: "तुरई" },
      { id: "pumpkin", name: "Pumpkin", nameHi: "कद्दू" },
      { id: "cucumber", name: "Cucumber", nameHi: "खीरा" },
      { id: "beans", name: "Beans", nameHi: "सेम" },
      { id: "capsicum", name: "Capsicum/Bell Pepper", nameHi: "शिमला मिर्च" },
      { id: "green_peas", name: "Green Peas", nameHi: "हरी मटर" },
      { id: "drumstick", name: "Drumstick/Moringa", nameHi: "सहजन" },
      { id: "sweet_potato", name: "Sweet Potato", nameHi: "शकरकंद" },
    ],
  },
  {
    id: "fruits",
    name: "Fruits",
    nameHi: "फल",
    crops: [
      { id: "mango", name: "Mango", nameHi: "आम" },
      { id: "banana", name: "Banana", nameHi: "केला" },
      { id: "grape", name: "Grape", nameHi: "अंगूर" },
      { id: "pomegranate", name: "Pomegranate", nameHi: "अनार" },
      { id: "guava", name: "Guava", nameHi: "अमरूद" },
      { id: "papaya", name: "Papaya", nameHi: "पपीता" },
      { id: "orange", name: "Orange", nameHi: "संतरा" },
      { id: "lemon", name: "Lemon/Lime", nameHi: "नींबू" },
      { id: "apple", name: "Apple", nameHi: "सेब" },
      { id: "litchi", name: "Litchi", nameHi: "लीची" },
      { id: "sapota", name: "Sapota/Chikoo", nameHi: "चीकू" },
      { id: "watermelon", name: "Watermelon", nameHi: "तरबूज" },
      { id: "muskmelon", name: "Muskmelon", nameHi: "खरबूजा" },
      { id: "pineapple", name: "Pineapple", nameHi: "अनानास" },
      { id: "jackfruit", name: "Jackfruit", nameHi: "कटहल" },
      { id: "custard_apple", name: "Custard Apple", nameHi: "सीताफल" },
      { id: "fig", name: "Fig", nameHi: "अंजीर" },
      { id: "dates", name: "Dates", nameHi: "खजूर" },
      { id: "ber", name: "Ber/Jujube", nameHi: "बेर" },
      { id: "amla", name: "Amla/Indian Gooseberry", nameHi: "आंवला" },
    ],
  },
  {
    id: "fodder",
    name: "Fodder & Forage",
    nameHi: "चारा",
    crops: [
      { id: "berseem", name: "Berseem/Egyptian Clover", nameHi: "बरसीम" },
      { id: "lucerne", name: "Lucerne/Alfalfa", nameHi: "रिजका" },
      { id: "napier", name: "Napier Grass", nameHi: "नेपियर घास" },
      { id: "oat_fodder", name: "Oat Fodder", nameHi: "जई चारा" },
      { id: "maize_fodder", name: "Maize Fodder", nameHi: "मक्का चारा" },
      { id: "sorghum_fodder", name: "Sorghum Fodder", nameHi: "ज्वार चारा" },
    ],
  },
  {
    id: "flowers",
    name: "Flowers & Ornamentals",
    nameHi: "फूल",
    crops: [
      { id: "marigold", name: "Marigold", nameHi: "गेंदा" },
      { id: "rose", name: "Rose", nameHi: "गुलाब" },
      { id: "jasmine", name: "Jasmine", nameHi: "चमेली" },
      { id: "tuberose", name: "Tuberose", nameHi: "रजनीगंधा" },
      { id: "chrysanthemum", name: "Chrysanthemum", nameHi: "गुलदाउदी" },
      { id: "gladiolus", name: "Gladiolus", nameHi: "ग्लेडियोलस" },
    ],
  },
] as const;

// Flat list of all crops for simpler usage
export const CROP_TYPES = CROP_CATEGORIES.flatMap((cat) =>
  cat.crops.map((crop) => ({
    ...crop,
    category: cat.id,
    categoryName: cat.name,
  }))
);

export const IRRIGATION_TYPES = [
  { id: "rainfed", name: "Rainfed", nameHi: "वर्षा सिंचित" },
  { id: "canal", name: "Canal", nameHi: "नहर" },
  { id: "tubewell", name: "Tubewell/Borewell", nameHi: "ट्यूबवेल/बोरवेल" },
  { id: "drip", name: "Drip Irrigation", nameHi: "टपक सिंचाई" },
  { id: "sprinkler", name: "Sprinkler", nameHi: "फव्वारा सिंचाई" },
  { id: "tank", name: "Tank/Pond", nameHi: "तालाब" },
] as const;

export const ALERT_TYPES = {
  WEATHER: "weather",
  PEST: "pest",
  DISEASE: "disease",
  WEED: "weed",
  NUTRIENT: "nutrient",
  IRRIGATION: "irrigation",
  HARVEST: "harvest",
  MARKET: "market",
  SCHEME: "scheme",
} as const;

export const ALERT_SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export const SATELLITE_SOURCES = {
  SENTINEL2: "sentinel-2",
  SENTINEL1: "sentinel-1",
  LANDSAT8: "landsat-8",
  LANDSAT9: "landsat-9",
  MODIS: "modis",
  VIIRS: "viirs",
  GPM_IMERG: "gpm-imerg",
  SMAP: "smap",
} as const;

export const ROLES = {
  FARMER: "farmer",
  EXTENSION_OFFICER: "extension_officer",
  ADMIN: "admin",
  TENANT_ADMIN: "tenant_admin",
  RESEARCHER: "researcher",
  SERVICE_PROVIDER: "service_provider",
} as const;

export const PERMISSIONS = {
  FARM_CREATE: "farm:create",
  FARM_READ: "farm:read",
  FARM_UPDATE: "farm:update",
  FARM_DELETE: "farm:delete",
  ALERT_CREATE: "alert:create",
  ALERT_READ: "alert:read",
  TICKET_CREATE: "ticket:create",
  TICKET_RESPOND: "ticket:respond",
  USER_READ: "user:read",
  USER_CREATE: "user:create",
  USER_UPDATE: "user:update",
  USER_MANAGE: "user:manage",
  CONTENT_MODERATE: "content:moderate",
  ANALYTICS_VIEW: "analytics:view",
  TENANT_MANAGE: "tenant:manage",
  JOB_MANAGE: "job:manage",
  ADMIN: "admin",
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  farmer: [
    PERMISSIONS.FARM_CREATE,
    PERMISSIONS.FARM_READ,
    PERMISSIONS.FARM_UPDATE,
    PERMISSIONS.ALERT_READ,
    PERMISSIONS.TICKET_CREATE,
  ],
  extension_officer: [
    PERMISSIONS.FARM_READ,
    PERMISSIONS.ALERT_CREATE,
    PERMISSIONS.ALERT_READ,
    PERMISSIONS.TICKET_RESPOND,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  admin: Object.values(PERMISSIONS),
  tenant_admin: [
    PERMISSIONS.FARM_READ,
    PERMISSIONS.FARM_UPDATE,
    PERMISSIONS.ALERT_CREATE,
    PERMISSIONS.ALERT_READ,
    PERMISSIONS.TICKET_RESPOND,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.CONTENT_MODERATE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  researcher: [
    PERMISSIONS.FARM_READ,
    PERMISSIONS.ALERT_READ,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  service_provider: [
    PERMISSIONS.FARM_READ,
  ],
};
