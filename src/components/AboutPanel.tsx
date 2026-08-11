import { useEffect, useRef, useState } from 'react';
import { asset, MEDIA, VIDEO_FPS } from '../app/constants';
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
  ['WALL STRIKES', 'strikes'],
  ['STRUCTURAL INTEGRITY', 'integrity'],
] as const;

const STATIC_READOUTS = [
  ['SEEK MODE', 'FRAME-ACCURATE'],
  ['DATA EGRESS', 'NONE — LOCAL ONLY'],
] as const;

interface ClassifiedFieldProps {
  readonly label: string;
  readonly value: string;
  readonly mask: string;
}

const ClassifiedField = ({ label, value, mask }: ClassifiedFieldProps) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="classified-field">
      <span className="classified-field__label">{label}</span>
      <button
        type="button"
        className={`classified-field__value${revealed ? ' is-revealed' : ''}`}
        aria-expanded={revealed}
        aria-label={revealed
          ? `${label}: ${value}. Conceal field`
          : `${label}. Classified. Reveal field`}
        onClick={() => setRevealed((current) => !current)}
      >
        <span aria-hidden="true">{revealed ? value : mask}</span>
        {revealed && <span className="classified-field__access" aria-hidden="true">ACCESS LOGGED</span>}
      </button>
    </div>
  );
};

interface ArchiveReadoutProps {
  readonly label: string;
  readonly value: string;
  readonly alert?: boolean;
}

