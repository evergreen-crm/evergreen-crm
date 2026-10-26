// Incident deadlines, shared by the Incidents tab and the Dashboard.
// Written report: MCFD = within 24 hours of every reportable incident (form CF4179, 2026/03);
// CLBC = 24 hours if urgent, otherwise 5 working days (CLBC Critical Incidents guide, Nov 2024).
function addBusinessDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  let added = 0;
  while (added < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) added++; }
  return d.toISOString().slice(0, 10);
}

export function writtenDue(inc, program) {
  if (inc.is_urgent) { const d = new Date(inc.occurred_on + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  if (program === 'clbc') return addBusinessDays(inc.occurred_on, 5);
  const d = new Date(inc.occurred_on + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The exact deadline (set by supabase/incident-forms.sql), as plain words: "due in 5 h 20 min" / "overdue by 3 h".
export function countdown(dueAt, now = Date.now()) {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - now;
  const abs = Math.abs(ms), h = Math.floor(abs / 3600e3), m = Math.floor((abs % 3600e3) / 60e3);
  const span = h >= 48 ? `${Math.round(h / 24)} days` : h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  return { late: ms < 0, text: ms < 0 ? `overdue by ${span}` : `due in ${span}`, tone: ms < 0 ? 'bad' : ms < 6 * 3600e3 ? 'bad' : ms < 12 * 3600e3 ? 'warn' : '' };
}
export const FORM_NAME = { mcfd: 'MCFD Reportable Incident Form (CF4179)', clbc: 'CLBC Critical Incident Report' };

// Internal review within 5 business days (MCFD Policy 6.3)
export function reviewDue(inc) { return addBusinessDays(inc.occurred_on, 5); }

export const INCIDENT_CLASSES = [
  { key: 'Critical', label: 'Critical incident — must be reported to MCFD / CLBC' },
  { key: 'Behavioural', label: 'Behavioural incident — internal record (ABC)' },
  { key: 'Minor', label: 'Minor incident — internal record' },
];
