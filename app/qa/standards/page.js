// 📚 COA standards tracker and evidence binder. Each COA section (and any numbered standard added under it)
// has a status, owner, due date, notes and the evidence that proves it — CRM pages or uploaded files.
import Link from 'next/link';
import { fmtDate, todayISO } from '@/lib/options';
import { personLabel } from '@/lib/levels';
import { plainError } from '@/lib/plain';
import { requireQa } from '../guard';
import QaShell from '../QaShell';
import EvidenceForm from './EvidenceForm';
import { addStandard, updateStandard, removeEvidence } from './actions';

export const dynamic = 'force-dynamic';
const STATUSES = ['Not started', 'In progress', 'Met', 'Partially met', 'Not met', 'N/A'];
const TONE = { Met: 'green', 'N/A': 'none', 'Partially met': 'yellow', 'In progress': 'yellow', 'Not met': 'red', 'Not started': 'red' };
// Where in the CRM the evidence for each COA section usually lives.
const SUGGEST = {
  GOV: [{ href: '/portal/governance', label: 'Governance records (Board, policy review)' }],
  FIN: [{ href: '/portal/finance', label: 'Finance records' }],
  PQI: [{ href: '/qa', label: 'QA dashboard' }, { href: '/qa/actions', label: 'Improvement actions' }, { href: '/qa/surveys', label: 'Surveys & monthly reviews' }, { href: '/kpi', label: 'KPIs' }],
  RPM: [{ href: '/qa/incidents', label: 'Incidents & risk trends' }, { href: '/missing', label: 'Missing youth log' }],
  HR: [{ href: '/qa/staff', label: 'Staff compliance' }, { href: '/hr', label: 'HR files' }],
  TS: [{ href: '/academy', label: 'Evergreen Academy (training)' }, { href: '/policies', label: 'Policy sign-offs' }, { href: '/probation', label: 'First-90-days reviews' }],
  ASE: [{ href: '/qa/safety', label: 'Health & safety grid' }, { href: '/portal/qa/tool-b', label: 'Monthly facility inspections' }],
  BSM: [{ href: '/qa/incidents', label: 'Restraint trend' }],
  CR: [{ href: '/portal/program/std-b', label: 'Complaints and rights' }, { href: '/qa/surveys', label: 'Youth and family surveys' }],
  GLS: [{ href: '/qa/audits', label: 'Resident file audits' }, { href: '/homes', label: 'Houses and residents' }],
};

