// Documentation guide: what to write, when, and for which program (MCFD or CLBC).
// Sources: CLBC Service Standards and Expectations (confirmed, timings as stated there);
// the MCFD and CLBC resident checklists already in the CRM (lib/requirements.js, from Evergreen's own manuals).
// Items marked "Confirm" are not yet verified against the full MCFD or COA text.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { MCFD, CLBC } from '@/lib/requirements';
import { MCFD_RECORDS, SERVICE_RECORD_STANDARD, SERVICE_RECORD_SECTIONS } from '@/lib/mcfdStandards';

const count = (p) => (p.sections ?? []).reduce((n, s) => n + (s.items?.length ?? 0), 0);

// Where each MCFD record is entered in the CRM.
const WHERE = {
  day_book: 'House shift log, “MCFD daily records”, once per child',
  wellness_check: 'House shift log, “MCFD daily records”, once per child',
  mar: 'Resident page, Medications tab',
};
const whereOf = (r) => WHERE[r.kind] ?? `Resident page, Logs tab, type “${r.section}”`;

const SHIFT = [
  ['Start of shift (first 15 min)', 'Clock in at the house. Read the communication book and handover. Check today’s activity plan and who is on it. Check medication times on the MAR.'],
  ['During the shift', 'Daily note for each resident: mood, behaviour, meals, school or work, visits, calls. Health, sleep, seizure or bowel entries when they happen. Goal progress when it happens. Any incident: report straight away.'],
  ['End of shift (last 30 min)', 'Sign the daily notes for everyone on the shift. Sign the shift checklist. Write the handover. Clock out (the CRM asks for anything missing).'],
];

