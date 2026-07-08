# Khetscope - Satellite-Based Agricultural Advisory Platform

A production-ready, multi-tenant agricultural advisory platform for Indian
farmers. Combines free satellite data, AI-powered crop analysis, and real-time
weather to deliver personalized farm recommendations as an installable web PWA.

## Features

### Farmer-Facing (Web PWA)

- **Farm Management** - Register farms with polygon boundaries on a map, track
  multiple farms
- **Satellite Monitoring** - NDVI/EVI health scores from Sentinel-2 & Landsat
  (Element 84, free)
- **AI Crop Analysis** - Camera-based crop scanning with Gemini vision AI
  (pest/disease ID)
- **AI Chat Assistant** - Context-aware farming advice via Gemini (knows your
  farm, crop, weather)
- **Weather Intelligence** - 7-day forecast, rainfall, irrigation advisories
  (Open-Meteo, free)
- **Alerts & Advisories** - Push notifications for weather, pest, market events
- **Voice Advisories** - Listen in 11 Indian languages (Sarvam AI TTS)
- **Government Schemes** - Browse eligible schemes with deadlines
- **Market Prices** - Mandi price data for nearby markets
- **Offline Support** - Service worker caching, offline data sync

### Admin Panel (15+ pages)

- **Dashboard** - Overview stats, recent alerts, farm health summary
- **CRM Leads** - Farmer/farm profiles with engagement scoring, smart
  segmentation, CSV/JSON export, shareable links for CRM integration
- **Notification Composer** - Send push notifications with icon selection, tone,
  expandable image, deep links
- **Farm Management** - View, verify, inspect all farms with satellite data
- **User Management** - Create, edit, toggle active, reset passwords, role
  assignment
- **Alert Management** - Create bulk alerts by district/crop/farm targeting
- **News Management** - Crawl, manage agricultural news articles
- **Scheme & Product Management** - Full CRUD for government schemes and agri
  products
- **Analytics** - Crop distribution, health trends, monthly stats, CSV export
  with time range filter
- **Audit Logs** - Track all admin actions
- **Data Sync** - Manual satellite/weather/market sync triggers

## Tech Stack

