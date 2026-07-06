# Compass - Satellite-Based Agricultural Advisory Platform

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
- **Video Reels** - TikTok-style agricultural education videos (YouTube Data
  API)
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
- **Video Reels Management** - Fetch, toggle visibility, delete YouTube videos
- **News Management** - Crawl, manage agricultural news articles
- **Scheme & Product Management** - Full CRUD for government schemes and agri
  products
- **Analytics** - Crop distribution, health trends, monthly stats, CSV export
  with time range filter
- **Audit Logs** - Track all admin actions
- **Data Sync** - Manual satellite/weather/market sync triggers

## Tech Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Runtime       | Deno 2.0+                                           |
| Web Framework | Fresh 1.6 (Preact, SSR)                             |
| Database      | PostgreSQL 16 + PostGIS                             |
| Auth          | Username/password, PBKDF2 hashing, session tokens   |
| AI            | Google Gemini 2.0 Flash (analysis, chat, vision)    |
| Translation   | Sarvam AI (11 languages, TTS)                       |
| Satellite     | Element 84 Earth Search (free, Sentinel-2, Landsat) |
| Weather       | Open-Meteo (free, no API key)                       |
| Videos        | YouTube Data API v3                                 |
| Push          | Firebase Cloud Messaging (FCM v1 HTTP API)          |
| CSS           | Tailwind CSS 3.4                                    |
| Maps          | Leaflet + ISRO Bhuvan WMS layers                    |

## Quick Start

### Prerequisites

