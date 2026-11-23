// Daily policy sign-off job (called from lib/automation.js every morning). Server only.
//   * Staff are reminded 7 and 2 days before a policy is due, and when it is late.
//   * The day a policy goes late, the person's Program Coordinator and Program Manager get the link,
//     and so does whoever added the person to the portal.
//     7 more days and the directors are told too.
//   * Anyone who has signed everything gets their sign-off record (catch-up for the moment of signing).
//   * Day 30 after starting: if policies are unsigned or orientation is not finished, a warning goes to the staff
//     member, their Program Coordinator and Program Manager (Melvin, Nov 15 2026: a warning, not a block on shifts).
//   * A record waiting for a witness (coordinator or program manager, whoever signs first) goes to the directors after WITNESS_DAYS (3) days.
import 'server-only';
import { levelOf } from '@/lib/levels';
import { policySignStatus, daysFrom, POLICY_DAYS, WITNESS_DAYS, DIRECTOR_AFTER_DAYS } from '@/lib/policyDue';
import { loadPeople, leadersFor, witnessesAt, alertPeople, ensurePolicyRecord, remakeSignedCopy } from '@/lib/policyRecords';

const isPdf = (v) => v && /\.pdf$/i.test(v.file_path ?? v.file_name ?? '');
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const STAGE = { 1: 'Program Coordinator or Program Manager', 2: 'Program Manager', 3: 'directors' };

// What every care staff member still has to sign. Used by the job and by the sign-off records page.
export async function loadPolicyStatus(admin, today) {
  const people = await loadPeople(admin);
  const [{ data: details }, { data: policies }, { data: versions }, { data: acks }] = await Promise.all([
    admin.from('staff_details').select('profile_id, program, hire_date'),
    admin.from('policies').select('id, title, code, applies_to, applies_roles, current_version_id').eq('active', true).eq('require_signature', true).not('current_version_id', 'is', null),
    admin.from('policy_versions').select('id, published_at, file_path, file_name'),
    admin.from('policy_acks').select('policy_version_id, profile_id'),
  ]);
  const ver = Object.fromEntries((versions ?? []).map((v) => [v.id, v]));
  const staff = people.filter((p) => p.role !== 'admin' && levelOf(p) < 8);
  const status = policySignStatus({
    people: staff, details: Object.fromEntries((details ?? []).map((x) => [x.profile_id, x])),
    policies: (policies ?? []).filter((p) => isPdf(ver[p.current_version_id])), versions: ver,
    signed: new Set((acks ?? []).map((a) => `${a.policy_version_id}:${a.profile_id}`)), today,
  });
  return { people, staff, status };
}

