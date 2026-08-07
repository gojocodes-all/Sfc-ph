-- PICNYM V2 index cleanup and account-ownership lookup support.
-- Apply during the V2 rollout after staging verification.

create index if not exists inboxes_creator_key_created_idx
  on public.inboxes (creator_key, created_at desc)
  where creator_key is not null;

-- The unique (inbox_id, sender_key) index already covers block lookups.
drop index if exists public.blocks_inbox_sender_idx;
drop index if exists public.idx_blocks_inbox_sender;

-- Keep idx_messages_inbox_created; remove the identical duplicate.
drop index if exists public.messages_inbox_created_idx;

-- Keep idx_polls_inbox_created; remove the identical duplicate.
drop index if exists public.polls_inbox_created_idx;

-- Existing useful indexes retained:
-- poll_options_poll_position_idx (poll_id, position)
-- votes_poll_option_idx (poll_id, option_id)
-- votes_poll_id_voter_key_key unique (poll_id, voter_key)
-- idx_reports_message_id (message_id)
