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
  period text not null check (period in ('day', 'week', 'month')),
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
  period text not null check (period in ('day', 'week', 'month')),
  period_key text not null,
  claimed_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

create table if not exists public.journal_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  mood_emoji text null,
  mood_text text null,
  energy_level integer null check (energy_level between 1 and 5),
  stress_level integer null check (stress_level between 1 and 5),
  focus_level integer null check (focus_level between 1 and 5),
  body_state text null,
  mind_state text null,
  key_events text null,
  gratitude_text text null,
  reflection_text text null,
  tomorrow_text text null,
  free_text text null,
  prompts_open boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  primary key (user_id, id)
);

alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.review_entries enable row level security;
alter table public.reward_rules enable row level security;
alter table public.reward_claims enable row level security;
alter table public.journal_entries enable row level security;

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

create policy "journal entries select own" on public.journal_entries for select using (auth.uid() = user_id);
create policy "journal entries insert own" on public.journal_entries for insert with check (auth.uid() = user_id);
create policy "journal entries update own" on public.journal_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal entries delete own" on public.journal_entries for delete using (auth.uid() = user_id);

-- If these tables already existed before daily rewards were added, run these statements once.
alter table public.reward_rules drop constraint if exists reward_rules_period_check;
alter table public.reward_rules add constraint reward_rules_period_check check (period in ('day', 'week', 'month'));
alter table public.reward_claims drop constraint if exists reward_claims_period_check;
alter table public.reward_claims add constraint reward_claims_period_check check (period in ('day', 'week', 'month'));
