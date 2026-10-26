// 📄 The official incident forms, filled from the CRM incident report.
//  * MCFD: SHSS Service Provider Reportable Incident Reporting Form — CF4179 (2026/03).
//  * CLBC: Critical Incident Report (Critical Incidents Service Provider Requirements Guide, Nov 2024, Appendix I).
// Sections and fields follow each form's own order and wording, so the printed page can be checked
// against the blank form line by line. Empty fields are left blank to fill in by hand.
import { fmtDate, fmtTime, TZ } from '@/lib/options';

export const ORG = { name: 'Evergreen Community Care Inc.', email: process.env.ORG_EMAIL || '' }; // set ORG_EMAIL in Vercel to print it
const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : '');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '');
const join = (...parts) => parts.filter(Boolean).join('\n\n');

// What happened, in the order the forms ask for it.
function details(inc) {
  return join(
    inc.antecedent && `Before: ${inc.antecedent}`,
    inc.description,
    inc.consequence && `After: ${inc.consequence}`,
    inc.duration_minutes && `Duration: about ${inc.duration_minutes} minutes.`,
    inc.injuries && `Injuries: ${inc.injuries}`,
  );
}
function actions(inc) {
  return join(
    inc.intervention && `Support / de-escalation used: ${inc.intervention}`,
    inc.tried_first && `Less restrictive approaches tried first: ${inc.tried_first}`,
    inc.hold_used && `Hold or method used: ${inc.hold_used}${inc.no_prohibited ? ' (no prone hold, no pressure on neck/chest/back, no mechanical or chemical restraint, no seclusion)' : ''}`,
    inc.actions_taken,
    inc.injury_check_at && `Injury check ${when(inc.injury_check_at)}${inc.injury_check_note ? `: ${inc.injury_check_note}` : ''}`,
  );
}
const notifiedRows = (inc) => (Array.isArray(inc.notified) ? inc.notified : []).map((n) => [n.name, n.role, n.org, n.at ? when(n.at) : '', n.method, n.copy === true ? 'Y' : n.copy === false ? 'N' : '']);
// Notifications the CRM already knows about (phone call, family, funder told after a restraint).
export function knownNotices(inc, resident, program) {
  const out = [];
  if (inc.verbal_report_at) out.push({ name: inc.verbal_report_to ?? '', role: program === 'clbc' ? 'CLBC liaison analyst' : 'Social worker', org: program === 'clbc' ? 'CLBC' : 'MCFD', at: inc.verbal_report_at, method: 'Phone' });
  if (inc.funder_told_at && inc.funder_told_who) out.push({ name: inc.funder_told_who, role: 'Funder', org: program === 'clbc' ? 'CLBC' : 'MCFD', at: inc.funder_told_at, method: 'Phone' });
  if (inc.family_notified && resident?.guardian_name) out.push({ name: resident.guardian_name, role: resident.guardian_relationship || 'Parent / guardian', org: '', at: null, method: '' });
  return out;
}