| Layer             | Technology                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Deno 2.0+                                                                                                                                             |
| Web Framework     | Fresh 1.6 (Preact 10, SSR, islands architecture)                                                                                                      |
| Database          | PostgreSQL 16+ with PostGIS                                                                                                                           |
| Validation        | Zod                                                                                                                                                   |
| Job Queue         | PostgreSQL-backed (`FOR UPDATE SKIP LOCKED`, no external queue)                                                                                       |
| Auth              | Username/password, PBKDF2 hashing, session cookies                                                                                                    |
| AI                | Google Gemini 2.0 Flash via Vertex AI (analysis, chat, vision)                                                                                        |
| Speech-to-Text    | Google Cloud Speech-to-Text, with Gemini audio as fallback                                                                                            |
| Translation/TTS   | Sarvam AI (11 Indian languages)                                                                                                                       |
| Earth Observation | Element 84 Earth Search + Microsoft Planetary Computer (fallback), Copernicus Data Space, NASA GIBS, ISRO Bhuvan -- see [Data Sources](#data-sources) |
| Weather           | Open-Meteo (primary), NASA POWER (agro-climatology)                                                                                                   |
| Soil              | ISRO Bhuvan/NBSS (India), SoilGrids/ISRIC (global fallback)                                                                                           |
| Market Prices     | data.gov.in / Agmarknet, eNAM (fallback)                                                                                                              |
| Maps              | Leaflet, ISRO Bhuvan WMS layers, Ola Maps (Indian geocoding)                                                                                          |
| Push              | Firebase Cloud Messaging (FCM v1 HTTP API)                                                                                                            |
| CSS               | Tailwind CSS 3.4                                                                                                                                      |
| Testing           | Deno's built-in test runner, k6 load tests                                                                                                            |
| Deployment        | Google Cloud Run via GitHub Actions (Workload Identity Federation)                                                                                    |

## Data Sources

Every data source is free/public -- no paid satellite or weather API, per the
platform's public-data-only constraint. Each domain has its own fallback chain
(`lib/satellite/`, `lib/soil.ts`) so a single provider outage degrades quality
rather than breaking the feature:

- **Satellite imagery (Sentinel-2, Landsat)**:
  [Element 84 Earth Search](https://earth-search.aws.element84.com) (primary,
  free STAC API) ->
  [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com)
  (fallback)
- **Additional imagery/map layers**:
  [Copernicus Data Space](https://dataspace.copernicus.eu) (Sentinel Hub WMS),
  [NASA GIBS](https://gibs.earthdata.nasa.gov) (MODIS/GPM/SMAP tiles),
  [ISRO Bhuvan](https://bhuvan.nrsc.gov.in) (Indian thematic layers)
- **Weather**: [Open-Meteo](https://open-meteo.com) (primary, no auth) ->
  [NASA POWER](https://power.larc.nasa.gov) (agricultural
  meteorology/climatology)
- **Soil**: ISRO Bhuvan/NBSS (India-specific) ->
  [SoilGrids/ISRIC](https://soilgrids.org) (global 250m) -> Open-Meteo soil
  moisture -> deterministic fallback
- **Market prices**: [data.gov.in](https://data.gov.in) / Agmarknet ->
  [eNAM](https://enam.gov.in) (fallback) -> cached static data
- **Geocoding**: Ola Maps -> OSM/Nominatim fallback

## Quick Start

### Prerequisites

- [Deno](https://deno.com/) v2.0+
- A PostgreSQL 16 database with PostGIS — either:
  - [Neon](https://neon.tech) serverless Postgres (free tier, no local setup),
    or
  - Local via [Docker](https://docker.com/) Compose (included)

### 1. Clone & Configure

```bash
git clone <repo-url>
cd kissan-alert-solution
cp .env.example .env
```

Edit `.env` with your values. See the **Environment Variables** section below
for the full list. At minimum you need `DATABASE_URL` and `APP_SECRET`.

### 2. Database

**Option A — Neon (recommended):** create a free project at https://neon.tech
and set `DATABASE_URL` in `.env` to the **direct** (non-pooler) connection
string, e.g.

```
DATABASE_URL=postgres://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**Option B — local Docker:**

```bash
docker-compose up -d postgres
```

(The default `DATABASE_URL` in `.env.example` already points at this container.)
Migrations create the required `postgis` and `uuid-ossp` extensions
automatically.

### 3. Run Migrations

```bash
deno task db:migrate
```

This applies all 13 migrations creating 44+ tables.

### 4. Seed Demo Data

```bash
deno task db:seed          # tenant, users, 3 demo farms, crops
deno task seed:schemes     # real government schemes (PM-KISAN, KALIA, PMFBY…)
deno task sync:farms       # fetch live satellite/weather observations
```

Creates a demo tenant, admin user, sample farms (Pune, Koraput, Anantapur), crop
data, schemes, and field observations.

### 5. Start the App — one command runs everything

```bash
deno task dev
```

Open http://localhost:8000

There is **no separate frontend and backend** to start. Fresh is a full-stack
framework: this single process serves

- the server-rendered **frontend** (farmer PWA at `/app`, admin at `/admin`,
  bank portal at `/bank`),
- the **REST API** (`routes/api/*` under `/api/…`), and
- the **scheduled cron jobs** (satellite ingest, weather alerts, advisories —
  registered from `cron.ts` at startup).

Optional extra process for heavy background jobs only:

```bash
deno task worker   # background job queue processor (not needed for the demo)
```

For production-style serving without file watching: `deno task start`.

### 6. Login

Default credentials after seeding:

- **Username**: `admin` (or phone number without +91)
- **Password**: Same as username (forced to change on first login)

### 7. Push Notifications (Optional)

**Firebase Setup** (server-side FCM push):

1. Create a Firebase project at https://console.firebase.google.com
2. Generate a service account key → set the `FCM_*` env vars on the server

## Project Structure

```
kissan-alert-solution/
├── ai/                          # AI integrations
│   ├── gemini.ts                # Gemini: analysis, chat, vision
│   ├── sarvam.ts                # Sarvam: translation, TTS
│   └── advisory.ts              # Advisory rule engine
├── components/                  # Shared Preact components
│   ├── Layout.tsx               # App layout
│   └── AdminLayout.tsx          # Admin sidebar layout
├── db/                          # Database layer
│   ├── client.ts                # PostgreSQL pool + query helpers
│   ├── migrate.ts               # 13 versioned migrations
│   └── seed.ts                  # Demo data seeder
├── islands/                     # Interactive Preact islands
│   ├── FarmMap.tsx              # Leaflet map with drawing
│   ├── LoginForm.tsx            # Auth forms
│   └── ...                      # 14+ islands
├── lib/                         # Business logic
│   ├── auth.ts                  # Auth: hashing, sessions, cache
│   ├── leads.ts                 # CRM lead scoring & export
│   ├── notifications.ts         # FCM push notification sender
│   └── news/crawler.ts          # RSS news aggregator
├── middlewares/                  # Fresh middleware
│   └── auth.ts                  # Session validation + caching
├── routes/
│   ├── admin/                   # 20+ admin pages
│   │   ├── index.tsx            # Dashboard
│   │   ├── leads.tsx            # CRM leads + export
│   │   ├── notifications.tsx    # Push notification composer
│   │   ├── news.tsx             # News management
│   │   └── ...                  # Users, farms, alerts, etc.
│   ├── api/                     # REST API endpoints
│   │   ├── auth/                # Login, register, logout
│   │   ├── farms/               # CRUD + observations
│   │   ├── leads/               # Shareable CRM lead links
│   │   ├── push/                # FCM token register/unregister
│   │   └── ...                  # Chat, alerts, crops, weather
│   └── app/                     # Farmer-facing PWA pages
├── workers/                     # Background job processors
├── utils/                       # Config, constants, env
├── static/                      # PWA assets, service worker
├── cron.ts                      # Deno cron job definitions
├── docker-compose.yml
├── Dockerfile
└── deno.json                    # Deno config with import map
```

## API Reference

### Authentication

| Method | Endpoint           | Description                        |
| ------ | ------------------ | ---------------------------------- |
| POST   | `/api/auth/login`  | Login / Register / Change password |
| POST   | `/api/auth/logout` | Logout (clear session)             |
| GET    | `/api/auth/me`     | Get current user profile           |

### Farms

| Method | Endpoint                      | Description                    |
| ------ | ----------------------------- | ------------------------------ |
| GET    | `/api/farms`                  | List user's farms              |
| POST   | `/api/farms`                  | Create farm with polygon       |
| GET    | `/api/farms/:id`              | Farm detail with crops, health |
| GET    | `/api/farms/:id/observations` | Time-series health data        |

### AI & Analysis

| Method | Endpoint                       | Description               |
| ------ | ------------------------------ | ------------------------- |
| POST   | `/api/chat`                    | AI chat with farm context |
| POST   | `/api/analyze-crop`            | Camera image analysis     |
| GET    | `/api/recommendations/:farmId` | AI recommendations        |

### Alerts

| Method | Endpoint      | Description          |
| ------ | ------------- | -------------------- |
| GET    | `/api/alerts` | User's active alerts |

### Push Notifications

| Method | Endpoint               | Description          |
| ------ | ---------------------- | -------------------- |
| POST   | `/api/push/register`   | Register FCM token   |
| POST   | `/api/push/unregister` | Unregister FCM token |

### CRM Leads (Shareable)

| Method | Endpoint            | Description                   |
| ------ | ------------------- | ----------------------------- |
| GET    | `/api/leads/:token` | Public lead export (CSV/JSON) |

## Environment Variables

### Required

| Variable       | Description                        |
| -------------- | ---------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string       |
| `APP_SECRET`   | Session signing secret (64+ chars) |

### AI Services

Gemini runs through Vertex AI, authenticated as the runtime's own GCP identity
-- there's no API key to set. Locally, run
`gcloud auth application-default login` once; on Cloud Run, the service
account's IAM roles (`aiplatform.user`, `speech.client`) handle it.

| Variable               | Description                          | Required    |
| ---------------------- | ------------------------------------ | ----------- |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID for Vertex AI/STT     | Recommended |
| `VERTEX_AI_LOCATION`   | Vertex AI region (default: `global`) | Optional    |
| `SARVAM_API_KEY`       | Sarvam AI for translation/TTS        | Optional    |

### Push Notifications (Firebase)

| Variable                    | Description                       |
| --------------------------- | --------------------------------- |
| `FCM_PROJECT_ID`            | Firebase project ID               |
| `FCM_SERVICE_ACCOUNT_EMAIL` | Service account email             |
| `FCM_PRIVATE_KEY`           | Service account private key (PEM) |

### Feature Flags

| Variable              | Default | Description                |
| --------------------- | ------- | -------------------------- |
| `DATABASE_POOL_SIZE`  | 20      | PostgreSQL connection pool |
| `MOCK_SATELLITE_DATA` | false   | Use mock satellite data    |
| `ENABLE_VOICE_ALERTS` | true    | Enable Sarvam TTS          |

## Database Schema

13 migrations creating 44+ tables across domains:

- **Multi-tenancy**: `tenants`, `users`, `sessions`
- **Farm Management**: `farms`, `farm_crops`, `crop_declarations`,
  `farm_observations`, `farm_activity_logs`, `farm_calendar_events`
- **Satellite**: `satellite_products`
- **Alerts**: `alerts`, `alert_schedules`, `advisory_messages`
- **Content**: `news_articles`, `content_items`
- **Commerce**: `agri_products`, `manufacturers`, `product_recommendations`,
  `market_prices`, `dealers`
- **Government**: `government_schemes`, `schemes`, `farmer_scheme_matches`
- **Banking**: `bank_customers`, `loan_applications`, `loan_repayments`,
  `bank_audit_logs`
- **Support**: `expert_tickets`, `ticket_messages`, `service_providers`,
  `bookings`
- **Infrastructure**: `push_tokens`, `lead_export_links`, `audit_logs`, `jobs`,
  `translation_cache`, `tts_cache`

## Cron Jobs

7 scheduled background tasks:

| Schedule | Job                   | Description                      |
| -------- | --------------------- | -------------------------------- |
| Every 6h | `ingest-satellite`    | Fetch satellite catalog updates  |
| Every 4h | `extract-features`    | Extract NDVI/EVI from imagery    |
| Every 2h | `generate-advisories` | Run AI advisory engine           |
| Every 3h | `update-weather`      | Refresh weather data             |
| 3x daily | `crawl-news`          | Fetch agricultural news from RSS |
| Daily    | `sync-market-prices`  | Update mandi market prices       |
| Daily    | `cleanup-old-data`    | Remove stale/expired records     |

## Deployment

### Google Cloud Run

Every push to `main` triggers `.github/workflows/deploy-cloud-run.yml`, which
authenticates via Workload Identity Federation (no long-lived key) and runs:

```bash
gcloud run deploy compass \
  --source . \
  --region asia-south1 \
  --set-secrets APP_SECRET=app-secret:latest,DATABASE_URL=database-url:latest
```

`APP_SECRET` and `DATABASE_URL` come from Secret Manager, not `.env`. Gemini and
Cloud STT need no secret at all -- the Cloud Run service account is granted the
`aiplatform.user` and `speech.client` IAM roles directly.

### Docker

```bash
docker-compose up -d
```

### Production Checklist

- [ ] Set strong `APP_SECRET` (64+ random characters)
- [ ] Configure `DATABASE_URL` with SSL
- [ ] Grant the service account `aiplatform.user` and `speech.client` IAM roles
      for Gemini/STT
- [ ] Set `FCM_*` variables for push notifications
- [ ] Run `deno task db:migrate` on production database
- [ ] Configure HTTPS/TLS termination
- [ ] Set up database backups
- [ ] Monitor with Cloud Run metrics/logs

## License

MIT
