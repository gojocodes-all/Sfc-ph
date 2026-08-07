create index if not exists idx_messages_poll_id on public.messages(poll_id) where poll_id is not null;
create index if not exists idx_poll_options_poll_id on public.poll_options(poll_id);
create index if not exists idx_reports_message_id on public.reports(message_id);
create index if not exists idx_votes_option_id on public.votes(option_id);
