// 📝 Daily notes — one screen for everyone at my house this shift. The shift is picked from the clock,
// choices are taps, drafts can be edited until signed, and "Sign all" finishes the shift in one tap.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { todayISO, TZ } from '@/lib/options';
import { SHIFTS, shiftNow } from '@/lib/checklist';
import NoteCard from './NoteCard';
import { saveNote, signAllMine } from './actions';
import { plainError } from '@/lib/plain';

const time = (ts) => new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

export default async function Notes({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const [{ data: open }, homesRes] = await Promise.all([
    supabase.from('time_entries').select('home_id').eq('profile_id', user.id).is('clock_out', null).maybeSingle(),
    supabase.from('homes').select('id, name, shift_day_start, shift_evening_start, shift_night_start').order('name'),
  ]);
  const homes = homesRes.error ? (await supabase.from('homes').select('id, name').order('name')).data ?? [] : homesRes.data ?? [];
  const choices = lvl >= 3 ? homes : homes.filter((h) => h.id === profile.home_id || h.id === open?.home_id);
  const home = choices.find((h) => h.id === sp?.home) ?? choices.find((h) => h.id === open?.home_id) ?? choices.find((h) => h.id === profile.home_id) ?? choices[0];

  if (!home) return <main><h1>Daily notes</h1><p className="card">You are not assigned to a house yet. Ask your Program Coordinator.</p></main>;

  const now = shiftNow(home);
  const since = new Date(Date.now() - 16 * 3600e3).toISOString();
  const { data: people } = await supabase.from('residents').select('id, first_name, preferred_name, last_name, allergies').eq('home_id', home.id).neq('status', 'discharged').order('first_name');
  const ids = (people ?? []).map((p) => p.id);
  const { data: notes } = ids.length
    ? await supabase.from('shift_notes').select('id, resident_id, author_id, shift, mood, meals, activities, note, share_with_family, signed_at, created_at, profiles(full_name)').in('resident_id', ids).gte('created_at', since).order('created_at')
    : { data: [] };
  const list = people ?? [];
  const byRes = {};
  for (const n of notes ?? []) (byRes[n.resident_id] ??= []).push(n);
  const mineSigned = (rid) => (byRes[rid] ?? []).some((n) => n.author_id === user.id && n.signed_at);
  const myDraft = (rid) => (byRes[rid] ?? []).find((n) => n.author_id === user.id && !n.signed_at);
  const drafts = list.filter((r) => myDraft(r.id)).length;
  const done = list.filter((r) => mineSigned(r.id)).length;
  const todo = list.filter((r) => !mineSigned(r.id));
  const nextAfter = (rid) => { const i = todo.findIndex((r) => r.id === rid); return (todo.slice(i + 1).concat(todo.slice(0, Math.max(0, i))).find((r) => r.id !== rid))?.id ?? ''; };

  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">📝</span>
        <div><h1>Daily notes — {home.name}</h1><p>{SHIFTS[now.shift]?.icon} {now.shift} shift · write a note for each person before you leave. Tap choices, then a few sentences in your own words.</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}

      <section className="card notes-bar">
        <div><strong>{done} of {list.length}</strong> signed by you this shift{drafts > 0 && <> · <span className="badge warn">{drafts} draft{drafts > 1 ? 's' : ''}</span></>}</div>
        <progress max={list.length || 1} value={done} />
        <div className="row" style={{ gap: 8 }}>
          {drafts > 0 && <form action={signAllMine}><input type="hidden" name="home_id" value={home.id} /><button>✍️ Sign all my drafts ({drafts})</button></form>}
          <Link href="/checklist" className="button secondary">📋 Shift checklist</Link>
        </div>
        {choices.length > 1 && (
          <form className="row no-print" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label>House<select name="home" defaultValue={home.id}>{choices.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
            <button className="secondary">Show</button>
          </form>
        )}
      </section>

      {!list.length && <p className="card muted">No one is living at this house right now.</p>}
      {list.map((r) => {
        const signed = mineSigned(r.id);
        const draft = myDraft(r.id);
        const others = (byRes[r.id] ?? []).filter((n) => n.author_id !== user.id);
        return (
          <section key={r.id} id={`r-${r.id}`} className={`card note-person${signed ? ' is-done' : ''}`}>
            <div className="rh-head">
              <h2 style={{ margin: 0 }}>{r.preferred_name || r.first_name} {r.last_name?.[0] ? `${r.last_name[0]}.` : ''}
                {r.allergies && <span className="badge bad" style={{ marginLeft: 8 }} title={r.allergies}>Allergy: {r.allergies}</span>}</h2>
              <span className={`badge ${signed ? '' : draft ? 'warn' : 'bad'}`}>{signed ? '✓ Your note is signed' : draft ? 'Draft — not signed' : 'No note yet'}</span>
            </div>
            {others.length > 0 && <p className="muted small">Also today: {others.map((n) => `${n.profiles?.full_name ?? 'Staff'} (${n.shift}, ${time(n.created_at)})`).join(' · ')}</p>}
            {signed && !draft ? (
              <details>
                <summary className="small">Write another note for {r.preferred_name || r.first_name}</summary>
                <NoteCard resident={r} shift={now.shift} day={todayISO()} homeId={home.id} action={saveNote} compact justSaved={sp?.saved === r.id} />
              </details>
            ) : (
              <NoteCard resident={r} draft={draft} shift={now.shift} day={todayISO()} homeId={home.id} nextId={nextAfter(r.id)} action={saveNote} justSaved={sp?.saved === r.id} />
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              <Link href={`/residents/${r.id}?tab=mar`}>💊 Medication</Link> · <Link href={`/residents/${r.id}?tab=incidents&new=1`}>⚠️ Incident</Link> · <Link href={`/residents/${r.id}?tab=notes`}>All notes</Link>
            </p>
          </section>
        );
      })}
    </main>
  );
}
