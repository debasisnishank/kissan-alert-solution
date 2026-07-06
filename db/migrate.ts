import { load } from "$std/dotenv/mod.ts";
await load({ allowEmptyValues: true, export: true });

// Dynamic import to ensure env is loaded first
const { getPool } = await import("./client.ts");

const migrations = [
  {
    version: 1,
    name: "initial_schema",
    up: `
      -- Enable PostGIS
      CREATE EXTENSION IF NOT EXISTS postgis;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Tenants
      CREATE TABLE tenants (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        logo_url TEXT,
        config JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Users
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        phone VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        role VARCHAR(50) NOT NULL DEFAULT 'farmer',
        language VARCHAR(10) DEFAULT 'en',
        is_active BOOLEAN DEFAULT true,
        avatar_url TEXT,
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_users_tenant ON users(tenant_id);
      CREATE INDEX idx_users_phone ON users(phone);
      CREATE INDEX idx_users_role ON users(role);

      -- Sessions
      CREATE TABLE sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_token ON sessions(token_hash);

      -- Farms
      CREATE TABLE farms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        polygon GEOMETRY(Polygon, 4326) NOT NULL,
        area_hectares NUMERIC(10, 4) NOT NULL,
        center_point GEOMETRY(Point, 4326),
        district VARCHAR(100),
        state VARCHAR(100),
        village VARCHAR(100),
        agro_climatic_zone VARCHAR(50),
        soil_type VARCHAR(50),
        water_source VARCHAR(50),
        ownership_type VARCHAR(20) DEFAULT 'owned',
        is_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_farms_tenant ON farms(tenant_id);
      CREATE INDEX idx_farms_farmer ON farms(farmer_id);
      CREATE INDEX idx_farms_polygon ON farms USING GIST(polygon);
      CREATE INDEX idx_farms_center ON farms USING GIST(center_point);

      -- Crop Declarations
      CREATE TABLE crop_declarations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        crop_type VARCHAR(50) NOT NULL,
        variety VARCHAR(100),
        sowing_date DATE NOT NULL,
        expected_harvest_date DATE,
        irrigation_type VARCHAR(50),
        season VARCHAR(20) NOT NULL,
        year INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_crop_decl_farm ON crop_declarations(farm_id);
      CREATE INDEX idx_crop_decl_active ON crop_declarations(farm_id, is_active);

      -- Satellite Products Catalog
      CREATE TABLE satellite_products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        source VARCHAR(50) NOT NULL,
        product_id VARCHAR(200) UNIQUE NOT NULL,
        acquisition_time TIMESTAMPTZ NOT NULL,
        cloud_cover_pct NUMERIC(5, 2),
        bounding_box GEOMETRY(Polygon, 4326),
        orbit_number INTEGER,
        processing_level VARCHAR(20),
        cog_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_sat_products_source ON satellite_products(source);
      CREATE INDEX idx_sat_products_time ON satellite_products(acquisition_time);
      CREATE INDEX idx_sat_products_bbox ON satellite_products USING GIST(bounding_box);

      -- Farm Observations (Feature Store)
      CREATE TABLE farm_observations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        observation_date DATE NOT NULL,
        source VARCHAR(50) NOT NULL,
        ndvi NUMERIC(5, 4),
        evi NUMERIC(5, 4),
        ndwi NUMERIC(5, 4),
        sar_backscatter NUMERIC(8, 4),
        rainfall_24h NUMERIC(8, 2),
        rainfall_72h NUMERIC(8, 2),
        rainfall_7d NUMERIC(8, 2),
        lst_day NUMERIC(6, 2),
        lst_night NUMERIC(6, 2),
        soil_moisture_proxy NUMERIC(5, 4),
        health_score NUMERIC(5, 2),
        anomaly_score NUMERIC(5, 4),
        stage_estimate VARCHAR(50),
        cloud_cover_pct NUMERIC(5, 2),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(farm_id, observation_date, source)
      );
      CREATE INDEX idx_farm_obs_farm ON farm_observations(farm_id);
      CREATE INDEX idx_farm_obs_date ON farm_observations(observation_date);
      CREATE INDEX idx_farm_obs_farm_date ON farm_observations(farm_id, observation_date DESC);

      -- Alerts
      CREATE TABLE alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        confidence NUMERIC(4, 3),
        trigger_data JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active',
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_alerts_tenant ON alerts(tenant_id);
      CREATE INDEX idx_alerts_farm ON alerts(farm_id);
      CREATE INDEX idx_alerts_type ON alerts(type);
      CREATE INDEX idx_alerts_status ON alerts(status);
      CREATE INDEX idx_alerts_created ON alerts(created_at DESC);

      -- Advisory Messages (Localized)
      CREATE TABLE advisory_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
        language VARCHAR(10) NOT NULL,
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        actions JSONB DEFAULT '[]',
        audio_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(alert_id, language)
      );
      CREATE INDEX idx_advisory_alert ON advisory_messages(alert_id);

      -- Expert Tickets
      CREATE TABLE expert_tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
        subject VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        priority VARCHAR(20) DEFAULT 'medium',
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_tickets_tenant ON expert_tickets(tenant_id);
      CREATE INDEX idx_tickets_farmer ON expert_tickets(farmer_id);
      CREATE INDEX idx_tickets_status ON expert_tickets(status);

      -- Ticket Messages
      CREATE TABLE ticket_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id UUID REFERENCES expert_tickets(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        attachments JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_ticket_msg_ticket ON ticket_messages(ticket_id);

      -- Content Items (Reels/Shorts)
      CREATE TABLE content_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        media_url TEXT NOT NULL,
        thumbnail_url TEXT,
        content_type VARCHAR(20) NOT NULL,
        duration_seconds INTEGER,
        tags JSONB DEFAULT '[]',
        crop_tags JSONB DEFAULT '[]',
        stage_tags JSONB DEFAULT '[]',
        language VARCHAR(10) DEFAULT 'en',
        author_id UUID REFERENCES users(id) ON DELETE SET NULL,
        is_verified BOOLEAN DEFAULT false,
        is_published BOOLEAN DEFAULT false,
        view_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_content_tenant ON content_items(tenant_id);
      CREATE INDEX idx_content_published ON content_items(is_published);
      CREATE INDEX idx_content_language ON content_items(language);

      -- Service Providers (Marketplace)
      CREATE TABLE service_providers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        business_name VARCHAR(200) NOT NULL,
        service_types JSONB DEFAULT '[]',
        coverage_districts JSONB DEFAULT '[]',
        kyc_status VARCHAR(20) DEFAULT 'pending',
        rating NUMERIC(3, 2),
        total_bookings INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_providers_tenant ON service_providers(tenant_id);
      CREATE INDEX idx_providers_kyc ON service_providers(kyc_status);

      -- Bookings
      CREATE TABLE bookings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
        service_type VARCHAR(100) NOT NULL,
        scheduled_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        total_amount NUMERIC(12, 2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
      CREATE INDEX idx_bookings_farmer ON bookings(farmer_id);
      CREATE INDEX idx_bookings_provider ON bookings(provider_id);
      CREATE INDEX idx_bookings_status ON bookings(status);

      -- Market Prices
      CREATE TABLE market_prices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        crop VARCHAR(100) NOT NULL,
        variety VARCHAR(100),
        mandi_name VARCHAR(200) NOT NULL,
        district VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        price_date DATE NOT NULL,
        min_price NUMERIC(12, 2) NOT NULL,
        max_price NUMERIC(12, 2) NOT NULL,
        modal_price NUMERIC(12, 2) NOT NULL,
        unit VARCHAR(20) DEFAULT 'quintal',
        source VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_prices_crop ON market_prices(crop);
      CREATE INDEX idx_prices_date ON market_prices(price_date);
      CREATE INDEX idx_prices_district ON market_prices(district);

      -- Schemes
      CREATE TABLE schemes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(300) NOT NULL,
        name_local JSONB DEFAULT '{}',
        description TEXT NOT NULL,
        description_local JSONB DEFAULT '{}',
        type VARCHAR(50) NOT NULL,
        eligibility_criteria JSONB DEFAULT '{}',
        documents_required JSONB DEFAULT '[]',
        application_url TEXT,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_schemes_type ON schemes(type);
      CREATE INDEX idx_schemes_active ON schemes(is_active);

      -- Farmer Scheme Matches
      CREATE TABLE farmer_scheme_matches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        scheme_id UUID REFERENCES schemes(id) ON DELETE CASCADE,
        eligibility_score NUMERIC(5, 4),
        status VARCHAR(20) DEFAULT 'eligible',
        applied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(farmer_id, scheme_id)
      );
      CREATE INDEX idx_scheme_match_farmer ON farmer_scheme_matches(farmer_id);

      -- Audit Log
      CREATE TABLE audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(50),
        user_id UUID,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id UUID,
        before_data JSONB,
        after_data JSONB,
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
      CREATE INDEX idx_audit_user ON audit_log(user_id);
      CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

      -- Job Queue
      CREATE TABLE jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        error TEXT,
        result JSONB,
        scheduled_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_jobs_status ON jobs(status);
      CREATE INDEX idx_jobs_type ON jobs(type);
      CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_at) WHERE status = 'pending';

      -- Translation Cache
      CREATE TABLE translation_cache (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        source_text_hash VARCHAR(64) NOT NULL,
        source_language VARCHAR(10) NOT NULL,
        target_language VARCHAR(10) NOT NULL,
        translated_text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(source_text_hash, source_language, target_language)
      );
      CREATE INDEX idx_translation_hash ON translation_cache(source_text_hash);

      -- TTS Audio Cache
      CREATE TABLE tts_cache (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        text_hash VARCHAR(64) NOT NULL,
        language VARCHAR(10) NOT NULL,
        voice_id VARCHAR(50),
        audio_url TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(text_hash, language, voice_id)
      );
      CREATE INDEX idx_tts_hash ON tts_cache(text_hash);

      -- Government Schemes
      CREATE TABLE government_schemes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(50) DEFAULT 'general',
        eligibility TEXT,
        benefits TEXT,
        documents_required JSONB DEFAULT '[]',
        deadline DATE,
        document_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_gov_schemes_active ON government_schemes(is_active);
      CREATE INDEX idx_gov_schemes_deadline ON government_schemes(deadline);

      -- Manufacturers
      CREATE TABLE manufacturers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(200) NOT NULL UNIQUE,
        contact_person VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        website TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_manufacturers_active ON manufacturers(is_active);

      -- Agri Products
      CREATE TABLE agri_products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(200) NOT NULL,
        category VARCHAR(50) NOT NULL,
        manufacturer VARCHAR(200),
        description TEXT,
        composition TEXT,
        price NUMERIC(10, 2),
        unit VARCHAR(20) DEFAULT 'kg',
        recommended_for TEXT[] DEFAULT '{}',
        usage_instructions TEXT,
        safety_precautions TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX idx_products_category ON agri_products(category);
      CREATE INDEX idx_products_manufacturer ON agri_products(manufacturer);
      CREATE INDEX idx_products_active ON agri_products(is_active);

      -- Product Recommendations
      CREATE TABLE product_recommendations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        product_id UUID REFERENCES agri_products(id) ON DELETE CASCADE,
        recommendation_type VARCHAR(50) NOT NULL,
        reason TEXT,
        priority INTEGER DEFAULT 5,
        is_cross_sell BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );
      CREATE INDEX idx_recommendations_farm ON product_recommendations(farm_id);
      CREATE INDEX idx_recommendations_type ON product_recommendations(recommendation_type);

      -- Migrations tracking
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
    down: `
      DROP TABLE IF EXISTS _migrations CASCADE;
      DROP TABLE IF EXISTS product_recommendations CASCADE;
      DROP TABLE IF EXISTS agri_products CASCADE;
      DROP TABLE IF EXISTS manufacturers CASCADE;
      DROP TABLE IF EXISTS government_schemes CASCADE;
      DROP TABLE IF EXISTS tts_cache CASCADE;
      DROP TABLE IF EXISTS translation_cache CASCADE;
      DROP TABLE IF EXISTS jobs CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS farmer_scheme_matches CASCADE;
      DROP TABLE IF EXISTS schemes CASCADE;
      DROP TABLE IF EXISTS market_prices CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS service_providers CASCADE;
      DROP TABLE IF EXISTS content_items CASCADE;
      DROP TABLE IF EXISTS ticket_messages CASCADE;
      DROP TABLE IF EXISTS expert_tickets CASCADE;
      DROP TABLE IF EXISTS advisory_messages CASCADE;
      DROP TABLE IF EXISTS alerts CASCADE;
      DROP TABLE IF EXISTS farm_observations CASCADE;
      DROP TABLE IF EXISTS satellite_products CASCADE;
      DROP TABLE IF EXISTS crop_declarations CASCADE;
      DROP TABLE IF EXISTS farms CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS tenants CASCADE;
    `,
  },
  {
    version: 2,
    name: "add_missing_columns_and_tables",
    up: `
      -- Add is_active to farms if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'is_active') THEN
          ALTER TABLE farms ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
      END $$;

      -- Add polygon_geojson to farms if not exists
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farms' AND column_name = 'polygon_geojson') THEN
          ALTER TABLE farms ADD COLUMN polygon_geojson JSONB;
        END IF;
      END $$;

      -- Create government_schemes if not exists
      CREATE TABLE IF NOT EXISTS government_schemes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(50) DEFAULT 'general',
        eligibility TEXT,
        benefits TEXT,
        documents_required JSONB DEFAULT '[]',
        deadline DATE,
        document_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_gov_schemes_active ON government_schemes(is_active);
      CREATE INDEX IF NOT EXISTS idx_gov_schemes_deadline ON government_schemes(deadline);

      -- Create manufacturers if not exists
      CREATE TABLE IF NOT EXISTS manufacturers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        contact_person VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        website TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_manufacturers_active ON manufacturers(is_active);

      -- Create agri_products if not exists
      CREATE TABLE IF NOT EXISTS agri_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        category VARCHAR(50) NOT NULL,
        manufacturer VARCHAR(200),
        description TEXT,
        composition TEXT,
        price NUMERIC(10, 2),
        unit VARCHAR(20) DEFAULT 'kg',
        recommended_for TEXT[] DEFAULT '{}',
        usage_instructions TEXT,
        safety_precautions TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_products_category ON agri_products(category);
      CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON agri_products(manufacturer);
      CREATE INDEX IF NOT EXISTS idx_products_active ON agri_products(is_active);

      -- Create jobs if not exists
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        error TEXT,
        result JSONB,
        scheduled_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);

      -- Create alert_schedules if not exists
      CREATE TABLE IF NOT EXISTS alert_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        interval VARCHAR(20) NOT NULL,
        message TEXT,
        enabled BOOLEAN DEFAULT true,
        next_run TIMESTAMPTZ,
        last_run TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_alert_schedules_farm ON alert_schedules(farm_id);
      CREATE INDEX IF NOT EXISTS idx_alert_schedules_next ON alert_schedules(next_run) WHERE enabled = true;

      -- Create dealers if not exists
      CREATE TABLE IF NOT EXISTS dealers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        shop_name VARCHAR(200),
        phone VARCHAR(20),
        address TEXT,
        district VARCHAR(100),
        state VARCHAR(100),
        categories TEXT[] DEFAULT '{}',
        rating NUMERIC(3, 2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_dealers_district ON dealers(district);
      CREATE INDEX IF NOT EXISTS idx_dealers_active ON dealers(is_active);

      -- Create news_articles if not exists
      CREATE TABLE IF NOT EXISTS news_articles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        summary TEXT,
        content TEXT,
        category VARCHAR(50),
        source VARCHAR(200),
        source_url TEXT,
        image_url TEXT,
        published_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_news_category ON news_articles(category);
      CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
    `,
    down: `
      DROP TABLE IF EXISTS news_articles CASCADE;
      DROP TABLE IF EXISTS dealers CASCADE;
      DROP TABLE IF EXISTS alert_schedules CASCADE;
      ALTER TABLE farms DROP COLUMN IF EXISTS is_active;
      ALTER TABLE farms DROP COLUMN IF EXISTS polygon_geojson;
    `,
  },
  {
    version: 3,
    name: "add_activity_logs_table",
    up: `
      -- Create farm_activity_logs table
      CREATE TABLE IF NOT EXISTS farm_activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        quantity NUMERIC(10, 2),
        unit VARCHAR(20),
        cost NUMERIC(12, 2),
        notes TEXT,
        activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_farm ON farm_activity_logs(farm_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON farm_activity_logs(activity_type);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON farm_activity_logs(activity_date DESC);
    `,
    down: `
      DROP TABLE IF EXISTS farm_activity_logs CASCADE;
    `,
  },
  {
    version: 4,
    name: "add_farm_crops_table",
    up: `
      -- Create farm_crops table for tracking crops planted on farms
      CREATE TABLE IF NOT EXISTS farm_crops (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        crop_type VARCHAR(50) NOT NULL,
        variety VARCHAR(100),
        sowing_date DATE NOT NULL,
        expected_harvest_date DATE,
        actual_harvest_date DATE,
        irrigation_type VARCHAR(50) DEFAULT 'rainfed',
        season VARCHAR(20) DEFAULT 'kharif',
        area_hectares NUMERIC(10, 2),
        expected_yield_kg NUMERIC(10, 2),
        actual_yield_kg NUMERIC(10, 2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_farm_crops_farm ON farm_crops(farm_id);
      CREATE INDEX IF NOT EXISTS idx_farm_crops_type ON farm_crops(crop_type);
      CREATE INDEX IF NOT EXISTS idx_farm_crops_active ON farm_crops(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_farm_crops_sowing ON farm_crops(sowing_date);
    `,
    down: `
      DROP TABLE IF EXISTS farm_crops CASCADE;
    `,
  },
  {
    version: 5,
    name: "add_farm_calendar_events",
    up: `
      -- Farm calendar events for scheduling and tracking activities
      CREATE TABLE IF NOT EXISTS farm_calendar_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        crop_id UUID REFERENCES farm_crops(id) ON DELETE SET NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        event_type VARCHAR(50) NOT NULL DEFAULT 'task',
        event_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        is_recurring BOOLEAN DEFAULT false,
        recurrence_pattern VARCHAR(50),
        status VARCHAR(20) DEFAULT 'scheduled',
        priority VARCHAR(20) DEFAULT 'medium',
        reminder_days INTEGER DEFAULT 1,
        completed_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_events_farm ON farm_calendar_events(farm_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON farm_calendar_events(event_date);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON farm_calendar_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON farm_calendar_events(status);

      -- Seed default calendar templates based on crop stages
      CREATE TABLE IF NOT EXISTS crop_calendar_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        crop_type VARCHAR(50) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        day_offset INTEGER NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        season VARCHAR(20),
        region VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_templates_crop ON crop_calendar_templates(crop_type);

      -- Insert calendar templates for common crops
      INSERT INTO crop_calendar_templates (crop_type, event_type, title, description, day_offset, priority) VALUES
        -- Rice
        ('rice', 'sowing', 'Seed Sowing/Transplanting', 'Prepare nursery and transplant seedlings', 0, 'high'),
        ('rice', 'fertilizer', 'First Urea Application', 'Apply 40kg urea per hectare', 21, 'high'),
        ('rice', 'irrigation', 'Maintain Water Level', 'Keep 5-7cm water in field', 25, 'medium'),
        ('rice', 'fertilizer', 'Second Fertilizer Dose', 'Apply NPK mixture', 45, 'high'),
        ('rice', 'pesticide', 'Pest Management', 'Check for stem borer and BPH', 60, 'medium'),
        ('rice', 'irrigation', 'Reduce Water for Ripening', 'Drain water 15 days before harvest', 90, 'medium'),
        ('rice', 'harvest', 'Harvest', 'Harvest when 80% grains are golden', 120, 'high'),
        -- Wheat
        ('wheat', 'sowing', 'Seed Sowing', 'Use seed drill for uniform sowing', 0, 'high'),
        ('wheat', 'irrigation', 'First Irrigation (Crown Root)', 'Critical irrigation at 21 days', 21, 'high'),
        ('wheat', 'fertilizer', 'Urea Top Dressing', 'Apply 60kg urea per hectare', 25, 'high'),
        ('wheat', 'irrigation', 'Second Irrigation (Tillering)', 'Irrigation at tillering stage', 45, 'high'),
        ('wheat', 'pesticide', 'Weed Control', 'Apply herbicide if needed', 35, 'medium'),
        ('wheat', 'irrigation', 'Third Irrigation (Jointing)', 'Critical for grain formation', 70, 'high'),
        ('wheat', 'irrigation', 'Fourth Irrigation (Flowering)', 'Pre-flowering irrigation', 90, 'medium'),
        ('wheat', 'harvest', 'Harvest', 'Harvest at 14% moisture content', 140, 'high'),
        -- Cotton
        ('cotton', 'sowing', 'Seed Sowing', 'Sow BT cotton seeds', 0, 'high'),
        ('cotton', 'fertilizer', 'First Fertilizer', 'Apply DAP and urea', 20, 'high'),
        ('cotton', 'irrigation', 'First Irrigation', 'Light irrigation', 30, 'medium'),
        ('cotton', 'pesticide', 'Bollworm Management', 'Monitor and spray if needed', 45, 'high'),
        ('cotton', 'fertilizer', 'Second Fertilizer', 'Apply potash mixture', 60, 'high'),
        ('cotton', 'pesticide', 'Whitefly Control', 'Check for whitefly and spray', 75, 'medium'),
        ('cotton', 'harvest', 'First Picking', 'Pick fully opened bolls', 150, 'high'),
        -- Soybean
        ('soybean', 'sowing', 'Seed Sowing', 'Sow after monsoon onset', 0, 'high'),
        ('soybean', 'fertilizer', 'Fertilizer Application', 'Apply rhizobium culture', 15, 'medium'),
        ('soybean', 'pesticide', 'Pest Management', 'Monitor for girdle beetle', 40, 'medium'),
        ('soybean', 'irrigation', 'Irrigation if Needed', 'Only if dry spell occurs', 50, 'low'),
        ('soybean', 'harvest', 'Harvest', 'Harvest when leaves turn yellow', 100, 'high'),
        -- Maize
        ('maize', 'sowing', 'Seed Sowing', 'Sow at 60cm row spacing', 0, 'high'),
        ('maize', 'fertilizer', 'First Nitrogen Dose', 'Apply 1/3 nitrogen', 20, 'high'),
        ('maize', 'irrigation', 'Critical Irrigation', 'Irrigation at knee-high stage', 30, 'high'),
        ('maize', 'fertilizer', 'Second Nitrogen Dose', 'Apply remaining nitrogen', 45, 'high'),
        ('maize', 'pesticide', 'Fall Armyworm Control', 'Monitor and spray if needed', 35, 'high'),
        ('maize', 'harvest', 'Harvest', 'Harvest at physiological maturity', 110, 'high')
      ON CONFLICT DO NOTHING;
    `,
    down: `
      DROP TABLE IF EXISTS crop_calendar_templates CASCADE;
      DROP TABLE IF EXISTS farm_calendar_events CASCADE;
    `,
  },
  {
    version: 6,
    name: "add_bank_loan_tables",
    up: `
      -- Bank customers (links users to bank officers for tracking)
      CREATE TABLE IF NOT EXISTS bank_customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        bank_officer_id UUID REFERENCES users(id),
        customer_code VARCHAR(50),
        kyc_status VARCHAR(20) DEFAULT 'pending',
        kyc_verified_at TIMESTAMPTZ,
        credit_score INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bank_customers_tenant ON bank_customers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_bank_customers_user ON bank_customers(user_id);
      CREATE INDEX IF NOT EXISTS idx_bank_customers_officer ON bank_customers(bank_officer_id);

      -- Loan applications
      CREATE TABLE IF NOT EXISTS loan_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id UUID NOT NULL REFERENCES bank_customers(id) ON DELETE CASCADE,
        farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
        application_number VARCHAR(50) UNIQUE,
        loan_type VARCHAR(50) NOT NULL DEFAULT 'crop_loan',
        loan_purpose TEXT,
        requested_amount NUMERIC(12, 2) NOT NULL,
        approved_amount NUMERIC(12, 2),
        interest_rate NUMERIC(5, 2),
        tenure_months INTEGER,
        status VARCHAR(20) DEFAULT 'draft',
        agri_score INTEGER,
        agri_score_breakdown JSONB,
        risk_category VARCHAR(20),
        assessment_notes TEXT,
        submitted_at TIMESTAMPTZ,
        assessed_at TIMESTAMPTZ,
        assessed_by UUID REFERENCES users(id),
        approved_at TIMESTAMPTZ,
        approved_by UUID REFERENCES users(id),
        disbursed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_loans_tenant ON loan_applications(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_loans_customer ON loan_applications(customer_id);
      CREATE INDEX IF NOT EXISTS idx_loans_farm ON loan_applications(farm_id);
      CREATE INDEX IF NOT EXISTS idx_loans_status ON loan_applications(status);
      CREATE INDEX IF NOT EXISTS idx_loans_app_number ON loan_applications(application_number);

      -- Loan repayments
      CREATE TABLE IF NOT EXISTS loan_repayments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        principal NUMERIC(12, 2),
        interest NUMERIC(12, 2),
        payment_date DATE NOT NULL,
        payment_method VARCHAR(50),
        reference_number VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_repayments_loan ON loan_repayments(loan_id);
      CREATE INDEX IF NOT EXISTS idx_repayments_date ON loan_repayments(payment_date);

      -- Bank audit trail
      CREATE TABLE IF NOT EXISTS bank_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(50),
        user_id UUID,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bank_audit_entity ON bank_audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_bank_audit_user ON bank_audit_logs(user_id);
    `,
    down: `
      DROP TABLE IF EXISTS bank_audit_logs CASCADE;
      DROP TABLE IF EXISTS loan_repayments CASCADE;
      DROP TABLE IF EXISTS loan_applications CASCADE;
      DROP TABLE IF EXISTS bank_customers CASCADE;
    `,
  },
  {
    version: 7,
    name: "fix_calendar_crop_fk",
    up: `
      -- Drop the existing FK constraint to farm_crops
      ALTER TABLE farm_calendar_events 
        DROP CONSTRAINT IF EXISTS farm_calendar_events_crop_id_fkey;
      
      -- Add new FK constraint to crop_declarations instead
      ALTER TABLE farm_calendar_events
        ADD CONSTRAINT farm_calendar_events_crop_id_fkey
        FOREIGN KEY (crop_id) REFERENCES crop_declarations(id) ON DELETE SET NULL;
    `,
    down: `
      ALTER TABLE farm_calendar_events 
        DROP CONSTRAINT IF EXISTS farm_calendar_events_crop_id_fkey;
      
      ALTER TABLE farm_calendar_events
        ADD CONSTRAINT farm_calendar_events_crop_id_fkey
        FOREIGN KEY (crop_id) REFERENCES farm_crops(id) ON DELETE SET NULL;
    `,
  },
  {
    version: 8,
    name: "push_tokens",
    up: `
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);
    `,
    down: `DROP TABLE IF EXISTS push_tokens CASCADE;`,
  },
  {
    version: 9,
    name: "username_password_auth_and_video_reels",
    up: `
      -- Add username and force_password_change columns to users
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

      -- Backfill existing users: username = phone (without +91)
      -- Handle duplicates by appending row_number
      UPDATE users u
      SET username = sub.new_username,
          force_password_change = true
      FROM (
        SELECT id,
               CASE
                 WHEN ROW_NUMBER() OVER (PARTITION BY REPLACE(phone, '+91', '') ORDER BY created_at) = 1
                 THEN REPLACE(phone, '+91', '')
                 ELSE REPLACE(phone, '+91', '') || '_' || ROW_NUMBER() OVER (PARTITION BY REPLACE(phone, '+91', '') ORDER BY created_at)
               END AS new_username
        FROM users
        WHERE username IS NULL
      ) sub
      WHERE u.id = sub.id;

      -- For any remaining NULLs, use the user id
      UPDATE users SET username = id::text WHERE username IS NULL;

      -- Now make it NOT NULL and UNIQUE
      ALTER TABLE users ALTER COLUMN username SET NOT NULL;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
          ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

      -- Video sources catalog
      CREATE TABLE IF NOT EXISTS video_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform VARCHAR(20) NOT NULL CHECK (platform IN ('youtube', 'facebook')),
        external_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        channel_name VARCHAR(255),
        channel_id VARCHAR(255),
        thumbnail_url TEXT,
        thumbnail_cached_path TEXT,
        video_url TEXT NOT NULL,
        embed_url TEXT,
        duration_seconds INTEGER,
        view_count BIGINT DEFAULT 0,
        like_count BIGINT DEFAULT 0,
        published_at TIMESTAMPTZ,
        tags TEXT[],
        category VARCHAR(50),
        language VARCHAR(10) DEFAULT 'en',
        geo_region VARCHAR(50) DEFAULT 'IN',
        is_short BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        metadata JSONB DEFAULT '{}',
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(platform, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_video_sources_platform ON video_sources(platform);
      CREATE INDEX IF NOT EXISTS idx_video_sources_category ON video_sources(category);
      CREATE INDEX IF NOT EXISTS idx_video_sources_is_short ON video_sources(is_short);
      CREATE INDEX IF NOT EXISTS idx_video_sources_published ON video_sources(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_video_sources_active ON video_sources(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_video_sources_tags ON video_sources USING GIN(tags);

      -- Track which videos each user has seen
      CREATE TABLE IF NOT EXISTS video_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id UUID NOT NULL REFERENCES video_sources(id) ON DELETE CASCADE,
        watched_seconds INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT false,
        liked BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, video_id)
      );
      CREATE INDEX IF NOT EXISTS idx_video_views_user ON video_views(user_id);
      CREATE INDEX IF NOT EXISTS idx_video_views_video ON video_views(video_id);

      -- Video fetch job tracking
      CREATE TABLE IF NOT EXISTS video_fetch_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform VARCHAR(20) NOT NULL,
        query_term VARCHAR(255) NOT NULL,
        page_token TEXT,
        videos_fetched INTEGER DEFAULT 0,
        next_page_token TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_video_fetch_log_platform ON video_fetch_log(platform, query_term);
      CREATE INDEX IF NOT EXISTS idx_video_fetch_log_created ON video_fetch_log(created_at DESC);
    `,
    down: `
      DROP TABLE IF EXISTS video_fetch_log CASCADE;
      DROP TABLE IF EXISTS video_views CASCADE;
      DROP TABLE IF EXISTS video_sources CASCADE;
      ALTER TABLE users DROP COLUMN IF EXISTS username;
      ALTER TABLE users DROP COLUMN IF EXISTS force_password_change;
    `,
  },
  {
    version: 10,
    name: "crm_lead_exports",
    up: `
      CREATE TABLE IF NOT EXISTS lead_export_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id),
        token VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(200) NOT NULL,
        segment VARCHAR(50) NOT NULL DEFAULT 'all',
        export_type VARCHAR(10) NOT NULL DEFAULT 'farmer' CHECK (export_type IN ('farmer', 'farm')),
        format VARCHAR(10) NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
        filters JSONB DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL,
        max_access_count INTEGER DEFAULT 100,
        access_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lead_links_token ON lead_export_links(token);
      CREATE INDEX IF NOT EXISTS idx_lead_links_tenant ON lead_export_links(tenant_id);

      -- Track user engagement for lead scoring
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
    `,
    down: `
      DROP TABLE IF EXISTS lead_export_links CASCADE;
      ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
      ALTER TABLE users DROP COLUMN IF EXISTS login_count;
    `,
  },
  {
    version: 11,
    name: "production_fixes",
    up: `
      -- Widen phone column from VARCHAR(15) to VARCHAR(20)
      ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(20);

      -- Add unique constraint for market prices upsert
      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_prices_unique
        ON market_prices(crop, mandi_name, price_date);
    `,
    down: `
      ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(15);
      DROP INDEX IF EXISTS idx_market_prices_unique;
    `,
  },
  {
    version: 12,
    name: "user_preferences",
    up: `
      -- Key-value user preferences (used by /app/settings)
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key VARCHAR(100) NOT NULL,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, key)
      );
    `,
    down: `
      DROP TABLE IF EXISTS user_preferences CASCADE;
    `,
  },
];

async function migrate() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Ensure migrations table exists
    await client.queryObject(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Get applied migrations
    const result = await client.queryObject<{ version: number }>(
      "SELECT version FROM _migrations ORDER BY version",
    );
    const appliedVersions = new Set(result.rows.map((r) => r.version));

    // Apply pending migrations
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        console.log(
          `Applying migration ${migration.version}: ${migration.name}`,
        );
        await client.queryObject("BEGIN");
        try {
          await client.queryObject(migration.up);
          await client.queryObject(
            "INSERT INTO _migrations (version, name) VALUES ($1, $2)",
            [migration.version, migration.name],
          );
          await client.queryObject("COMMIT");
          console.log(`Migration ${migration.version} applied successfully`);
        } catch (error) {
          await client.queryObject("ROLLBACK");
          throw error;
        }
      }
    }

    console.log("All migrations applied successfully");
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.main) {
  await migrate();
}

export { migrate, migrations };
