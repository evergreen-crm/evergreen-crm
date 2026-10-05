// The Evergreen Combined Pre-Screening Standard, as used by the prescreen checklist.
import Link from 'next/link';
import { requirePrescreen } from '@/lib/prescreenAuth';
import { SECTIONS, STEPS, CLEARANCE, TAG_LABEL } from '@/lib/prescreen';

export const metadata = { title: 'Screening standard · Evergreen' };

export default async function Standard() {
  await requirePrescreen();
  return (
    <main>
      <p className="small no-print"><Link href="/hr/prescreen">← Prescreening</Link></p>
      <h1>Evergreen Community Care — Combined Pre-Screening Standard</h1>
      <p>Every employee, contractor, volunteer, relief worker, caregiver, and other person requiring access to residents must complete the applicable screening and clearance process before working independently. Tagged items appear on a person’s checklist only when they apply to them.</p>
      <section className="card"><h2>Workflow</h2>
        <ol className="ps-steps">{STEPS.map(([k, l]) => <li key={k}><span>{l}</span></li>)}</ol>
      </section>
      <div className="ps-standard">
        {SECTIONS.map((s) => (
          <section key={s.n} className="card">
            <h2>{s.n}. {s.t}</h2>
            <ul>{s.items.map((i) => <li key={i.k}>{i.l} {i.tag !== 'all' && <span className={`ps-tag ps-tag-${i.tag}`}>{TAG_LABEL[i.tag]}</span>} {i.exp && <span className="ps-tag">Renews</span>}</li>)}</ul>
          </section>
        ))}
        <section className="card"><h2>9. Clearance status</h2>
          {Object.entries(CLEARANCE).map(([k, c]) => <p key={k}><span className={`ps-clr ps-${k}`}>{c.label}</span><br /><span className="small">{c.text}</span></p>)}
        </section>
        <section className="card"><h2>10. Digital employee screening file</h2>
          <p className="small">Each person’s screening file holds their application, ID verification, interview, references, criminal record and MCFD/CLBC screening, qualifications, training, driver and health documentation where applicable, final clearance, and renewal/expiry dates.</p>
        </section>
      </div>
    </main>
  );
}
