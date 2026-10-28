-- Department menu (step 2): each person has one department and optional extra departments.
-- Admin and CEO (level 7 and up) see every department in the menu.
-- The row-level rules for HR and Payroll are NOT changed here; they still need a separate check.
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists extra_departments text[] not null default '{}';
comment on column public.profiles.department is 'Home department: Everyone, Houses & Care, Operations, HR & Orientation, Finance & Payroll, Health & Safety, Quality, Admin';
comment on column public.profiles.extra_departments is 'Extra departments this person can open, in addition to the home department';
