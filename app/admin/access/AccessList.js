'use client';
// One card per person: choose a department, tick extras, see what they'll see, then Save.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEPARTMENTS, LEVELS, LEVEL_ORDER, mySections } from '@/lib/sections';
import { savePersonAccess, savePersonSections, savePersonHomes } from './actions';

// Department choices (Everyone is automatic, so it isn't offered as a home).
const CHOICES = DEPARTMENTS.filter((d) => d !== 'Everyone');
const PRESETS = {
  'Frontline': { department: 'Houses & Care', extra: [] },
  'Program Coordinator': { department: 'Houses & Care', extra: ['Operations'] },
  'Program Manager': { department: 'Houses & Care', extra: ['Operations', 'Health & Safety', 'Quality'] },
  'Director': { department: 'Quality', extra: ['Health & Safety', 'Houses & Care', 'Operations'] },
  'HR': { department: 'HR & Orientation', extra: [] },
  'Payroll': { department: 'Finance & Payroll', extra: [] },
};

export default function AccessList({ rows, sections, homes = [] }) {
  return (
    <div className="access-list">
      {rows.map((r) => <PersonCard key={r.id} row={r} sections={sections} homes={homes} />)}
      {!rows.length && <p className="muted">No people yet.</p>}
    </div>
  );
}

function PersonCard({ row, sections, homes }) {
  const [houseIds, setHouseIds] = useState(row.homeIds ?? []);
  const [houseSaved, setHouseSaved] = useState(null);
  async function saveHouses(next) {
    setHouseIds(next);
    const r = await savePersonHomes({ id: row.id, homeIds: next });
    setHouseSaved(r?.error ? { bad: true, text: r.error } : { text: 'Houses saved.' });
  }
  function toggleHouse(h) {
    const next = houseIds.includes(h) ? houseIds.filter((x) => x !== h) : [...houseIds, h];
    saveHouses(next);
  }
  const [department, setDepartment] = useState(row.department);
  const [own, setOwn] = useState(row.own ?? {});
  const [extra, setExtra] = useState(row.extra);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const preview = mySections({ role: row.fullAccess ? 'admin' : 'staff', level: row.level, department, extra_departments: extra, id: row.id }, null, { personLevels: Object.fromEntries(Object.entries(own).filter(([, v]) => v !== 'default')) });
  const shown = row.fullAccess ? DEPARTMENTS.filter((d) => d !== 'Everyone') : [department, ...extra].filter(Boolean);
  const dirty = department !== row.department || extra.slice().sort().join() !== row.extra.slice().sort().join() || sections.some((x) => (own[x.key] ?? 'default') !== (row.own?.[x.key] ?? 'default'));

  function applyPreset(name) {
    const p = PRESETS[name];
    setDepartment(p.department);
    setExtra(p.extra);
    setSaved(null);
  }
  function toggleExtra(d) {
    setExtra((e) => (e.includes(d) ? e.filter((x) => x !== d) : [...e, d]));
    setSaved(null);
  }
  function setSection(key, level) {
    setOwn((o) => ({ ...o, [key]: level }));
    setSaved(null);
  }
  async function save() {
    setBusy(true); setSaved(null);
    const r = await savePersonAccess({ id: row.id, department, extra });
    if (!r?.error) {
      const changed = Object.fromEntries(sections.filter((x) => (own[x.key] ?? 'default') !== (row.own?.[x.key] ?? 'default')).map((x) => [x.key, own[x.key] ?? 'default']));
      if (Object.keys(changed).length) {
        const r2 = await savePersonSections({ id: row.id, levels: changed });
        if (r2?.error) { setBusy(false); setSaved({ bad: true, text: r2.error }); return; }
      }
    }
    setBusy(false);
    if (r?.error) { setSaved({ bad: true, text: r.error }); return; }
    setSaved({ text: 'Saved.' });
    router.refresh();
  }

  return (
    <section className="card access-card">
      <div className="title-row">
        <div>
          <strong>{row.name}</strong> <span className="muted small">· {row.job}{!row.active ? ' · inactive' : ''}</span>
        </div>
        {row.fullAccess
          ? <span className="small">🌐 Sees everything</span>
          : <button type="button" className="secondary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>}
      </div>

      {row.canHouses && (
        <div className="small" style={{ margin: '8px 0' }}>
          <strong>Houses they can see:</strong>{' '}
          {homes.map((h) => (
            <label key={h.id} style={{ marginRight: 12 }}>
              <input type="checkbox" checked={houseIds.includes(h.id)} onChange={() => toggleHouse(h.id)} /> {h.name}
            </label>
          ))}
          {!houseIds.length && <span className="muted"> None yet. They see no houses.</span>}
          {houseSaved && <div className={houseSaved.bad ? 'message' : 'muted'}>{houseSaved.text}</div>}
        </div>
      )}

      {row.fullAccess ? (
        <p className="small muted">The administrator and CEO always see every department. No setting needed.</p>
      ) : (
        <>
          <div className="small" style={{ margin: '8px 0' }}>
            <span className="muted">Quick set-up for a job: </span>
            {Object.keys(PRESETS).map((name) => (
              <button key={name} type="button" className="chip" onClick={() => applyPreset(name)}>{name}</button>
            ))}
          </div>
          <label className="small">Home department{' '}
            <select value={department} onChange={(e) => { setDepartment(e.target.value); setSaved(null); }}>
              <option value="">— choose —</option>
              {CHOICES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div className="small" style={{ marginTop: 8 }}>
            <span className="muted">Also give access to: </span>
            {CHOICES.filter((d) => d !== department).map((d) => (
              <label key={d} style={{ marginRight: 12 }}>
                <input type="checkbox" checked={extra.includes(d)} onChange={() => toggleExtra(d)} /> {d}
              </label>
            ))}
          </div>
          <details style={{ marginTop: 8 }}>
            <summary className="small">Fine-tune each section for this person</summary>
            <table className="small" style={{ marginTop: 6 }}>
              <tbody>
                {sections.map((x) => (
                  <tr key={x.key}>
                    <td>{x.icon} {x.label}</td>
                    <td>
                      <select value={own[x.key] ?? 'default'} onChange={(e) => setSection(x.key, e.target.value)}>
                        <option value="default">Default (from department)</option>
                        {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVELS[l].icon} {LEVELS[l].name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className="small" style={{ marginTop: 8 }}>
            <strong>They will see:</strong>{' '}
            {preview.length ? preview.map((s) => `${s.icon} ${s.label}`).join(' · ') : 'Nothing yet, pick a department.'}
          </p>
        </>
      )}
      {saved && <p className={saved.bad ? 'message' : 'small muted'}>{saved.text}</p>}
    </section>
  );
}
