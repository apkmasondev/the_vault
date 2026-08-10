import { useEffect, useRef } from 'react';
import { VIDEO_FPS } from '../app/constants';
import type { TelemetryReader } from '../app/telemetry';
import { SequenceMap } from './SequenceMap';

interface AboutPanelProps {
  readonly readTelemetry: TelemetryReader;
  /** False in the reduced-motion build, where there is no running sequence. */
  readonly live: boolean;
  readonly cinematicRunning: boolean;
  readonly onSeek: (progress: number) => void;
  readonly onToggleCinematic: () => void;
  readonly onClose: () => void;
}

const READOUTS = [
  ['SCROLL PROGRESS', 'progress'],
  ['DAMPING TARGET', 'target'],
  ['ACTIVE CUE', 'cue'],
  ['UNLOCK FILM', 'video1'],
  ['OPENING FILM', 'video2'],
  ['SOURCE', 'resolution'],
  ['RENDER TIER', 'tier'],
  ['FRAME RATE', 'fps'],
  ['DRAW CALLS', 'calls'],
  ['PIXEL RATIO', 'dpr'],
  ['ARTIFACT CHARGE', 'charge'],
  ['CONTACTS LOGGED', 'contacts'],
] as const;

/**
 * The exhibit label for the whole piece. It explains the mechanism, and then
 * shows that mechanism running live rather than asking to be believed.
 */
