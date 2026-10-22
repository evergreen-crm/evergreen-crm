// ⚙️ Set up a house's shift duties: shift times, bed-check interval, medication count, and the duty list
// (copied from the MCFD youth or CLBC adult template when the house is created). Program Coordinator for their
// own house; Program Manager and above for any house. Changes apply from the next shift — signed checklists never change.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { SHIFTS, AREAS, houseTimes } from '@/lib/checklist';
import { saveHouseSettings, saveItem, toggleItem, resetHouseList } from '../actions';
import NotReady from '@/app/components/NotReady';
import { plainError } from '@/lib/plain';

const SECTION_ORDER = ['Start', 'Day', 'Evening', 'Night', 'End'];
const SECTION_LABEL = { Start: 'Every shift — start', Day: '☀️ Day shift', Evening: '🌆 Evening shift', Night: '🌙 Night shift', End: 'Every shift — end' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function Setup({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  if (lvl < 2) return <main><h1>Set up duties</h1><p className="card">Only the Program Coordinator or Program Manager can change a house’s checklist.</p></main>;
  const { data: homes, error } = await supabase.from('homes')
    .select('id, name, house_type, shift_day_start, shift_evening_start, shift_night_start, bed_check_minutes, med_count_required').order('name');
  if (error) return <main><h1>Set up duties</h1><NotReady what="The shift checklist" file="shift-checklists.sql" /></main>;
  const allowed = lvl >= 3 ? homes : homes.filter((h) => h.id === profile.home_id);
  const home = allowed.find((h) => h.id === sp?.home) ?? allowed[0];
  if (!home) return <main><h1>Set up duties</h1><p className="card">You are not assigned to a house.</p></main>;
  const { data: items } = await supabase.from('house_checklist_items').select('*').eq('home_id', home.id).order('sort');
  const t = houseTimes(home);
  const editing = sp?.edit ? (items ?? []).find((i) => i.id === sp.edit) : null;

  return (
    <main>
      <p className="small no-print"><Link href={`/checklist?view=house&home=${home.id}`}>← House board</Link></p>
      <div className="div-banner">
        <span className="div-icon">⚙️</span>
        <div><h1>Shift duties — {home.name}</h1><p>{home.house_type === 'Adults' ? 'CLBC adult home' : 'MCFD youth home'} · changes apply from the next shift. Signed checklists never change.</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}

      {lvl >= 3 && allowed.length > 1 && (
        <form className="row no-print" style={{ alignItems: 'flex-end', gap: 8 }}>
          <label>House<select name="home" defaultValue={home.id}>{allowed.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <button className="secondary">Open</button>
        </form>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Shift times and checks</h2>
        <form action={saveHouseSettings} className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
          <input type="hidden" name="home_id" value={home.id} />
          <label>☀️ Day starts<input type="time" name="day" defaultValue={t.day} required /></label>
          <label>🌆 Evening starts<input type="time" name="evening" defaultValue={t.evening} required /></label>
          <label>🌙 Night starts<input type="time" name="night" defaultValue={t.night} required /></label>
          <label>Bed checks every (min)<input type="number" name="bed" min={10} max={120} defaultValue={home.bed_check_minutes ?? 30} style={{ width: 90 }} /></label>
          <label className="check"><input type="checkbox" name="med_count" defaultChecked={home.med_count_required} /> Medication count at every handover</label>
          <button>Save</button>
        </form>
        <p className="muted small">Each shift runs until the next one starts (for example 7–3 / 3–11 / 11–7, or 8–4 / 4–12 / 12–8). A care plan can require more frequent bed checks — follow the care plan.</p>
      </section>

      <section className="card" id="add">
        <h2 style={{ marginTop: 0 }}>{editing ? 'Change a duty' : 'Add a duty for this house'}</h2>
        <form action={saveItem} className="stack" key={editing?.id ?? 'new'}>
          <input type="hidden" name="home_id" value={home.id} />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label>Duty<input name="item" required maxLength={240} defaultValue={editing?.item ?? ''} placeholder="e.g. Hot tub cover locked" /></label>
          <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
            <label>When<select name="shift" defaultValue={editing?.shift ?? 'Day'}>{SECTION_ORDER.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}</select></label>
            <label>Type<select name="area" defaultValue={editing?.area ?? 'Care'}>{Object.entries(AREAS).map(([k, i]) => <option key={k} value={k}>{i} {k}</option>)}</select></label>
            <label>Only on<select name="weekday" defaultValue={editing?.weekday ?? ''}><option value="">Every day</option>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
            <label className="check"><input type="checkbox" name="critical" defaultChecked={editing?.critical} /> ⭐ Safety item (can’t be N/A)</label>
          </div>
          <div className="row"><button>{editing ? 'Save change' : 'Add duty'}</button>{editing && <Link className="button secondary" href={`/checklist/setup?home=${home.id}`}>Cancel</Link>}</div>
        </form>
      </section>

      {SECTION_ORDER.map((sec) => {
        const list = (items ?? []).filter((i) => i.shift === sec);
        if (!list.length) return null;
        return (
          <section key={sec} className="card">
            <h2 style={{ marginTop: 0 }}>{SECTION_LABEL[sec]} <span className="muted small">({list.filter((i) => i.active).length} on)</span></h2>
            <table>
              <tbody>{list.map((i) => (
                <tr key={i.id} className={i.active ? '' : 'muted'}>
                  <td style={{ width: 28 }}>{AREAS[i.area] ?? '•'}</td>
                  <td>{i.item}{i.critical && ' ⭐'}{i.weekday != null && <span className="badge" style={{ marginLeft: 6 }}>{DAYS[i.weekday]}s</span>}
                    {i.only_if === 'med_count' && <span className="badge" style={{ marginLeft: 6 }}>if medication count is on</span>}
                    {!i.code && <span className="badge warn" style={{ marginLeft: 6 }}>this house only</span>}</td>
                  <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                    <Link href={`/checklist/setup?home=${home.id}&edit=${i.id}#add`}>Edit</Link>{' · '}
                    <form action={toggleItem} style={{ display: 'inline' }}>
                      <input type="hidden" name="home_id" value={home.id} /><input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="active" value={i.active ? 'false' : 'true'} />
                      <button className="link">{i.active ? 'Switch off' : 'Switch on'}</button>
                    </form>
                  </td>
                </tr>))}
              </tbody>
            </table>
          </section>
        );
      })}

      <form action={resetHouseList} className="no-print">
        <input type="hidden" name="home_id" value={home.id} />
        <button className="secondary">Add back any missing standard duties</button>
      </form>
    </main>
  );
}
