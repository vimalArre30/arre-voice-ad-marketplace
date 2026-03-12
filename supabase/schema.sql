-- ============================================================
-- Arré Voice Ad Marketplace — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. episodes
create table if not exists episodes (
  id                uuid primary key default gen_random_uuid(),
  creator_name      text not null,
  title             text not null,
  category          text not null
    check (category in ('finance','business','tech','health','travel','food','culture','sports','entertainment','education')),
  audience_tier     text not null
    check (audience_tier in ('metro','tier1','tier2','national')),
  geography         text not null,
  age_group         text not null
    check (age_group in ('18-24','25-34','35-44','45-54','55+')),
  gender            text not null
    check (gender in ('male','female','mixed')),
  audio_url         text,
  duration_seconds  integer,
  transcript        jsonb,
  status            text not null default 'uploaded'
    check (status in ('uploaded','transcribing','transcribed','detecting','ready')),
  created_at        timestamptz not null default now()
);

-- 2. moments
create table if not exists moments (
  id                  uuid primary key default gen_random_uuid(),
  episode_id          uuid not null references episodes(id) on delete cascade,
  timestamp_seconds   integer not null,
  context_snippet     text not null,
  ad_category         text not null,
  confidence_score    numeric(3,2) check (confidence_score >= 0 and confidence_score <= 1),
  status              text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at          timestamptz not null default now()
);

-- 3. ads
create table if not exists ads (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  brand_name        text not null,
  category          text not null,
  audio_url         text not null,
  duration_seconds  integer not null,
  created_at        timestamptz not null default now()
);

-- 4. ad_slots
create table if not exists ad_slots (
  id               uuid primary key default gen_random_uuid(),
  moment_id        uuid not null references moments(id) on delete cascade,
  ad_id            uuid references ads(id),
  final_audio_url  text,
  created_at       timestamptz not null default now()
);

-- 5. brands
create table if not exists brands (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  target_categories  text[],
  target_audience    text,
  target_geography   text[],
  created_at         timestamptz not null default now()
);

-- Indexes for common lookups
create index if not exists moments_episode_id_idx on moments(episode_id);
create index if not exists ad_slots_moment_id_idx on ad_slots(moment_id);
create index if not exists ad_slots_ad_id_idx     on ad_slots(ad_id);
