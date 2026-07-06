-- =============================================
-- Migration 009: Username/Password Auth + Video Reels
-- =============================================

-- 1. Add username and force_password_change columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- 2. Backfill existing users: username = phone (without +91), password_hash set to bcrypt of phone
--    We mark force_password_change = true so they must update on next login.
UPDATE users
SET username = REPLACE(phone, '+91', ''),
    force_password_change = true
WHERE username IS NULL;

-- 3. Make username NOT NULL after backfill
ALTER TABLE users ALTER COLUMN username SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- =============================================
-- Video Reels Tables
-- =============================================

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

-- Track which videos each user has seen (to avoid repeats)
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

-- Video fetch job tracking (to avoid re-fetching)
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
