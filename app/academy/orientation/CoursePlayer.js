'use client';
// The training "video": narrated slides. Uses the browser's built-in voice (no download),
// with captions, auto-advance, and a timer when the sound is off.
import { useEffect, useRef, useState, useCallback } from 'react';
import Quiz from './Quiz';

const STORE = 'ecc-orientation-seen';
const readSeen = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
const saveSeen = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };

function pickVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const vs = window.speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
  return vs.find((v) => v.lang === 'en-CA') ?? vs.find((v) => v.lang === 'en-US' && /natural|google|samantha|aria|jenny/i.test(v.name))
    ?? vs.find((v) => v.lang === 'en-US') ?? vs[0] ?? null;
}

const CSS = `
.course-player { padding: 0; overflow: hidden; }
.course-screen { position: relative; min-height: 320px; padding: 28px 32px 20px; color: #fff;
  background: linear-gradient(135deg, #1f4d3a 0%, #2e6b4f 60%, #3c8a64 100%); }
.course-player:fullscreen { display: flex; flex-direction: column; background: #fff; }
.course-player:fullscreen .course-screen { flex: 1; font-size: 1.35em; padding: 6vh 8vw; }
.course-count { position: absolute; top: 12px; right: 16px; font-size: 13px; opacity: .8; }
.course-icon { font-size: 48px; line-height: 1; }
.course-title { color: #fff; margin: 10px 0 12px; font-size: 1.6em; }
.course-points { margin: 0; padding-left: 1.2em; font-size: 1.08em; line-height: 1.55; }
.course-points li { margin: 4px 0; }
.course-captions { margin: 0; padding: 10px 16px; background: #111; color: #f2f2f2; font-size: 15px; line-height: 1.45; }
.course-progress { height: 5px; background: #dfe7e2; }
.course-progress span { display: block; height: 100%; background: #3c8a64; transition: width .3s; }
.course-controls { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px 4px; }
.course-dots { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 14px; }
.course-dots button { width: 14px; height: 14px; min-width: 0; padding: 0; border-radius: 50%; border: 1px solid #9bb5a6; background: #fff; cursor: pointer; }
.course-dots button.seen { background: #a9d3bb; }
.course-dots button.on { background: #1f4d3a; border-color: #1f4d3a; }
.quiz-q { border: 1px solid #dfe7e2; border-radius: 8px; padding: 10px 14px; margin: 0 0 12px; }
.quiz-q legend { padding: 0 4px; }
.quiz-opt { display: flex; align-items: flex-start; gap: 10px; margin: 4px 0; padding: 8px 10px; border-radius: 6px; font-weight: normal; cursor: pointer; }
.quiz-opt input { width: auto; margin: 3px 0 0; padding: 0; flex: none; }
.quiz-opt:hover { background: #f3f7f4; }
.quiz-opt.right { background: #e6f2ea; }
.quiz-opt.wrong { background: #fbe9e7; }
@media (max-width: 600px) { .course-screen { padding: 20px 16px; min-height: 280px; } .course-title { font-size: 1.3em; } }
`;

export default function CoursePlayer({ slides, questions, passPercent }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [seen, setSeen] = useState([0]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [canSpeak, setCanSpeak] = useState(true);
  const timer = useRef(null);
  const boxRef = useRef(null);
  const run = useRef(0); // ignores callbacks from a slide we already left

  useEffect(() => {
    setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window);
    setSeen((s) => Array.from(new Set([...s, ...readSeen()])));
    return () => { clearTimeout(timer.current); try { window.speechSynthesis?.cancel(); } catch {} };
  }, []);

  useEffect(() => { setSeen((s) => { if (s.includes(i)) return s; const n = [...s, i]; saveSeen(n); return n; }); }, [i]);

  const stop = useCallback(() => {
    run.current += 1; clearTimeout(timer.current);
    try { window.speechSynthesis?.cancel(); } catch {}
  }, []);

  const next = useCallback(() => setI((n) => {
    if (n >= slides.length - 1) { setPlaying(false); return n; }
    return n + 1;
  }), [slides.length]);

  // Play the current slide whenever i / playing / muted changes.
  useEffect(() => {
    if (!playing) { stop(); return; }
    stop();
    const me = run.current;
    const words = slides[i].say.split(/\s+/).length;
    const fallback = () => { timer.current = setTimeout(() => { if (run.current === me) next(); }, Math.max(6000, words * 400)); };
    if (muted || !canSpeak) { fallback(); return; }
    const u = new SpeechSynthesisUtterance(slides[i].say);
    const v = pickVoice(); if (v) u.voice = v;
    u.lang = v?.lang ?? 'en-CA'; u.rate = 0.98;
    u.onend = () => { if (run.current === me) timer.current = setTimeout(() => { if (run.current === me) next(); }, 900); };
    u.onerror = () => { if (run.current === me) fallback(); };
    try { window.speechSynthesis.speak(u); } catch { fallback(); }
  }, [i, playing, muted, canSpeak, slides, next, stop]);

  const go = (n) => { setI(Math.max(0, Math.min(slides.length - 1, n))); };
  const allSeen = seen.length >= slides.length;
  const s = slides[i];

  function fullscreen() {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.();
  }

  return (
    <>
      <style>{CSS}</style>
      <section className="card course-player" ref={boxRef}>
        <div className="course-screen">
          <div className="course-count">{i + 1} / {slides.length}</div>
          <div className="course-icon" aria-hidden>{s.icon}</div>
          <h2 className="course-title">{s.title}</h2>
          <ul className="course-points">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
        {captions && <p className="course-captions" aria-live="polite">{s.say}</p>}
        <div className="course-progress" aria-hidden><span style={{ width: `${((i + 1) / slides.length) * 100}%` }} /></div>
        <div className="course-controls">
          <button type="button" className="secondary" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous">⏮</button>
          <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : i === 0 && !playing ? '▶ Play' : '▶ Resume'}</button>
          <button type="button" className="secondary" onClick={() => go(i + 1)} disabled={i === slides.length - 1} aria-label="Next">⏭</button>
          <button type="button" className="secondary" onClick={() => setMuted((m) => !m)}>{muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
          <button type="button" className="secondary" onClick={() => setCaptions((c) => !c)}>{captions ? 'CC on' : 'CC off'}</button>
          <button type="button" className="secondary" onClick={fullscreen}>⛶ Full screen</button>
        </div>
        <div className="course-dots">
          {slides.map((x, n) => (
            <button key={n} type="button" title={x.title} onClick={() => go(n)}
              className={n === i ? 'on' : seen.includes(n) ? 'seen' : ''} aria-label={`Part ${n + 1}: ${x.title}`} />
          ))}
        </div>
        {!canSpeak && <p className="muted small">Your browser can’t read aloud — the lesson will play with captions only.</p>}
      </section>

      {!quizOpen ? (
        <section className="card">
          <h2>Final quiz</h2>
          <p>{questions.length} questions · pass mark {passPercent}% ({Math.ceil((passPercent / 100) * questions.length)} of {questions.length}).</p>
          <button type="button" disabled={!allSeen} onClick={() => { setPlaying(false); setQuizOpen(true); }}>Start the final quiz</button>
          {!allSeen && <p className="muted small">Watch every part of the video first — {slides.length - seen.length} part{slides.length - seen.length === 1 ? '' : 's'} left.</p>}
        </section>
      ) : (
        <Quiz questions={questions} passPercent={passPercent} onReview={() => { setQuizOpen(false); setI(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}
    </>
  );
}
