// The Board of Directors' welcome message. Staff see it the first time they open the portal after their orientation
// is complete, and must accept it before going on. After that it stays here to read again or print.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/options';
import { plainError } from '@/lib/plain';
import PrintButton from '@/app/PrintButton';
import { firstName, welcomeIntro, WELCOME_SECTIONS, WELCOME_CLOSING, WELCOME_FOOTNOTE, WELCOME_SIGNATURE, WELCOME_ORG, WELCOME_ACK } from '@/lib/boardWelcome';
import { acceptWelcome } from '../actions';

export const dynamic = 'force-dynamic';

export default async function BoardWelcome({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: status } = await supabase.rpc('orientation_status');
  if (!status?.complete) redirect('/orientation');
  const accepted = status.welcome_ack_at ?? null;
  const day = (ts) => fmtDate(String(ts).slice(0, 10));

  return (
    <main className="board-welcome">
      <header className="bw-hero">
        <img src="/logo-mark.png" alt="" />
        <p className="bw-eyebrow">A message from the Board of Directors</p>
        <h1>Congratulations, {firstName(profile.full_name)}.<br />Welcome to Evergreen Community Care.</h1>
        <p className="bw-cert">New Staff Orientation complete · Certificate {status.certificate_no} · {day(status.completed_at)}</p>
      </header>

      {sp.error && <p className="alert">{plainError(sp.error)}</p>}

      <section className="card bw-letter">
        {welcomeIntro(profile.full_name).map((t) => <p key={t}>{t}</p>)}
      </section>

      {WELCOME_SECTIONS.map((s) => (
        <section key={s.key} className={`card bw-section bw-${s.key}`}>
          <h2>{s.title}</h2>
          <p>{s.lead}</p>
          <ul>
            {s.points.map((x) => <li key={x.strong}><strong>{x.strong}</strong> {x.text}</li>)}
          </ul>
        </section>
      ))}

      <section className="card bw-letter bw-closing">
        {WELCOME_CLOSING.map((t) => <p key={t}>{t}</p>)}
        <p className="bw-sign"><strong>{WELCOME_SIGNATURE}</strong><br />{WELCOME_ORG}</p>
      </section>

      {accepted ? (
        <section className="card no-print">
          <p><strong>✓ You accepted this message on {day(accepted)}.</strong> You can come back and read it any time from My orientation.</p>
          <p><Link className="button" href="/portal">Go to my home page</Link> <PrintButton /></p>
        </section>
      ) : status.welcome_ack === false ? (
        <form action={acceptWelcome} className="card bw-accept no-print">
          <label><input type="checkbox" name="agree" value="1" required /> {WELCOME_ACK}</label>
          <button type="submit">Accept and start</button>
        </form>
      ) : (
        <p className="no-print"><Link className="button" href="/portal">Go to my home page</Link> <PrintButton /></p>
      )}

      <p className="small muted">{WELCOME_FOOTNOTE} <Link href="/policies">Open the policies →</Link></p>
    </main>
  );
}