const ArchiveReadout = ({ label, value, alert = false }: ArchiveReadoutProps) => (
  <div className="classified-field classified-field--static">
    <span className="classified-field__label">{label}</span>
    <span className={`classified-field__reading${alert ? ' is-alert' : ''}`}>{value}</span>
  </div>
);

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
      set('strikes', String(t.strikes));
      set('integrity', t.integrity > 0 ? `${Math.round(t.integrity * 100)}%` : 'DESTROYED');
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

        <figure className="about__plate">
          <img
            src={asset(MEDIA.poster)}
            alt="The sealed industrial vault before the containment sequence begins."
            width="1280"
            height="720"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <figcaption>
            <span>ARCHIVE FRAME 01</span>
            SEAL INTACT
          </figcaption>
        </figure>

        <aside className="about__classified" aria-label="Restricted archive fields">
          <img
            className="about__classified-art"
            src={asset(MEDIA.radioactiveOrb)}
            alt=""
            width="960"
            height="512"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <ClassifiedField
            label="Recovery site"
            value="NORTH ANNEX // SUBLEVEL 07"
            mask="████████████████"
          />
          <ClassifiedField
            label="Containment order"
            value="IRON SLEEP // NO EXPIRY"
            mask="██████████████"
          />
          <ArchiveReadout label="Hazard class" value="RADIOLOGICAL / UNKNOWN" alert />
          <ArchiveReadout label="Signal state" value="DORMANT / INTERMITTENT" />
        </aside>

        {live && (
          <section className="about__section">
            <h3>Finding your way around</h3>
            <ul className="about__guide">
              <li><span>Scroll</span>The entire sequence follows your position on the page. Scroll back and the door closes again.</li>
              <li><span>Hold</span>Press the object and keep still. It takes on charge for as long as you hold it; let go and the charge leaves as a shockwave.</li>
              <li><span>Drag</span>Pull it and it comes with you, with weight behind it.</li>
              <li><span>Throw</span>Release it while your hand is moving. It keeps that momentum, strikes the chamber wall and returns hot.</li>
              <li><span>Fracture</span>A hard enough impact briefly parts the shell and exposes what is inside.</li>
              <li><span>Destroy</span>Damage is permanent. Repeated strikes reduce integrity to zero and change the final record.</li>
              <li><span>Chapters</span>The marks down the right edge jump to the named moments.</li>
              <li><span>Play it for me</span>Use the automatic sequence if you would rather watch. Any scroll takes control back.</li>
            </ul>
          </section>
        )}

        <section className="about__section about__section--divider">
          <h3>How it is made</h3>
          <p>
            The rest is for anyone who wants to look behind the seal. The films are never played
            conventionally and there is no animation library: the page holds one number between
            zero and one, and everything you have seen is derived from it.
          </p>
        </section>

        <section className="about__section">
          <h3>The sequence</h3>
          <p>
            Your position through the scroll sequence is normalised to that number and
            exponentially damped, so the image keeps moving smoothly after your finger stops.
            {live ? ' Drag the map to scrub the sequence running behind this panel.' : ''}
          </p>
          {live && <SequenceMap readTelemetry={readTelemetry} onSeek={onSeek} />}
        </section>

        <figure className="about__plate about__plate--open">
          <img
            src={asset(MEDIA.transition)}
            alt="The open vault at the point where the live rendered scene takes over."
            width="1280"
            height="720"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <figcaption>
            <span>ARCHIVE FRAME 02</span>
            APERTURE OPEN
          </figcaption>
        </figure>

        <section className="about__section">
          <h3>Film, then geometry</h3>
          <p>
            Every frame in both films is independently reachable, so the page can seek through
            them like a filmstrip — forwards or backwards, at the speed of your scroll. A scheduler
            keeps those requests within what the decoder can present smoothly.
          </p>
          <p>
            At the final matched frame of the second film, a live Three.js scene takes over the same
            point on screen. The object, its fissures, smoke, particulate and light are generated in
            real time, which is why the chamber can react to you.
          </p>
        </section>

        <section className="about__section">
          <h3>Why it feels physical</h3>
          <p>
            Your pointer does not carry the object directly. It pulls a damped spring, giving the
            body weight while preserving momentum after release. Throws take their speed from your
            hand; impacts return heat, shards and camera movement to the chamber.
          </p>
          <p>
            Holding builds charge and widens the light escaping through the shell. Heat fades, but
            structural damage remains. If integrity reaches zero, the geometry separates into its
            individual faces and the final archive records what happened.
          </p>
        </section>

        <details className="about__details">
          <summary>
            <span>TECHNICAL DOSSIER</span>
            <strong>OPEN ENGINEERING NOTES</strong>
          </summary>
          <div className="about__details-body">
            <section>
              <h4>Frame pipeline</h4>
              <p>
                Both films are encoded with every frame as a keyframe. That costs more disk space,
                but makes arbitrary frames reachable immediately. The transition keeps the outgoing
                film opaque underneath the incoming frame, so no poster or empty layer can flash
                through the blend.
              </p>
              <p>
                The live scene adds selective bloom, an impact distortion, restrained colour
                separation and film grain. Two procedural smoke sheets bridge the frozen footage:
                one behind the object and one drifting in front.
              </p>
            </section>
            <section>
              <h4>Interaction model</h4>
              <p>
                A stiff spring tracks the hand while held; a softer one preserves velocity after
                release. Surface cracks widen with charge, strikes add permanent damage, and the
                soundtrack's low band displaces the mesh in real time.
              </p>
              <p>
                The destructible core uses separate triangles, each with its own centre, axis and
                heading. At zero integrity those faces can travel, spin and fall independently
                instead of stretching a shared mesh.
              </p>
            </section>
            <section>
              <h4>Device strategy</h4>
              <p>
                Quality is selected from device memory, core count, pointer type and the Save-Data
                hint, then reduced if frame times slip. Phones receive smaller films and a lighter
                scene. Missing WebGL, failed media and reduced-motion preferences each have a
                dedicated fallback.
              </p>
            </section>
            <section>
              <h4>Stack</h4>
              <ul className="about__stack">
                <li><span>Build</span>Vite 8 · TypeScript strict · ESLint · Vitest</li>
                <li><span>Interface</span>React 19, no UI framework</li>
                <li><span>Render</span>Three.js, hand-written GLSL, no post-processing library</li>
                <li><span>Audio</span>Web Audio: one AAC file, live analysis, synthesised impacts</li>
                <li><span>Delivery</span>GitHub Actions to GitHub Pages</li>
                <li><span>Remote services</span>None — no external fonts, analytics, trackers or remote media</li>
              </ul>
            </section>
          </div>
        </details>

        {live && (
          <section className="about__section">
            <h3>Live instrumentation</h3>
            <p>Read straight out of the running experience, updated every frame.</p>
            <div className="about__readouts-frame">
              <img
                className="about__readouts-art"
                src={asset(MEDIA.radioactiveOrb)}
                alt=""
                width="960"
                height="512"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
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
                {STATIC_READOUTS.map(([label, value]) => (
                  <div className="about__readout-static" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

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
