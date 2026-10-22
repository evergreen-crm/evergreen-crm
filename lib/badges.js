// Evergreen performance badges (🟢 Green / 🟡 Yellow / 🔴 Red), set monthly by a Program Manager.
// The badge colour is worked out from the reasons ticked — the worst reason wins.
// Policy: "Staff Duties, Expectations, Performance Badges and Bonus" v1.1, Section 3 and 4.

export const BADGE = {
  green: { icon: '🟢', label: 'Green', meaning: 'Meets or exceeds expectations', bg: '#e3f4ea', fg: '#1d6b43', border: '#3c8a64' },
  yellow: { icon: '🟡', label: 'Yellow', meaning: 'Needs attention — plan to get back to Green within 30 days', bg: '#fff6d6', fg: '#7a5a00', border: '#d9a600' },
  red: { icon: '🔴', label: 'Red', meaning: 'Serious concern — Letter of Expectation or warning, bonus count restarts', bg: '#fde7e7', fg: '#9b1c1c', border: '#d64545' },
};

// color: the badge this reason forces. restart: it restarts the 24-month bonus count.
export const REASONS = [
  { group: 'Complaints', key: 'complaint_minor', color: 'yellow', label: '1 minor substantiated complaint, resolved' },
  { group: 'Complaints', key: 'complaint', color: 'red', restart: true, label: 'Serious substantiated complaint, or 2 or more' },
  { group: 'Letters and warnings', key: 'coaching', color: 'yellow', label: 'Coaching record active' },
  { group: 'Letters and warnings', key: 'loe1', color: 'yellow', restart: true, label: 'Letter of Expectation #1' },
  { group: 'Letters and warnings', key: 'loe2', color: 'red', restart: true, label: 'Letter of Expectation #2' },
  { group: 'Letters and warnings', key: 'loe3', color: 'red', restart: true, label: 'Letter of Expectation #3 — final notice' },
  { group: 'Letters and warnings', key: 'final_warning', color: 'red', restart: true, label: 'Final written warning (serious breach)' },
  { group: 'Letters and warnings', key: 'investigation', color: 'red', label: 'Zero-tolerance investigation or suspension' },
  { group: 'Training and CRC', key: 'training_soon', color: 'yellow', label: 'Training expires within 30 days, no renewal booked' },
  { group: 'Training and CRC', key: 'training_expired', color: 'red', label: 'Training or CRC expired' },
  { group: 'Documentation', key: 'notes_mid', color: 'yellow', label: 'Daily notes on time 85–94%' },
  { group: 'Documentation', key: 'notes_low', color: 'red', label: 'Daily notes on time below 85%' },
  { group: 'Documentation', key: 'checklist_some', color: 'yellow', label: '1–2 shift checklists not signed this month' },
  { group: 'Documentation', key: 'checklist_many', color: 'red', label: '3+ shift checklists not signed this month' },
  { group: 'Documentation', key: 'incident_late1', color: 'yellow', label: '1 incident report late' },
  { group: 'Documentation', key: 'incident_late', color: 'red', label: '2+ incident reports late, or one not reported' },
  { group: 'Medication', key: 'med_minor', color: 'yellow', label: '1 minor medication error, reported right away' },
  { group: 'Medication', key: 'med_error', color: 'red', label: 'Unreported medication error, or 2+ errors' },
  { group: 'Attendance', key: 'late_some', color: 'yellow', label: '2–3 late arrivals' },
  { group: 'Attendance', key: 'noshow', color: 'red', label: 'No-call/no-show, or 4+ late arrivals' },
  { group: '90-day plan (new staff)', key: 'plan_some', color: 'yellow', label: '1–2 plan items overdue' },
  { group: '90-day plan (new staff)', key: 'plan_many', color: 'red', label: '3+ items overdue, or a solo-phase item missing' },
  { group: 'Leaders (team results)', key: 'leader_some', color: 'yellow', label: 'Team training 95–99%, reviews 85–94%, 1 late review or missed drill' },
  { group: 'Leaders (team results)', key: 'leader_many', color: 'red', label: 'Late MCFD/CLBC notice, uncleared staff scheduled, or other Red team result' },
];
export const reasonByKey = (k) => REASONS.find((r) => r.key === k) ?? null;

const RANK = { green: 0, yellow: 1, red: 2 };
export function colorFor(keys = []) {
  return keys.reduce((c, k) => { const r = reasonByKey(k); return r && RANK[r.color] > RANK[c] ? r.color : c; }, 'green');
}
export const restartsFor = (keys = []) => colorFor(keys) === 'red' || keys.some((k) => reasonByKey(k)?.restart);

export const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
export const fmtMonth = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// 24-month Excellence Bonus count. Badges in any order. A restart month or a 4th Yellow restarts the count.
export function bonusCount(badges = []) {
  let months = 0, yellows = 0, since = null;
  for (const b of [...badges].sort((a, z) => a.month.localeCompare(z.month))) {
    if (b.restart || b.color === 'red') { months = 0; yellows = 0; since = null; continue; }
    if (b.color === 'yellow') { yellows++; if (yellows > 3) { months = 0; yellows = 0; since = null; continue; } }
    if (!since) since = b.month;
    months++;
  }
  return { months: Math.min(months, 24), yellows, since, eligible: months >= 24 };
}

// Who may set whose badge (mirrors can_set_badge() in supabase/performance-badges.sql).
// Levels 1-3: a higher level (Program Manager+), or HR for levels 1-2. Level 4+: Executive Director, CSO, CEO or Administrator.
export function canSetBadge(me, myLevel, isHR, target, targetLevel) {
  if (!target || target === me) return false;
  return myLevel >= 5 || (myLevel >= 3 && myLevel > targetLevel) || (isHR && targetLevel < 3);
}
