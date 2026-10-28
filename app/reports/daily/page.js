// 🖨 Daily documentation report: everything written for one person or one house between two dates,
// ready to print or "Save as PDF" (MCFD / CLBC requests, social worker updates, audits, care plan reviews).
// Who: Program Manager and up for any house; Program Coordinator for their own house only. Not Frontline, HR or Payroll.
// Every time the report is opened or printed it is saved in report_prints (supabase/report-prints.sql).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';
import { TZ, fmtDate, fmtTime, todayISO, addDaysISO } from '@/lib/options';
import { ENTRY_TYPES } from '@/lib/entries';
import { STEP_LABEL } from '@/lib/missing';
import NotReady from '@/app/components/NotReady';
import ReportPrintButton from './ReportPrintButton';
import { MCFD_RECORDS } from '@/lib/mcfdStandards';
import { CLBC_RECORDS } from '@/lib/records';

// Every record a house keeps, for the record checklist on this report (medication has its own section).
const ALL_RECORDS = [...MCFD_RECORDS, ...CLBC_RECORDS].filter((r) => !r.tab);

// Date and time with the year (reports can cover more than one year).
const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { key: 'notes', label: 'Daily shift notes' },
  { key: 'mar', label: 'Medication record (MAR) and PRN' },
  { key: 'incidents', label: 'Incident reports and restraint / restricted practice' },
  { key: 'missing', label: 'Missing youth logs' },
  { key: 'logs', label: 'Other logs (contacts, health, behaviour, money, drills…)' },
  { key: 'checklists', label: 'Shift checklists (whole house only)' },
];
const MAX_DAYS = 366;
const SHIFT_ORDER = { Day: 1, Evening: 2, Night: 3 };
const MAR_FLAG = { Refused: 'bad', Missed: 'bad', Held: 'warn', Error: 'bad' };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const nameOf = (r) => (r ? `${r.preferred_name || r.first_name || ''} ${r.last_name ?? ''}`.trim() : '');
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
// The Vancouver calendar date of a timestamp.
const localDate = (ts) => (ts ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts)) : null);
// Written more than a day after the date it is about = a late entry.
const lateBy = (aboutDate, createdTs) => {
  const d = localDate(createdTs);
  return d && aboutDate && daysBetween(aboutDate, d) > 1 ? d : null;
};
// Midnight in Vancouver for a date, as a UTC timestamp string.
function vanMidnight(iso) {
  const noon = new Date(iso + 'T12:00:00Z');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(noon);
  const off = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-7';
  const m = off.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : -480;
  return new Date(Date.parse(iso + 'T00:00:00Z') - mins * 60000).toISOString();
}
// Supabase returns at most 1000 rows per request; read page by page (up to 20,000 rows).
async function all(make) {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}
const chunks = (arr, n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function Late({ on }) {
  return on ? <span className="badge warn" title="Written more than a day after the date it is about">Late entry — written {fmtDate(on)}</span> : null;
}
function By({ name, at }) {
  return <span className="small">{name ?? '—'}{at ? <><br /><span className="muted">{fmtDateTime(at)}</span></> : null}</span>;
}

export default async function DailyReport({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const lead = lvl >= 3;
  if (lvl < 2 || (lvl === 2 && groupOf(profile))) redirect('/');
  const ownHome = lead ? null : profile.home_id;

  // ---------- Choices for the form ----------
  let homesQ = supabase.from('homes').select('id, name, address, licence_number').order('name');
  if (ownHome) homesQ = homesQ.eq('id', ownHome);
  let resQ = supabase.from('residents').select('id, first_name, preferred_name, last_name, date_of_birth, file_number, home_id, status, funder').order('first_name');
  if (ownHome) resQ = resQ.eq('home_id', ownHome);
  const [{ data: homes }, { data: residents }] = await Promise.all([homesQ, resQ]);
  const homeById = Object.fromEntries((homes ?? []).map((h) => [h.id, h]));
  const resById = Object.fromEntries((residents ?? []).map((r) => [r.id, r]));

  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : today.slice(0, 8) + '01';
  const to = isDate(sp.to) ? sp.to : today;
  const resident = isId(sp.resident) ? resById[sp.resident] : null;
  const home = resident ? homeById[resident.home_id] : isId(sp.home) ? homeById[sp.home] : null;
  const chosen = sp.go ? new Set(SECTIONS.map((s) => s.key).filter((k) => sp[k])) : new Set(SECTIONS.map((s) => s.key));
  const marMode = sp.mar === 'exceptions' ? 'exceptions' : 'all';
  // Records ticked on the form. Null = not chosen yet (all records print).
  const recFilter = sp.recs ? new Set([].concat(sp.rec ?? [])) : null;
  const span = daysBetween(from, to) + 1;

  let problem = null;
  if (sp.go) {
    if (!home && !resident) problem = 'Choose a house or a person.';
    else if (span < 1) problem = 'The “to” date is before the “from” date.';
    else if (span > MAX_DAYS) problem = `Please choose ${MAX_DAYS} days or less (you chose ${span}). For longer periods, print one year at a time.`;
    else if (to > today) problem = 'The “to” date can’t be in the future.';
    else if (!chosen.size) problem = 'Tick at least one section.';
    else if (chosen.has('logs') && recFilter && !recFilter.size) problem = 'Tick at least one record to print.';
  }
  const ready = sp.go && !problem;

  const quick = (f, t) => {
    const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === 'string')), from: f, to: t });
    return `/reports/daily?${q}`;
  };
  const firstOfMonth = today.slice(0, 8) + '01';
  const lastMonthEnd = addDaysISO(firstOfMonth, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + '01';

  const form = (
    <form className="card no-print" method="get">
      <input type="hidden" name="go" value="1" />
      <h2 style={{ marginTop: 0 }}>🖨 Daily documentation report</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Everything written for one person or one house between two dates, ready to print or save as a PDF.
        {ownHome ? ' You can print your own house.' : ''} Every report you open or print is recorded.
      </p>
      <div className="row">
        <label>House
          <select name="home" defaultValue={home?.id ?? ''}>
            <option value="">{ownHome ? '' : 'Choose a house…'}</option>
            {(homes ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label>Person (leave blank for the whole house)
          <select name="resident" defaultValue={resident?.id ?? ''}>
            <option value="">Whole house</option>
            {(homes ?? []).map((h) => {
              const list = (residents ?? []).filter((r) => r.home_id === h.id);
              return list.length ? (
                <optgroup key={h.id} label={h.name}>
                  {list.map((r) => <option key={r.id} value={r.id}>{nameOf(r)}{r.status === 'discharged' ? ' (discharged)' : ''}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <label>From<input type="date" name="from" defaultValue={from} max={today} required /></label>
        <label>To<input type="date" name="to" defaultValue={to} max={today} required /></label>
      </div>
      <p className="small" style={{ margin: '0 0 8px' }}>
        Quick dates: <Link href={quick(firstOfMonth, today)}>This month</Link> · <Link href={quick(lastMonthStart, lastMonthEnd)}>Last month</Link> ·{' '}
        <Link href={quick(addDaysISO(today, -29), today)}>Last 30 days</Link> · <Link href={quick(addDaysISO(today, -89), today)}>Last 90 days</Link>
        <span className="muted"> (then press Show report)</span>
      </p>
      <div className="row">
        <div>
          <strong className="small">Include</strong>
          {SECTIONS.map((s) => (
            <label key={s.key} className="check"><input type="checkbox" name={s.key} value="1" defaultChecked={chosen.has(s.key)} /> {s.label}</label>
          ))}
        </div>
        <div>
          <label>Medication record
            <select name="mar" defaultValue={marMode}>
              <option value="all">Every dose</option>
              <option value="exceptions">Only refused, missed, held, errors and PRN</option>
            </select>
          </label>
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}>
        <legend className="small"><strong>Records to print</strong> — tick the ones you need. In “Other logs”, only ticked records print.</legend>
        <input type="hidden" name="recs" value="1" />
        <div className="row">
          {ALL_RECORDS.map((r) => (
            <label key={r.kind} className="check"><input type="checkbox" name="rec" value={r.kind} defaultChecked={!recFilter || recFilter.has(r.kind)} /> {r.section} <span className="muted small">({r.standard})</span></label>
          ))}
        </div>
      </fieldset>
      <div className="row" style={{ alignItems: 'center' }}>
        <button>Show report</button>
        {ready && <ReportPrintButton info={{ home_id: home?.id, resident_id: resident?.id, from, to, sections: [...chosen] }} />}
      </div>
      {problem && <p className="message error">{problem}</p>}
      <p className="muted small">Tip: to make a PDF, choose “Save as PDF” as the printer. Discharged people are still listed so their records can be printed.</p>
    </form>
  );

  if (!ready) {
    return (
      <main className="report">
        {form}
        {!(homes ?? []).length && <p className="card">No houses to show yet.</p>}
      </main>
    );
  }

  // ---------- Record that the report was opened ----------
  const { error: logErr } = await supabase.from('report_prints').insert({
    report: 'daily-documentation', action: 'opened', home_id: home?.id ?? null, resident_id: resident?.id ?? null,
    date_from: from, date_to: to, sections: [...chosen],
  });
  if (logErr) {
    return (
      <main className="report">
        {form}
        {/report_prints|relation|schema cache/i.test(logErr.message)
          ? <NotReady what="The printed-reports log" file="report-prints.sql" />
          : <p className="message error">The report couldn’t be recorded, so it isn’t shown: {logErr.message}</p>}
      </main>
    );
  }

  // ---------- Who is in the report ----------
  const people = resident ? [resident] : (residents ?? []).filter((r) => r.home_id === home.id);
  const ids = people.map((r) => r.id);
  const scopeName = resident ? `${nameOf(resident)} — ${home?.name ?? ''}` : home.name;
  const fromTs = vanMidnight(from), toTs = vanMidnight(addDaysISO(to, 1));
  const errors = [];
  const note = (label, error) => { if (error) errors.push(`${label}: ${error.message}`); };

  // ---------- Load each section ----------
  const tasks = {};
  if (chosen.has('notes') && ids.length) {
    tasks.notes = Promise.all(chunks(ids).map((part) => all(() => supabase.from('shift_notes')
      .select('id, resident_id, note_date, shift, mood, meals, activities, note, share_with_family, signed_at, created_at, profiles(full_name)')
      .in('resident_id', part).gte('note_date', from).lte('note_date', to)
      .order('note_date').order('created_at'))));
  }
  if (chosen.has('mar') && ids.length) {
    tasks.mar = Promise.all(chunks(ids).map((part) => all(() => {
      let q = supabase.from('med_administrations')
        .select('id, resident_id, admin_date, scheduled_time, status, given_at, reason, medications(name, dose, route, is_prn), profiles:given_by(full_name)')
        .in('resident_id', part).gte('admin_date', from).lte('admin_date', to);
      return q.order('admin_date').order('given_at');
    })));
  }
  if (chosen.has('incidents')) {
    tasks.incidents = all(() => {
      let q = supabase.from('incidents').select('*, profiles:reported_by(full_name), residents(first_name, preferred_name, last_name)')
        .gte('occurred_on', from).lte('occurred_on', to);
      q = resident ? q.eq('resident_id', resident.id) : q.eq('home_id', home.id);
      return q.order('occurred_on').order('occurred_time', { nullsFirst: true });
    });
  }
  if (chosen.has('missing')) {
    tasks.missing = all(() => {
      let q = supabase.from('missing_episodes').select('*, residents(first_name, preferred_name, last_name), starter:started_by(full_name), closer:closed_by(full_name)')
        .gte('started_at', fromTs).lt('started_at', toTs);
      q = resident ? q.eq('resident_id', resident.id) : q.eq('home_id', home.id);
      return q.order('started_at');
    });
  }
  if (chosen.has('logs')) {
    tasks.logs = all(() => {
      let q = supabase.from('entries').select('id, kind, resident_id, entry_date, entry_time, data, amount, created_at, author:created_by(full_name)')
        .gte('entry_date', from).lte('entry_date', to);
      q = resident ? q.eq('resident_id', resident.id) : q.eq('home_id', home.id);
      if (recFilter) q = q.in('kind', [...recFilter]);
      return q.order('entry_date').order('entry_time', { nullsFirst: true });
    });
  }
  if (chosen.has('checklists') && !resident) {
    tasks.checklists = all(() => supabase.from('shift_checklist_board')
      .select('id, shift_date, shift, full_name, status, signed_at, initials, bed_check_count, bed_check_minutes, items, answered, problems')
      .eq('home_id', home.id).gte('shift_date', from).lte('shift_date', to).order('shift_date').order('starts_at'));
  }
  const res = Object.fromEntries(await Promise.all(Object.entries(tasks).map(async ([k, p]) => [k, await p])));
  const flat = (r) => (Array.isArray(r) ? { data: r.flatMap((x) => x.data), error: r.find((x) => x.error)?.error } : r ?? { data: [] });

  const notesR = flat(res.notes); note('Daily notes', notesR.error);
  const marR = flat(res.mar); note('Medication record', marR.error);
  const incR = flat(res.incidents); note('Incidents', incR.error);
  const missR = flat(res.missing); note('Missing youth', missR.error);
  const logsR = flat(res.logs); note('Other logs', logsR.error);
  const clR = flat(res.checklists); note('Shift checklists', clR.error);

  const notes = (notesR.data ?? []).sort((a, b) => a.note_date.localeCompare(b.note_date) || (SHIFT_ORDER[a.shift] ?? 9) - (SHIFT_ORDER[b.shift] ?? 9) || nameOf(resById[a.resident_id]).localeCompare(nameOf(resById[b.resident_id])) || a.created_at.localeCompare(b.created_at));
  const marAll = marR.data ?? [];
  const mar = marMode === 'exceptions' ? marAll.filter((m) => m.status !== 'Given' || m.medications?.is_prn || !m.scheduled_time) : marAll;
  mar.sort((a, b) => a.admin_date.localeCompare(b.admin_date) || String(a.scheduled_time ?? a.given_at ?? '').localeCompare(String(b.scheduled_time ?? b.given_at ?? '')));
  const incidents = incR.data ?? [];
  const missing = missR.data ?? [];
  const logs = (logsR.data ?? []).filter((e) => ENTRY_TYPES[e.kind]);
  const checklists = clR.data ?? [];

  // Missing-youth timelines and checklist problems.
  let missLog = [], clProblems = [];
  if (missing.length) {
    const r = await all(() => supabase.from('missing_log').select('episode_id, at, step, note, profiles:by(full_name)').in('episode_id', missing.map((m) => m.id)).order('at'));
    missLog = r.data; note('Missing youth timeline', r.error);
  }
  if (checklists.some((c) => Number(c.problems) > 0)) {
    const withProblems = checklists.filter((c) => Number(c.problems) > 0).map((c) => c.id);
    const parts = await Promise.all(chunks(withProblems).map((part) => all(() => supabase.from('shift_checklist_ticks')
      .select('checklist_id, section, area, item, critical, note, at').in('checklist_id', part).eq('status', 'Problem').order('sort'))));
    clProblems = parts.flatMap((p) => p.data); parts.forEach((p) => note('Checklist problems', p.error));
  }
  const logByEp = {}; for (const l of missLog) (logByEp[l.episode_id] ??= []).push(l);
  const clById = Object.fromEntries(checklists.map((c) => [c.id, c]));

  // ---------- Summary numbers ----------
  const count = (arr, f) => arr.filter(f).length;
  const lateNotes = count(notes, (n) => lateBy(n.note_date, n.created_at));
  const marCounts = ['Given', 'Refused', 'Missed', 'Held', 'Error'].map((s) => [s, count(marAll, (m) => m.status === s)]);
  const prn = count(marAll, (m) => m.medications?.is_prn || !m.scheduled_time);
  const restraint = count(incidents, (i) => i.physical_intervention || i.hold_used);
  const showPerson = !resident;
  const printedAt = fmtDateTime(new Date().toISOString());
  const info = { home_id: home?.id, resident_id: resident?.id, from, to, sections: [...chosen] };

  return (
    <main className="report daily-report">
      <style>{`
        .daily-report .conf { border: 2px solid #b3261e; color: #b3261e; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: .05em; }
        .daily-report td, .daily-report th { vertical-align: top; }
        .daily-report .note-text { white-space: pre-wrap; }
        .daily-report .inc { border-left: 4px solid #b3261e; padding-left: 10px; margin: 12px 0; break-inside: avoid; }
        .daily-report .inc.minor { border-left-color: #8a5a00; }
        .daily-report .facts2 { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: .9rem; }
        .daily-report .facts2 dt { font-weight: 600; }
        .daily-report .print-foot { display: none; }
        @media print {
          .daily-report .print-foot { display: block; position: fixed; bottom: 0; left: 0; right: 0; font-size: 8pt; color: #555; text-align: center; border-top: 1px solid #ccc; padding-top: 2px; background: #fff; }
          .daily-report { padding-bottom: 24px; }
          .daily-report tr { break-inside: avoid; }
          @page { margin: 14mm 12mm 16mm; }
        }
      `}</style>
      {form}

      <div className="print-foot">CONFIDENTIAL — Evergreen Community Care Inc. · {scopeName} · {fmtDate(from)} to {fmtDate(to)} · Printed {printedAt} by {profile.full_name}</div>

      <div className="report-head">
        <img src="/logo.png" alt="Evergreen Community Care" />
        <h1>Daily documentation report</h1>
        <span className="conf">CONFIDENTIAL</span>
      </div>
      <dl className="facts2" style={{ marginBottom: 12 }}>
        <dt>{resident ? 'Person' : 'House'}</dt><dd>{resident ? <>{nameOf(resident)}{resident.date_of_birth ? ` · born ${fmtDate(resident.date_of_birth)}` : ''}{resident.file_number ? ` · file ${resident.file_number}` : ''}</> : home.name}</dd>
        {resident && <><dt>House</dt><dd>{home?.name ?? '—'}</dd></>}
        {resident?.funder && <><dt>Funder</dt><dd>{resident.funder}</dd></>}
        {!resident && <><dt>People included</dt><dd>{people.map(nameOf).join(', ') || '—'}</dd></>}
        {home?.licence_number && <><dt>Licence</dt><dd>{home.licence_number}</dd></>}
        <dt>Dates</dt><dd>{fmtDate(from)} to {fmtDate(to)} ({span} day{span > 1 ? 's' : ''})</dd>
        <dt>Printed</dt><dd>{printedAt} by {profile.full_name}</dd>
      </dl>

      {errors.length > 0 && (
        <div className="message error">Some parts couldn’t be loaded, so this report is not complete:<ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}

      <section className="card">
        <h2>Summary</h2>
        <ul className="small">
          {chosen.has('notes') && <li><strong>{notes.length}</strong> daily notes · {count(notes, (n) => n.signed_at)} signed · {count(notes, (n) => !n.signed_at)} not signed{lateNotes ? ` · ${lateNotes} late entries` : ''}</li>}
          {chosen.has('mar') && <li><strong>{marAll.length}</strong> medication records · {marCounts.filter(([, n]) => n).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(' · ') || 'none'} · {prn} PRN</li>}
          {chosen.has('incidents') && <li><strong>{incidents.length}</strong> incidents · {count(incidents, (i) => i.is_critical || i.incident_class === 'Critical')} critical · {restraint} with physical intervention / restraint · {count(incidents, (i) => i.status === 'Open')} still open</li>}
          {chosen.has('missing') && <li><strong>{missing.length}</strong> missing youth episodes{missing.length ? ` · ${count(missing, (m) => m.status !== 'Closed')} not closed yet` : ''}</li>}
          {chosen.has('logs') && <li><strong>{logs.length}</strong> other log entries</li>}
          {chosen.has('checklists') && !resident && <li><strong>{checklists.length}</strong> shift checklists · {count(checklists, (c) => c.status === 'Signed')} signed · {checklists.reduce((s, c) => s + Number(c.problems || 0), 0)} problems flagged</li>}
          {chosen.has('checklists') && resident && <li className="muted">Shift checklists are for the whole house, so they’re only in the whole-house report.</li>}
        </ul>
        <p className="muted small" style={{ marginBottom: 0 }}>“Late entry” means it was written more than a day after the date it is about. Signed notes can’t be changed — corrections are written as a new note.</p>
      </section>

      {chosen.has('notes') && (
        <section className="card page-break">
          <h2>1. Daily shift notes</h2>
          {!notes.length ? <p className="muted">No daily notes in these dates.</p> : (
            <table>
              <thead><tr><th>Date / shift</th>{showPerson && <th>Person</th>}<th>Note</th><th>Written by</th><th>Signed</th></tr></thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td className="small">{fmtDate(n.note_date)}<br /><strong>{n.shift}</strong></td>
                    {showPerson && <td className="small">{nameOf(resById[n.resident_id])}</td>}
                    <td>
                      {(n.mood || n.meals || (n.activities ?? []).length > 0) && (
                        <p className="small muted" style={{ margin: '0 0 4px' }}>
                          {[n.mood && `Mood: ${n.mood}`, n.meals && `Meals: ${n.meals}`, (n.activities ?? []).length && `Activities: ${[].concat(n.activities).join(', ')}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <div className="note-text">{n.note}</div>
                      <Late on={lateBy(n.note_date, n.created_at)} />
                    </td>
                    <td><By name={n.profiles?.full_name} at={n.created_at} /></td>
                    <td className="small">{n.signed_at ? fmtDateTime(n.signed_at) : <span className="badge bad">Not signed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('mar') && (
        <section className="card page-break">
          <h2>2. Medication record (MAR){marMode === 'exceptions' ? ' — refused, missed, held, errors and PRN only' : ''}</h2>
          {!mar.length ? <p className="muted">No medication records in these dates.</p> : (
            <table>
              <thead><tr><th>Date</th><th>Time</th>{showPerson && <th>Person</th>}<th>Medication</th><th>Status</th><th>Reason / notes</th><th>By</th></tr></thead>
              <tbody>
                {mar.map((m) => {
                  const isPrn = m.medications?.is_prn || !m.scheduled_time;
                  const late = m.given_at && lateBy(m.admin_date, m.given_at);
                  return (
                    <tr key={m.id}>
                      <td className="small">{fmtDate(m.admin_date)}</td>
                      <td className="small">{m.scheduled_time ? fmtTime(m.scheduled_time) : 'PRN'}{m.given_at ? <><br /><span className="muted">at {fmtDateTime(m.given_at)}</span></> : null}</td>
                      {showPerson && <td className="small">{nameOf(resById[m.resident_id])}</td>}
                      <td className="small">{m.medications?.name ?? '—'}{m.medications?.dose ? ` ${m.medications.dose}` : ''}{m.medications?.route ? ` · ${m.medications.route}` : ''}{isPrn ? ' · PRN' : ''}</td>
                      <td><span className={`badge ${MAR_FLAG[m.status] ?? ''}`}>{m.status}</span></td>
                      <td className="small">{m.reason ?? ''}{late ? <><br /><Late on={late} /></> : null}</td>
                      <td className="small">{m.profiles?.full_name ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('incidents') && (
        <section className="card page-break">
          <h2>3. Incident reports</h2>
          {!incidents.length ? <p className="muted">No incidents in these dates.</p> : incidents.map((i) => {
            const critical = i.is_critical || i.incident_class === 'Critical';
            const restr = i.physical_intervention || i.hold_used || i.tried_first;
            return (
              <div key={i.id} className={`inc ${critical ? '' : 'minor'}`}>
                <h3 style={{ margin: '0 0 4px' }}>
                  {fmtDate(i.occurred_on)}{i.occurred_time ? ` · ${fmtTime(i.occurred_time)}` : ''} — {i.incident_type ?? 'Incident'}
                  {' '}<span className={`badge ${critical ? 'bad' : ''}`}>{i.incident_class ?? (critical ? 'Critical' : 'Incident')}</span>
                  {' '}<span className="badge">{i.status}</span>
                </h3>
                <dl className="facts2">
                  {showPerson && <><dt>Person</dt><dd>{nameOf(i.residents) || 'Whole house'}</dd></>}
                  <dt>Reported by</dt><dd>{i.profiles?.full_name ?? '—'} · written {fmtDateTime(i.created_at)} <Late on={lateBy(i.occurred_on, i.created_at)} /></dd>
                  {i.antecedent && <><dt>Before (trigger)</dt><dd className="note-text">{i.antecedent}</dd></>}
                  <dt>What happened</dt><dd className="note-text">{i.description ?? '—'}</dd>
                  {i.intervention && <><dt>Staff response</dt><dd className="note-text">{i.intervention}</dd></>}
                  {i.actions_taken && <><dt>Actions taken</dt><dd className="note-text">{i.actions_taken}</dd></>}
                  {i.consequence && <><dt>After</dt><dd className="note-text">{i.consequence}</dd></>}
                  {i.duration_minutes != null && <><dt>How long</dt><dd>{i.duration_minutes} minutes</dd></>}
                  {i.injuries && <><dt>Injuries</dt><dd className="note-text">{i.injuries}</dd></>}
                  {(i.verbal_report_to || i.verbal_report_at) && <><dt>Verbal report</dt><dd>{i.verbal_report_to ?? ''}{i.verbal_report_at ? ` · ${fmtDateTime(i.verbal_report_at)}` : ''}</dd></>}
                  {i.written_report_sent_on && <><dt>Written report sent</dt><dd>{fmtDate(i.written_report_sent_on)}</dd></>}
                  {i.family_notified != null && <><dt>Family told</dt><dd>{i.family_notified === true ? 'Yes' : i.family_notified === false ? 'No' : String(i.family_notified)}</dd></>}
                  {i.internal_review_on && <><dt>Internal review</dt><dd>{fmtDate(i.internal_review_on)}</dd></>}
                </dl>
                {restr && (
                  <div style={{ marginTop: 6 }}>
                    <strong className="small">✋ Restraint / restricted practice</strong>
                    <dl className="facts2">
                      {i.tried_first && <><dt>Tried first</dt><dd className="note-text">{i.tried_first}</dd></>}
                      {i.hold_used && <><dt>Hold / method</dt><dd>{i.hold_used}</dd></>}
                      {i.staff_involved && <><dt>Staff and witnesses</dt><dd>{i.staff_involved}</dd></>}
                      {i.no_prohibited != null && <><dt>No prohibited holds</dt><dd>{i.no_prohibited ? 'Confirmed' : 'Not confirmed'}</dd></>}
                      {i.in_safety_plan != null && <><dt>In approved plan</dt><dd>{i.in_safety_plan ? 'Yes' : 'No (emergency)'}</dd></>}
                      <dt>Injury check</dt><dd>{i.injury_check_at ? `${fmtDateTime(i.injury_check_at)} — ${i.injury_check_note ?? ''}` : 'Not done'}</dd>
                      <dt>Person’s debrief</dt><dd className="note-text">{i.person_debrief_at ? `${fmtDateTime(i.person_debrief_at)} — ${i.person_view ?? ''}` : 'Not done'}</dd>
                      <dt>Staff debrief</dt><dd className="note-text">{i.staff_debrief_at ? `${fmtDateTime(i.staff_debrief_at)} — ${i.staff_view ?? ''}` : 'Not done'}</dd>
                      <dt>Funder told</dt><dd>{i.funder_told_at ? `${fmtDateTime(i.funder_told_at)} — ${i.funder_told_who ?? ''}` : 'Not done'}</dd>
                      <dt>Manager review</dt><dd className="note-text">{i.manager_review_at ? `${fmtDateTime(i.manager_review_at)} — ${i.manager_review ?? ''}` : 'Not done'}</dd>
                    </dl>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {chosen.has('missing') && (
        <section className="card page-break">
          <h2>4. Missing youth logs</h2>
          {!missing.length ? <p className="muted">No missing youth episodes in these dates.</p> : missing.map((m) => (
            <div key={m.id} className="inc">
              <h3 style={{ margin: '0 0 4px' }}>{nameOf(m.residents)} — reported missing {fmtDateTime(m.started_at)} <span className="badge">{m.status}</span></h3>
              <dl className="facts2">
                <dt>Reported by</dt><dd>{m.starter?.full_name ?? '—'}</dd>
                {m.last_seen_at && <><dt>Last seen</dt><dd>{fmtDateTime(m.last_seen_at)}{m.last_seen_where ? ` · ${m.last_seen_where}` : ''}{m.last_seen_with ? ` · with ${m.last_seen_with}` : ''}</dd></>}
                {m.clothing && <><dt>Clothing</dt><dd>{m.clothing}</dd></>}
                {m.higher_risk != null && <><dt>Higher risk</dt><dd>{m.higher_risk ? 'Yes' : 'No'}{m.risk_notes ? ` — ${m.risk_notes}` : ''}</dd></>}
                {m.police_called_at && <><dt>Police called</dt><dd>{fmtDateTime(m.police_called_at)}{m.police_file ? ` · file ${m.police_file}` : ''}</dd></>}
                {m.worker_told_at && <><dt>Worker told</dt><dd>{fmtDateTime(m.worker_told_at)}{m.worker_told_who ? ` · ${m.worker_told_who}` : ''}</dd></>}
                {m.found_at && <><dt>Back / found</dt><dd>{fmtDateTime(m.found_at)}{m.found_where ? ` · ${m.found_where}` : ''}</dd></>}
                {m.return_notes && <><dt>Return notes</dt><dd className="note-text">{m.return_notes}</dd></>}
                {m.debrief_notes && <><dt>Debrief</dt><dd className="note-text">{m.debrief_notes}</dd></>}
                {m.closed_at && <><dt>Closed</dt><dd>{fmtDateTime(m.closed_at)} by {m.closer?.full_name ?? '—'}</dd></>}
              </dl>
              {(logByEp[m.id] ?? []).length > 0 && (
                <table style={{ marginTop: 6 }}>
                  <thead><tr><th>Time</th><th>Step</th><th>Note</th><th>By</th></tr></thead>
                  <tbody>
                    {logByEp[m.id].map((l, k) => (
                      <tr key={k}><td className="small">{fmtDateTime(l.at)}</td><td className="small">{STEP_LABEL[l.step] ?? l.step}</td><td className="small note-text">{l.note ?? ''}</td><td className="small">{l.profiles?.full_name ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
      )}

      {chosen.has('logs') && (
        <section className="card page-break">
          <h2>5. Other logs</h2>
          {!logs.length ? <p className="muted">No other log entries in these dates.</p> : (
            <table>
              <thead><tr><th>Date</th>{showPerson && <th>Person</th>}<th>Type</th><th>Details</th><th>By</th></tr></thead>
              <tbody>
                {logs.map((e) => {
                  const t = ENTRY_TYPES[e.kind];
                  let text = '';
                  try { text = t.summary ? t.summary(e.data ?? {}, { amount: e.amount }) : ''; } catch { text = ''; }
                  text = String(text ?? '').replace(/\bundefined\b|\bnull\b/g, '—');
                  if (!text.replace(/[—\s·:]/g, '')) text = Object.entries(e.data ?? {}).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ');
                  return (
                    <tr key={e.id}>
                      <td className="small">{fmtDate(e.entry_date)}{e.entry_time ? <><br />{fmtTime(e.entry_time)}</> : null}</td>
                      {showPerson && <td className="small">{e.resident_id ? nameOf(resById[e.resident_id]) : 'House'}</td>}
                      <td className="small">{t.icon} {t.label}</td>
                      <td className="small note-text">{text}{e.amount != null ? `${text ? ' · ' : ''}${Number(e.amount) < 0 ? '−' : '+'}$${Math.abs(Number(e.amount)).toFixed(2)}` : ''} <Late on={lateBy(e.entry_date, e.created_at)} /></td>
                      <td className="small">{e.author?.full_name ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {chosen.has('checklists') && !resident && (
        <section className="card page-break">
          <h2>6. Shift checklists</h2>
          {!checklists.length ? <p className="muted">No shift checklists in these dates.</p> : (
            <>
              <table>
                <thead><tr><th>Date</th><th>Shift</th><th>Staff</th><th>Done</th><th>Bed checks</th><th>Problems</th><th>Signed</th></tr></thead>
                <tbody>
                  {checklists.map((c) => (
                    <tr key={c.id}>
                      <td className="small">{fmtDate(c.shift_date)}</td>
                      <td className="small">{c.shift}</td>
                      <td className="small">{c.full_name ?? '—'}</td>
                      <td className="small">{c.answered}/{c.items}</td>
                      <td className="small">{c.shift === 'Night' || Number(c.bed_check_count) ? c.bed_check_count ?? 0 : '—'}</td>
                      <td className="small">{Number(c.problems) ? <span className="badge warn">⚠ {c.problems}</span> : '0'}</td>
                      <td className="small">{c.signed_at ? `${fmtDateTime(c.signed_at)}${c.initials ? ` · ${c.initials}` : ''}` : <span className="badge bad">Not signed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clProblems.length > 0 && (
                <>
                  <h3>⚠ Problems flagged on checklists</h3>
                  <table>
                    <thead><tr><th>Shift</th><th>Item</th><th>What staff wrote</th></tr></thead>
                    <tbody>
                      {clProblems.map((p, k) => {
                        const c = clById[p.checklist_id];
                        return (
                          <tr key={k}>
                            <td className="small">{c ? `${fmtDate(c.shift_date)} · ${c.shift} · ${c.full_name ?? ''}` : ''}</td>
                            <td className="small">{p.critical ? '⭐ ' : ''}{p.item}{p.area ? <span className="muted"> ({p.area})</span> : null}</td>
                            <td className="small note-text">{p.note ?? ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="card" style={{ breakInside: 'avoid' }}>
        <h2>Review and sign-off</h2>
        <table>
          <tbody>
            <tr><td style={{ width: '30%' }}>Reviewed by (name)</td><td>&nbsp;</td></tr>
            <tr><td>Position</td><td>&nbsp;</td></tr>
            <tr><td>Signature</td><td>&nbsp;</td></tr>
            <tr><td>Date</td><td>&nbsp;</td></tr>
            <tr><td>Sent to (name, agency) and why</td><td>&nbsp;</td></tr>
          </tbody>
        </table>
        <p className="muted small">This report contains personal information protected under BC privacy law. Share it only with people who are allowed to see it, and only what they need.</p>
      </section>

      <p className="no-print" style={{ marginTop: 16 }}><ReportPrintButton info={info} /></p>
    </main>
  );
}
