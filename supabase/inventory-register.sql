-- =====================================================================
-- Evergreen CRM - Per-house inventory register (things the house buys or adds: phones, tablets, equipment).
-- Each item has a serial number, SKU and (for phones) IMEI. Once saved, the identity fields
-- cannot be changed: there is no UPDATE policy, so only photos can be added afterwards.
-- Read: anyone who can see the house (same check as residents). Add item and photos: Program
-- Coordinator and up for that house, plus managers and admins. Nobody edits or deletes from the app.
-- Corrections: status changes and Admin-only number corrections, with history (inventory-changes.sql).
-- Photos are kept in a private storage bucket, path: <home_id>/<item_id>/<file>.
-- Safe to run more than once.
-- =====================================================================
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  category text not null default 'other',       -- phone, tablet, computer, equipment, furniture, other
  item text not null,                            -- what it is, e.g. "Samsung A15 phone"
  sku text,
  serial_no text,
  imei text,
  bought_on date,
  added_by_note text,                            -- "bought" or "added", and from where, in plain words
  status text not null default 'in use',         -- in use, stored, lost, retired (recorded when saved)
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint inventory_imei_digits check (imei is null or imei ~ '^[0-9]{15}$')
);
create index if not exists inventory_items_home on inventory_items (home_id, created_at desc);
alter table inventory_items enable row level security;

drop policy if exists inv_read on inventory_items;
create policy inv_read on inventory_items for select using (
  app_role() = 'admin' or app_level() >= 3 or app_scope_home('ind', home_id)
);

drop policy if exists inv_insert on inventory_items;
create policy inv_insert on inventory_items for insert with check (
  app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_scope_write('ind', home_id))
);
-- No update or delete policy: changes go only through inventory-changes.sql functions (logged).

create table if not exists inventory_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  file_path text not null,
  caption text,
  taken_on date,
  added_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_photos_item on inventory_photos (item_id, created_at);
alter table inventory_photos enable row level security;

drop policy if exists invp_read on inventory_photos;
create policy invp_read on inventory_photos for select using (
  app_role() = 'admin' or app_level() >= 3 or app_scope_home('ind', home_id)
);

drop policy if exists invp_insert on inventory_photos;
create policy invp_insert on inventory_photos for insert with check (
  app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_scope_write('ind', home_id))
);

-- Private photo bucket (not public; viewed through signed links).
insert into storage.buckets (id, name, public)
values ('inventory-photos', 'inventory-photos', false)
on conflict (id) do nothing;

drop policy if exists inv_photos_read on storage.objects;
create policy inv_photos_read on storage.objects for select using (
  bucket_id = 'inventory-photos' and (
    app_role() = 'admin' or app_level() >= 3
    or app_scope_home('ind', ((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists inv_photos_insert on storage.objects;
create policy inv_photos_insert on storage.objects for insert with check (
  bucket_id = 'inventory-photos' and (
    app_role() = 'admin' or app_level() >= 3
    or (app_level() = 2 and app_scope_write('ind', ((storage.foldername(name))[1])::uuid))
  )
);
