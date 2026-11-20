-- =====================================================================
-- Evergreen CRM - Offline notes (plan B3, Nov 20, 2026).
-- Daily notes and records written while the house internet is down are kept on the device and uploaded when it
-- comes back. offline_id stops the same note being uploaded twice; written_offline_at keeps the real time it was
-- written (shown on the record as "written offline").
-- Run as migration offline_notes. Safe to re-run.
-- =====================================================================
alter table public.shift_notes add column if not exists offline_id uuid;
alter table public.shift_notes add column if not exists written_offline_at timestamptz;
create unique index if not exists shift_notes_offline_id on public.shift_notes (offline_id) where offline_id is not null;

alter table public.entries add column if not exists offline_id uuid;
alter table public.entries add column if not exists written_offline_at timestamptz;
create unique index if not exists entries_offline_id on public.entries (offline_id) where offline_id is not null;
