'use client';
// An Academy training video (MP4 with captions built in). Staff can't skip ahead or speed it up,
// and the quiz only opens when the database confirms the whole video was watched.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Quiz from './Quiz';
import { startLesson, finishLesson } from '../lessonActions';

export default function VideoLesson({ src, questions, passPercent, grade, courseKey = 'orientation', ready = false, slidesHref = '/academy/orientation?slides=1' }) {
  const ref = useRef(null);
  const reached = useRef(0);      // furthest point reached by normal playback
  const session = useRef(null);   // this viewing's id, timed by the database
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(ready);
  const [quizOpen, setQuizOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState(null);

  // Pause when the person switches tab or app — the video has to be watched, not left running.
  useEffect(() => {
    const onVis = () => { if (document.hidden) ref.current?.pause(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  async function onPlay() {
    if (done || session.current) return;
    session.current = 'starting';
    const r = await startLesson(courseKey);
    if (r?.id) session.current = r.id;
    else { session.current = null; setNote(r?.error ?? 'Could not start the lesson — please refresh.'); ref.current?.pause(); }
  }

  function onTime() {
    const v = ref.current; if (!v || !v.duration) return;
    if (v.currentTime <= reached.current + 1.5) reached.current = Math.max(reached.current, v.currentTime);
    setPct(Math.min(100, Math.round((reached.current / v.duration) * 100)));
  }

  // No skipping ahead: jumping past the furthest point watched sends it straight back.
  function onSeeking() {
    const v = ref.current; if (!v || done) return;
    if (v.currentTime > reached.current + 1.5) {
      v.currentTime = reached.current;
      setNote('Skipping ahead is turned off. You can go back, but not forward.');
    }
  }

  // Normal speed only.
  function onRate() { const v = ref.current; if (v && !done && v.playbackRate !== 1) v.playbackRate = 1; }

  async function onEnded() {
    const v = ref.current; if (!v || done) return;
    if (reached.current < v.duration - 3) return;
    if (!session.current || session.current === 'starting') { setNote('Your viewing wasn’t recorded — please refresh the page and watch again.'); return; }
    const r = await finishLesson(session.current);
    if (r?.left === 0) { setDone(true); setNote(null); }
    else if (r?.left > 0) setNote(`Not quite — the full video needs another ${r.left} seconds of viewing at normal speed. Please refresh and watch it again.`);
    else setNote(r?.error ?? 'Something went wrong — please refresh and try again.');
  }

  return (
    <>
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {failed ? (
          <p className="message" style={{ margin: 16 }}>The video couldn’t load. Refresh the page, or <Link href={slidesHref}>use the slide version</Link>.</p>
        ) : (
          <video ref={ref} src={src} controls playsInline preload="metadata"
            controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
            onPlay={onPlay} onTimeUpdate={onTime} onSeeking={onSeeking} onRateChange={onRate} onEnded={onEnded} onError={() => setFailed(true)}
            style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', background: '#0d1a14' }} />
        )}
        <div style={{ padding: '10px 16px' }} className="small">
          <div style={{ height: 6, background: '#dfe7e2', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${done ? 100 : pct}%`, background: '#3c8a64' }} />
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {done ? '✓ Video watched — the quiz is open.' : `Watched ${pct}%. Watch to the end at normal speed — skipping ahead is turned off and the video pauses if you leave this page.`}
          </p>
          {note && <p className="message" style={{ margin: '8px 0 0' }}>{note}</p>}
        </div>
      </section>

      {!quizOpen ? (
        <section className="card">
          <h2>Final quiz</h2>
          <p>{questions.length} questions · pass mark {passPercent}% ({Math.ceil((passPercent / 100) * questions.length)} of {questions.length}).</p>
          <button type="button" disabled={!done} onClick={() => { ref.current?.pause(); setQuizOpen(true); }}>Start the final quiz</button>
          {!done && <p className="muted small">The quiz opens when the whole video has played. Each try needs a full viewing.</p>}
        </section>
      ) : (
        <Quiz questions={questions} passPercent={passPercent} grade={grade} />
      )}
    </>
  );
}