export const AboutPanel = ({
  readTelemetry,
  live,
  cinematicRunning,
  onSeek,
  onToggleCinematic,
  onClose,
}: AboutPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const readoutRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      // Keep focus inside the dialog while it owns the screen.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!live) return;
    let frame = 0;
    const set = (key: string, value: string): void => {
      const element = readoutRefs.current.get(key);
      if (element && element.textContent !== value) element.textContent = value;
    };

    const tick = (): void => {
      const t = readTelemetry();
      set('progress', `${(t.progress * 100).toFixed(1)}%`);
      set('target', `${(t.targetProgress * 100).toFixed(1)}%`);
      set('cue', t.cue.toUpperCase());
      set('video1', `frame ${Math.round(t.video1Presented * VIDEO_FPS)} → ${Math.round(t.video1Target * VIDEO_FPS)}`);
      set('video2', `frame ${Math.round(t.video2Presented * VIDEO_FPS)} → ${Math.round(t.video2Target * VIDEO_FPS)}`);
      set('resolution', t.resolution);
      set('tier', t.webglTier.toUpperCase());
      set('fps', t.fps > 0 ? `${t.fps} fps` : 'sampling');
      set('calls', String(t.drawCalls));
      set('dpr', t.dpr.toFixed(2));
      set('charge', `${Math.round(t.charge * 100)}%`);
      set('contacts', String(t.contacts));
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [live, readTelemetry]);

  return (
    <div className="about" role="dialog" aria-modal="true" aria-labelledby="about-title" ref={panelRef}>
      <div className="about__inner">
        <header className="about__header">
          <div>
            <p className="eyebrow">Containment system V-07</p>
            <h2 id="about-title">ABOUT THE VAULT</h2>
          </div>
          <button className="about__close" type="button" onClick={onClose} ref={closeRef}>
            CLOSE
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <section className="about__section about__section--lead">
          <h3>The premise</h3>
          <p className="about__lead">
            Something was sealed in here long enough that the paperwork outlived the people who
            filed it. The door still works. You are the one turning the wheel.
          </p>
          <p>
            There is no plot to follow and nothing to win. The chamber opens at exactly the speed
            you open it, and stops when you stop. What is inside is not inert — it takes light from
            being held, it leans toward your hand, and it keeps count of every time you reach for
            it. Whether you touch it at all is the only real decision the piece asks of you, and
            the record at the end reads differently depending on what you chose.
          </p>
        </section>

        {live && (
          <section className="about__section">
            <h3>Finding your way around</h3>
            <ul className="about__guide">
              <li><span>Scroll</span>Everything is tied to how far down the page you are. Scroll back and the door closes again.</li>
              <li><span>Hold</span>Press the object and keep still. It takes on charge for as long as you hold it; let go and the charge leaves as a shockwave.</li>
              <li><span>Drag</span>Pull it and it comes with you, with weight behind it, then swings back through the middle.</li>
            <li><span>Throw</span>Let go while it is still moving fast and it comes apart, and you get a moment of what is inside before it closes itself.</li>
              <li><span>Chapters</span>The marks down the right edge jump to the named moments.</li>
              <li><span>Play it for me</span>Hands off, if you would rather just watch. Any scroll takes control back.</li>
            </ul>
          </section>
        )}

        <section className="about__section about__section--divider">
          <h3>How it is made</h3>
          <p>
            The rest of this is for anyone who wants to look behind it. There is no video player
            and no animation library in here: the page holds one number between zero and one, and
            everything you have just seen is derived from it.
          </p>
        </section>

        <section className="about__section">
          <h3>The sequence</h3>
          <p>
            Your scroll position through a nine-screen section is normalised to that number and
            exponentially damped, so the image keeps moving smoothly after your finger stops.
            {live ? ' Drag the map to scrub the sequence running behind this panel.' : ''}
          </p>
          {live && <SequenceMap readTelemetry={readTelemetry} onSeek={onSeek} />}
        </section>

        <section className="about__section">
          <h3>Film, then geometry</h3>
          <p>
            The two films are never played. They are re-encoded so that every single frame is a
            keyframe, which is far larger on disk but makes any frame reachable instantly — the
            page seeks them like a filmstrip, forwards and backwards, at whatever speed you scroll.
            A seek scheduler limits how far each request may jump so the decoder is never asked for
            more than it can present.
          </p>
          <p>
            At frame 239 of the second film the footage freezes and a Three.js scene takes over the
            same point on screen. Everything after that — the object, its fissures, the drifting
            particulate, the haze — is generated live, which is why it can react to you at all.
          </p>
          <p>
            That scene is then run through three extra passes: the hot parts of the frame are
            isolated and blurred into a bloom, a shock ring warps the image outward on impact, and
            colour separates toward the corners under a light film grain. All of it keeps its
            transparency, so the glow still falls across the footage underneath.
          </p>
          <p>
            The film's own smoke freezes at that frame along with everything else in it, so the
            live scene picks the motion up: two sheets of smoke, one behind the object and one
            drifting in front, drawn by warping a noise field with itself. That self-warping is the
            difference between smoke that curls and a texture that slides.
          </p>
        </section>

        <section className="about__section">
          <h3>Why the object feels like an object</h3>
          <p>
            Its body is nearly black. The light you see is escaping along a narrow band where a
            noise field crosses a threshold, which is what makes those read as cracks rather than
            patches, and that band widens as charge builds. Holding it speeds the churn underneath
            and drives a tone that climbs with the stored energy.
          </p>
          <p>
            Carrying it runs on a spring rather than on the pointer directly: stiff and damped
            while you hold it so it tracks your hand, slack and underdamped when you let go so it
            swings back through the middle and settles. The faster you haul it, the more it draws
            out along the direction of travel and pinches across it, the way a heavy drop behaves.
            Let go above a threshold speed and the shell parts along the throw, light escapes the
            seam, and a stiff spring pulls the break shut again in about a third of a second.
          </p>
          <p>
            While the soundtrack plays it is analysed live, and its low band displaces the surface —
            the object is breathing in time with what you are hearing.
          </p>
        </section>

        {live && (
          <section className="about__section">
            <h3>Live instrumentation</h3>
            <p>Read straight out of the running experience, updated every frame.</p>
            <dl className="about__readouts">
              {READOUTS.map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd
                    ref={(element) => {
                      if (element) readoutRefs.current.set(key, element);
                      else readoutRefs.current.delete(key);
                    }}
                  >
                    —
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="about__section">
          <h3>Built to survive the device it lands on</h3>
          <p>
            Render quality is picked from device memory, core count, pointer type and the Save-Data
            hint, then dropped a tier automatically if frame times slip — the bloom chain is the
            first thing to go, since it costs the most for the least. A phone gets smaller films and
            a lighter scene. If WebGL is missing the object falls back to a CSS rendering, if a film
            fails a still frame covers the gap, and if the visitor prefers reduced motion the whole
            sequence becomes a click-through with no movement at all.
          </p>
        </section>

        <section className="about__section">
          <h3>Stack</h3>
          <ul className="about__stack">
            <li><span>Build</span>Vite 8 · TypeScript strict · ESLint · Vitest</li>
            <li><span>Interface</span>React 19, no UI framework</li>
            <li><span>Render</span>Three.js, hand-written GLSL, no post-processing library</li>
            <li><span>Audio</span>Web Audio: one AAC file, live analysis, synthesised impacts</li>
            <li><span>Delivery</span>GitHub Actions to GitHub Pages</li>
            <li><span>Third parties</span>none — no fonts, analytics, trackers or remote media</li>
          </ul>
        </section>

        <section className="about__section">
          <h3>Who made this</h3>
          <p>
            Built by apkmason as a portfolio piece, to find out how much presence a browser tab can
            carry with nothing loaded from anywhere else. The source renders and the soundtrack are
            original; everything between them is hand-written.
          </p>
        </section>

        <footer className="about__footer">
          {live && (
            <button className="outline-button" type="button" onClick={onToggleCinematic}>
              {cinematicRunning ? 'STOP CINEMATIC' : 'PLAY IT FOR ME'}
            </button>
          )}
          <a href="https://apkmason.dev" target="_blank" rel="noreferrer">APKMASON.DEV</a>
        </footer>
      </div>
    </div>
  );
};
