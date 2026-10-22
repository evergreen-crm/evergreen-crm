'use client';
// One person's daily note on the Shift notes screen: tap choices, guided prompts, saved on this device as you type
// (so a dropped connection or the 15-minute idle sign-out never loses it), Save draft / Save & sign.
import { useEffect, useRef, useState } from 'react';
import { MOODS, MEALS, ACTIVITIES, NOTE_PROMPTS } from '@/lib/checklist';

const key = (rid, day) => `evg-note:${rid}:${day}`;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const drop = (k) => { try { localStorage.removeItem(k); } catch {} };

export default function NoteCard({ resident, draft, shift, day, homeId, nextId, justSaved, action, compact, returnTo }) {
  const k = key(resident.id, day);
  const [v, setV] = useState(() => ({
    shift: draft?.shift ?? shift,
    mood: draft?.mood ?? '',
    meals: draft?.meals ?? '',
    acts: draft?.activities ? draft.activities.split(',').map((x) => x.trim()).filter(Boolean) : [],
    note: draft?.note ?? '',
    share: !!draft?.share_with_family,
  }));
  const [restored, setRestored] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (justSaved) { drop(k); return; }
    const saved = read(k);
    if (saved && saved.note && saved.note !== (draft?.note ?? '')) { setV(saved); setRestored(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (v.note || v.mood || v.meals || v.acts.length) write(k, v);
  }, [v, k]);

  const set = (patch) => setV((x) => ({ ...x, ...patch }));
  const toggleAct = (a) => set({ acts: v.acts.includes(a) ? v.acts.filter((x) => x !== a) : [...v.acts, a] });
  const name = resident.preferred_name || resident.first_name;

  return (
    <form action={action} className={`note-card${compact ? ' compact' : ''}`}>
      <input type="hidden" name="resident_id" value={resident.id} />
      <input type="hidden" name="home_id" value={homeId ?? ''} />
      {draft?.id && <input type="hidden" name="note_id" value={draft.id} />}
      <input type="hidden" name="next" value={nextId ?? ''} />
      <input type="hidden" name="return" value={returnTo ?? ''} />
      <input type="hidden" name="shift" value={v.shift} />
      <input type="hidden" name="mood" value={v.mood} />
      <input type="hidden" name="meals" value={v.meals} />
      <input type="hidden" name="activities" value={v.acts.join(', ')} />

      {restored && <p className="message ok small" style={{ margin: '0 0 8px' }}>We kept what you typed before — check it and save.</p>}

      <div className="nc-row">
        <span className="nc-label">Shift</span>
        <div className="nc-chips">{['Day', 'Evening', 'Night'].map((s) => (
          <button type="button" key={s} className={`nc-chip${v.shift === s ? ' on' : ''}`} onClick={() => set({ shift: s })}>{s === 'Day' ? '☀️' : s === 'Evening' ? '🌆' : '🌙'} {s}</button>))}
        </div>
      </div>
      <div className="nc-row">
        <span className="nc-label">Mood</span>
        <div className="nc-chips">{MOODS.map((m) => (
          <button type="button" key={m.v} className={`nc-chip${v.mood === m.v ? ' on' : ''}`} onClick={() => set({ mood: v.mood === m.v ? '' : m.v })}>{m.icon} {m.v}</button>))}
        </div>
      </div>
      <div className="nc-row">
        <span className="nc-label">Meals</span>
        <div className="nc-chips">{MEALS.map((m) => (
          <button type="button" key={m} className={`nc-chip${v.meals === m ? ' on' : ''}`} onClick={() => set({ meals: v.meals === m ? '' : m })}>{m}</button>))}
        </div>
      </div>
      <div className="nc-row">
        <span className="nc-label">Activities</span>
        <div className="nc-chips">{ACTIVITIES.map((a) => (
          <button type="button" key={a} className={`nc-chip${v.acts.includes(a) ? ' on' : ''}`} onClick={() => toggleAct(a)}>{a}</button>))}
        </div>
      </div>
      <label className="nc-note">
        <span className="nc-label">Note about {name}{!v.note && <button type="button" className="link small" onClick={() => set({ note: NOTE_PROMPTS })}> · use prompts</button>}</span>
        <textarea name="note" rows={compact ? 3 : 5} required value={v.note} onChange={(e) => set({ note: e.target.value })}
          placeholder="How was their day? Any concerns? Follow-up for the next shift? Write what you saw and heard — facts, not opinions." />
      </label>
      <div className="nc-foot">
        <label className="check small"><input type="checkbox" name="share_with_family" checked={v.share} onChange={(e) => set({ share: e.target.checked })} /> Share with family (after signing)</label>
        <label className="check small"><input type="checkbox" name="serious" /> ⚠️ Something serious happened — open an incident report next</label>
      </div>
      <div className="row">
        <button name="sign" value="yes">Save &amp; sign{nextId ? ' → next' : ''}</button>
        <button name="sign" value="no" className="secondary">Save draft</button>
      </div>
    </form>
  );
}
