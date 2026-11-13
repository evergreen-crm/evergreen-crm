// 📋 Forms: every form from Evergreen's MCFD and CLBC manuals that is completed inside the CRM.
// Forms Batch 1 (daily care and safety) is here; Batches 2–4 are added to lib/policyForms.js.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { POLICY_FORMS, FORM_AREAS } from '@/lib/policyForms';
import { ENTRY_TYPES } from '@/lib/entries';
import { plainError } from '@/lib/plain';

export const dynamic = 'force-dynamic';
const PROGRAM = { BOTH: 'MCFD & CLBC', MCFD: 'MCFD', CLBC: 'CLBC' };

export default async function Forms({ searchParams }) {
  const sp = (await searchParams) ?? {};
  await requireUser(['admin', 'manager', 'staff']);
  const list = Object.entries(POLICY_FORMS);
  const also = ['fire_drill', 'safety_check', 'mcfd_restraint', 'mcfd_incident'].filter((k) => ENTRY_TYPES[k]);
  return (
    <main className="report">
      <h1>📋 Forms</h1>
      <p className="small muted">Every form from Evergreen’s MCFD and CLBC policy manuals is filled in here, not on paper. Each one is saved to the person’s or the house’s file. When a reminder task asks for a form, its “Fill in the form” button opens it, and saving the form completes the task. Upload only outside papers (doctor’s notes, court orders, IEPs) on the person’s Documents tab.</p>
      {sp.error && <p className="message error">{plainError(sp.error)}</p>}
      {FORM_AREAS.map((area) => {
        const forms = list.filter(([, f]) => f.area === area);
        if (!forms.length) return null;
        return (
          <section key={area} className="card">
            <h2 style={{ marginTop: 0 }}>{area}</h2>
            <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {forms.map(([k, f]) => (
                <li key={k} style={{ padding: '6px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <Link href={`/forms/${k}`}><strong>{f.icon} {f.label}</strong></Link>{' '}
                  <span className="badge">{PROGRAM[f.program]}</span> <span className="badge">{f.scope === 'house' ? 'House' : 'Person'}</span>
                  <div className="muted">{f.source}{f.signs ? ` · ${f.signs}` : ''}</div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="card small">
        <h2 style={{ marginTop: 0 }}>Other records already in the CRM</h2>
        <p>{also.map((k, i) => <span key={k}>{i ? ' · ' : ''}<Link href={`/forms/${k}`}>{ENTRY_TYPES[k].label}</Link></span>)} · Medication record (MAR), incidents, complaints, consents and plans are on each person’s page.</p>
      </section>
    </main>
  );
}
