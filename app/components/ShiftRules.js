// "How we decide who works which shift" — the fair, open rules for full-time / part-time and Day / Evening / Night.
// Shown (folded) on the Schedule page; the same rules are in the pinned "Our new schedule" notice.
export default function ShiftRules({ open = false }) {
  return (
    <details className="card shift-rules no-print" open={open}>
      <summary><strong>📋 How we decide who works full-time, part-time, days, evenings or nights</strong></summary>
      <p className="small muted">Staff choose first. If too many people want the same spot, we use the same open rules for everyone, so it is never personal.</p>

      <h3>1. Tell us what you want</h3>
      <ul>
        <li>Full-time (36 h a week) or part-time (about 20 h, and you can pick up more, up to 36 h).</li>
        <li>Your 1st, 2nd and 3rd choice of shift: Day 7–3, Evening 3–11 or Awake night 11–7.</li>
        <li>Anything you can’t change, like school pick-up or caring for a family member.</li>
        <li>In 2-bed homes: which weekends you’d like, weekends 1 and 3 or weekends 2 and 4. Couples and co-parents can ask for opposite weekends.</li>
      </ul>
      <p className="small">Tell your Program Coordinator.</p>

      <h3>2. If too many people want the same spot, we decide in this order</h3>
      <ol>
        <li><strong>Safety.</strong> Night staff must have passed probation and have their required training (First Aid, NVCI, medication). In 2-bed homes every pair has at least one experienced person.</li>
        <li><strong>Family needs.</strong> Real childcare or caregiving limits come before plain preference.</li>
        <li><strong>Reliability.</strong> Attendance, documentation on time and your KPI and badge record.</li>
        <li><strong>Seniority.</strong> Your start date with Evergreen.</li>
        <li><strong>Still tied?</strong> We draw names, and write down that we did.</li>
      </ol>

      <h3>3. Full-time spots</h3>
      <ul>
        <li>Full-time goes to people who ask for it, in the order above.</li>
        <li>If you want full-time and there’s no spot yet, you go on the full-time waiting list. When a spot opens, the first person on the list is offered it.</li>
        <li>New staff start part-time during their 90-day probation.</li>
      </ul>

      <h3>4. Changes</h3>
      <ul>
        <li>Every 6 months you can ask to change your shift or move between full-time and part-time. The same rules decide.</li>
        <li>Nobody stays on nights unless they want to.</li>
        <li>You can swap shifts with a coworker any time if your Program Coordinator approves (Schedule → Open shifts).</li>
      </ul>
    </details>
  );
}
