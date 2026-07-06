/**
 * Seed real government schemes (Odisha-focused) into both tables the app
 * reads: `schemes` (farmer app) and `government_schemes` (admin panel).
 * Idempotent — safe to re-run.
 */
import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

// Dynamic import so .env is loaded before utils/env.ts reads DATABASE_URL
const { query } = await import("../db/client.ts");

interface SchemeSeed {
  name: string;
  nameOdia: string;
  description: string;
  type: "subsidy" | "loan" | "insurance" | "welfare";
  eligibility: string;
  benefits: string;
  documents: string[];
  url: string;
}

const SCHEMES: SchemeSeed[] = [
  {
    name: "PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)",
    nameOdia: "ପିଏମ୍-କିଷାନ",
    description:
      "Central income support of ₹6,000 per year to all landholding farmer families, paid in three ₹2,000 installments directly to bank accounts.",
    type: "welfare",
    eligibility:
      "All landholding farmer families with cultivable land; excludes institutional landholders and income-tax payers.",
    benefits: "₹6,000/year in 3 installments via DBT",
    documents: ["Aadhaar card", "Land record (RoR)", "Bank passbook"],
    url: "https://pmkisan.gov.in/",
  },
  {
    name: "KALIA (Krushak Assistance for Livelihood and Income Augmentation)",
    nameOdia: "କାଳିଆ ଯୋଜନା",
    description:
      "Odisha state scheme providing financial assistance to small/marginal farmers and landless agricultural households for cultivation and livelihood support.",
    type: "welfare",
    eligibility:
      "Small & marginal farmers and landless agricultural households of Odisha; identified via Green Form/verification.",
    benefits:
      "₹4,000/year cultivation support per farm family; ₹12,500 livelihood support for landless households",
    documents: [
      "Aadhaar card",
      "Bank passbook",
      "Land record or landless certificate",
    ],
    url: "https://kalia.odisha.gov.in/",
  },
  {
    name: "PMFBY (Pradhan Mantri Fasal Bima Yojana)",
    nameOdia: "ପ୍ରଧାନମନ୍ତ୍ରୀ ଫସଲ ବୀମା ଯୋଜନା",
    description:
      "Crop insurance against yield losses from natural calamities, pests and diseases. Farmer premium capped at 2% (kharif), 1.5% (rabi), 5% (commercial/horticulture).",
    type: "insurance",
    eligibility:
      "All farmers growing notified crops in notified areas, including sharecroppers and tenant farmers.",
    benefits: "Insured sum paid on assessed crop loss; low fixed premium",
    documents: [
      "Aadhaar card",
      "Land record / tenancy agreement",
      "Bank passbook",
      "Sowing declaration",
    ],
    url: "https://pmfby.gov.in/",
  },
  {
    name: "Kisan Credit Card (KCC)",
    nameOdia: "କିଷାନ କ୍ରେଡିଟ୍ କାର୍ଡ",
    description:
      "Short-term credit for cultivation, post-harvest expenses and allied activities at subsidised interest (effective ~4% with prompt-repayment incentive).",
    type: "loan",
    eligibility:
      "Farmers (owner cultivators, tenants, sharecroppers, SHGs); animal husbandry & fisheries included.",
    benefits:
      "Credit up to ₹3 lakh at subsidised interest; interest subvention 2% + prompt repayment incentive 3%",
    documents: [
      "Aadhaar card",
      "Land record",
      "Bank account",
      "Passport photo",
    ],
    url: "https://www.myscheme.gov.in/schemes/kcc",
  },
  {
    name: "Soil Health Card Scheme",
    nameOdia: "ମୃତ୍ତିକା ସ୍ୱାସ୍ଥ୍ୟ କାର୍ଡ",
    description:
      "Free soil testing every 2 years with crop-wise fertilizer recommendations (N, P, K, micronutrients) to cut input cost and improve yield.",
    type: "subsidy",
    eligibility:
      "All farmers; samples collected via state agriculture department.",
    benefits: "Free soil test report + fertilizer dose recommendation per crop",
    documents: ["Aadhaar card", "Land details"],
    url: "https://soilhealth.dac.gov.in/",
  },
  {
    name: "Mukhyamantri Krushi Udyoga Yojana (MKUY / APICOL)",
    nameOdia: "ମୁଖ୍ୟମନ୍ତ୍ରୀ କୃଷି ଉଦ୍ୟୋଗ ଯୋଜନା",
    description:
      "Odisha capital investment subsidy for agri-enterprises: commercial agriculture, horticulture, fishery and animal husbandry units.",
    type: "subsidy",
    eligibility:
      "Odisha residents 18+ taking up commercial agri-enterprise; priority to SC/ST, women, unemployed graduates.",
    benefits: "Capital subsidy 40–50% of project cost (caps by category)",
    documents: [
      "Aadhaar card",
      "Project report",
      "Land document/lease",
      "Bank account",
      "Caste certificate (if applicable)",
    ],
    url: "https://apicol.odisha.gov.in/",
  },
];

for (const s of SCHEMES) {
  // Farmer app table
  await query(
    `INSERT INTO schemes (name, name_local, description, type, eligibility_criteria, documents_required, application_url, is_active)
     SELECT $1::varchar, $2::jsonb, $3::text, $4::varchar, $5::jsonb, $6::jsonb, $7::text, true
     WHERE NOT EXISTS (SELECT 1 FROM schemes WHERE name = $1::varchar)`,
    [
      s.name,
      JSON.stringify({ or: s.nameOdia }),
      s.description,
      s.type,
      JSON.stringify({ text: s.eligibility }),
      JSON.stringify(s.documents),
      s.url,
    ],
  );
  // Admin table
  await query(
    `INSERT INTO government_schemes (name, description, type, eligibility, benefits, documents_required, document_url, is_active)
     SELECT $1::varchar, $2::text, $3::varchar, $4::text, $5::text, $6::jsonb, $7::text, true
     WHERE NOT EXISTS (SELECT 1 FROM government_schemes WHERE name = $1::varchar)`,
    [
      s.name,
      s.description,
      s.type,
      s.eligibility,
      s.benefits,
      JSON.stringify(s.documents),
      s.url,
    ],
  );
}

const counts = await query<{ a: number; b: number }>(
  `SELECT (SELECT COUNT(*) FROM schemes) a, (SELECT COUNT(*) FROM government_schemes) b`,
);
console.log(
  `Done. schemes: ${counts[0].a}, government_schemes: ${counts[0].b}`,
);
Deno.exit(0);
