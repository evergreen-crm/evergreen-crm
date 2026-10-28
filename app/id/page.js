// My digital ID card (phone-first) and shift check-ins. Managers can open anyone's card with ?person=.
import { canHR } from '@/lib/levels';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { cardStatus, siteOrigin, qrSvg, emergencyFor, fmtDistance, CHECKIN_EVERY_HOURS } from '@/lib/idcard';
import { fmtDateTime, todayISO, addDaysISO } from '@/lib/options';
import { ackLocationNotice } from '@/app/id/actions';
import { IdCardFront, IdCardBack } from './IdCard';
import IdPhotoUpload from './IdPhotoUpload';
import CheckInPanel from './CheckInPanel';
import { shiftTimes, clock } from '@/lib/attendance';
import PrintButton from '@/app/PrintButton';
import MyTimeForms from './MyTimeForms';
import NightCheck from './NightCheck';
import NightDuties from './NightDuties';

export const metadata = { title: 'My ID card · Evergreen' };

export default async function IdPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isMgr = canHR(profile);
  const pid = isMgr && sp.person ? sp.person : user.id;
  const isSelf = pid === user.id;
  const today = todayISO();
  const { data: upcomingShifts } = isSelf ? await supabase.from('shifts').select('id, shift_date, start_time, homes(name)')
    .eq('profile_id', user.id).gte('shift_date', today).lte('shift_date', addDaysISO(today, 14)).order('shift_date').order('start_time') : { data: null };

  const { data: nightChecks } = isSelf ? await supabase.rpc('my_night_checks') : { data: null };
  // The night shift I am on right now (or started within the last 12 hours), for its duty list.
  const { data: nightShifts } = isSelf ? await supabase.from('shifts').select('id, shift_date, start_time, end_time, label, night_role, homes(program)')
    .eq('profile_id', user.id).in('label', ['Awake night', 'Sleep night']).gte('shift_date', addDaysISO(today, -1)).lte('shift_date', today) : { data: null };
  const nowMs = Date.now();
  const mineNow = (nightShifts ?? []).map((x) => {
    const st = new Date(`${x.shift_date}T${String(x.start_time).slice(0, 5)}:00-07:00`).getTime();
    const dur = (((Number(String(x.end_time).slice(0, 2)) * 60 + Number(String(x.end_time).slice(3, 5))) - (Number(String(x.start_time).slice(0, 2)) * 60 + Number(String(x.start_time).slice(3, 5)))) + 1440) % 1440;
    return { ...x, st, en: st + dur * 60000, program: x.homes?.program };
  }).find((x) => nowMs >= x.st - 30 * 60000 && nowMs < x.en);

  const [{ data: person }, { data: details }, { data: card }, { data: onb }, { data: perf }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, active, home_id, homes(name)').eq('id', pid).maybeSingle(),
    supabase.from('staff_details').select('position, employee_no, program, employment_status, emergency_contact, emergency_phone').eq('profile_id', pid).maybeSingle(),
    supabase.from('id_cards').select('*').eq('profile_id', pid).maybeSingle(),
    supabase.from('onboardings').select('personal').eq('profile_id', pid).maybeSingle(),
    // Latest performance badge — only returned if this viewer may see it (database rules).
    supabase.from('staff_badges').select('color, month').eq('profile_id', pid).order('month', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!person) return <main><h1>ID card</h1><p className="muted">Not found.</p></main>;
  // 🪪 Cleared to work? (supabase/cert-expiry.sql) — expired or missing criminal record check, First Aid or NVCI.
  const { data: notCleared } = await supabase.rpc('cleared_on', { p_profile: pid });

  let photoUrl = null;
  if (card?.photo_path) {
    const { data } = await supabase.storage.from('id-photos').createSignedUrl(card.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }
  let newPhotoUrl = null;
  if (card?.new_photo_path && card.new_photo_status === 'Pending') {
    const { data } = await supabase.storage.from('id-photos').createSignedUrl(card.new_photo_path, 3600);
    newPhotoUrl = data?.signedUrl ?? null;
  }
  const status = cardStatus({ card, details, active: person.active, today });
  const verifyUrl = card ? `${await siteOrigin()}/verify/${card.token}` : null;
  const qr = verifyUrl && status === 'Valid' ? await qrSvg(verifyUrl) : '';
  const emergency = emergencyFor(details, onb);

  // Shift and check-ins (own card only)
  let openEntry = null, checks = [], homes = [], outStatus = null, staffOnShift = [], nextShift = null;
  if (isSelf) {
    ({ data: openEntry } = await supabase.from('time_entries').select('id, clock_in, home_id, homes(name)')
      .eq('profile_id', user.id).is('clock_out', null).maybeSingle());
    if (openEntry) {
      ({ data: checks } = await supabase.from('location_checkins').select('kind, at, distance_m, on_site, lat')
        .eq('time_entry_id', openEntry.id).order('at', { ascending: false }));
    }
    ({ data: homes } = await supabase.from('homes').select('id, name').order('name'));
    if (!openEntry) {
      // My next shift today (or one that started already) for the clock-in screen.
      const { data: soon } = await supabase.from('shifts').select('id, shift_date, start_time, end_time, label, home_id, homes(name)')
        .eq('profile_id', user.id).gte('shift_date', addDaysISO(today, -1)).lte('shift_date', addDaysISO(today, 1)).order('shift_date').order('start_time');
      const n = (soon ?? []).map((x) => ({ ...x, ...shiftTimes(x) })).find((x) => x.end > new Date() && x.start < new Date(Date.now() + 18 * 3600000));
      if (n) nextShift = { home_id: n.home_id, text: `${n.label ?? 'Shift'} ${clock(n.start)}–${clock(n.end)} · ${n.homes?.name ?? ''}`, from: n.start > new Date() ? clock(new Date(n.start.getTime() - 15 * 60000)) : null };
    }
    if (openEntry) {
      const [st, sched] = await Promise.all([
        supabase.rpc('clock_out_status'),
        supabase.from('shifts').select('shift_date, profiles(full_name)').eq('home_id', openEntry.home_id).gte('shift_date', today).lte('shift_date', addDaysISO(today, 1)).not('profile_id', 'is', null),
      ]);
      outStatus = st.error ? null : st.data;
      staffOnShift = [...new Set((sched.data ?? []).map((x) => x.profiles?.full_name).filter((n) => n && n !== profile.full_name))];
    }
  }
  const lastAt = checks?.[0]?.at ?? openEntry?.clock_in;
  const nextDue = lastAt ? new Date(new Date(lastAt).getTime() + CHECKIN_EVERY_HOURS * 3600000) : null;
  const overdue = nextDue && nextDue < new Date();

  return (
    <main className="id-page">
      <div className="title-row no-print">
        <h1>{isSelf ? 'My ID card' : `ID card — ${person.full_name}`}</h1>
        <span>{isMgr && !isSelf && <Link href={`/hr/${pid}#id-card`} className="small">← HR record</Link>} <PrintButton label="Print card" /></span>
      </div>

      <div className="card no-print">
        {(!card || card.photo_status === 'None') && <p><strong>Step 1:</strong> add a clear head-and-shoulders photo (plain background, no sunglasses or hat).</p>}
        {card?.photo_status === 'Pending' && <p><span className="badge warn">Photo waiting for approval</span> Your manager will approve it and issue your card.</p>}
        {card?.photo_status === 'Returned' && <p className="message">Your manager asked for a new photo{card.photo_note && `: ${card.photo_note}`}</p>}
        {card?.photo_status === 'Approved' && !card.issued_on && <p><span className="badge">Photo approved</span> Your manager will issue your card soon.</p>}
        {card?.new_photo_status === 'Pending' && <p><span className="badge warn">New photo waiting for approval</span> Your current card keeps working until it’s approved.</p>}
        {card?.new_photo_status === 'Returned' && <p className="message">Your new photo wasn’t approved{card.new_photo_note && `: ${card.new_photo_note}`}. Your current card still works.</p>}
        {notCleared && <p className="message error">⛔ <strong>Not cleared to work with youth or adults:</strong> {notCleared} Upload the renewed certificate in <Link href={`/hr/${pid}`}>HR</Link> and tell your Program Coordinator. Until then you can’t be scheduled.</p>}
        {status === 'Expired' && <p className="message">This card has expired. Ask your manager to renew it.</p>}
        {status === 'Not active' && <p className="message">This card is not active.</p>}
        {isSelf && status !== 'Not active' && (
          <IdPhotoUpload profileId={pid}
            label={card?.photo_path ? 'Change photo (selfie)' : 'Take a selfie'}
            note={card?.photo_status === 'Approved' ? 'A new photo needs your manager’s approval. Your current card keeps working until then.' : null} />
        )}
        {isSelf && newPhotoUrl && (
          <div className="id-admin"><div className="id-admin-photo"><img src={newPhotoUrl} alt="" /></div><p className="small muted">Your new photo (waiting for approval)</p></div>
        )}
      </div>

      <div className="idcards">
        <IdCardFront name={person.full_name} position={details?.position} employeeNo={details?.employee_no}
          program={details?.program} house={person.homes?.name} photoUrl={photoUrl} qr={qr} status={status} expires={card?.expires_on} perf={perf} />
        <IdCardBack emergency={emergency} verifyUrl={verifyUrl ?? '—'} issued={card?.issued_on} />
      </div>
      {perf && <p className="muted small no-print">The coloured ring and badge show {isSelf ? 'your' : 'the'} latest performance badge (<Link href="/badges">details</Link>). They appear on screen only — not on the printed card or the public verify page.</p>}
      {isSelf && !emergency.name && <p className="muted small no-print">Add your emergency contact in <Link href="/onboarding">My onboarding → Personal information</Link>.</p>}

      {isSelf && (
        <section className="card no-print" id="checkin">
          <h2>⏰ Clock In – Clock Out</h2>
          {!card?.location_ack_at ? (
            <form action={ackLocationNotice}>
              <p className="small"><strong>About location.</strong> When you tap <em>Clock in</em>, <em>Check in</em> or <em>Clock out</em>, your phone shares its location once so we can confirm you are at your house during your shift. Clock in and clock out only work at the house (or with your manager’s OK). Location is <strong>not</strong> tracked in the background or when you are off shift. Your manager sees the time, the distance from the house and a map link. Records are kept with timesheets.</p>
              <p className="small">You’ll get a reminder to check in every {CHECKIN_EVERY_HOURS} hours while on shift.</p>
              <button>I understand</button>
            </form>
          ) : (
            <>
              {openEntry ? (
                <p className="small">
                  On shift at <strong>{openEntry.homes?.name ?? 'no house'}</strong> since {fmtDateTime(openEntry.clock_in)}.{' '}
                  {nextDue && <span className={overdue ? 'badge bad' : 'badge'}>{overdue ? 'Check-in due now' : `Next check-in by ${fmtDateTime(nextDue.toISOString()).split(', ').pop()}`}</span>}
                </p>
              ) : <p className="muted small">You are not clocked in.</p>}
              {mineNow && <NightDuties shift={mineNow} />}
              <CheckInPanel onShift={!!openEntry} homes={homes ?? []} defaultHome={profile.home_id} houseName={openEntry?.homes?.name} status={outStatus} staffOnShift={staffOnShift} nextShift={nextShift} />
              {checks?.length > 0 && (
                <ul className="list compact">
                  {checks.map((c, i) => (
                    <li key={i}><span>{c.kind} · {fmtDateTime(c.at).split(', ').pop()}</span>
                      <span className="small">{c.lat == null ? <span className="badge warn">No location</span> : c.on_site ? <span className="badge">At house</span> : c.on_site === false ? <span className="badge bad">{fmtDistance(c.distance_m)} away</span> : <span className="muted">House location not set</span>}</span></li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p className="small"><Link href="/timesheet">Full timesheet →</Link></p>
        </section>
      )}
      {isSelf && <NightCheck checks={nightChecks ?? []} />}
      {isSelf && <MyTimeForms today={today} shifts={(upcomingShifts ?? []).map((x) => ({ id: x.id, shift_date: x.shift_date, start_time: x.start_time, homes: x.homes }))} />}
      {isSelf && <p className="muted small no-print">Tip: on your phone, use “Add to Home Screen” so your ID card opens like an app.</p>}
    </main>
  );
}
