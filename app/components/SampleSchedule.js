// A colour-coded sample of the weekend-partner schedule (1-bed home, 4 weeks), shown inside notices that
// contain the marker [[sample-schedule]]. Names are examples. Same pattern the CRM uses (schedule-teams.sql).
const A = new Set([0, 1, 4, 5, 6, 8, 9, 10, 11]);
const START = '2026-11-02';
const TEAMS = [
  { shift: 'D', name: 'Day 7 am–3 pm', ft: 'Maria', pt: 'Jordan' },
  { shift: 'E', name: 'Evening 3–11 pm', ft: 'Priya', pt: 'Sam' },
  { shift: 'N', name: 'Awake night 11 pm–7 am', ft: 'Daniel', pt: 'Lee' },
];
const day = (i) => new Date(Date.parse(START + 'T12:00:00Z') + i * 864e5);

export default function SampleSchedule() {
  const days = Array.from({ length: 28 }, (_, i) => day(i));
  const rows = TEAMS.flatMap((t) => [
    { who: t.ft, kind: 'Full-time · 36 h', shift: t.shift, team: t.name, on: (i) => A.has(i % 14) },
    { who: t.pt, kind: 'Part-time · 20 h', shift: t.shift, team: t.name, on: (i) => !A.has(i % 14) },
  ]);
  return (
    <div className="sample-sched">
      <p className="small" style={{ margin: '4px 0 8px' }}><strong>Sample: a 1-bed home, Nov 2–29</strong> (example names). Each coloured box is a shift. Shaded columns are weekends.</p>
      <div className="legend-row small">
        <span><i className="ss D">D</i> Day 7–3</span><span><i className="ss E">E</i> Evening 3–11</span><span><i className="ss N">N</i> Awake night 11–7</span><span><i className="ss off" /> Off</span>
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
      <p className="small muted" style={{ margin: '6px 0 0' }}>Each pair (Maria and Jordan, Priya and Sam, Daniel and Lee) covers one shift every day. Full-timers work weekends 1 and 3; part-timers work weekends 2 and 4. After 4 weeks it repeats.</p>
    </div>
  );
}
