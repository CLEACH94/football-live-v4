create table if not exists public.mi_fixtures (
  fixture_id text primary key,
  home_team text, away_team text,
  home_team_id bigint, away_team_id bigint,
  competition text, kickoff timestamptz,
  league_id bigint, season integer,
  status text, goals_home integer, goals_away integer,
  last_seen_at timestamptz default now(),
  last_checked_at timestamptz
);
create table if not exists public.mi_snapshots (
  fixture_id text primary key references public.mi_fixtures(fixture_id) on delete cascade,
  model text not null, stage text,
  lineup_confirmed boolean default false,
  snapshot jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists public.mi_audit (
  key text primary key,
  fixture_id text references public.mi_fixtures(fixture_id) on delete cascade,
  rule text, type text, title text,
  model text, stage text,
  p numeric, raw_p numeric,
  lineup_confirmed boolean default false,
  kickoff timestamptz,
  engines jsonb, ablation jsonb,
  correct boolean, result text,
  created_at timestamptz default now(),
  settled_at timestamptz
);
create index if not exists mi_fixtures_kickoff_idx on public.mi_fixtures(kickoff);
create index if not exists mi_audit_model_idx on public.mi_audit(model, type, correct);
