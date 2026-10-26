// 🤖 Ask Evergreen — a helper that answers policy and how-to questions from Evergreen's own policies.
// Directors (level 4+) also see what staff asked (to find gaps in the policies) and can read new policies in.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { askReady, ASK_DAILY_LIMIT } from '@/lib/ask';
import { fmtDate } from '@/lib/options';
import AskBox from './AskBox';
import ReadPoliciesButton from './ReadPoliciesButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Ask Evergreen · Evergreen' };

export default async function AskPage() {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const boss = levelOf(profile) >= 4 || profile.role === 'admin';
  const [home, mine, all, idx, pols] = await Promise.all([
    profile.home_id ? supabase.from('homes').select('on_call_phone').eq('id', profile.home_id).maybeSingle() : { data: null },
    supabase.from('ask_log').select('id, question, created_at, found').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(8),
    boss ? supabase.from('ask_log').select('id, question, created_at, found, helpful, who:profile_id(full_name)').order('created_at', { ascending: false }).limit(60) : { data: null },
    boss ? supabase.from('ask_indexed').select('version_id, chunks, note') : { data: null },
    boss ? supabase.from('policies').select('id, current_version_id').eq('active', true) : { data: null },
  ]);
  const notReady = mine.error && /relation|schema/i.test(mine.error.message);
  const readIn = new Set((idx.data ?? []).filter((x) => x.chunks > 0).map((x) => x.version_id));
  const polCount = (pols.data ?? []).length;
  const polRead = (pols.data ?? []).filter((p) => readIn.has(p.current_version_id)).length;
  const notFound = (all.data ?? []).filter((a) => a.found === false);

  return (
    <main>
      <h1>🤖 Ask Evergreen</h1>
      <p className="small">Ask how to do something or what a policy says. Answers come only from Evergreen’s own policies and the CRM help, with the policy name and page so you can check. {ASK_DAILY_LIMIT} questions a day.</p>
      {notReady && <p className="message">Ask Evergreen isn’t set up yet (setup file: ask-evergreen.sql).</p>}
      {!askReady() && <p className="message">Ask Evergreen isn’t switched on yet — the AI key still needs to be added. Until then, see <Link href="/policies">📘 Policies</Link> or <Link href="/help">❓ Help</Link>.</p>}
      <AskBox onCall={home.data?.on_call_phone ?? null} />
      <p className="muted small">🔒 Privacy: your question and the matching policy text are sent to the AI service (Anthropic) to write the answer. No youth or resident records are sent, and questions with a resident’s name are stopped. Questions are kept 90 days; directors can see them to improve the policies.</p>

      {(mine.data ?? []).length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>My recent questions</h2>
          <ul className="list compact">{mine.data.map((a) => <li key={a.id}><span className="small">{a.question}</span><span className="muted small">{fmtDate(a.created_at.slice(0, 10))}{a.found === false ? ' · not found' : ''}</span></li>)}</ul>
        </section>
      )}

      {boss && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>For directors</h2>
          <p className="small"><strong>{polRead} of {polCount}</strong> policies are read in. New or changed policies are read in every night{(idx.data ?? []).some((x) => x.note) ? ' (some could not be read — see below)' : ''}.</p>
          <ReadPoliciesButton />
          {(idx.data ?? []).filter((x) => x.note).length > 0 && <p className="small bad-text">Not readable: {(idx.data ?? []).filter((x) => x.note).length} file(s) — usually a scanned PDF with no text. Upload a text PDF to fix it.</p>}
          <h3>Questions with no answer in the policies ({notFound.length})</h3>
          <p className="muted small">These may show a gap in a policy or the training.</p>
          <ul className="list compact">{notFound.slice(0, 20).map((a) => <li key={a.id}><span className="small">{a.question}</span><span className="muted small">{a.who?.full_name ?? ''} · {fmtDate(a.created_at.slice(0, 10))}</span></li>)}</ul>
          <h3>Recent questions</h3>
          <ul className="list compact">{(all.data ?? []).slice(0, 30).map((a) => <li key={a.id}><span className="small">{a.question}</span><span className="muted small">{a.who?.full_name ?? ''} · {fmtDate(a.created_at.slice(0, 10))}{a.helpful === true ? ' · 👍' : a.helpful === false ? ' · 👎' : ''}</span></li>)}</ul>
        </section>
      )}
    </main>
  );
}