export default async function QaStandards({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireQa('/qa/standards');
  const today = todayISO();
  const [{ data: stds, error }, { data: ev }, { data: people }] = await Promise.all([
    supabase.from('qa_standards').select('id, code, area, title, status, owner_id, due_date, notes, updated_at, owner:owner_id(full_name)').order('area').order('code'),
    supabase.from('qa_evidence').select('id, standard_id, title, link, file_path, file_name, added_at, adder:added_by(full_name)').order('added_at'),
    supabase.from('profiles').select('id, full_name, role, level').eq('active', true).gte('level', 2).neq('role', 'family').order('full_name'),
  ]);
  if (error && /qa_standards|relation|schema cache/i.test(error.message)) return <QaShell active="/qa/standards" title="Quality assurance — COA standards"><p className="message">Run supabase/qa-phase2.sql in Supabase first.</p></QaShell>;
  const list = stds ?? [];
  // Signed links for uploaded files (1 hour).
  const files = (ev ?? []).filter((e) => e.file_path);
  const signed = {};
  if (files.length) {
    const { data } = await supabase.storage.from('qa-evidence').createSignedUrls(files.map((f) => f.file_path), 3600);
    for (const [i, f] of files.entries()) signed[f.id] = data?.[i]?.signedUrl ?? null;
  }
  const allAreas = [...new Set(list.map((s) => s.area))];
  const areas = allAreas.includes(sp.area) ? [sp.area] : allAreas;
  const items = list.filter((s) => s.code !== s.area);
  const counted = list.filter((s) => s.status !== 'N/A');
  const met = counted.filter((s) => s.status === 'Met').length;
  const late = counted.filter((s) => s.status !== 'Met' && s.due_date && s.due_date < today).length;
  const noEvidence = counted.filter((s) => !(ev ?? []).some((e) => e.standard_id === s.id)).length;

  return (
    <QaShell active="/qa/standards" title="Quality assurance — COA standards" printedBy={profile.full_name}
      intro="Work through the checklist under each COA section: set the status, owner and due date, write what is in place, press Save, then attach the evidence (a CRM page or a file). Add COA's own numbered standards (e.g. PQI 2) with + Add a standard.">
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {sp.error && <p className="message error no-print">{plainError(sp.error)}</p>}
      <section className="qa-summary">
        <div className={`qa-score kpi-${counted.length && met === counted.length ? 'green' : 'yellow'}`}><span className="small muted">Met</span><strong>{counted.length ? Math.round((100 * met) / counted.length) : 0}%</strong><span className="small">{met} of {counted.length}</span></div>
        <div className={`qa-score kpi-${late ? 'red' : 'green'}`}><span className="small muted">Past due</span><strong>{late}</strong><span className="small">not met by due date</span></div>
        <div className={`qa-score kpi-${noEvidence ? 'yellow' : 'green'}`}><span className="small muted">No evidence yet</span><strong>{noEvidence}</strong><span className="small">standards</span></div>
      </section>

      <details className="card no-print">
        <summary><strong>+ Add a standard</strong></summary>
        <form action={addStandard}>
          <div className="row">
            <label>COA section<select name="area" defaultValue={sp.area ?? 'PQI'}>{allAreas.map((a) => <option key={a}>{a}</option>)}</select></label>
            <label>Standard number<input name="code" required maxLength={30} placeholder="e.g. PQI 2" /></label>
            <label>Due date<input type="date" name="due_date" /></label>
            <label>Owner<select name="owner_id" defaultValue=""><option value="">—</option>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}</select></label>
          </div>
          <label>Title (short, in your own words)<input name="title" required maxLength={300} placeholder="e.g. Stakeholder feedback is gathered and used" /></label>
          <button>Add standard</button>
        </form>
      </details>

      {!items.length && <p className="message no-print">Only the 10 section headings are here. Run supabase/qa-records.sql in Supabase to load the starting checklist under each section, or add standards yourself below.</p>}
      <nav className="qa-tabs no-print" aria-label="COA sections">
        <Link href="/qa/standards" className={!sp.area ? 'on' : ''}>All sections</Link>
        {allAreas.map((a) => {
          const sub = list.filter((s) => s.area === a && s.status !== 'N/A');
          const m = sub.filter((s) => s.status === 'Met').length;
          return <Link key={a} href={`/qa/standards?area=${a}`} className={sp.area === a ? 'on' : ''}>{a} {m}/{sub.length}</Link>;
        })}
      </nav>

      {areas.map((a) => (
        <section key={a} className="card qa-area">
          <h2 style={{ marginTop: 0 }}>{a} — {list.find((s) => s.code === a)?.title ?? a}</h2>
          {list.filter((s) => s.area === a).map((s) => {
            const evid = (ev ?? []).filter((e) => e.standard_id === s.id);
            return (
              <div key={s.id} id={`s-${s.id}`} className={`qa-std qa-std-${TONE[s.status] ?? 'none'}`}>
                <div className="title-row">
                  <strong>{s.code === a ? 'Whole section' : s.code} {s.code !== a && <span>— {s.title}</span>}</strong>
                  <span className={`badge ${TONE[s.status] === 'green' ? '' : TONE[s.status] === 'red' ? 'bad' : 'warn'}`}>{s.status}</span>
                </div>
                <p className="small muted" style={{ margin: '2px 0 6px' }}>Owner: {s.owner?.full_name ?? '—'} · Due: {s.due_date ? <span className={s.due_date < today && s.status !== 'Met' ? 'bad-text' : ''}>{fmtDate(s.due_date)}</span> : '—'} · Updated {fmtDate(s.updated_at.slice(0, 10))}</p>
                {s.notes && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</p>}
                <ul className="small">
                  {evid.map((e) => (
                    <li key={e.id}>📎 {e.link ? <Link href={e.link} target={e.link.startsWith('http') ? '_blank' : undefined}>{e.title}</Link> : signed[e.id] ? <a href={signed[e.id]} target="_blank" rel="noreferrer">{e.title}</a> : e.title}
                      <span className="muted"> · {e.adder?.full_name ?? ''} {fmtDate(e.added_at.slice(0, 10))}</span>
                      <form action={removeEvidence} style={{ display: 'inline' }} className="no-print"><input type="hidden" name="id" value={e.id} /> <button className="link small">remove</button></form></li>
                  ))}
                  {!evid.length && <li className="muted">No evidence yet.</li>}
                </ul>
                <form action={updateStandard} className="qa-std-form no-print">
                  <input type="hidden" name="id" value={s.id} />
                  {sp.area && <input type="hidden" name="area_filter" value={sp.area} />}
                  <div className="row">
                    <label>Status<select name="status" defaultValue={s.status}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
                    <label>Owner<select name="owner_id" defaultValue={s.owner_id ?? ''}><option value="">—</option>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
                    <label>Due date<input type="date" name="due_date" defaultValue={s.due_date ?? ''} /></label>
                  </div>
                  <label>Notes (what's in place, what's missing)<textarea name="notes" rows={2} maxLength={4000} defaultValue={s.notes ?? ''} /></label>
                  <button>Save</button>
                </form>
                <details className="no-print" open={!evid.length}>
                  <summary className="small"><strong>📎 Attach evidence</strong> (a CRM page, web link or file)</summary>
                  <EvidenceForm standardId={s.id} suggestions={SUGGEST[a] ?? []} />
                </details>
              </div>
            );
          })}
        </section>
      ))}
    </QaShell>
  );
}
