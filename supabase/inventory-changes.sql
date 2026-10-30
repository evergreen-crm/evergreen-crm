-- =====================================================================
-- Evergreen CRM - Inventory register: status changes and Admin corrections, with history (Oct 30, 2026).
-- Serial number, SKU and IMEI stay locked for everyone except an Administrator.
--   * Status (in use / stored / lost / retired): anyone who can add items to the house
--     (Program Coordinator for their assigned houses, Program Manager and up, Admin). A reason is required.
--   * Correcting the name, SKU, serial number or IMEI: Administrator only. A reason is required.
-- Every change is kept in inventory_changes (old and new values, who, when, why). Nothing is deleted.
-- Run after inventory-register.sql. Run as migration inventory_changes. Safe to run more than once.
-- =====================================================================
create table if not exists inventory_changes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  kind text not null check (kind in ('status', 'correction')),
  old_values jsonb not null,
  new_values jsonb not null,
  reason text not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists inventory_changes_item on inventory_changes (item_id, changed_at desc);
alter table inventory_changes enable row level security;

drop policy if exists invc_read on inventory_changes;
create policy invc_read on inventory_changes for select using (
  app_role() = 'admin' or app_level() >= 3 or app_scope_home('ind', home_id)
);
-- No insert/update/delete policies: changes are written only by the two functions below.

create or replace function inventory_set_status(p_item uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare it inventory_items;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into it from inventory_items where id = p_item;
  if it.id is null then raise exception 'That item no longer exists.'; end if;
  if not (app_role() = 'admin' or coalesce(app_level(), 0) >= 3 or (coalesce(app_level(), 0) = 2 and app_scope_write('ind', it.home_id))) then
    raise exception 'Only the house’s Program Coordinator, a Program Manager or a director can change an item’s status.';
  end if;
  if p_status not in ('in use', 'stored', 'lost', 'retired') then raise exception 'Pick a status from the list.'; end if;
  if p_status = it.status then raise exception 'The item is already "%".', it.status; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Write why the status is changing.'; end if;
  update inventory_items set status = p_status where id = p_item;
  insert into inventory_changes (item_id, home_id, kind, old_values, new_values, reason, changed_by)
  values (p_item, it.home_id, 'status', jsonb_build_object('status', it.status), jsonb_build_object('status', p_status), left(trim(p_reason), 500), auth.uid());
end $$;

create or replace function inventory_correct(p_item uuid, p_name text, p_sku text, p_serial text, p_imei text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare it inventory_items; v_name text; v_sku text; v_serial text; v_imei text; o jsonb := '{}'; n jsonb := '{}';
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if coalesce(app_role()::text, '') <> 'admin' then raise exception 'Only an Administrator can correct serial, SKU or IMEI numbers.'; end if;
  select * into it from inventory_items where id = p_item;
  if it.id is null then raise exception 'That item no longer exists.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Write why the numbers are being corrected.'; end if;
  v_name := coalesce(nullif(trim(p_name), ''), it.item);
  v_sku := nullif(trim(p_sku), '');
  v_serial := nullif(trim(p_serial), '');
  v_imei := nullif(regexp_replace(coalesce(p_imei, ''), '\s', '', 'g'), '');
  if v_imei is not null and v_imei !~ '^[0-9]{15}$' then raise exception 'IMEI must be 15 digits.'; end if;
  if it.category = 'phone' and v_imei is null then raise exception 'Phones need an IMEI number.'; end if;
  if v_name is distinct from it.item then o := o || jsonb_build_object('item', it.item); n := n || jsonb_build_object('item', v_name); end if;
  if v_sku is distinct from it.sku then o := o || jsonb_build_object('sku', it.sku); n := n || jsonb_build_object('sku', v_sku); end if;
  if v_serial is distinct from it.serial_no then o := o || jsonb_build_object('serial_no', it.serial_no); n := n || jsonb_build_object('serial_no', v_serial); end if;
  if v_imei is distinct from it.imei then o := o || jsonb_build_object('imei', it.imei); n := n || jsonb_build_object('imei', v_imei); end if;
  if n = '{}'::jsonb then raise exception 'Nothing was changed.'; end if;
  update inventory_items set item = v_name, sku = v_sku, serial_no = v_serial, imei = v_imei where id = p_item;
  insert into inventory_changes (item_id, home_id, kind, old_values, new_values, reason, changed_by)
  values (p_item, it.home_id, 'correction', o, n, left(trim(p_reason), 500), auth.uid());
end $$;

revoke execute on function inventory_set_status(uuid, text, text) from public, anon;
revoke execute on function inventory_correct(uuid, text, text, text, text, text) from public, anon;
grant execute on function inventory_set_status(uuid, text, text) to authenticated;
grant execute on function inventory_correct(uuid, text, text, text, text, text) to authenticated;
