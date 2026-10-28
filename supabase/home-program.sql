-- Each house runs under one program: MCFD (children and youth) or CLBC (adults). Requirements differ by program.
alter table public.homes add column if not exists program text check (program in ('MCFD', 'CLBC'));
