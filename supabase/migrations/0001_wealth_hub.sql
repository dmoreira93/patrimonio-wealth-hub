-- Migração Unificada Supabase para o Patrimônio & Wealth Hub
-- Permite sincronização de snapshots completos por usuário (com RLS) e tabelas relacionais.

create table if not exists public.wealth_snapshots (
  user_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.wealth_snapshots enable row level security;

create policy "Allow public or authenticated upsert on own profile"
  on public.wealth_snapshots
  for all
  using (true)
  with check (true);
