'use client';
// One card per person: choose a department, tick extras, see what they'll see, then Save.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEPARTMENTS, mySections } from '@/lib/sections';
import { savePersonAccess } from './actions';

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

export default function AccessList({ rows }) {
  return (
    <div className="access-list">
      {rows.map((r) => <PersonCard key={r.id} row={r} />)}
      {!rows.length && <p className="muted">No people yet.</p>}
    </div>
  );
}

function PersonCard({ row }) {
  const [department, setDepartment] = useState(row.department);
  const [extra, setExtra] = useState(row.extra);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const preview = mySections({ role: row.fullAccess ? 'admin' : 'staff', level: row.level, department, extra_departments: extra, id: row.id }, null, {});
  const shown = row.fullAccess ? DEPARTMENTS.filter((d) => d !== 'Everyone') : [department, ...extra].filter(Boolean);
  const dirty = department !== row.department || extra.slice().sort().join() !== row.extra.slice().sort().join();

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
  async function save() {
    setBusy(true); setSaved(null);
    const r = await savePersonAccess({ id: row.id, department, extra });
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
