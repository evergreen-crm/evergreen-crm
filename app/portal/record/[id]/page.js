// One portal record: full details, edit (if allowed) and print.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { findArea, isDone } from '@/lib/divisions';
import { getGrants, canEditRecord } from '@/lib/portal';
import { fmtDate, fmtDateTime, todayISO, TZ } from '@/lib/options';
import { saveRecord, deleteRecord } from '@/app/portal/actions';
import RecordFields from '@/app/portal/RecordFields';
import PrintButton from '@/app/PrintButton';

export default async function RecordPage({ params, searchParams }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: r } = await supabase.from('records')
    .select('*, homes(name), residents(first_name, last_name), author:created_by(full_name), editor:updated_by(full_name)')
    .eq('id', id).maybeSingle();
  if (!r) notFound();
  const { div, area } = findArea(r.division, r.area);
  if (!area) notFound();
  const grants = await getGrants(supabase, profile);
  const canEdit = canEditRecord(profile, grants, r, user.id);
  const back = `/portal/${r.division}/${r.area}`;
  const overdue = !isDone(r) && r.due_date && r.due_date < todayISO();

  let homes = [], residents = [];
  if (edit && canEdit) {
    [{ data: homes }, { data: residents }] = await Promise.all([
      supabase.from('homes').select('id, name').order('name'),
      area.resident ? supabase.from('residents').select('id, first_name, last_name').order('last_name') : { data: [] },
    ]);
  }

  return (
    <main style={{ '--div': div.color }}>
      <p className="small no-print"><Link href="/portal">Portal</Link> › <Link href={`/portal/${div.key}`}>{div.num}. {div.title}</Link> › <Link href={back}>{area.title}</Link></p>
      <div className="div-banner">
        <span className="div-icon">{div.icon}</span>
        <div>
          <h1>{r.title}</h1>
          <p>{area.title} · {area.std}</p>
        </div>
        <span className="no-print row">
          {canEdit && !edit && <Link className="button secondary" href={`/portal/record/${id}?edit=1`}>Edit</Link>}
          <PrintButton label="Print" />
        </span>
      </div>

      {edit && canEdit ? (
        <form action={saveRecord} className="card no-print">
          <h2>Edit record</h2>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="division" value={r.division} />
          <input type="hidden" name="area" value={r.area} />
          <RecordFields area={area} record={r} homes={homes} residents={residents} />
          <div className="row">
            <button>Save changes</button>
            <Link className="button secondary" href={`/portal/record/${id}`}>Cancel</Link>
          </div>
        </form>
      ) : (
        <div className="card record-sheet">
          <dl className="facts">
            <dt>Division</dt><dd>{div.num}. {div.title}</dd>
            <dt>Area</dt><dd>{area.title} ({area.std})</dd>
            {r.record_type && <><dt>Type</dt><dd>{r.record_type}</dd></>}
            <dt>Date</dt><dd>{fmtDate(r.record_date)}</dd>
            <dt>Due</dt><dd>{r.due_date ? fmtDate(r.due_date) : '—'} {overdue && <span className="badge bad">Overdue</span>}</dd>
            <dt>Status</dt><dd><span className={`badge ${isDone(r) ? '' : 'warn'}`}>{r.status}</span></dd>
            <dt>House</dt><dd>{r.homes?.name ?? 'All / organization'}</dd>
            {r.residents && <><dt>Resident</dt><dd>{r.residents.first_name} {r.residents.last_name}</dd></>}
            {area.fields.map((f) => {
              const v = r.data?.[f.name];
              if (v === undefined || v === null || v === '') return null;
              const shown = f.type === 'date' ? fmtDate(v) : f.name === 'amount' ? `$${Number(v).toFixed(2)}` : String(v);
              return <span key={f.name} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{shown}</dd></span>;
            })}
          </dl>
          <p className="muted small">
            Recorded by {r.author?.full_name ?? 'staff'} on {fmtDateTime(r.created_at)}
            {r.updated_at && ` · last edited by ${r.editor?.full_name ?? 'staff'} on ${fmtDateTime(r.updated_at)}`}
          </p>
          <div className="print-only sign-lines">
            <p>Reviewed by: ______________________________ &nbsp; Signature: ____________________ &nbsp; Date: ____________</p>
            <p className="muted small">Printed {new Date().toLocaleString('en-CA', { timeZone: TZ })} by {profile.full_name} · Evergreen Community Care Inc. · Confidential</p>
          </div>
        </div>
      )}

      <p className="small no-print"><Link href={back}>← Back to {area.title}</Link></p>
      {profile.role === 'admin' && !edit && (
        <form action={deleteRecord} className="no-print">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={back} />
          <button className="link small">Delete record (admin)</button>
        </form>
      )}
    </main>
  );
}
