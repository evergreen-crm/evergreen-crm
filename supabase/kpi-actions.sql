-- =====================================================================
-- Evergreen CRM - KPI Phase 1: Action items (management accountability)
-- Issue -> Owner -> Due date -> Status -> Evidence -> Approval -> Closed
-- Every step is recorded in action_item_events (and the audit log).
-- Run once in Supabase SQL Editor (after access-levels.sql). Safe to run again.
-- =====================================================================

create table if not exists action_items (
  id                  uuid primary key default gen_random_uuid(),
  source_key          text unique,            -- set for automatic items, so one problem = one item
  auto                boolean not null default false,
  title               text not null,
  details             text,
  category            text not null default 'compliance',  -- care, staffing, compliance, safety, qa, hr, finance, operations, training, mcfd
  severity            text not null default 'yellow' check (severity in ('yellow','red')),
  home_id             uuid references homes on delete set null,
  resident_id         uuid references residents on delete set null,
  subject_profile_id  uuid references profiles on delete set null,   -- the staff member it is about
  link                text,                   -- page where the problem is fixed
  owner_id            uuid references profiles on delete set null,
  due_date            date,
  status              text not null default 'Open'
                      check (status in ('Open','In progress','Evidence submitted','Approved','Closed','Dismissed')),
  evidence_note       text,
  evidence_link       text,
  evidence_by         uuid references profiles,
  evidence_at         timestamptz,
  approved_by         uuid references profiles,
  approved_at         timestamptz,
  closed_by           uuid references profiles,
  closed_at           timestamptz,
  closed_note         text,
  created_by          uuid references profiles default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists action_items_open_idx on action_items (status, due_date);
create index if not exists action_items_owner_idx on action_items (owner_id, status);

create table if not exists action_item_events (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid not null references action_items on delete cascade,
  at        timestamptz not null default now(),
  actor_id  uuid references profiles default auth.uid(),
  action    text not null,     -- Created, Assigned, Started, Evidence submitted, Approved, Closed, Reopened, Dismissed, Auto-closed
  note      text
);
create index if not exists action_item_events_item_idx on action_item_events (item_id, at);

alter table action_items       enable row level security;
alter table action_item_events enable row level security;

-- See: level 3+ sees everything; others see items they own, raised, or for their own home.
drop policy if exists "actions see" on action_items;
drop policy if exists "actions add" on action_items;
drop policy if exists "actions edit" on action_items;
drop policy if exists "actions delete" on action_items;
create policy "actions see" on action_items for select using (
  app_level() >= 3 or owner_id = auth.uid() or created_by = auth.uid()
  or (app_level() >= 1 and home_id is not null and home_id = app_home()));
create policy "actions add" on action_items for insert with check (app_level() >= 2);
create policy "actions edit" on action_items for update using (app_level() >= 3 or owner_id = auth.uid())
  with check (app_level() >= 3 or owner_id = auth.uid());
create policy "actions delete" on action_items for delete using (app_role() = 'admin');

drop policy if exists "action events see" on action_item_events;
drop policy if exists "action events add" on action_item_events;
create policy "action events see" on action_item_events for select using (
  exists (select 1 from action_items a where a.id = item_id));   -- same visibility as the item
create policy "action events add" on action_item_events for insert with check (
  app_level() >= 1 and actor_id = auth.uid() and exists (select 1 from action_items a where a.id = item_id));

-- An owner below level 3 may only move their own item forward with evidence;
-- approval, closing, dismissing and reassigning need level 3+ (and nobody approves their own work, except admins).
create or replace function guard_action_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null then return new; end if;   -- system jobs
  if app_level() < 3 then
    if new.owner_id is distinct from old.owner_id or new.due_date is distinct from old.due_date
       or new.status in ('Approved','Closed','Dismissed') or new.approved_by is distinct from old.approved_by then
      raise exception 'Only a Program Manager or above can approve, close, dismiss or reassign action items.';
    end if;
  end if;
  if new.status = 'Approved' and old.status <> 'Approved' and app_role() <> 'admin'
     and (old.owner_id = auth.uid() or old.evidence_by = auth.uid()) then
    raise exception 'Someone else must approve evidence you submitted.';
  end if;
  return new;
end $$;
drop trigger if exists action_items_guard on action_items;
create trigger action_items_guard before update on action_items for each row execute function guard_action_item();

drop trigger if exists audit_action_items on action_items;
create trigger audit_action_items after insert or update or delete on action_items for each row execute function write_audit();
