// One QA record type: what it requires, the add form (open), the saved records, and edit (?edit=<id>).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fmtDate, todayISO } from '@/lib/options';
import { QA_RECORD_TYPES, QA_DIVISION, QA_RECORD_STATUSES, riskScore } from '@/lib/qa';
import { plainError } from '@/lib/plain';
import { requireQa } from '../../guard';
import QaShell from '../../QaShell';
import QaRecordForm from '../QaRecordForm';
import { setQaRecordStatus } from '../actions';

export const dynamic = 'force-dynamic';
const DONE = ['Complete', 'N/A'];
const resName = (r) => (r ? `${r.preferred_name || r.first_name} ${r.last_name ? r.last_name[0] + '.' : ''}`.trim() : '');

export default async function QaRecordType({ params, searchParams }) {
  const { type: key } = await params;
  const sp = (await searchParams) ?? {};
  const type = QA_RECORD_TYPES.find((t) => t.key === key);
  if (!type) notFound();
  const { supabase, user, profile } = await requireQa(`/qa/records/${key}`);
  const today = todayISO();
  const show = ['open', 'done', 'all'].includes(sp.show) ? sp.show : 'all';

  let q = supabase.from('records')
    .select('id, record_type, title, record_date, due_date, status, home_id, resident_id, data, created_at, updated_at, homes(name), residents(first_name, last_name, preferred_name), author:created_by(full_name)')
    .eq('division', QA_DIVISION).eq('area', key);
  if (show === 'open') q = q.in('status', ['Open', 'In progress']);
  if (show === 'done') q = q.in('status', DONE);
  if (sp.home) q = q.eq('home_id', sp.home);
  const [{ data: records, error }, { data: homes }, { data: residents }, { data: people }] = await Promise.all([
    q.order('record_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    supabase.from('homes').select('id, name').order('name'),
    type.resident ? supabase.from('residents').select('id, first_name, last_name, preferred_name').neq('status', 'discharged').order('first_name') : { data: [] },
    supabase.from('profiles').select('id, full_name, role, level').eq('active', true).gte('level', 2).neq('role', 'family').order('full_name'),
  ]);
  const list = records ?? [];
  // A record being edited (may not be in the filtered list).
  let editing = sp.edit ? list.find((r) => r.id === sp.edit) : null;
  if (sp.edit && !editing) {
    const { data } = await supabase.from('records').select('*').eq('id', sp.edit).eq('division', QA_DIVISION).eq('area', key).maybeSingle();
    editing = data;
  }
  const isRisk = key === 'risks';
  const sorted = isRisk ? [...list].sort((a, b) => (riskScore(b.data)?.score ?? 0) - (riskScore(a.data)?.score ?? 0)) : list;
  const longFields = type.fields.filter((f) => f.type === 'textarea');
  const shortFields = type.fields.filter((f) => f.type !== 'textarea');

  return (
    <QaShell active="/qa/records" title={`${type.icon} ${type.title}`} printedBy={profile.full_name} intro={`COA ${type.coa}. ${type.summary}`}>
      <p className="small no-print"><Link href="/qa/records">← All record types</Link></p>
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {(sp.error || error) && <p className="message error no-print">{plainError(sp.error ?? (/relation|schema|permission/i.test(error.message) ? 'Run supabase/qa-records.sql in Supabase first.' : error.message))}</p>}

      <details className="card no-print">
        <summary><strong>What COA expects</strong></summary>
        <ul className="rules">{type.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      </details>

      <section className="card no-print" id="new">
        {editing ? (
          <>
            <h2 style={{ marginTop: 0 }}>Edit: {editing.title}</h2>
            <QaRecordForm type={type} record={editing} homes={homes ?? []} residents={residents ?? []} people={people ?? []} userId={user.id} cancelHref={`/qa/records/${key}`} />
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>+ Add {type.title.toLowerCase().replace(/s$/, '')}</h2>
            <QaRecordForm type={type} homes={homes ?? []} residents={residents ?? []} people={people ?? []} userId={user.id} />
          </>
        )}
      </section>

      <section className="card">
        <div className="title-row">
          <h2 style={{ margin: 0 }}>Saved ({list.length})</h2>
          <span className="small no-print">{[['all', 'All'], ['open', 'Open'], ['done', 'Complete']].map(([k, l], i) => <span key={k}>{i ? ' · ' : ''}{show === k ? <strong>{l}</strong> : <Link href={`/qa/records/${key}?show=${k}`}>{l}</Link>}</span>)}</span>
        </div>
        {!list.length ? <p className="muted small">Nothing saved yet. Use the form above.</p> : (
          <div className="table-wrap">
            <table className="qa-table">
              <thead><tr><th>Date</th><th>Record</th>{isRisk && <th>Score</th>}<th>House</th><th>{type.dueLabel ?? 'Due'}</th><th>Status</th><th className="no-print"></th></tr></thead>
              <tbody>{sorted.map((r) => {
                const late = !DONE.includes(r.status) && r.due_date && r.due_date < today;
                const rs = isRisk ? riskScore(r.data) : null;
                return (
                  <tr key={r.id}>
                    <td className="small">{fmtDate(r.record_date)}</td>
                    <td>
                      <strong>{r.title}</strong>{r.record_type && <span className="muted small"> · {r.record_type}</span>}
                      {r.residents && <span className="small"> · {resName(r.residents)}</span>}
                      <details className="qa-rec-details print-open">
                        <summary className="small">Details</summary>
                        <dl className="small">
                          {shortFields.filter((f) => r.data?.[f.name] !== undefined && r.data?.[f.name] !== '').map((f) => <div key={f.name}><dt>{f.label}</dt><dd>{f.type === 'date' ? fmtDate(r.data[f.name]) : String(r.data[f.name])}</dd></div>)}
                          {longFields.filter((f) => r.data?.[f.name]).map((f) => <div key={f.name}><dt>{f.label}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.data[f.name]}</dd></div>)}
                          <div><dt>Entered by</dt><dd>{r.author?.full_name ?? '—'}{r.updated_at ? ` · edited ${fmtDate(r.updated_at.slice(0, 10))}` : ''}</dd></div>
                        </dl>
                      </details>
                    </td>
                    {isRisk && <td className={`qa-cell qa-${rs?.tone ?? 'none'}`}>{rs ? `${rs.score} · ${rs.level}` : '—'}</td>}
                    <td className="small">{r.homes?.name ?? 'All'}</td>
                    <td className={`small ${late ? 'bad-text' : ''}`}>{r.due_date ? fmtDate(r.due_date) : '—'}{late ? ' · overdue' : ''}</td>
                    <td>
                      <form action={setQaRecordStatus} className="mar-form no-print">
                        <input type="hidden" name="type" value={key} /><input type="hidden" name="id" value={r.id} />
                        <select name="status" defaultValue={r.status}>{QA_RECORD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                        <button className="secondary">Set</button>
                      </form>
                      <span className="print-only small">{r.status}</span>
                    </td>
                    <td className="no-print"><Link className="small" href={`/qa/records/${key}?edit=${r.id}#new`}>Edit</Link></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </QaShell>
  );
}
