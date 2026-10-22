// Colour-coded samples of the weekend-partner schedule (4 weeks), shown inside notices that contain a marker:
//   [[sample-schedule]]            1-bed home (6 staff)
//   [[sample-schedule-2bed]]       2-bed home, 2 staff on every shift (12 staff)
//   [[sample-schedule-2bed-peak]]  2-bed home, 1 staff on each shift + an extra 3–7 pm helper (8 staff)
// Names are examples. Same pattern the CRM uses (schedule-teams.sql): a second pair on a shift starts a week later.
const A = new Set([0, 1, 4, 5, 6, 8, 9, 10, 11]);
const START = '2026-11-02';
const day = (i) => new Date(Date.parse(START + 'T12:00:00Z') + i * 864e5);

const HOMES = {
  '1bed': {
    title: 'Sample: a 1-bed home, Nov 2–29',
    teams: [
      { shift: 'D', ft: 'Maria', pt: 'Jordan' },
      { shift: 'E', ft: 'Priya', pt: 'Sam' },
      { shift: 'N', ft: 'Daniel', pt: 'Lee' },
    ],
    note: 'One staff on every shift, 6 people (3 full-time, 3 part-time). Each pair covers one shift every day. Full-timers work weekends 1 and 3; part-timers work weekends 2 and 4. After 4 weeks it repeats.',
  },
  '2bed': {
    title: 'Sample: a 2-bed home with 2 staff on every shift, Nov 2–29',
    teams: [
      { shift: 'D', ft: 'Maria', pt: 'Jordan' },
      { shift: 'D', ft: 'Aisha', pt: 'Ben', pair: 2 },
      { shift: 'E', ft: 'Priya', pt: 'Sam' },
      { shift: 'E', ft: 'Grace', pt: 'Omar', pair: 2 },
      { shift: 'N', ft: 'Daniel', pt: 'Lee' },
      { shift: 'N', ft: 'Nadia', pt: 'Tom', pair: 2 },
    ],
    note: '12 people (6 full-time, 6 part-time). Every shift, day, evening and awake night, always has 2 staff. The second pair on each shift starts a week later, so there is always a full-timer and a part-timer on each shift, and every weekend has a mix of both.',
  },
  '2bed-peak': {
    title: 'Sample: a 2-bed home with 1 staff per shift + extra 3–7 pm helper, Nov 2–29',
    teams: [
      { shift: 'D', ft: 'Maria', pt: 'Jordan' },
      { shift: 'X', ft: 'Aisha', pt: 'Ben', pair: 2, hours: ['Part-time · 18 h', 'Part-time · 10 h'] },
      { shift: 'E', ft: 'Priya', pt: 'Sam' },
      { shift: 'N', ft: 'Daniel', pt: 'Lee' },
    ],
    note: '8 people. One staff on each shift, plus a second person from 3 to 7 pm, the busiest time (after school, dinner, homework). The 3–7 pm pair are part-timers who can pick up more shifts, up to 36 h a week.',
  },
};

export default function SampleSchedule({ home = '1bed' }) {
  const h = HOMES[home] ?? HOMES['1bed'];
  const days = Array.from({ length: 28 }, (_, i) => day(i));
  const off = (t) => (t.pair === 2 ? 7 : 0);
  const rows = h.teams.flatMap((t) => [
    { who: t.ft, kind: t.hours?.[0] ?? 'Full-time · 36 h', shift: t.shift, on: (i) => A.has((i + off(t)) % 14) },
    { who: t.pt, kind: t.hours?.[1] ?? 'Part-time · 20 h', shift: t.shift, on: (i) => !A.has((i + off(t)) % 14) },
  ]);
  const hasPeak = h.teams.some((t) => t.shift === 'X');
  return (
    <div className="sample-sched">
      <p className="small" style={{ margin: '4px 0 8px' }}><strong>{h.title}</strong> (example names). Each coloured box is a shift. Shaded columns are weekends.</p>
      <div className="legend-row small">
        <span><i className="ss D">D</i> Day 7–3</span><span><i className="ss E">E</i> Evening 3–11</span><span><i className="ss N">N</i> Awake night 11–7</span>
        {hasPeak && <span><i className="ss X">X</i> Extra 3–7 pm</span>}
        <span><i className="ss off" /> Off</span>
      </div>
      <div className="scroll-x">
        <table className="ss-grid wide">
          <thead>
            <tr><th className="who">Week</th>{[1, 2, 3, 4].map((w) => <th key={w} colSpan={7} className="wk">Week {w} · {w % 2 ? 'A' : 'B'}</th>)}</tr>
            <tr><th className="who">Staff</th>{days.map((d, i) => {
              const dow = d.getUTCDay();
              return <th key={i} className={`${dow === 0 || dow === 6 ? 'we' : ''} ${i % 7 === 0 ? 'wkstart' : ''}`}>{'SMTWTFS'[dow]}<small>{d.getUTCDate()}</small></th>;
            })}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.who} className={ri % 2 === 1 ? 'pair-end' : ''}>
                <th className="who">{r.who}<small>{r.kind}</small></th>
                {days.map((d, i) => {
                  const dow = d.getUTCDay();
                  const on = r.on(i);
                  return <td key={i} className={`ss ${on ? r.shift : 'off'} ${dow === 0 || dow === 6 ? 'we' : ''} ${i % 7 === 0 ? 'wkstart' : ''}`}>{on ? r.shift : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>{h.note}</p>
    </div>
  );
}
