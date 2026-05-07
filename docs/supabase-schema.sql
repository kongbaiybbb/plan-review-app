-- Run this in the Supabase SQL editor for the project used by the PWA.
-- Each table uses (user_id, id) as the unique sync key so the same local ids can exist for different users.

create table if not exists public.categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  title text not null,
  category_id text not null,
  note text null,
  completed boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

create table if not exists public.review_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  title text not null,
  category_id text not null,
  task_id text null,
  is_ad_hoc boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

create table if not exists public.reward_rules (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period in ('week', 'month')),
  threshold_percent integer not null check (threshold_percent between 0 and 100),
  reward_text text not null,
  active boolean not null default true,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

create table if not exists public.reward_claims (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id text not null,
  period text not null check (period in ('week', 'month')),
  period_key text not null,
  claimed_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.review_entries enable row level security;
alter table public.reward_rules enable row level security;
alter table public.reward_claims enable row level security;

create policy "categories select own" on public.categories for select using (auth.uid() = user_id);
create policy "categories insert own" on public.categories for insert with check (auth.uid() = user_id);
create policy "categories update own" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories delete own" on public.categories for delete using (auth.uid() = user_id);

create policy "tasks select own" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks insert own" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks update own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks delete own" on public.tasks for delete using (auth.uid() = user_id);

create policy "review entries select own" on public.review_entries for select using (auth.uid() = user_id);
create policy "review entries insert own" on public.review_entries for insert with check (auth.uid() = user_id);
create policy "review entries update own" on public.review_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "review entries delete own" on public.review_entries for delete using (auth.uid() = user_id);

create policy "reward rules select own" on public.reward_rules for select using (auth.uid() = user_id);
create policy "reward rules insert own" on public.reward_rules for insert with check (auth.uid() = user_id);
create policy "reward rules update own" on public.reward_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reward rules delete own" on public.reward_rules for delete using (auth.uid() = user_id);

create policy "reward claims select own" on public.reward_claims for select using (auth.uid() = user_id);
create policy "reward claims insert own" on public.reward_claims for insert with check (auth.uid() = user_id);
create policy "reward claims update own" on public.reward_claims for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reward claims delete own" on public.reward_claims for delete using (auth.uid() = user_id);
