// "Forms" tab on a person's page: only the forms for their program (MCFD youth / CLBC adults, plus forms for both),
// grouped by area, with how many are completed and the last date. Clicking one opens it for this person.
import Link from 'next/link';
import { POLICY_FORMS, FORM_AREAS } from '@/lib/policyForms';
import { streamOf } from '@/lib/plans';
import { fmtDate } from '@/lib/options';

export default async function Forms({ supabase, resident }) {
  const stream = streamOf(resident);
  const forms = Object.entries(POLICY_FORMS).filter(([, f]) => f.scope === 'resident' && (f.program === 'BOTH' || f.program === stream));
  const { data: rows } = await supabase.from('entries').select('kind, entry_date')
    .eq('resident_id', resident.id).in('kind', forms.map(([k]) => k)).order('entry_date', { ascending: false }).limit(1000);
  const done = {};
  for (const r of rows ?? []) { const d = (done[r.kind] ??= { n: 0, last: r.entry_date }); d.n += 1; }
  const name = resident.preferred_name || resident.first_name;

  return (
    <section>
      <p className="small muted">{stream} forms for {name}. Open a form to fill it in for {name}; completed forms are listed on the form page and can be printed. Reminders for these forms appear in the to-do list of the right staff level.</p>
      {FORM_AREAS.map((area) => {
        const list = forms.filter(([, f]) => f.area === area);
        if (!list.length) return null;
        return (
          <div key={area} className="card">
            <h3 style={{ marginTop: 0 }}>{area}</h3>
            <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {list.map(([k, f]) => (
                <li key={k} style={{ padding: '5px 0', borderBottom: '1px solid var(--line, #eee)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link href={`/forms/${k}?resident=${resident.id}`}><strong>{f.icon} {f.label}</strong></Link>
                  {f.program !== 'BOTH' && <span className="badge">{f.program} only</span>}
                  <span className="muted">{done[k] ? `${done[k].n} completed · last ${fmtDate(done[k].last)}` : 'none yet'}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