- [Deno](https://deno.com/) v2.0+
- [Docker](https://docker.com/) & Docker Compose
- PostgreSQL 16 with PostGIS extension

### 1. Clone & Configure

```bash
git clone <repo-url>
cd compass-deno
cp .env.example .env
```

Edit `.env` with your values. See the **Environment Variables** section
below for the full list. At minimum you need `DATABASE_URL` and `APP_SECRET`.

### 2. Start Database

```bash
docker-compose up -d postgres
```

Or use an existing PostgreSQL instance with PostGIS:

```bash
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 3. Run Migrations

```bash
deno task db:migrate
```

This applies all 10 migrations creating 39+ tables.

### 4. Seed Demo Data

```bash
deno task db:seed
```

Creates a demo tenant, admin user, sample farms, and crop data.

### 5. Start Development Server

```bash
deno task dev
```

Open http://localhost:8000

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
compass-deno/
├── ai/                          # AI integrations
│   ├── gemini.ts                # Gemini: analysis, chat, vision
│   ├── sarvam.ts                # Sarvam: translation, TTS
│   └── advisory.ts              # Advisory rule engine
├── components/                  # Shared Preact components
│   ├── Layout.tsx               # App layout
│   └── AdminLayout.tsx          # Admin sidebar layout
├── db/                          # Database layer
│   ├── client.ts                # PostgreSQL pool + query helpers
│   ├── migrate.ts               # 10 versioned migrations
│   └── seed.ts                  # Demo data seeder
├── islands/                     # Interactive Preact islands
│   ├── FarmMap.tsx              # Leaflet map with drawing
│   ├── VideoReels.tsx           # TikTok-style reels player
│   ├── LoginForm.tsx            # Auth forms
│   └── ...                      # 14+ islands
├── lib/                         # Business logic
│   ├── auth.ts                  # Auth: hashing, sessions, cache
│   ├── leads.ts                 # CRM lead scoring & export
│   ├── notifications.ts         # FCM push notification sender
│   ├── news/crawler.ts          # RSS news aggregator
│   └── videos/youtube.ts        # YouTube video fetcher
├── middlewares/                  # Fresh middleware
│   └── auth.ts                  # Session validation + caching
├── routes/
│   ├── admin/                   # 20+ admin pages
│   │   ├── index.tsx            # Dashboard
│   │   ├── leads.tsx            # CRM leads + export
│   │   ├── notifications.tsx    # Push notification composer
│   │   ├── reels.tsx            # Video management
│   │   ├── news.tsx             # News management
│   │   └── ...                  # Users, farms, alerts, etc.
│   ├── api/                     # REST API endpoints
│   │   ├── auth/                # Login, register, logout
│   │   ├── farms/               # CRUD + observations
│   │   ├── reels/               # Video reels + fetch
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

### Content

| Method | Endpoint          | Description           |
| ------ | ----------------- | --------------------- |
| GET    | `/api/reels`      | Paginated video reels |
| POST   | `/api/reels/view` | Track video view      |
| POST   | `/api/reels/like` | Like/unlike video     |
| GET    | `/api/alerts`     | User's active alerts  |

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

| Variable         | Description                   | Required    |
| ---------------- | ----------------------------- | ----------- |
| `GEMINI_API_KEY` | Google Gemini API key         | Recommended |
| `SARVAM_API_KEY` | Sarvam AI for translation/TTS | Optional    |

### Push Notifications (Firebase)

| Variable                    | Description                       |
| --------------------------- | --------------------------------- |
| `FCM_PROJECT_ID`            | Firebase project ID               |
| `FCM_SERVICE_ACCOUNT_EMAIL` | Service account email             |
| `FCM_PRIVATE_KEY`           | Service account private key (PEM) |

### Content APIs

| Variable                     | Description                   |
| ---------------------------- | ----------------------------- |
| `YOUTUBE_API_KEY`            | YouTube Data API v3 key       |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook Graph API (optional) |

### Feature Flags

| Variable              | Default | Description                |
| --------------------- | ------- | -------------------------- |
| `DATABASE_POOL_SIZE`  | 20      | PostgreSQL connection pool |
| `MOCK_SATELLITE_DATA` | false   | Use mock satellite data    |
| `ENABLE_VOICE_ALERTS` | true    | Enable Sarvam TTS          |

## Database Schema

10 migrations creating 39+ tables across domains:

- **Multi-tenancy**: `tenants`, `users`, `sessions`
- **Farm Management**: `farms`, `farm_crops`, `crop_declarations`,
  `farm_observations`, `farm_activity_logs`, `farm_calendar_events`
- **Satellite**: `satellite_products`
- **Alerts**: `alerts`, `alert_schedules`, `advisory_messages`
- **Content**: `video_sources`, `video_views`, `video_fetch_log`,
  `news_articles`, `content_items`
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

8 scheduled background tasks:

| Schedule  | Job                   | Description                      |
| --------- | --------------------- | -------------------------------- |
| Every 6h  | `ingest-satellite`    | Fetch satellite catalog updates  |
| Every 12h | `extract-features`    | Extract NDVI/EVI from imagery    |
| Every 8h  | `generate-advisories` | Run AI advisory engine           |
| Every 6h  | `weather-alerts`      | Check weather and issue alerts   |
| Every 8h  | `crawl-news`          | Fetch agricultural news from RSS |
| Every 12h | `fetch-video-reels`   | Fetch YouTube agriculture videos |
| Daily 6AM | `market-prices`       | Update mandi market prices       |
| Every 4h  | `cleanup-sessions`    | Remove expired sessions          |

## Deployment

### Deno Deploy

```bash
# Push to GitHub, connect repo at https://dash.deno.com
# Set environment variables in the Deno Deploy dashboard
```

Environment variables are set in the Deno Deploy dashboard (not `.env` files).

### Docker

```bash
docker-compose up -d
```

### Production Checklist

- [ ] Set strong `APP_SECRET` (64+ random characters)
- [ ] Configure `DATABASE_URL` with SSL
- [ ] Set `GEMINI_API_KEY` for AI features
- [ ] Set `FCM_*` variables for push notifications
- [ ] Set `YOUTUBE_API_KEY` for video reels
- [ ] Run `deno task db:migrate` on production database
- [ ] Configure HTTPS/TLS termination
- [ ] Set up database backups
- [ ] Monitor with Deno Deploy analytics

## License

MIT
