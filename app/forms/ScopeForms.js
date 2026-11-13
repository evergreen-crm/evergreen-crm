// Forms for one house (scope 'house') or one staff member (scope 'staff'), grouped by area,
// with how many are done and the last date. Used on the house page (Forms tab) and on the staff file.
import Link from 'next/link';
import { POLICY_FORMS, FORM_AREAS } from '@/lib/policyForms';
import { fmtDate } from '@/lib/options';

export default async function ScopeForms({ supabase, scope, id, program, name }) {
  const prog = String(program ?? '').toUpperCase();
  const forms = Object.entries(POLICY_FORMS).filter(([, f]) => f.scope === scope && (f.program === 'BOTH' || !['MCFD', 'CLBC'].includes(prog) || f.program === prog));
  if (!forms.length) return null;
  let q = supabase.from('entries').select('kind, entry_date').in('kind', forms.map(([k]) => k));
  q = scope === 'staff' ? q.eq('subject_profile_id', id) : q.eq('home_id', id).is('resident_id', null);
  const { data: rows } = await q.order('entry_date', { ascending: false }).limit(1000);
  const done = {};
  for (const r of rows ?? []) { const d = (done[r.kind] ??= { n: 0, last: r.entry_date }); d.n += 1; }
  const param = scope === 'staff' ? 'staff' : 'home';

  return (
    <section>
      <p className="small muted">{scope === 'staff' ? 'Forms for' : 'House forms for'} {name}. Open a form to fill it in; completed forms are listed on the form page and can be printed. Reminders for these forms appear in the to-do list of the right staff level.</p>
      {FORM_AREAS.map((area) => {
        const list = forms.filter(([, f]) => f.area === area);
        if (!list.length) return null;
        return (
          <div key={area} className="card">
            <h3 style={{ marginTop: 0 }}>{area}</h3>
            <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {list.map(([k, f]) => (
                <li key={k} style={{ padding: '5px 0', borderBottom: '1px solid var(--line, #eee)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link href={`/forms/${k}?${param}=${id}`}><strong>{f.icon} {f.label}</strong></Link>
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
