// 🏅 Quality assurance portal (directors and up): rules and the COA standard groups.
// Evergreen follows COA (Council on Accreditation) standards mainly; CARF is shown as a secondary note.
// Every number comes from the same KPI engine (lib/kpis.js), so the QA portal, the KPI page and the
// house dashboards never disagree.
import { levelOf } from '@/lib/levels';

// Director of Operations (4), Executive Director (5), CSO (6), CEO (7), Admin (8).
export const QA_MIN_LEVEL = 4;
export const canSeeQa = (profile) => levelOf(profile) >= QA_MIN_LEVEL;

// COA standard areas used in Phase 1, each with the KPIs that give evidence for it.
// Codes are COA's own section codes (Administration & Management, Service Delivery Administration, Service).
export const COA_AREAS = [
  { code: 'PQI', title: 'Performance and Quality Improvement', icon: '📈', carf: 'CARF: Performance measurement & management',
    what: 'Measure, review and improve: corrective actions get done on time.',
    kpis: ['corrective_actions', 'cap_on_time', 'outstanding_docs'] },
  { code: 'RPM', title: 'Risk Prevention and Management', icon: '⚠️', carf: 'CARF: Risk management',
    what: 'Incidents reported to the funder on time, reviewed, and trends watched.',
    kpis: ['open_incidents', 'critical_incidents', 'critical_on_time', 'incident_reviews', 'reports_due'] },
  { code: 'BSM', title: 'Behavior Support and Management', icon: '✋', carf: 'CARF: Rights / restrictive interventions',
    what: 'Restraint only as a last resort; every one reviewed.',
    kpis: ['restraints'] },
  { code: 'GLS', title: 'Group Living Services', icon: '🏡', carf: 'CARF: Child & Youth / Community services',
    what: 'Care plans current, medications documented, appointments kept, required documents on file.',
    kpis: ['care_plans', 'mar_complete', 'med_errors', 'appts_done', 'contract_reqs'] },
  { code: 'HR', title: 'Human Resources', icon: '🪪', carf: 'CARF: Workforce development & management',
    what: 'Criminal record checks and credentials current; enough staff on every shift.',
    kpis: ['crc', 'credentials', 'shift_coverage', 'overtime_week', 'onboarding'] },
  { code: 'TS', title: 'Training and Supervision', icon: '🎓', carf: 'CARF: Workforce development',
    what: 'Mandatory training current; policies read and signed.',
    kpis: ['training', 'policy_signoff'] },
  { code: 'ASE', title: 'Administrative and Service Environment', icon: '🔥', carf: 'CARF: Health & safety',
    what: 'Fire drills, safety checks and monthly inspections done in every house.',
    kpis: ['fire_drills', 'safety_checks'] },
  { code: 'CR', title: 'Client Rights', icon: '🗣', carf: 'CARF: Rights of persons served',
    what: 'Complaints acknowledged and resolved on time.',
    kpis: ['complaints'] },
];

export const QA_PAGES = [
  { href: '/qa', label: 'Dashboard', icon: '🏅' },
  { href: '/qa/incidents', label: 'Incidents & risk', icon: '⚠️' },
  { href: '/qa/staff', label: 'Staff compliance', icon: '🪪' },
  { href: '/qa/safety', label: 'Health & safety', icon: '🔥' },
  { href: '/qa/actions', label: 'Improvement actions', icon: '🛠' },
];

// Score an area: share of its measured KPIs that are green (yellow counts half).
export function areaScore(kpis) {
  const measured = kpis.filter((k) => k && k.status !== 'none');
  if (!measured.length) return null;
  const pts = measured.reduce((s, k) => s + (k.status === 'green' ? 1 : k.status === 'yellow' ? 0.5 : 0), 0);
  return Math.round((100 * pts) / measured.length);
}
export const scoreColor = (v) => (v === null ? 'none' : v >= 90 ? 'green' : v >= 70 ? 'yellow' : 'red');

// The last n months as YYYY-MM, oldest first.
export function lastMonths(todayIso, n = 12) {
  const y = Number(todayIso.slice(0, 4)), m = Number(todayIso.slice(5, 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
export const monthLabel = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-CA', { month: 'short', year: '2-digit', timeZone: 'UTC' });

// Every QA page view is written to the access log (supabase/qa-portal.sql). Never blocks the page.
export async function logQaView(supabase, page) {
  try { await supabase.from('qa_view_log').insert({ page }); } catch {}
}
