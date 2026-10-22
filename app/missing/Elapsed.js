'use client';
// Live "missing for 42 min" counter. Also refreshes the page every minute so new steps and timed alerts show
// (and urgent alert emails go out while someone has the log open).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtMins } from '@/lib/missing';

export default function Elapsed({ since, live = true }) {
  const router = useRouter();
  const calc = () => Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  const [mins, setMins] = useState(calc);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setMins(calc()), 15000);
    const r = setInterval(() => router.refresh(), 60000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [since, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span suppressHydrationWarning>{fmtMins(mins)}</span>;
}
