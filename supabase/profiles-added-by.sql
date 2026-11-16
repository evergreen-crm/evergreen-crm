-- Who added each person to the portal (Admin > Give a person access), so late policy alerts also reach them.
-- Applied Nov 15, 2026 as migration profiles_added_by. People added before this date have no value.
alter table public.profiles add column if not exists added_by uuid references public.profiles(id) on delete set null;
