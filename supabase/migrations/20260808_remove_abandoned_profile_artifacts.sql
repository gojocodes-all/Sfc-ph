-- Remove unused artifacts from an abandoned account-schema experiment.
-- PICNYM account ownership is stored in inboxes.creator_key (auth:<user_id>).

drop table if exists public.profiles;
alter table public.inboxes drop column if exists owner_user_id;
