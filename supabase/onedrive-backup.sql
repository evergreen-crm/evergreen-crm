-- Nightly backup to OneDrive (backup@evergreencommunitycare.com).
-- The Administrator connects the OneDrive once on Admin → 💾 Backup (Microsoft sign-in with a code). The sign-in
-- token is kept in Supabase Vault, never in a table or in the code. The nightly job (GitHub Actions,
-- .github/workflows/nightly-backup.yml) copies the whole database and every uploaded file to the OneDrive.

-- Connection details (not secret: the tenant and app IDs are public identifiers).
create table if not exists public.backup_settings (
  id int primary key default 1 check (id = 1),
  tenant_id text, client_id text,
  account text,                         -- the Microsoft account that was signed in (should be backup@)
  connected_at timestamptz, connected_by uuid references public.profiles(id),
  pending_device_code text,             -- only while the Administrator is signing in
  pending_user_code text, pending_url text,
  pending_until timestamptz,
  folder text not null default 'Evergreen CRM Backup'
);
insert into public.backup_settings (id) values (1) on conflict (id) do nothing;
alter table public.backup_settings enable row level security;
drop policy if exists "backup settings admin" on public.backup_settings;
create policy "backup settings admin" on public.backup_settings for select to authenticated
  using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = ''));
revoke all on public.backup_settings from anon;
-- The device code (valid 15 minutes while signing in) stays server-only; everything else can be read by the policy above.
revoke select on public.backup_settings from authenticated;
grant select (id, tenant_id, client_id, account, connected_at, connected_by, pending_user_code, pending_url, pending_until, folder)
  on public.backup_settings to authenticated;

-- Each nightly run.
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  db_bytes bigint, files_new int, files_bytes bigint, files_total int,
  note text
);
alter table public.backup_runs enable row level security;
drop policy if exists "backup runs see" on public.backup_runs;
create policy "backup runs see" on public.backup_runs for select to authenticated
  using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = ''));
revoke all on public.backup_runs from anon;

-- Which uploaded files are already in the OneDrive (so each night only copies new or changed files).
create table if not exists public.backup_files (
  bucket text not null, name text not null, size bigint, backed_up_at timestamptz not null default now(),
  primary key (bucket, name)
);
alter table public.backup_files enable row level security;
revoke all on public.backup_files from anon, authenticated;

-- The OneDrive sign-in token, in Vault. Only the server (service role) and the nightly job (postgres) can use these.
create or replace function public.backup_save_token(p_token text)
returns void language plpgsql security definer set search_path to 'public', 'vault' as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'onedrive_backup_token';
  if v_id is null then perform vault.create_secret(p_token, 'onedrive_backup_token', 'OneDrive refresh token for the nightly backup');
  else perform vault.update_secret(v_id, p_token); end if;
end $$;
create or replace function public.backup_get_token()
returns text language sql security definer set search_path to 'public', 'vault' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'onedrive_backup_token' limit 1
$$;
revoke all on function public.backup_save_token(text) from public, anon, authenticated;
revoke all on function public.backup_get_token() from public, anon, authenticated;
grant execute on function public.backup_save_token(text) to service_role;
grant execute on function public.backup_get_token() to service_role;
