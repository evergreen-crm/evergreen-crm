-- =====================================================================
-- Evergreen CRM - Urgent emails are retried, and directors are told if one still fails (Nov 5, 2026).
-- Before: if the network dropped while an urgent email was sending, it stayed on "sending" and was never sent
-- (this happened once on Nov 3).
--   * notifications.email_tries counts attempts.
--   * Every 2 minutes, before calling the sender, any urgent email stuck on "sending" for 10 minutes goes back
--     in the queue. The sender (lib/emailOutbox.js) retries a failed send up to 3 times; after the third
--     failure it alerts directors (level 4+) and Admins in the portal, so someone phones the person.
-- Run as migration urgent_email_retry. Safe to run more than once.
-- =====================================================================
alter table notifications add column if not exists email_tries int not null default 0;

create or replace function public.ping_urgent_email() returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  update notifications set emailed_at = null, email_note = 'retrying: was stuck while sending'
   where urgent and email_note = 'sending' and emailed_at < now() - interval '10 minutes'
     and created_at > now() - interval '6 hours';
  if exists (select 1 from notifications where urgent and emailed_at is null and created_at > now() - interval '6 hours') then
    perform net.http_post(
      url := 'https://evergreen-crm-azure.vercel.app/api/cron/urgent',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-flush-key', (select decrypted_secret from vault.decrypted_secrets where name = 'urgent_flush_key')),
      body := '{}'::jsonb, timeout_milliseconds := 20000);
  end if;
end $function$;
revoke execute on function public.ping_urgent_email() from public, anon, authenticated;

-- The one email stuck since Nov 3 (test data) is too old to resend: record what happened.
update notifications set email_note = 'failed: network error while sending (Nov 3); too old to resend'
 where urgent and email_note = 'sending' and emailed_at < now() - interval '6 hours';
