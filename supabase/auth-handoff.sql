-- Short-lived PKCE-code relay. Frontend roles have zero access to this table.
-- Apply to the existing TIIN project only; no financial tables are changed.
create table if not exists public.auth_pkce_handoffs (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  claim_hash text not null check (claim_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text not null,
  code text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.auth_pkce_handoffs enable row level security;
revoke all on public.auth_pkce_handoffs from public, anon, authenticated;
grant select, insert, update, delete on public.auth_pkce_handoffs to service_role;
create index if not exists auth_pkce_handoffs_expiry_idx on public.auth_pkce_handoffs(expires_at);
create index if not exists auth_pkce_handoffs_ip_expiry_idx on public.auth_pkce_handoffs(ip_hash, expires_at);
