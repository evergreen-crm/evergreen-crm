// Documentation guide: what to write, when, and for which program (MCFD or CLBC).
// Sources: CLBC Service Standards and Expectations (confirmed, timings as stated there);
// the MCFD and CLBC resident checklists already in the CRM (lib/requirements.js, from Evergreen's own manuals).
// Items marked "Confirm" are not yet verified against the full MCFD or COA text.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { MCFD, CLBC } from '@/lib/requirements';

const count = (p) => (p.sections ?? []).reduce((n, s) => n + (s.items?.length ?? 0), 0);

const SHIFT = [
  ['Start of shift (first 15 min)', 'Clock in at the house. Read the communication book and handover. Check today’s activity plan and who is on it. Check medication times on the MAR.'],
  ['During the shift', 'Daily note for each resident: mood, behaviour, meals, school or work, visits, calls. Health, sleep, seizure or bowel entries when they happen. Goal progress when it happens. Any incident: report straight away.'],
  ['End of shift (last 30 min)', 'Sign the daily notes for everyone on the shift. Sign the shift checklist. Write the handover. Clock out (the CRM asks for anything missing).'],
];

const TIMING = [
  ['Signs of illness', 'Document and respond', 'Promptly', 'CLBC'],
  ['Medication record (MAR)', 'Keep up to date', 'Every dose, at the time given', 'CLBC'],
  ['Medication errors', 'Report under the critical incident policy', 'Per policy', 'CLBC'],
  ['Individual record', 'Accurate, complete, current', 'Ongoing', 'CLBC'],
  ['Individual plan (goals, supports, evaluation)', 'Documented and kept current', 'Confirm the review interval', 'CLBC'],
  ['Consent', 'Written, time-limited, names what and who', 'Renew before it expires', 'CLBC'],
  ['Racism or discrimination', 'Document', 'Promptly', 'CLBC'],
  ['Incident trends', 'Review causes and actions', 'At least once a year', 'CLBC'],
  ['Health and safety self-inspection', 'Written report', 'At least twice a year', 'CLBC'],
  ['Emergency plans', 'Review, test, record results', 'Review every 2 years; test at least yearly', 'CLBC'],
  ['Daily notes', 'Every resident, every shift', 'Signed before the shift ends', 'Both (ECC standard)'],
  ['Care plan / goals', 'Review date on each goal', 'Confirm with the MCFD care plan or CLBC plan', 'Confirm'],
];

export default async function DocumentationGuide() {
  await requireUser(['admin', 'manager', 'staff']);
  return (
    <main>
      <div className="title-row"><h1>Documentation guide</h1></div>
      <p className="notice small"><strong>Draft for review.</strong> The CLBC timings come from the CLBC Service Standards and Expectations. The MCFD timings and the COA standards are not confirmed yet, so they are marked “Confirm”. Melvin confirms before staff rely on this.</p>

      <h2>Every shift (both programs)</h2>
      <table className="small">
        <thead><tr><th>When</th><th>What to write</th></tr></thead>
        <tbody>{SHIFT.map(([w, d]) => <tr key={w}><td>{w}</td><td>{d}</td></tr>)}</tbody>
      </table>

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
        <thead><tr><th>Record</th><th>What is needed</th><th>When</th><th>Program</th></tr></thead>
        <tbody>{TIMING.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
      </table>

      <h2>Goals</h2>
      <ul>
        <li>Each resident has goals on their page (Goals tab). Log progress when it happens, not at the end of the week.</li>
        <li>Each goal should have a review date. The CRM does not yet flag overdue goals.</li>
        <li>Goals should match the plan: MCFD care plan for MCFD youth, CLBC individual plan for adults.</li>
      </ul>

      <h2>Activity plan</h2>
      <p className="small">Each house keeps its activity plan on its house page. Write what ran and what didn’t, and why.</p>

      <p className="small muted">Sources: <a href="https://www.communitylivingbc.ca/wp-content/uploads/CLBC-Service-Standards-and-Expectations.pdf">CLBC Service Standards and Expectations</a>. The COA standards are not publicly available, so they are not cited here.</p>
    </main>
  );
}
