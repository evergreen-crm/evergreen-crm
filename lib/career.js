// Career ladder, automatic (Nov 24 2026). Works out each person's step from their position (career_ladder.pay_positions,
// raised by approved promotions), checks them against the next step with what the CRM already records, and – in the
// nightly job – opens a promotion review when every automatic check passes. A manager still confirms the parts no
// record can show (recommendation, acting shifts, interview), and management steps go to the Board of Directors.

const DAY = 86400000;
const OPEN = ['Requested', 'Recommended', 'Board review'];
const iso = (d) => d.toISOString().slice(0, 10);

export function monthsSince(date, now = new Date()) {
  if (!date) return null;
  return Math.floor((now - new Date(date + 'T12:00:00')) / (30.44 * DAY));
}

// db: any Supabase client that can read this person's records (their own session, a manager's, or the admin client).
export async function careerStatus(db, profileId, { ladder, now = new Date() } = {}) {
  const [{ data: lad }, { data: d }, { data: prob }, { data: onb }, { data: certs }, { data: badges }, { data: trainings }, { data: promos }] = await Promise.all([
    ladder ? Promise.resolve({ data: ladder }) : db.from('career_ladder').select('*').order('step'),
    db.from('staff_details').select('position, hire_date').eq('profile_id', profileId).maybeSingle(),
    db.from('staff_probation').select('status').eq('staff_id', profileId).maybeSingle(),
    db.from('onboardings').select('status').eq('profile_id', profileId).maybeSingle(),
    db.from('certifications').select('cert_type, expires_on').eq('profile_id', profileId),
    db.from('staff_badges').select('month, color').eq('profile_id', profileId).gte('month', iso(new Date(now - 366 * DAY))),
    db.from('trainings').select('title').eq('profile_id', profileId),
    db.from('staff_promotions').select('to_step, status, decided_on, created_at').eq('staff_id', profileId),
  ]);
  const steps = lad ?? [];
  const posStep = steps.find((s) => (s.pay_positions ?? []).includes(d?.position))?.step ?? 1;
  const approved = (promos ?? []).filter((p) => p.status === 'Approved').map((p) => p.to_step);
  const step = Math.max(posStep, ...approved);
  const cur = steps.find((s) => s.step === step) ?? null;
  const next = steps.find((s) => s.step === step + 1) ?? null;
  const months = monthsSince(d?.hire_date, now);
  const today = iso(now);
  const expired = (certs ?? []).filter((c) => c.expires_on && c.expires_on < today);
  const recent = (badges ?? []).filter((b) => b.month >= iso(new Date(now - 92 * DAY)));
  const greens = (badges ?? []).filter((b) => b.color === 'green').length;
  const hasLeadTraining = (trainings ?? []).some((t) => /lead|supervis/i.test(t.title ?? ''));
  const open = (promos ?? []).find((p) => OPEN.includes(p.status)) ?? null;
  if (!next) return { step, cur, next: null, months, checks: [], manual: [], ready: false, open, greens };

  const checks = [
    { label: `At least ${next.min_months} months at Evergreen`, ok: months !== null && months >= next.min_months, have: months === null ? 'no hire date' : `${months} months` },
    { label: 'Probation passed and confirmed', ok: prob?.status === 'Confirmed full-time', have: prob?.status ?? 'not recorded' },
    { label: 'Onboarding complete', ok: onb?.status === 'Complete', have: onb?.status ?? 'not started' },
    { label: 'All certificates current', ok: expired.length === 0, have: expired.length ? `expired: ${expired.map((c) => c.cert_type).join(', ')}` : 'all current' },
    { label: 'No red performance badge in the last 3 months', ok: !recent.some((b) => b.color === 'red'), have: recent.some((b) => b.color === 'red') ? 'red badge' : 'none' },
  ];
  if (next.requires_board) checks.push({ label: 'Two satisfactory monthly reviews (green badges) in the last 12 months', ok: greens >= 2, have: `${greens} green` });
  if (next.step >= 3) checks.push({ label: next.step === 3 ? 'Shift-lead training recorded' : 'Evergreen leadership training recorded', ok: hasLeadTraining, have: hasLeadTraining ? 'recorded' : 'not recorded' });
  const manual = [next.step <= 3 ? 'Supervisor recommends' : 'Acting shifts completed and interview with the manager', next.requires_board ? 'Final decision by the Board of Directors' : 'Approved by the Program Manager'];
  return { step, cur, next, months, checks, manual, ready: checks.every((c) => c.ok), open, greens };
}

// Nightly: everyone active with a job record. Opens one automatic review per person when they qualify for their next
// step (never while one is open, and not again within 90 days of a decline). Tells HR and the person.
export async function runCareerCheck(admin, { notify } = {}) {
  const now = new Date();
  const { data: ladder } = await admin.from('career_ladder').select('*').order('step');
  if (!ladder?.length) return { checked: 0, opened: 0 };
  const { data: people } = await admin.from('staff_details').select('profile_id, profiles!inner(full_name, active, role)').eq('profiles.active', true).in('profiles.role', ['staff', 'manager']);
  let checked = 0, opened = 0;
  for (const p of people ?? []) {
    const st = await careerStatus(admin, p.profile_id, { ladder, now });
    checked++;
    if (!st.next || !st.ready || st.open) continue;
    const { data: declined } = await admin.from('staff_promotions').select('id').eq('staff_id', p.profile_id).eq('to_step', st.next.step)
      .eq('status', 'Declined').gte('created_at', new Date(now - 90 * DAY).toISOString()).limit(1);
    if (declined?.length) continue;
    const { error } = await admin.from('staff_promotions').insert({
      staff_id: p.profile_id, from_step: st.step, to_step: st.next.step, status: 'Requested', auto: true,
      months_at_evergreen: st.months, satisfactory_reviews: st.greens,
      evidence: `Automatic check on ${iso(now)}: meets every requirement the CRM can check (${st.checks.map((c) => c.label.toLowerCase()).join('; ')}). Still to confirm: ${st.manual.join('; ')}.`,
    });
    if (error) continue;
    opened++;
    if (notify) {
      const name = p.profiles?.full_name ?? 'A staff member';
      await notify.hr(`🌱 ${name} qualifies for ${st.next.title}`, `${name} meets the automatic requirements for Step ${st.next.step}: ${st.next.title}. A manager now confirms the rest${st.next.requires_board ? ', then it goes to the Board of Directors' : ''}.`, '/careers#requests', `career:${p.profile_id}:${st.next.step}`);
      await notify.person(p.profile_id, `🌱 You qualify for your next step`, `You meet the requirements the system can check for ${st.next.title}. Your manager will review it with you.`, '/careers', `career-me:${p.profile_id}:${st.next.step}`);
    }
  }
  return { checked, opened };
}