export function buildForm(program, { inc, resident: r, home: h, preparer, sender }) {
  const r0 = r ?? {};
  const incidentWhen = [fmtDate(inc.occurred_on), inc.occurred_time ? fmtTime(inc.occurred_time) : ''];
  if (program === 'clbc') {
    return {
      title: 'Critical Incident Report',
      subtitle: 'Community Living British Columbia — reportable critical incident',
      note: inc.is_urgent ? 'URGENT: phone the CLBC liaison analyst immediately; send this report within 24 hours.' : 'Non-urgent: send this report to the CLBC liaison analyst within 5 working days.',
      sections: [
        { title: 'Program / place of service', rows: [
          ['Name of Program / Place of Service', h?.name], ['Phone Number', h?.phone], ['Address', h?.address],
          ['Name of Service Provider', ORG.name], ['Service Category', 'Staffed residential'],
        ] },
        { title: 'Person(s) involved', rows: [
          ['Individual served', `${r0.first_name ?? ''} ${r0.last_name ?? ''}`.trim()], ['Date of birth', r0.date_of_birth ? fmtDate(r0.date_of_birth) : ''],
          ['Other persons involved / adversely affected (names and roles)', inc.people_involved || inc.staff_involved],
        ] },
        { title: 'Type of incident — reportable to CLBC (choose one only)', rows: [['Type of incident', inc.incident_type]] },
        { title: 'Details of the incident — what occurred', hint: 'When, where, what happened, how it occurred, whether it was witnessed, immediate action taken, and for a death whether it was expected or unexpected.', rows: [
          ['Date and time', incidentWhen.filter(Boolean).join(' at ')], ['Where', inc.location], ['Witnessed by', inc.staff_involved],
          ['What happened', details(inc)], ['Immediate action taken', actions(inc)],
        ] },
        { title: 'Details of the incident — actions taken', rows: [
          ['Actions taken to resolve', inc.addressed], ['Measures to prevent recurrence', inc.prevention], ['Recommendations', inc.manager_review],
          ['Police involved', join(yn(inc.police_involved), inc.police_file && `File #${inc.police_file}`)],
        ] },
        { title: 'Notification', table: { head: ['Name', 'Role / relationship', 'Organization', 'Date & time notified', 'Method', 'Copy?'], rows: notifiedRows(inc) } },
        { title: 'Signatures', sign: [
          ['Person completing the form', preparer?.full_name, preparer?.title],
          ['Supervisor / manager', sender?.full_name, sender?.title],
          ['Witness / attending staff', '', ''],
        ] },
      ],
    };
  }
  return {
    title: 'SHSS Service Provider Reportable Incident Reporting Form',
    subtitle: 'Ministry of Children and Family Development — CF4179',
    note: 'Complete and submit to MCFD within 24 hours of a reportable incident. Submit a separate form for each incident.',
    sections: [
      { title: 'SHSS details', rows: [
        ['Service Provider Incident Number', inc.form_number], ['Service Provider Name', ORG.name], ['Place of Service Details Name', h?.name],
        ['Address', h?.address], ['Phone', h?.phone], ['Email', ORG.email],
      ] },
      { title: 'Child or youth details', rows: [
        ['First Name', r0.first_name], ['Last Name', r0.last_name], ['Date of Birth', r0.date_of_birth ? fmtDate(r0.date_of_birth) : ''], ['Gender', r0.gender],
        ['Home Address (if different from SHSS home)', ''], ['Is the child or youth Indigenous?', yn(r0.is_indigenous)],
        ['If yes, Indigenous Child and Family Service Agency / Indigenous Authority / Indigenous Community connected', r0.indigenous_agency],
        ['Does the child or youth have a safety plan?', yn(r0.has_bsp)],
        ['Name of Child’s Parent or Legal Guardian (if applicable)', r0.guardian_name],
        ['Name of Child’s Out-of-care Care Provider / Foster Caregiver (if applicable)', ''],
      ] },
      { title: 'Incident details', rows: [
        ['Date of Incident', incidentWhen[0]], ['Time of Incident', incidentWhen[1]], ['Location of Incident', inc.location],
        ['Type of Incident', inc.incident_type],
        ['Contributing Factors and Related Incidents', inc.contributing],
        ['Details of Incident', details(inc)],
        ['Individuals Involved (name, role) — no personal information about any other child or youth in the home', inc.people_involved || inc.staff_involved],
        ['Actions Taken', actions(inc)],
        ['Police / RCMP involvement', join(yn(inc.police_involved), inc.police_file && `Police file #${inc.police_file}`)],
        ['Coroner involvement', join(yn(inc.coroner_involved), inc.coroner_file && `File #${inc.coroner_file}`)],
        ['How the Incident Has Been Addressed to Date', inc.addressed],
      ] },
      { title: 'Notifications', table: { head: ['Name', 'Role', 'Organization', 'Date & time notified', 'Method', 'Received a copy? (Y/N)'], rows: notifiedRows(inc) } },
      { title: 'Submission and signature', rows: [
        ['Report Prepared by (name, position/title)', [preparer?.full_name, preparer?.title].filter(Boolean).join(', ')],
        ['Report Submitted to: MCFD Primary Professional', [r0.case_worker_name, r0.case_worker_email].filter(Boolean).join(' · ')],
        ['MCFD Resource Worker', [r0.resource_worker_name, r0.resource_worker_email].filter(Boolean).join(' · ')],
        ['Date of Report Submission', inc.form_sent_at ? when(inc.form_sent_at) : ''],
      ], sign: [['Reporter’s Signature', preparer?.full_name, '']] },
    ],
  };
}

// Which required fields are still empty (shown as a checklist before sending).
export function missing(program, { inc, resident: r, home: h }) {
  const m = [];
  if (!inc.location) m.push('Location of the incident');
  if (!inc.people_involved && !inc.staff_involved) m.push('Individuals involved (names and roles)');
  if (inc.police_involved == null) m.push('Police involved? (yes or no)');
  if (!inc.addressed) m.push('How the incident has been addressed to date');
  if (!(Array.isArray(inc.notified) && inc.notified.length)) m.push('Who was notified (at least one row)');
  if (!h?.address || !h?.phone) m.push('House address and phone (house settings)');
  if (program === 'mcfd') {
    if (inc.coroner_involved == null) m.push('Coroner involved? (yes or no)');
    if (inc.contributing == null) m.push('Contributing factors and related incidents');
    if (!r?.case_worker_name) m.push('MCFD Primary Professional (social worker) on the resident file');
    if (!r?.resource_worker_name) m.push('MCFD Resource Worker on the resident file');
  } else if (!inc.prevention) m.push('Measures to prevent it happening again');
  return m;
}