export async function runPolicyJob(admin, { today }) {
  const out = { reminded: 0, leadersTold: 0, records: 0, escalated: 0, copies: 0, errors: [] };

  // Catch-up: signatures made before signed copies existed (for example October 2026) get their signed copy.
  // A few each morning so the job stays well inside its time limit. Uses the typed name if no drawing was saved.
  try {
    const { data: old } = await admin.from('policy_acks').select('id').is('finished_path', null).order('signed_at').limit(5);
    for (const a of old ?? []) {
      const r = await remakeSignedCopy(admin, a.id);
      if (r?.error) out.errors.push(`Signed copy ${a.id.slice(0, 8)}: ${r.error}`); else out.copies++;
    }
  } catch (e) { out.errors.push(`Signed copy catch-up: ${e.message}`); }
  const { people, staff, status } = await loadPolicyStatus(admin, today);
  const { data: recs } = await admin.from('policy_records').select('id, profile_id, status, stage, stage_started_at').in('status', ['awaiting_witness', 'witnessed']);
  const hasRecord = new Set((recs ?? []).map((r) => r.profile_id));

  for (const p of staff) {
    const st = status[p.id];
    if (!st?.need) continue;
    try {
      if (!st.unsigned.length) { // everything signed: make sure the record exists
        if (!hasRecord.has(p.id)) { const r = await ensurePolicyRecord(admin, p.id, people); if (r.status === 'created') out.records++; }
        continue;
      }
      if (hasRecord.has(p.id)) await ensurePolicyRecord(admin, p.id, people); // a policy changed: retire a waiting record
      if (st.late.length) {
        const n = st.late.length, due = st.oldestDue, over = daysFrom(due, today);
        const list = st.late.slice(0, 6).map((x) => x.title).join('; ') + (n > 6 ? `; and ${n - 6} more` : '');
        out.reminded += await alertPeople(admin, [p], { key: `pol-late:${due}`, title: `Overdue: ${pl(n, 'policy', 'policies')} to sign`,
          body: `You have ${pl(n, 'policy', 'policies')} that had to be signed by ${due}: ${list}. Please read and sign today. Your Program Coordinator and Program Manager have been told.`, link: '/policies', button: 'Read and sign now' });
        const L = leadersFor(p, people);
        const first = [...L.pcs, ...L.pms];
        const leaders = first.length ? first : (L.directors.length ? L.directors : L.admins);
        // Whoever added this person to the portal is told too (if they are still active and not already on the list).
        const adder = p.added_by && p.added_by !== p.id ? people.find((x) => x.id === p.added_by) : null;
        if (adder && !leaders.some((x) => x.id === adder.id)) leaders.push(adder);
        out.leadersTold += await alertPeople(admin, leaders, { key: `pol-late-lead:${p.id}:${due}`, title: `${p.full_name} has not signed ${pl(n, 'policy', 'policies')} (due ${due})`,
          body: `${p.full_name} had ${POLICY_DAYS} days to sign and is now late on: ${list}. Please have them sign before their next shift. This is part of the audit file.`, link: `/policies/records?person=${p.id}`, button: 'See what is not signed' });
        if (over >= DIRECTOR_AFTER_DAYS && first.length)
          out.leadersTold += await alertPeople(admin, L.directors.length ? L.directors : L.admins, { key: `pol-late-dir:${p.id}:${due}`, title: `Still not signed after ${over} days: ${p.full_name}, ${pl(n, 'policy', 'policies')}`,
            body: `${p.full_name} is ${over} days past the deadline on ${pl(n, 'policy', 'policies')}: ${list}. The Program Coordinator and Program Manager were told on the first day.`, link: `/policies/records?person=${p.id}`, button: 'See what is not signed' });
      } else if (st.nextDue) {
        const left = daysFrom(today, st.nextDue), n = st.unsigned.length;
        const step = left <= 2 ? 2 : left <= 7 ? 7 : null;
        if (step) out.reminded += await alertPeople(admin, [p], { key: `pol-soon${step}:${st.nextDue}`, title: `${pl(n, 'policy', 'policies')} to sign by ${st.nextDue}`,
          body: `You have ${pl(n, 'policy', 'policies')} still to read and sign. The deadline is ${st.nextDue} (${left <= 0 ? 'today' : pl(left, 'day', 'days') + ' left'}).`, link: '/policies', button: 'Read and sign' });
      }
    } catch (e) { out.errors.push(`Policies, ${p.full_name}: ${e.message}`); }
  }

  // Day 30 warning: what is still missing 30 days after the person started. Sent once (days 30 to 44 catch a missed run).
  try {
    const [{ data: det }, { data: done }] = await Promise.all([
      admin.from('staff_details').select('profile_id, hire_date'),
      admin.from('orientation_completions').select('profile_id'),
    ]);
    const started = Object.fromEntries((det ?? []).filter((x) => x.hire_date).map((x) => [x.profile_id, x.hire_date]));
    const oriented = new Set((done ?? []).map((x) => x.profile_id));
    for (const p of staff) {
      const start = started[p.id];
      if (!start) continue;
      const d = daysFrom(start, today);
      if (d < 30 || d > 44) continue;
      const missing = [];
      const st = status[p.id];
      if (st?.unsigned.length) missing.push(`${pl(st.unsigned.length, 'policy', 'policies')} not signed`);
      if (!oriented.has(p.id)) missing.push('orientation not finished');
      if (!missing.length) continue;
      const what = missing.join(' and ');
      out.reminded += await alertPeople(admin, [p], { key: 'day30', title: `30 days since you started: ${what}`,
        body: `It has been 30 days since you started at Evergreen, and you still have ${what}. Please finish this now. Your Program Coordinator and Program Manager have been told.`, link: st?.unsigned.length ? '/policies' : '/orientation', button: 'Finish now' });
      const L = leadersFor(p, people);
      const leaders = [...L.pcs, ...L.pms];
      const adder = p.added_by && p.added_by !== p.id ? people.find((x) => x.id === p.added_by) : null;
      if (adder && !leaders.some((x) => x.id === adder.id)) leaders.push(adder);
      out.leadersTold += await alertPeople(admin, leaders.length ? leaders : (L.directors.length ? L.directors : L.admins), { key: `day30-lead:${p.id}`,
        title: `Day 30 warning: ${p.full_name} has ${what}`,
        body: `${p.full_name} started ${start} and still has ${what}. This is a warning only: they can still be scheduled. Please help them finish.`, link: `/hr/${p.id}`, button: 'Open their staff file' });
    }
  } catch (e) { out.errors.push(`Day 30 warning: ${e.message}`); }

  // Witness review: move up a level after WITNESS_DAYS at each level.
  const { data: waiting } = await admin.from('policy_records').select('id, profile_id, stage, stage_started_at, items').eq('status', 'awaiting_witness');
  for (const r of waiting ?? []) {
    try {
      const person = people.find((x) => x.id === r.profile_id);
      if (!person || daysFrom(String(r.stage_started_at).slice(0, 10), today) < WITNESS_DAYS) continue;
      const cur = witnessesAt(person, people, r.stage);
      if (cur.stage >= 3 || r.stage >= 3) { // already with the directors: tell the Administrator once
        const admins = people.filter((x) => x.role === 'admin' && x.id !== person.id);
        out.escalated += await alertPeople(admin, admins, { key: `polrec:${r.id}:admin`, title: `Witness review still not done: ${person.full_name}`,
          body: `${person.full_name}'s policy sign-off record has waited more than ${WITNESS_DAYS} days with the directors. Please review and sign as witness.`, link: `/policies/records/${r.id}`, button: 'Review and sign as witness' }) ? 1 : 0;
        continue;
      }
      const next = witnessesAt(person, people, cur.stage + 1);
      if (!next.who.length || next.stage <= r.stage) continue;
      await admin.from('policy_records').update({ stage: next.stage, stage_started_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'awaiting_witness');
      await admin.from('policy_record_events').insert({ record_id: r.id, event: 'escalated', detail: `Not witnessed in ${WITNESS_DAYS} days by the ${STAGE[r.stage]}. Sent to: ${next.who.map((w) => w.full_name).join(', ')}.` });
      await admin.from('action_items').update({ owner_id: next.who[0].id, severity: 'red' }).eq('source_key', `polrec:${r.id}`).not('status', 'in', '("Closed","Dismissed")');
      await alertPeople(admin, next.who, { key: `polrec:${r.id}:s${next.stage}`, title: `Witness review overdue: ${person.full_name} signed every policy`,
        body: `${person.full_name} signed all ${(r.items ?? []).length} policies, and the witness review was not done in ${WITNESS_DAYS} days by the ${STAGE[r.stage]}. Please open the record, check the signed copies and sign as witness.`, link: `/policies/records/${r.id}`, button: 'Review and sign as witness' });
      out.escalated++;
    } catch (e) { out.errors.push(`Witness record ${r.id}: ${e.message}`); }
  }
  return out;
}

// Open witness reviews as action items (lib/actionScan.js). Owner = whoever has it now.
export async function witnessIssues(supabase, profiles, today) {
  const out = [];
  try {
    const { data: rows, error } = await supabase.from('policy_records').select('id, profile_id, stage, stage_started_at, items').eq('status', 'awaiting_witness');
    if (error) return out;
    const { data: mh } = await supabase.from('manager_homes').select('profile_id, home_id');
    const extra = {};
    for (const m of mh ?? []) (extra[m.profile_id] ??= []).push(m.home_id);
    const people = (profiles ?? []).filter((p) => p.active && p.role !== 'family').map((p) => ({ ...p, homes: new Set([p.home_id, ...(extra[p.id] ?? [])].filter(Boolean)) }));
    for (const r of rows ?? []) {
      const person = people.find((p) => p.id === r.profile_id);
      if (!person) continue;
      const due = new Date(new Date(r.stage_started_at).getTime() + WITNESS_DAYS * 86400000).toISOString().slice(0, 10);
      const { who } = witnessesAt(person, people, r.stage);
      out.push({ source_key: `polrec:${r.id}`, category: 'compliance', kind: 'staff', subject_profile_id: person.id, home_id: person.home_id ?? null,
        title: `Witness review: ${person.full_name} signed all ${(r.items ?? []).length} policies`,
        details: `Open the record, check each signed copy and sign once as witness. If it is not done in ${WITNESS_DAYS} days it goes to the directors.`,
        due_date: due, severity: due < today || r.stage > 1 ? 'red' : 'yellow', link: `/policies/records/${r.id}`, owner_id: who[0]?.id ?? null });
    }
  } catch { /* table not created yet */ }
  return out;
}
