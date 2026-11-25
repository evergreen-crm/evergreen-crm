-- Career ladder, automatic (Nov 24 2026, Roles plan): the ladder uses the new position names, the Team Leader step
-- is a leadership training position toward Program Coordinator / Program Manager / program lead, and each step lists
-- the pay positions that sit on it so the CRM can tell where each person is. The nightly job (lib/career.js) checks
-- everyone against the next step and opens a promotion review when they qualify. Management steps still go to the
-- Board of Directors (24 months at Evergreen, two satisfactory reviews in the last 12 months).

alter table public.career_ladder add column if not exists pay_positions text[] not null default '{}';
alter table public.staff_promotions add column if not exists auto boolean not null default false;

update public.career_ladder set title = 'Care Worker I', pay_positions = '{"Child & Youth Care Worker","Community Support Worker I"}',
  requirements = 'Child & Youth Care Worker (MCFD) or Community Support Worker I (CLBC). Onboarding complete; criminal record check cleared; First Aid/CPR and CPI current; probation passed and confirmed.'
 where step = 1;
update public.career_ladder set title = 'Care Worker II', pay_positions = '{"Community Support Worker II"}',
  requirements = 'Community Support Worker II (CLBC), or the next wage-grid step for a Child & Youth Care Worker. At least 6 months at Evergreen; probation confirmed; all certificates current; no red performance badge in the last 3 months; supervisor recommends.'
 where step = 2;
update public.career_ladder set title = 'Team Leader (leadership training)', pay_positions = '{"Team Leader"}',
  requirements = 'A training position toward Program Coordinator, Program Manager or program lead: the Team Leader keeps all care worker duties and also leads the shift. At least 12 months at Evergreen; Care Worker II or equivalent; no red performance badge in the last 3 months; shift-lead training recorded; chosen by the Program Coordinator and approved by the Program Manager.',
  unlocks = 'Team Leader rate; leads the shift; Evergreen leadership training; acting-PC shifts; first look at Program Coordinator postings.'
 where step = 3;
update public.career_ladder set pay_positions = '{"Program Coordinator"}',
  requirements = 'Team Leader for 6+ months (or equivalent experience); acting-PC shifts completed; Evergreen leadership training recorded; incident review and care-plan writing training done; interview with the Program Manager. MANAGEMENT RULE: at least 24 months at Evergreen; at least two satisfactory performance reviews in the last 12 months; final decision by the Board of Directors.'
 where step = 4;
update public.career_ladder set pay_positions = '{"Program Manager"}' where step = 5;
update public.career_ladder set pay_positions = '{"Director of Operations","Executive Director","Chief Strategic Officer","Chief Executive Officer"}' where step = 6;
