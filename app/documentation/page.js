// What to document each shift, for MCFD and CLBC houses. Draft: Melvin confirms it against the
// COA, MCFD and CLBC standards before staff rely on it. Reads from the rules already in the CRM.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PROGRAM_DIFFERENCES } from '@/lib/programCompare';

const EVERY_SHIFT = [
  { when: 'Start of shift (first 15 min)', what: ['Clock in at the house', 'Read the communication book and the handover', 'Check today’s activity plan and who is on it', 'Check medication times (MAR) for the shift'] },
  { when: 'During the shift', what: ['Daily note for each resident: mood, behaviour, meals, school or work, visits, calls', 'Health, sleep, seizure or bowel entries when they happen', 'Goal progress when it happens (not at the end of the week)', 'Any incident: report it straight away, then the full form'] },
  { when: 'End of shift (last 30 min)', what: ['Sign the daily notes for everyone on the shift', 'Sign the shift checklist', 'Write the handover for the next shift', 'Clock out (the CRM asks for anything still missing)'] },
];
const AWAKE = ['Night check at the house every 2 hours (location check-in)', 'Random check about every 32 minutes, on an awake night', 'Note what happened if a resident woke or needed help', 'Write the night entry before 7 am'];
const SLEEP = ['Night check every 2 hours (location check-in)', 'Note any night medication, and any resident who woke', 'Write the night entry before 7 am'];
const DAILY = ['Daily notes for every resident, signed before the shift ends', 'Activity plan: note what ran and what didn’t, and why', 'Resident goals: progress entries as they happen'];

export default async function DocumentationGuide() {
  await requireUser(['admin', 'manager', 'staff']);
  return (
    <main>
      <div className="title-row"><h1>What to document each shift</h1></div>
      <p className="notice small"><strong>Draft.</strong> Melvin confirms this guide against the COA, MCFD and CLBC standards before staff rely on it. The rules for incidents and checklists are the ones already set in the CRM.</p>

      <h2>Every shift (MCFD and CLBC)</h2>
      {EVERY_SHIFT.map((s) => (
        <section key={s.when} className="card">
          <h3>{s.when}</h3>
          <ul>{s.what.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      ))}

      <h2>Night shifts</h2>
      <div className="cards">
        <section className="card"><h3>Awake night</h3><ul>{AWAKE.map((w) => <li key={w}>{w}</li>)}</ul></section>
        <section className="card"><h3>Sleep night (CLBC)</h3><ul>{SLEEP.map((w) => <li key={w}>{w}</li>)}</ul></section>
      </div>

      <h2>Every day</h2>
      <ul>{DAILY.map((w) => <li key={w}>{w}</li>)}</ul>

      <h2>MCFD or CLBC: what is different</h2>
      <table className="small">
        <thead><tr><th>Topic</th><th>MCFD house</th><th>CLBC house</th></tr></thead>
        <tbody>{PROGRAM_DIFFERENCES.map((d) => <tr key={d.topic}><td>{d.topic}</td><td>{d.mcfd}</td><td>{d.clbc}</td></tr>)}</tbody>
      </table>

      <p className="small muted">Goals are on each resident’s page. Activity plans are on each house’s page. <Link href="/homes">Go to houses</Link></p>
    </main>
  );
}
