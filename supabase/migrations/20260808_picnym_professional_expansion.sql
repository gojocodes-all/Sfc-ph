create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '',
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_path text,
  plan text not null default 'free' check (plan in ('free','premium')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  discoverable boolean not null default true,
  allow_friend_requests boolean not null default true,
  show_activity boolean not null default false,
  browser_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id text primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  pair_key text generated always as (least(requester_id::text, addressee_id::text) || ':' || greatest(requester_id::text, addressee_id::text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (pair_key)
);

create table if not exists public.inbox_settings (
  inbox_id text primary key references public.inboxes(id) on delete cascade,
  paused boolean not null default false,
  registered_only boolean not null default false,
  friends_only boolean not null default false,
  allow_images boolean not null default true,
  allow_voice boolean not null default true,
  allow_polls boolean not null default true,
  hidden_words text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports add column if not exists reporter_user_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists target_type text;
alter table public.reports add column if not exists target_id text;
alter table public.reports add column if not exists details text not null default '';
alter table public.reports add column if not exists status text not null default 'open';

alter table public.messages add column if not exists sender_user_id uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists sender_revealed boolean not null default false;
alter table public.messages add column if not exists is_public boolean not null default false;
alter table public.messages add column if not exists favorite boolean not null default false;
alter table public.messages add column if not exists archived boolean not null default false;

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_friendships_requester_status on public.friendships(requester_id, status, created_at desc);
create index if not exists idx_friendships_addressee_status on public.friendships(addressee_id, status, created_at desc);
create index if not exists idx_reports_status_created on public.reports(status, created_at desc);
create index if not exists idx_messages_public_created on public.messages(is_public, created_at desc) where is_public = true;
create index if not exists idx_messages_sender_user on public.messages(sender_user_id) where sender_user_id is not null;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.friendships enable row level security;
alter table public.inbox_settings enable row level security;
alter table public.reports enable row level security;
