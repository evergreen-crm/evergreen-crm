// Admin: how much storage Evergreen is using, by type, against the plan limits.
const MB = 1024 * 1024, GB = 1024 * MB;
const fmt = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const NAMES = {
  policies: 'Policy manuals', documents: 'Resident documents', 'staff-files': 'Staff files (CRC, résumés, certificates)',
};

export default async function StorageUsage({ supabase }) {
  const { data, error } = await supabase.rpc('storage_usage');
  if (error) return <p className="muted small">Storage figures unavailable: {error.message}</p>;
  const rows = (data ?? []).filter((r) => r.bucket !== '_database');
  const db = (data ?? []).find((r) => r.bucket === '_database')?.bytes ?? 0;
  const files = rows.reduce((s, r) => s + Number(r.bytes), 0);
  const count = rows.reduce((s, r) => s + Number(r.files), 0);
  // Supabase plan limits: Free = 1 GB files + 500 MB database; Pro = 100 GB files + 8 GB database.
  const plans = [
    { name: 'Free plan', files: 1 * GB, db: 500 * MB },
    { name: 'Pro plan', files: 100 * GB, db: 8 * GB },
  ];
  const Bar = ({ used, limit }) => {
    const pct = Math.min(100, (100 * used) / limit);
    return <span className="pbar-track"><span style={{ width: `${Math.max(pct, 0.5)}%`, background: pct > 80 ? '#b3261e' : undefined }} /></span>;
  };
  return (
    <section className="card">
      <h2>Storage used</h2>
      <div className="stats">
        <div className="stat"><strong>{fmt(files + db)}</strong><span>total</span></div>
        <div className="stat"><strong>{fmt(files)}</strong><span>files ({count})</span></div>
        <div className="stat"><strong>{fmt(db)}</strong><span>database (records)</span></div>
      </div>
      <table>
        <thead><tr><th>What</th><th>Files</th><th>Size</th></tr></thead>
        <tbody>
          {rows.sort((a, b) => b.bytes - a.bytes).map((r) => (
            <tr key={r.bucket}><td>{NAMES[r.bucket] ?? r.bucket}</td><td>{r.files}</td><td>{fmt(Number(r.bytes))}</td></tr>
          ))}
          <tr><td>Database — notes, MAR, incidents, HR, signatures…</td><td>—</td><td>{fmt(Number(db))}</td></tr>
        </tbody>
      </table>
      {plans.map((p) => (
        <div key={p.name} className="small" style={{ marginTop: 10 }}>
          <strong>{p.name}</strong>
          <div className="pbar"><span className="pbar-label">Files {fmt(files)} of {fmt(p.files)}</span><Bar used={files} limit={p.files} /><span className="pbar-num">{((100 * files) / p.files).toFixed(1)}%</span></div>
          <div className="pbar"><span className="pbar-label">Database {fmt(db)} of {fmt(p.db)}</span><Bar used={db} limit={p.db} /><span className="pbar-num">{((100 * db) / p.db).toFixed(1)}%</span></div>
        </div>
      ))}
      <p className="muted small">Uploaded files are compressed where possible. Exact billing figures are in Supabase → Settings → Usage.</p>
    </section>
  );
}
