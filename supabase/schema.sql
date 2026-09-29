-- TIIN 2.0 initial schema. Run in the Supabase SQL editor only after creating a project.
-- The browser must use a publishable/anon key only; never add a service-role key to this repo.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'personal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Core entities preserve a user_id for simple RLS and a workspace_id for future projects.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null, type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0), category_id text not null, comment text not null default '',
  transaction_date date not null, wallet text not null default 'personal', tags jsonb not null default '[]'::jsonb,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.categories (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete cascade, name text not null, icon text, type text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tags (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, created_at timestamptz not null default now(), unique(user_id,name));
create table if not exists public.templates (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.recurring_payments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.goals (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.budgets (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.payment_items (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.payment_status (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.settings (user_id uuid primary key references auth.users(id) on delete cascade, payload jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.sync_metadata (user_id uuid primary key references auth.users(id) on delete cascade, last_synced_at timestamptz, migration_completed_at timestamptz, updated_at timestamptz not null default now());

alter table public.profiles enable row level security; alter table public.workspaces enable row level security; alter table public.workspace_members enable row level security;
alter table public.transactions enable row level security; alter table public.categories enable row level security; alter table public.tags enable row level security; alter table public.templates enable row level security; alter table public.recurring_payments enable row level security; alter table public.goals enable row level security; alter table public.budgets enable row level security; alter table public.payment_items enable row level security; alter table public.payment_status enable row level security; alter table public.settings enable row level security; alter table public.sync_metadata enable row level security;

create policy "profile owner" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "workspace owner" on public.workspaces for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "workspace member self" on public.workspace_members for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions owner" on public.transactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories owner" on public.categories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tags owner" on public.tags for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "templates owner" on public.templates for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recurring owner" on public.recurring_payments for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals owner" on public.goals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "budgets owner" on public.budgets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "payment items owner" on public.payment_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "payment status owner" on public.payment_status for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings owner" on public.settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sync metadata owner" on public.sync_metadata for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on all tables in schema public to authenticated;