const TIMING = [
  // [record, what is needed, when, program, source]
  ['Daily log (day book)', 'Significant events, normal routines, any change to routines', 'Daily, for each child', 'MCFD', 'MCFD standards C.1.11, E.7.10(g)'],
  ['Daily safety and wellness checks', 'Check on each child, within the plan of care', 'Daily', 'MCFD', 'MCFD standards C.1.12'],
  ['Reportable incident (notify)', 'Notify the child’s social worker', 'Immediately after the incident', 'MCFD', 'MCFD standards C.2.8'],
  ['Reportable incident (record)', 'Record it in the child’s individual service record', 'Per incident', 'MCFD', 'MCFD standards E.7.10(j)'],
  ['Restraint', 'Record the child’s and staff’s perspectives; debrief', 'Debrief “timely”, no fixed hours', 'MCFD', 'MCFD standards C.3.11, C.3.3, C.3.9'],
  ['Behaviour and discipline', 'Record events leading up to it, and the discipline', 'Per incident', 'MCFD', 'MCFD standards D.7.5, D.7.8(a)'],
  ['Serious illness or injury', 'Notify the social worker and others of significance', 'As soon as possible', 'MCFD', 'MCFD standards D.6.5(b)'],
  ['Medication', 'Approval for each prescribed and OTC medication; notify parents as the plan says', 'Before it is given', 'MCFD', 'MCFD standards D.6.6(c)'],
  ['Individual service record', 'Medical, dental, signed consents, PHN, assessments, day book, incidents', 'Kept current', 'MCFD', 'MCFD standards D.6.6(f), E.7.10'],
  ['Care plan reviews', 'Record each review in the individual service record', 'Schedule timely review dates; set the frequency in the plan', 'MCFD', 'MCFD standards E.5.6, E.5.13(a)'],
  ['Program statement of purpose', 'Review and update', 'Annually', 'MCFD', 'MCFD standards A.1.7'],
  ['Goal and care plan review', 'Progress against each measurable objective, with timelines; the child’s input; next review date', 'On each review date (the CRM flags overdue reviews)', 'MCFD', 'MCFD standards E.4.5(b), E.5.6, E.5.10(c), E.5.13(a)'],
  ['Individual service record sections', 'Intake, Indigenous identity, legal documents, health and consents, assessments, care plan, day book, incidents, complaints, termination or transition', 'Kept current; each change filed the same shift', 'MCFD', 'MCFD standards E.7.10, E.7.11, D.6.6(f)'],
  ['Views of child, family and others', 'Recorded in the individual service record', 'Each time views are sought', 'MCFD', 'MCFD standards E.3.9, E.3.10(e)'],
  ['Intake decisions and consents', 'Intake decision and consents documented; decision sent to the referral source', 'Within the agreed time', 'MCFD', 'MCFD standards E.1.7(d), E.1.8(b)'],
  ['Transition or discharge plan', 'Written plan, filed in the individual service record', 'Before the transition', 'MCFD', 'MCFD standards E.6.4, E.6.5(c)'],
  ['Reportable incident alert', 'Saving a reportable incident alerts the house’s Program Coordinator and Program Manager (in-app and email). No other record alerts.', 'Immediately', 'MCFD', 'MCFD standards C.2.8; CRM alert'],
  ['Staff orientation and acknowledgement', 'Written orientation: philosophy, service, duties and plan of care, safety and emergency, confidentiality, ethics, standards; signed acknowledgement', 'Before first independent shift (Evergreen practice; the standard says timely)', 'MCFD', 'MCFD standards G.3.6, G.3.7'],
  ['Job description', 'Current written job description for each position, signed', 'At hire; kept current', 'MCFD', 'MCFD standards G.1.9, G.4.5(a)'],
  ['Performance review (staff)', 'Regular written performance evaluation', 'Every 3 months (Melvin’s instruction)', 'MCFD', 'MCFD standards G.4.5(d)'],
  ['Supervision (staff)', 'Supervision and support recorded', 'Every 3 months (Evergreen default, to be confirmed)', 'MCFD', 'MCFD standards G.4.3'],
  ['Personnel record (staff)', 'Criminal record check, references, qualifications, orientation acknowledgement, evaluations, discipline, employment dates, rehire recommendation, exit interview', 'Kept current, secure and retrievable', 'MCFD', 'MCFD standards G.1.10(a)–(b)'],
  ['Signs of illness', 'Document and respond', 'Promptly', 'CLBC', 'CLBC standards §9'],
  ['Medication record (MAR)', 'Keep an up-to-date record of all medications', 'Up to date', 'CLBC', 'CLBC standards §11'],
  ['Medication errors', 'Handle under the critical incident policy', 'Per policy', 'CLBC', 'CLBC standards §11'],
  ['Individual record', 'Accurate, complete, current; emergency information up to date', 'Ongoing', 'CLBC', 'CLBC standards §3'],
  ['Individual plan', 'Goals, support needs, service design, delivery, evaluation, changing needs', 'Keep current (no interval stated)', 'CLBC', 'CLBC standards §7'],
  ['Consent', 'Time-limited; names the information and who it is shared with', 'Renew before it expires', 'CLBC', 'CLBC standards §3'],
  ['Racism or discrimination', 'Document', 'Promptly', 'CLBC', 'CLBC standards §14'],
  ['Incident trends', 'Review causes, actions, and results of last year’s efforts', 'At least yearly', 'CLBC', 'CLBC standards §15'],
  ['Health and safety self-inspection', 'Written report', 'At least twice a year', 'CLBC', 'CLBC standards §16'],
  ['Emergency plans', 'Review; test each procedure and record results', 'Review every 2 years; test at least yearly', 'CLBC', 'CLBC standards §18'],
  ['Daily notes (ECC practice)', 'Every resident, every shift', 'Signed before the shift ends', 'Both', 'Evergreen standard'],
  ['Goal progress (ECC practice)', 'Log when it happens', 'As it happens; review date set on each goal', 'Both', 'Evergreen standard'],
];

