'use client';
// The orientation training video (MP4 with captions built in). The quiz unlocks once
// the video has been watched to the end without skipping ahead.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Quiz from './Quiz';

const STORE = 'ecc-orientation-video-done';

export default function VideoLesson({ src, questions, passPercent }) {
  const ref = useRef(null);
  const reached = useRef(0);   // furthest point watched normally
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { try { if (localStorage.getItem(STORE) === '1') setDone(true); } catch {} }, []);

  function onTime() {
    const v = ref.current; if (!v || !v.duration) return;
    // count only normal playback: a jump forward of more than 2 seconds is a skip
    if (v.currentTime <= reached.current + 2) reached.current = Math.max(reached.current, v.currentTime);
    const p = Math.min(100, Math.round((reached.current / v.duration) * 100));
    setPct(p);
    if (p >= 95 && !done) { setDone(true); try { localStorage.setItem(STORE, '1'); } catch {} }
  }

  return (
    <>
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {failed ? (
          <p className="message" style={{ margin: 16 }}>The video couldn’t load. Refresh the page, or <Link href="/academy/orientation?slides=1">use the slide version</Link>.</p>
        ) : (
          <video ref={ref} src={src} controls playsInline preload="metadata" onTimeUpdate={onTime} onError={() => setFailed(true)}
            style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', background: '#0d1a14' }} />
        )}
        <div style={{ padding: '10px 16px' }} className="small">
          <div style={{ height: 6, background: '#dfe7e2', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${done ? 100 : pct}%`, background: '#3c8a64' }} />
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {done ? '✓ Video watched.' : `Watched ${pct}%.`} Captions are shown in the video. · <Link href="/academy/orientation?slides=1">Prefer the slide version?</Link>
          </p>
        </div>
      </section>

      {!quizOpen ? (
        <section className="card">
          <h2>Final quiz</h2>
          <p>{questions.length} questions · pass mark {passPercent}% ({Math.ceil((passPercent / 100) * questions.length)} of {questions.length}).</p>
          <button type="button" disabled={!done} onClick={() => { ref.current?.pause(); setQuizOpen(true); }}>Start the final quiz</button>
          {!done && <p className="muted small">Watch the whole video first — the quiz unlocks at the end.</p>}
        </section>
      ) : (
        <Quiz questions={questions} passPercent={passPercent} onReview={() => { setQuizOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}
    </>
  );
}
