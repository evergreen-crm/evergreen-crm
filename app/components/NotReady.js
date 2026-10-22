// Shown when a part of the portal hasn't been switched on yet. Plain words for staff; the setup file for the office.
export default function NotReady({ what = 'This part', file, card = true }) {
  return (
    <p className={card ? 'card notready' : 'message notready'}>
      {what} isn’t switched on yet. Please tell the office.
      {file && <span className="muted small"> (Setup file for the administrator: <code>supabase/{file}</code>)</span>}
    </p>
  );
}
