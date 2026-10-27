'use client';
// The Security settings grid: click a box to step to the next setting. Saved straight away and logged.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, LEVELS, LEVEL_ORDER, DEFAULTS, LOCKED, SCOPED } from '@/lib/sections';
import { setLevel, resetAll } from './actions';

export default function SecurityGrid({ sections, grid: start }) {
  const [grid, setGrid] = useState(start);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const router = useRouter();

  async function step(sec, role) {
    if (sec === 'adm' || role === 'adm') return;
    const cur = grid[sec]?.[role] ?? 'none';
    let next = LEVEL_ORDER[(LEVEL_ORDER.indexOf(cur) + 1) % LEVEL_ORDER.length];
    if (sec === 'day' && next === 'none') next = LEVEL_ORDER[1];
    setBusy(`${sec}:${role}`); setMsg(null);
    const r = await setLevel({ section: sec, role, level: next });
    setBusy(null);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    setGrid((g) => ({ ...g, [sec]: { ...g[sec], [role]: next } }));
    setMsg({ text: `Saved: ${sections.find((s) => s.key === sec)?.label} · ${ROLES.find((x) => x[0] === role)?.[1]} → ${LEVELS[next].name}.` });
    router.refresh();
  }
  async function reset() {
    if (!window.confirm('Put every box back to the recommended setting?')) return;
    setBusy('reset');
    const r = await resetAll();
    setBusy(null);
    if (r?.error) { setMsg({ bad: true, text: r.error }); return; }
    setGrid(structuredClone(DEFAULTS));
    setMsg({ text: `Back to recommended (${r.changed} box${r.changed === 1 ? '' : 'es'} changed).` });
    router.refresh();
  }

  return (
    <section className="card">
      <div className="title-row">
        <h2 style={{ margin: 0 }}>Who can see each section</h2>
        <button type="button" className="secondary" onClick={reset} disabled={!!busy}>↺ Back to recommended</button>
      </div>
      <p className="small"><strong>Click a box to change it.</strong> It steps through: {LEVEL_ORDER.map((k) => `${LEVELS[k].icon} ${LEVELS[k].name}`).join(' · ')}. Changes save straight away and are logged. Boxes that differ from the recommended setting have a yellow outline.</p>
      {msg && <p className={`message ${msg.bad ? 'error' : 'ok'}`}>{msg.text}</p>}
      <div className="scroll-x">
        <table className="sec-grid">
          <thead><tr><th>Section</th>{ROLES.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.key}>
                <th scope="row"><span aria-hidden="true">{s.icon}</span> {s.label}{SCOPED.includes(s.key) && <small className="muted"> · also the database rule</small>}</th>
                {ROLES.map(([r]) => {
                  const v = r === 'adm' ? 'all' : grid[s.key]?.[r] ?? 'none';
                  const locked = s.key === 'adm' || r === 'adm';
                  const changed = !locked && v !== DEFAULTS[s.key]?.[r];
                  return (
                    <td key={r}>
                      <button type="button" disabled={locked || !!busy} onClick={() => step(s.key, r)}
                        className={`sec-cell lv-${v}${changed ? ' changed' : ''}`} title={locked ? (LOCKED.adm) : 'Click to change'}>
                        {busy === `${s.key}:${r}` ? '…' : <>{LEVELS[v].icon} {LEVELS[v].name}</>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">For 👤 Individuals, 🏡 Houses and 🗓 Schedule & Time this setting is also the database rule: it decides which houses’ records each person can read and change. For the other sections it decides whether the section shows; a few pages keep a fixed legal limit (for example the COA portal is directors only, and BC sick-day balances are directors and Payroll only). Families always see only their own family member. ⚙️ Admin is always administrator-only.</p>
    </section>
  );
}
