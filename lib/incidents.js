// Incident deadlines, shared by the Incidents tab and the Dashboard.
// Written report: urgent = 24 hours (MCFD & CLBC); otherwise MCFD 72 hours, CLBC 5 working days.
function addBusinessDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  let added = 0;
  while (added < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) added++; }
  return d.toISOString().slice(0, 10);
}

export function writtenDue(inc, program) {
  if (inc.is_urgent) { const d = new Date(inc.occurred_on + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  if (program === 'clbc') return addBusinessDays(inc.occurred_on, 5);
  const d = new Date(inc.occurred_on + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

// Internal review within 5 business days (MCFD Policy 6.3)
export function reviewDue(inc) { return addBusinessDays(inc.occurred_on, 5); }

export const INCIDENT_CLASSES = [
  { key: 'Critical', label: 'Critical incident — must be reported to MCFD / CLBC' },
  { key: 'Behavioural', label: 'Behavioural incident — internal record (ABC)' },
  { key: 'Minor', label: 'Minor incident — internal record' },
];
