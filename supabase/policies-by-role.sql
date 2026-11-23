-- Policies by role: a policy can say which roles must sign it (Frontline, Program Coordinator, Program Manager,
-- directors, HR, Payroll). Empty = everyone in the policy's program, as before. The program filter (MCFD / CLBC)
-- still applies on top. Keys match lib/levels.js: frontline, pc, pm, doo, ed, cso, ceo, admin, hr, payroll.
alter table public.policies add column if not exists applies_roles text[];

-- Starting values for the policies whose title names one role.
update public.policies set applies_roles = '{frontline}' where code = 'ECC-SHSS-DUTY-2026-001-CYW' and applies_roles is null;
update public.policies set applies_roles = '{pc}' where code in ('ECC-SHSS-DUTY-2026-001-PC', 'ECC-PC-MAN-2026-001', 'ECC-MED-2026-001-IMP-PC') and applies_roles is null;
update public.policies set applies_roles = '{pm}' where code in ('ECC-SHSS-DUTY-2026-001-PM', 'ECC-PM-MAN-2026-001', 'ECC-MED-2026-001-IMP-PM') and applies_roles is null;
update public.policies set applies_roles = '{pc,pm}' where code = 'ECC-SHSS-DUTY-2026-001' and applies_roles is null;
update public.policies set applies_roles = '{ed}' where code = 'ECC-SHSS-DUTY-2026-001-ED' and applies_roles is null;

-- Melvin, Nov 22 2026: each role signs its own manual and binders (they were "for reference" before).
update public.policies set require_signature = true
 where code in ('ECC-SHSS-DUTY-2026-001-PC', 'ECC-PC-MAN-2026-001', 'ECC-MED-2026-001-IMP-PC',
                'ECC-SHSS-DUTY-2026-001-PM', 'ECC-PM-MAN-2026-001', 'ECC-MED-2026-001-IMP-PM',
                'ECC-SHSS-DUTY-2026-001', 'ECC-SHSS-DUTY-2026-001-ED')
   and applies_roles is not null;
