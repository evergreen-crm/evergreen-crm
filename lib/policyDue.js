// Policy sign-off deadline: every policy that applies to a person must be signed within 14 days.
// The 14 days start when the version was published or when the person started, whichever is later
// (and not before Nov 12, 2026, when signing inside the policy went live). Plain helpers: safe anywhere.
export const POLICY_DAYS = 14;
export const POLICY_CLOCK_START = '2026-11-12';
export const WITNESS_DAYS = 3;          // Melvin, Nov 15 2026: the witness has 3 days before it goes to the next level
export const DIRECTOR_AFTER_DAYS = 7;   // unsigned 7 days past the deadline: directors are told too

const iso = (d) => (d ? String(d).slice(0, 10) : null);
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const daysFrom = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
import { LEVELS, GROUPS, levelOf, groupOf } from '@/lib/levels';

// Policies by role (supabase/policies-by-role.sql). A policy's applies_roles lists the roles that must sign it;
// empty means everyone in its program. Role keys: the level keys (frontline, pc, pm, doo, ed, cso, ceo, admin)
// plus hr and payroll.
export const POLICY_ROLES = [
  ...LEVELS.filter((l) => l.level <= 7).map((l) => ({ key: l.key, name: l.name })),
  ...GROUPS.map((g) => ({ key: g.key, name: g.name })),
];
export const policyRoleKey = (person) => groupOf(person) ?? LEVELS.find((l) => l.level === levelOf(person))?.key ?? null;
export const roleNames = (roles) => (roles ?? []).map((k) => POLICY_ROLES.find((r) => r.key === k)?.name ?? k).join(', ');
// person: a profile with role, level and staff_group. Without one, only the program is checked.
export const appliesToRole = (roles, person) => !roles?.length || !person || roles.includes(policyRoleKey(person));
// Does this policy apply to this person? Program first, then role.
export const policyFor = (policy, program, person) => appliesToProgram(policy?.applies_to, program) && appliesToRole(policy?.applies_roles, person);

export const appliesToProgram = (policyProgram, staffProgram) => { const i = policyProgram ?? 'Both', p = staffProgram ?? 'Both'; return i === 'Both' || p === 'Both' || i === p; };

// The date a policy version must be signed by, for one person.
export function policyDueDate(publishedAt, personStart) {
  const start = [iso(publishedAt), iso(personStart), POLICY_CLOCK_START].filter(Boolean).sort().pop();
  return addDays(start, POLICY_DAYS);
}

// For each person: what is still unsigned, and what is late.
// people: [{ id, created_at }], details: { [profile_id]: { program, hire_date } }, policies (active, require_signature,
// current_version_id), versions: { [id]: { published_at } }, signed: Set("versionId:profileId").
export function policySignStatus({ people, details, policies, versions, signed, today }) {
  const out = {};
  for (const p of people) {
    const info = details[p.id] ?? {};
    const start = info.hire_date ?? iso(p.created_at);
    const row = { need: 0, have: 0, unsigned: [], late: [], oldestDue: null, nextDue: null };
    for (const pol of policies) {
      if (!pol.current_version_id || !policyFor(pol, info.program, p)) continue;
      row.need++;
      if (signed.has(`${pol.current_version_id}:${p.id}`)) { row.have++; continue; }
      const due = policyDueDate(versions[pol.current_version_id]?.published_at, start);
      const item = { policy_id: pol.id, title: pol.title, code: pol.code ?? null, due };
      row.unsigned.push(item);
      if (due < today) { row.late.push(item); if (!row.oldestDue || due < row.oldestDue) row.oldestDue = due; }
      else if (!row.nextDue || due < row.nextDue) row.nextDue = due;
    }
    out[p.id] = row;
  }
  return out;
}
