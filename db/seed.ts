import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

// Dynamic import so .env is loaded before utils/env.ts reads DATABASE_URL
// (a static import would hoist above the load() call)
const { getPool } = await import("./client.ts");

async function seed() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("Seeding database...");

    // Create default tenant
    await client.queryObject(`
      INSERT INTO tenants (id, name, slug, description) 
      VALUES ('default', 'Khetscope Demo', 'khetscope-demo', 'Default demo tenant for Khetscope platform')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create demo admin user
    await client.queryObject(`
      INSERT INTO users (id, tenant_id, username, phone, name, email, role, language)
      VALUES (
        'a0000000-0000-0000-0000-000000000001',
        'default',
        'admin',
        '+919876543210',
        'Admin User',
        'admin@compass.app',
        'admin',
        'en'
      )
      ON CONFLICT (phone) DO NOTHING;
    `);

    // Create demo farmer user
    await client.queryObject(`
      INSERT INTO users (id, tenant_id, username, phone, name, role, language)
      VALUES (
        'f0000000-0000-0000-0000-000000000001',
        'default',
        '9876543211',
        '+919876543211',
        'Demo Farmer',
        'farmer',
        'hi'
      )
      ON CONFLICT (phone) DO NOTHING;
    `);

    // Create demo farm with polygon (sample location in Maharashtra)
    await client.queryObject(`
      INSERT INTO farms (
        id, tenant_id, farmer_id, name, polygon, area_hectares, center_point,
        district, state, village, soil_type, water_source, ownership_type
      ) 
      VALUES (
        'ff000000-0000-0000-0000-000000000001',
        'default',
        'f0000000-0000-0000-0000-000000000001',
        'Demo Farm 1',
        ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[74.0060,18.5204],[74.0080,18.5204],[74.0080,18.5224],[74.0060,18.5224],[74.0060,18.5204]]]}'),
        2.5,
        ST_GeomFromGeoJSON('{"type":"Point","coordinates":[74.0070,18.5214]}'),
        'Pune',
        'Maharashtra',
        'Khed',
        'black_cotton',
        'tubewell',
        'owned'
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create crop declaration
    await client.queryObject(`
      INSERT INTO crop_declarations (
        id, farm_id, crop_type, variety, sowing_date, expected_harvest_date,
        irrigation_type, season, year, is_active
      ) 
      VALUES (
        'cc000000-0000-0000-0000-000000000001',
        'ff000000-0000-0000-0000-000000000001',
        'soybean',
        'JS-335',
        '2024-06-15',
        '2024-10-15',
        'rainfed',
        'kharif',
        2024,
        true
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Demo farm 2: Koraput, Odisha — rainfed kharif paddy (Odisha showcase;
    // also exercises the dry-spell rule when the forecast is dry)
    await client.queryObject(`
      INSERT INTO farms (
        id, tenant_id, farmer_id, name, polygon, area_hectares, center_point,
        district, state, village, soil_type, water_source, ownership_type
      )
      VALUES (
        'ff000000-0000-0000-0000-000000000002',
        'default',
        'f0000000-0000-0000-0000-000000000001',
        'Koraput Paddy Field',
        ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[82.7090,18.8110],[82.7130,18.8110],[82.7130,18.8140],[82.7090,18.8140],[82.7090,18.8110]]]}'),
        1.8,
        ST_GeomFromGeoJSON('{"type":"Point","coordinates":[82.7110,18.8125]}'),
        'Koraput', 'Odisha', 'Kundura', 'red', 'rainfed', 'owned'
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.queryObject(`
      INSERT INTO crop_declarations (
        id, farm_id, crop_type, variety, sowing_date, expected_harvest_date,
        irrigation_type, season, year, is_active
      )
      VALUES (
        'cc000000-0000-0000-0000-000000000002',
        'ff000000-0000-0000-0000-000000000002',
        'rice', 'Swarna', CURRENT_DATE - 40, CURRENT_DATE + 80,
        'rainfed', 'kharif', EXTRACT(YEAR FROM CURRENT_DATE)::int, true
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Demo farm 3: Anantapur, AP — rainfed paddy in a chronically dry belt
    // (reliably triggers the dry-spell forecast alert)
    await client.queryObject(`
      INSERT INTO farms (
        id, tenant_id, farmer_id, name, polygon, area_hectares, center_point,
        district, state, village, soil_type, water_source, ownership_type
      )
      VALUES (
        'ff000000-0000-0000-0000-000000000003',
        'default',
        'f0000000-0000-0000-0000-000000000001',
        'Anantapur Paddy Field',
        ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[77.5990,14.6800],[77.6030,14.6800],[77.6030,14.6840],[77.5990,14.6840],[77.5990,14.6800]]]}'),
        2.0,
        ST_GeomFromGeoJSON('{"type":"Point","coordinates":[77.6010,14.6820]}'),
        'Anantapur', 'Andhra Pradesh', 'Garladinne', 'red', 'rainfed', 'owned'
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.queryObject(`
      INSERT INTO crop_declarations (
        id, farm_id, crop_type, variety, sowing_date, expected_harvest_date,
        irrigation_type, season, year, is_active
      )
      VALUES (
        'cc000000-0000-0000-0000-000000000003',
        'ff000000-0000-0000-0000-000000000003',
        'rice', 'MTU-1010', CURRENT_DATE - 40, CURRENT_DATE + 80,
        'rainfed', 'kharif', EXTRACT(YEAR FROM CURRENT_DATE)::int, true
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Insert sample farm observations (mock NDVI data)
    const observations = [];
    const baseDate = new Date("2024-06-15");
    for (let i = 0; i < 30; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i * 5);
      const ndvi = 0.2 + (i / 30) * 0.5 + (Math.random() * 0.1 - 0.05);
      const evi = ndvi * 0.8;
      const rainfall = Math.random() > 0.7 ? Math.random() * 30 : 0;
      observations.push({
        date: date.toISOString().split("T")[0],
        ndvi: Math.min(0.9, Math.max(0.1, ndvi)).toFixed(4),
        evi: Math.min(0.85, Math.max(0.1, evi)).toFixed(4),
        rainfall: rainfall.toFixed(2),
        healthScore: Math.min(100, Math.max(0, ndvi * 100 + 20)).toFixed(2),
      });
    }

    for (const obs of observations) {
      await client.queryObject(
        `
        INSERT INTO farm_observations (
          farm_id, observation_date, source, ndvi, evi, rainfall_24h, health_score
        ) 
        VALUES (
          'ff000000-0000-0000-0000-000000000001',
          $1, 'sentinel-2', $2, $3, $4, $5
        )
        ON CONFLICT (farm_id, observation_date, source) DO UPDATE SET
          ndvi = EXCLUDED.ndvi,
          evi = EXCLUDED.evi,
          rainfall_24h = EXCLUDED.rainfall_24h,
          health_score = EXCLUDED.health_score;
      `,
        [obs.date, obs.ndvi, obs.evi, obs.rainfall, obs.healthScore],
      );
    }

    // Create sample alerts
    await client.queryObject(`
      INSERT INTO alerts (
        id, tenant_id, farm_id, type, severity, title, description, confidence, status
      ) 
      VALUES 
      (
        'aa000000-0000-0000-0000-000000000001',
        'default',
        'ff000000-0000-0000-0000-000000000001',
        'pest',
        'medium',
        'Possible Pest Risk - Soybean Pod Borer',
        'Based on current crop stage and recent weather conditions, there is moderate risk of pod borer infestation. Scout your field and look for bore holes in pods.',
        0.72,
        'active'
      ),
      (
        'aa000000-0000-0000-0000-000000000002',
        'default',
        'ff000000-0000-0000-0000-000000000001',
        'weather',
        'high',
        'Heavy Rainfall Expected',
        'IMD forecasts 50-70mm rainfall in next 48 hours. Ensure proper drainage in your field. Avoid any spray applications.',
        0.85,
        'active'
      ),
      (
        'aa000000-0000-0000-0000-000000000003',
        'default',
        'ff000000-0000-0000-0000-000000000001',
        'nutrient',
        'low',
        'Consider Foliar Spray',
        'Based on crop stage (flowering), a foliar application of micronutrients (Boron + Sulphur) may improve pod setting.',
        0.65,
        'active'
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create advisory messages in multiple languages
    await client.queryObject(`
      INSERT INTO advisory_messages (alert_id, language, title, message, actions) 
      VALUES 
      (
        'aa000000-0000-0000-0000-000000000001',
        'en',
        'Possible Pest Risk - Soybean Pod Borer',
        'Based on current crop stage and recent weather conditions, there is moderate risk of pod borer infestation. Scout your field and look for bore holes in pods.',
        '[{"label":"Learn More","type":"link","value":"/learn/pest/pod-borer"},{"label":"Book Spraying","type":"action","value":"book_spray"}]'
      ),
      (
        'aa000000-0000-0000-0000-000000000001',
        'hi',
        'संभावित कीट जोखिम - सोयाबीन फली छेदक',
        'वर्तमान फसल अवस्था और हाल की मौसम स्थितियों के आधार पर, फली छेदक संक्रमण का मध्यम जोखिम है। अपने खेत का निरीक्षण करें और फलियों में छेद देखें।',
        '[{"label":"और जानें","type":"link","value":"/learn/pest/pod-borer"},{"label":"स्प्रे बुक करें","type":"action","value":"book_spray"}]'
      )
      ON CONFLICT (alert_id, language) DO NOTHING;
    `);

    // Create sample schemes
    await client.queryObject(`
      INSERT INTO schemes (id, name, name_local, description, type, eligibility_criteria, documents_required, is_active) 
      VALUES 
      (
        '55000000-0000-0000-0000-000000000001',
        'PM-KISAN',
        '{"hi": "प्रधानमंत्री किसान सम्मान निधि"}',
        'Income support of Rs. 6000 per year to small and marginal farmer families',
        'subsidy',
        '{"land_holding_max_hectares": 2, "ownership": ["owned", "leased"]}',
        '["Aadhaar Card", "Land Records", "Bank Account Details"]',
        true
      ),
      (
        '55000000-0000-0000-0000-000000000002',
        'PMFBY - Pradhan Mantri Fasal Bima Yojana',
        '{"hi": "प्रधानमंत्री फसल बीमा योजना"}',
        'Crop insurance scheme providing financial support in case of crop failure',
        'insurance',
        '{"crops": ["soybean", "cotton", "rice", "wheat"]}',
        '["Aadhaar Card", "Land Records", "Bank Account", "Crop Sowing Declaration"]',
        true
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create sample market prices
    const crops = ["soybean", "cotton", "wheat", "rice"];
    const mandis = [
      { name: "Pune APMC", district: "Pune", state: "Maharashtra" },
      { name: "Latur APMC", district: "Latur", state: "Maharashtra" },
    ];

    for (const crop of crops) {
      for (const mandi of mandis) {
        const basePrice = Math.random() * 3000 + 2000;
        await client.queryObject(
          `
          INSERT INTO market_prices (crop, mandi_name, district, state, price_date, min_price, max_price, modal_price, source)
          VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, 'agmarknet')
          ON CONFLICT DO NOTHING;
        `,
          [
            crop,
            mandi.name,
            mandi.district,
            mandi.state,
            (basePrice * 0.95).toFixed(2),
            (basePrice * 1.05).toFixed(2),
            basePrice.toFixed(2),
          ],
        );
      }
    }

    // Create demo bank officer user
    await client.queryObject(`
      INSERT INTO users (id, tenant_id, username, phone, name, email, role, language)
      VALUES (
        'b0000000-0000-0000-0000-000000000001',
        'default',
        '9876543215',
        '+919876543215',
        'Bank Officer Demo',
        'bank@compass.app',
        'bank_officer',
        'en'
      )
      ON CONFLICT (phone) DO NOTHING;
    `);

    // Create bank customer from demo farmer (if bank_customers table exists)
    try {
      await client.queryObject(`
        INSERT INTO bank_customers (id, tenant_id, user_id, bank_officer_id, customer_code, kyc_status, credit_score, notes)
        VALUES (
          'bc000000-0000-0000-0000-000000000001',
          'default',
          'f0000000-0000-0000-0000-000000000001',
          'b0000000-0000-0000-0000-000000000001',
          'CUS001',
          'verified',
          720,
          'Demo farmer with verified KYC'
        )
        ON CONFLICT DO NOTHING;
      `);

      // Create sample loan application
      await client.queryObject(`
        INSERT INTO loan_applications (
          id, tenant_id, customer_id, farm_id, application_number,
          loan_type, loan_purpose, requested_amount, approved_amount,
          interest_rate, tenure_months, status, agri_score,
          agri_score_breakdown, risk_category, assessment_notes,
          submitted_at, assessed_at, approved_at
        )
        VALUES (
          'la000000-0000-0000-0000-000000000001',
          'default',
          'bc000000-0000-0000-0000-000000000001',
          'ff000000-0000-0000-0000-000000000001',
          'LOAN001',
          'crop_loan',
          'Kharif crop cultivation - soybean',
          150000,
          150000,
          7.0,
          12,
          'disbursed',
          72,
          '{"health": 75, "soil": 70, "water": 80, "management": 65, "credit": 70}',
          'low',
          'Good credit history, verified farm with active crop. Recommended for approval.',
          NOW() - INTERVAL '30 days',
          NOW() - INTERVAL '25 days',
          NOW() - INTERVAL '20 days'
        )
        ON CONFLICT DO NOTHING;
      `);

      // Create another sample loan (pending)
      await client.queryObject(`
        INSERT INTO loan_applications (
          id, tenant_id, customer_id, farm_id, application_number,
          loan_type, loan_purpose, requested_amount, tenure_months, status
        )
        VALUES (
          'la000000-0000-0000-0000-000000000002',
          'default',
          'bc000000-0000-0000-0000-000000000001',
          'ff000000-0000-0000-0000-000000000001',
          'LOAN002',
          'equipment_loan',
          'Purchase of drip irrigation system',
          80000,
          24,
          'submitted'
        )
        ON CONFLICT DO NOTHING;
      `);

      console.log("Bank data seeded successfully!");
    } catch (e) {
      console.log(
        "Bank tables may not exist yet, skipping bank data seeding:",
        e,
      );
    }

    console.log("Database seeded successfully!");
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  await seed();
}

export { seed };
