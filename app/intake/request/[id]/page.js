// A signed intake form — view and print (managers only).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { formByKey } from '@/lib/intakeForms';
import { fmtDate, fmtDateTime } from '@/lib/options';
import PrintButton from '@/app/PrintButton';

const show = (f, v) => {
  if (f.type === 'check') return v ? '☑ Yes' : '☐ No';
  if (!v) return <span className="muted">—</span>;
  if (f.type === 'date') return fmtDate(v);
  return v;
};

export default async function SignedIntake({ params }) {
  const { id } = await params;
  const { supabase } = await requireUser(['admin', 'manager']);
  const { data: r } = await supabase.from('intake_requests').select('*, intake_cases(id, person_name, stream)').eq('id', id).maybeSingle();
  if (!r) notFound();
  const form = formByKey(r.form_key);
  const a = r.data ?? {};
  return (
    <main className="intake-print">
      <p className="small no-print"><Link href={`/intake/${r.case_id}`}>← Back to intake</Link> <PrintButton /></p>
      <div className="report-head"><img src="/logo.png" alt="" /><div><h1>{r.form_title}</h1>
        <p className="muted small">{form?.code} · {r.intake_cases?.stream} · For: <strong>{r.intake_cases?.person_name}</strong></p></div></div>
      {form?.sections.map((s) => (
        <section key={s.title} className="intake-sec">
          <h2>{s.title}</h2>
          <dl className="facts">
            {s.fields.map((f) => (<div key={f.name} className="fact-row"><dt>{f.label}</dt><dd>{show(f, a[f.name])}</dd></div>))}
          </dl>
        </section>
      ))}
      <section className="intake-sec">
        <h2>Signature</h2>
        <p className="small">☑ {form?.attest}</p>
        {r.signature && <img src={r.signature} alt="Signature" className="intake-sig" />}
        <p><strong>{r.signed_name}</strong>{r.signer_role && ` — ${r.signer_role}`}</p>
        <p className="muted small">Signed electronically {fmtDateTime(r.completed_at)} (Pacific time, recorded by Evergreen’s server).
          Link sent to {r.recipient_name}{r.recipient_email && ` <${r.recipient_email}>`} on {fmtDateTime(r.sent_at)}.
          {r.signer_ip && ` IP ${r.signer_ip}.`} Ref {r.id.slice(0, 8)}.</p>
      </section>
      <p className="muted small">Source: {form?.source}. Retain with admission documentation for 7 years post-discharge (RC Program Manual v4 §17.1).</p>
    </main>
  );
}