export default async function DocumentationGuide() {
  await requireUser(['admin', 'manager', 'staff']);
  return (
    <main>
      <div className="title-row"><h1>Documentation guide</h1></div>
      <p className="notice small"><strong>Draft for review.</strong> Timings come from the official MCFD Standards for Staffed Children’s Residential Services and the CLBC Service Standards and Expectations (sources listed at the bottom). COA’s own standards are not publicly available. Melvin confirms before staff rely on this.</p>

      <h2>Every shift (both programs)</h2>
      <table className="small">
        <thead><tr><th>When</th><th>What to write</th></tr></thead>
        <tbody>{SHIFT.map(([w, d]) => <tr key={w}><td>{w}</td><td>{d}</td></tr>)}</tbody>
      </table>

      <h2>MCFD: every record, by section (enter daily)</h2>
      <p className="small">Each record below can be entered for each child on the house’s shift log, under “MCFD daily records”. Entries save with the date, time and author, and every correction keeps the earlier version.</p>
      <table className="small">
        <thead><tr><th>Record (section)</th><th>Standard</th><th>When to enter</th><th>Where in the CRM</th></tr></thead>
        <tbody>{MCFD_RECORDS.map((r) => <tr key={r.kind}><td>{r.section}</td><td>{r.standard}</td><td>{r.when}</td><td>{whereOf(r)}</td></tr>)}</tbody>
      </table>
      <h3>Individual service record: sections (E.7.10)</h3>
      <table className="small">
        <thead><tr><th>Section</th><th>What it must contain</th></tr></thead>
        <tbody>{SERVICE_RECORD_STANDARD.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td></tr>)}</tbody>
      </table>
      <p className="small">Staff enter each change under “Individual service record (by section)” on the resident’s Logs tab. Choose the section it belongs to:</p>
      <ul className="small">{SERVICE_RECORD_SECTIONS.map((s) => <li key={s}>{s}</li>)}</ul>
      <p className="small muted">Staff records (standard G.1.10(a): criminal record check, references, job description, orientation acknowledgement, performance evaluations, discipline documentation, first aid, and others) are on each staff member’s personnel file, not in the child record.</p>

      <h2>Night shifts</h2>
      <ul>
        <li><strong>Awake night:</strong> location check-in every 2 hours, and a random check about every 32 minutes. Note anything that happened.</li>
        <li><strong>Sleep night (CLBC houses):</strong> location check-in every 2 hours. Note any night medication and any resident who woke.</li>
      </ul>

      <h2>MCFD or CLBC: what to document</h2>
      <div className="cards">
        <section className="card">
          <h3>MCFD (children and youth)</h3>
          <p className="small">{count(MCFD)} resident checklist items, from Evergreen’s MCFD Residential Care Policy Manual. Incident report: MCFD Reportable Incident Form (CF4179).</p>
          <p><Link href="/residents">Resident requirements →</Link></p>
        </section>
        <section className="card">
          <h3>CLBC (adults)</h3>
          <p className="small">{count(CLBC)} resident checklist items, from CLBC’s Critical Incidents policy and service standards. Incident report: CLBC Critical Incident Report.</p>
          <p><Link href="/residents">Resident requirements →</Link></p>
        </section>
      </div>

      <h2>Timings from the standards</h2>
      <table className="small">
        <thead><tr><th>Record</th><th>What is needed</th><th>When</th><th>Program</th><th>Source</th></tr></thead>
        <tbody>{TIMING.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td></tr>)}</tbody>
      </table>

      <h2>Goals</h2>
      <ul>
        <li>Each resident has goals on their page (Goals tab). Log progress when it happens, not at the end of the week.</li>
        <li>Each goal needs a target date and a review date. The CRM flags goals with no review date, overdue reviews and reviews due soon.</li>
        <li>Goals should match the plan: MCFD care plan for MCFD youth, CLBC individual plan for adults.</li>
      </ul>

      <h2>Activity plan</h2>
      <p className="small">Each house keeps its activity plan on its house page. Write what ran and what didn’t, and why.</p>

      <p className="small muted">Sources: <a href="https://www2.gov.bc.ca/assets/gov/family-and-social-supports/data-monitoring-quality-assurance/information-for-service-providers/standards_residential_services.pdf">MCFD Standards for Staffed Children’s Residential Services</a> (official PDF; section numbers as read from it) and <a href="https://www.communitylivingbc.ca/wp-content/uploads/CLBC-Service-Standards-and-Expectations.pdf">CLBC Service Standards and Expectations</a>. COA’s own standards are not publicly available, so they are not cited here.</p>
    </main>
  );
}
