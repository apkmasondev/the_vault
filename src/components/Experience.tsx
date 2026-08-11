import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RAMPS,
  SCROLL_DAMPING_SECONDS,
  TIMELINE,
  VIDEO_DURATION_FALLBACK,
} from '../app/constants';
import type { AudioBands } from '../audio/AudioEngine';
import type { Telemetry } from '../app/telemetry';
import { VideoScrubber } from '../media/VideoScrubber';
import { selectVideoSources } from '../media/videoSources';
import { clamp, damp, smoothstep } from '../utils/math';
import {
  chapterIdForProgress,
  cueForProgress,
  type TimelineCue,
  video1TimeForProgress,
  video2TimeForProgress,
} from '../utils/timeline';
import { useArtifactInteraction } from '../hooks/useArtifactInteraction';
import { useCinematicScroll } from '../hooks/useCinematicScroll';
import { useVaultRenderer } from '../hooks/useVaultRenderer';
import { ArtifactSurface } from './ArtifactSurface';
import { ChapterRail } from './ChapterRail';
import { Finale } from './Finale';
import { MediaStack } from './MediaStack';
import { StageHud } from './StageHud';

const MINIMUM_FAILURE_DURATION_MS = 2_400;
/** Point in the sequence at which the opening film starts downloading. */
const OPENING_FILM_PREFETCH = 0.2;

export interface VaultControls {
  /** `smooth` is for deliberate jumps; scrubbing wants the instant form. */
  seek(progress: number, smooth?: boolean): void;
  toggleCinematic(): void;
}

interface ExperienceProps {
  readonly authorized: boolean;
  readonly soundEnabled: boolean;
  readonly cinematicRunning: boolean;
  readonly telemetry: Telemetry;
  readonly controls: React.RefObject<VaultControls | null>;
  readonly readAudioBands: (now: number) => AudioBands;
  readonly onLoadProgress: (progress: number) => void;
  readonly onMediaError: () => void;
  readonly onToggleSound: () => void;
  readonly onProgress: (progress: number) => void;
  readonly onChargeStart: () => void;
  readonly onChargeChange: (amount: number) => void;
  readonly onChargeRelease: (amount: number) => void;
  readonly onWallImpact: (force: number) => void;
  readonly onDestroyed: () => void;
  readonly onFracture: () => void;
  readonly onVisibilityChange: (visible: boolean) => void;
  readonly onCinematicChange: (running: boolean) => void;
  readonly onOpenAbout: () => void;
  readonly onReplay: () => void;
}

const cueCopy: Record<TimelineCue, readonly [string, string?]> = {
  // The sequence opens on a closed door and nothing moves for the first few
  // percent. Under the hands-off run that is three silent seconds in which a
  // visitor has every reason to think nothing is happening.
  idle: ['SEAL INTACT', 'THE DOOR HAS NOT MOVED IN DECADES'],
  sequence: ['MECHANICAL LOCK', 'SEQUENCE ACTIVE'],
  disengaged: ['LOCK STATUS', 'DISENGAGED'],
  released: ['CONTAINMENT RELEASED', undefined],
  warning: ['DO NOT OPEN.', undefined],
  opening: ['CONTAINMENT APERTURE', 'OPENING'],
  // The three reveal beats escalate — classification fails, then it reacts to
  // you, then it is plainly alive — rather than reading as three gauges.
  object: ['OBJECT: UNKNOWN', 'NO MATCH ON RECORD'],
  origin: ['ORIGIN: UNKNOWN', 'IT RESPONDS TO CONTACT'],
  stability: ['IT IS AWAKE', 'STABILITY FALLING'],
  failure: ['CONTAINMENT FAILURE', undefined],
  collapse: ['V-07 IS GONE', 'NOTHING HELD IT BUT THE DOOR'],
  final: ['THE VAULT', 'AN INTERACTIVE WEBGL EXPERIMENT'],
};

/**
 * Once the object has been broken beyond repair the chamber is empty, and the
 * beats about it waking cannot stand. The sequence changes its account of what
 * happened instead of narrating something that is no longer on screen.
 */
const destroyedCueCopy: Partial<Record<TimelineCue, readonly [string, string?]>> = {
  object: ['OBJECT: DESTROYED', 'RECOVERED IN FRAGMENTS'],
  origin: ['ORIGIN: UNKNOWN', 'AND NOW UNRECOVERABLE'],
  stability: ['NOTHING LEFT TO CONTAIN', 'THE CHAMBER HOLDS DUST'],
  failure: ['CONTAINMENT IRRELEVANT', undefined],
  collapse: ['V-07 IS GONE', 'IT TOOK NOTHING WITH IT'],
};

export const Experience = ({
  authorized,
  soundEnabled,
  cinematicRunning,
  telemetry,
  controls,
  readAudioBands,
  onLoadProgress,
  onMediaError,
  onToggleSound,
  onProgress,
  onChargeStart,
  onChargeChange,
  onChargeRelease,
  onFracture,
  onWallImpact,
  onDestroyed,
  onVisibilityChange,
  onCinematicChange,
  onOpenAbout,
  onReplay,
}: ExperienceProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const transitionRef = useRef<HTMLImageElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const authorizedRef = useRef(authorized);
  const displayProgressRef = useRef(0);
  const pointerRef = useRef({ targetX: 0, targetY: 0, x: 0, y: 0 });
  const scrubbersRef = useRef<{ first: VideoScrubber; second: VideoScrubber } | null>(null);
  const failureHoldUntilRef = useRef(0);
  const failureSeenRef = useRef(false);
  // Read inside the animation loop so a late-arriving second video cannot force
  // the loop to be torn down and restarted mid-scroll.
  const video2ReadyRef = useRef(false);
  const video2FailedRef = useRef(false);
  const frameScaleRef = useRef(1);
  const openingFilmRequestedRef = useRef(false);
  const [posterReady, setPosterReady] = useState(false);
  const [video1Ready, setVideo1Ready] = useState(false);
  const [video2Ready, setVideo2Ready] = useState(false);
  const [video2Failed, setVideo2Failed] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [cue, setCue] = useState<TimelineCue>('idle');
  const [chapterId, setChapterId] = useState(() => chapterIdForProgress(0));
  const [debugVisible, setDebugVisible] = useState(false);
  const integrityRef = useRef<HTMLSpanElement>(null);
  const { canvasRef, rendererRef, webglReady, webglFailed } = useVaultRenderer();
  const {
    sectionTopRef, scrollDistanceRef, seek, toggleCinematic, stopCinematic, advance,
  } = useCinematicScroll(onCinematicChange, cinematicRunning);
  const interaction = useArtifactInteraction(rendererRef, {
    onChargeStart, onChargeChange, onChargeRelease, onWallImpact, onDestroyed, onFracture,
  });
  // Only the stable half of the interaction may reach the animation loop. The
  // returned object is rebuilt on every render, and depending on it would tear
  // the loop down and rebuild it every time any of this state changed.
  const { beginFrame, endFrame, chargeRef, contactsRef, strikesRef } = interaction;
  const sources = useMemo(selectVideoSources, []);

  authorizedRef.current = authorized;
  video2ReadyRef.current = video2Ready;
  video2FailedRef.current = video2Failed;
  telemetry.resolution = sources.resolution;

  useEffect(() => {
    const progress = (posterReady ? 45 : 0) + (video1Ready ? 35 : 0) + (webglReady ? 20 : 0);
    onLoadProgress(progress);
  }, [onLoadProgress, posterReady, video1Ready, webglReady]);

  // A poster served from cache can finish decoding before React attaches its
  // onLoad handler, which would otherwise strand the loader at 55%.
  useEffect(() => {
    if (posterRef.current?.complete) setPosterReady(true);
  }, []);

  useEffect(() => {
    const first = video1Ref.current;
    const second = video2Ref.current;
    if (!first || !second) return;
    const scrubbers = {
      first: new VideoScrubber(first),
      second: new VideoScrubber(second),
    };
    scrubbersRef.current = scrubbers;
    return () => {
      scrubbers.first.destroy();
      scrubbers.second.destroy();
      if (scrubbersRef.current === scrubbers) scrubbersRef.current = null;
    };
  }, []);

  /**
   * Fetching the opening film is deferred rather than started on entry.
   * Measured on entry it was pulling its full weight — 3.5 MB at 540p, 6.6 MB
   * at 720p — against the unlock film, which is the one needed immediately;
   * the unlock film did not finish buffering until nearly half way through the
   * sequence even on a local connection. It is not needed until the crossfade
   * just before the halfway point, so it waits until the sequence is underway
   * and the film in front of it has had the bandwidth to itself.
   */
  const requestOpeningFilm = useCallback((): void => {
    const second = video2Ref.current;
    if (!second || openingFilmRequestedRef.current) return;
    openingFilmRequestedRef.current = true;
    second.preload = 'auto';
    second.load();
  }, []);

  useEffect(() => {
    // Not `once`: a scroll event fired before authorization would otherwise
    // consume the listener and leave the scroll hint on screen permanently.
    const handleScroll = (): void => {
      if (authorizedRef.current) setHasScrolled(true);
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (import.meta.env.DEV && event.key.toLowerCase() === 'd') {
        setDebugVisible((visible) => !visible);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    controls.current = { seek, toggleCinematic };
    return () => {
      if (controls.current?.seek === seek) controls.current = null;
    };
  }, [controls, seek, toggleCinematic]);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();
    // Resume from wherever the previous loop left off rather than snapping back
    // to zero if this effect is ever re-run.
    let displayProgress = displayProgressRef.current;
    let latestCue: TimelineCue = cueForProgress(displayProgress);
    let latestChapter = chapterIdForProgress(displayProgress);
    let pageVisible = !document.hidden;

    const measure = (): void => {
      const section = sectionRef.current;
      if (!section) return;
      sectionTopRef.current = section.getBoundingClientRect().top + window.scrollY;
      scrollDistanceRef.current = Math.max(1, section.offsetHeight - window.innerHeight);
      // The scene belongs inside the film, which is letterboxed on tall
      // viewports, so it is scaled against the poster's rendered height. Held in
      // a ref because the renderer is imported lazily and may not exist yet.
      const frame = posterRef.current?.getBoundingClientRect();
      if (frame && frame.height > 0) {
        const scale = frame.height / window.innerHeight;
        frameScaleRef.current = scale;
        // Everything rendered live belongs inside the film. Without clipping,
        // the smoke and the particulate spill into the letterbox on a phone and
        // sit in the black margin with nothing behind them.
        const inset = Math.max(0, (1 - scale) / 2) * 100;
        stageRef.current?.style.setProperty('--frame-inset', `${inset.toFixed(2)}%`);
      }
      rendererRef.current?.resize();
    };

    const handleVisibility = (): void => {
      pageVisible = !document.hidden;
      previousTime = performance.now();
      onVisibilityChange(pageVisible);
    };

    const update = (now: number): void => {
      const deltaSeconds = Math.min(0.05, Math.max(0.001, (now - previousTime) / 1000));
      previousTime = now;

      if (pageVisible) {
        advance(now);

        const targetProgress = authorizedRef.current
          ? clamp((window.scrollY - sectionTopRef.current) / scrollDistanceRef.current)
          : 0;
        displayProgress = damp(displayProgress, targetProgress, SCROLL_DAMPING_SECONDS, deltaSeconds);
        if (Math.abs(targetProgress - displayProgress) < 0.0001) displayProgress = targetProgress;
        displayProgressRef.current = displayProgress;
        onProgress(displayProgress);

        if (displayProgress < TIMELINE.failureStart - 0.004) {
          failureSeenRef.current = false;
          failureHoldUntilRef.current = 0;
        } else if (displayProgress >= TIMELINE.failureStart && !failureSeenRef.current) {
          failureSeenRef.current = true;
          failureHoldUntilRef.current = now + MINIMUM_FAILURE_DURATION_MS;
        }
        const failureHoldActive = now < failureHoldUntilRef.current;
        const visualProgress = failureHoldActive
          ? Math.min(displayProgress, TIMELINE.finalStart - 0.001)
          : displayProgress;

        const first = video1Ref.current;
        const second = video2Ref.current;
        const scrubbers = scrubbersRef.current;
        const duration1 = first?.duration && Number.isFinite(first.duration)
          ? first.duration
          : VIDEO_DURATION_FALLBACK;
        const duration2 = second?.duration && Number.isFinite(second.duration)
          ? second.duration
          : VIDEO_DURATION_FALLBACK;

        scrubbers?.first.update(video1TimeForProgress(displayProgress, duration1), now);
        if (authorizedRef.current && second && second.readyState >= HTMLMediaElement.HAVE_METADATA) {
          scrubbers?.second.update(video2TimeForProgress(displayProgress, duration2), now);
        }

        // Far enough in that the unlock film has had its run, far enough out
        // that the opening film has time to arrive before the crossfade.
        if (displayProgress > OPENING_FILM_PREFETCH) requestOpeningFilm();

        const crossfade = video2ReadyRef.current || video2FailedRef.current
          ? smoothstep(RAMPS.crossfadeStart, RAMPS.crossfadeEnd, displayProgress)
          : 0;
        /*
         * Keep the outgoing film opaque underneath the incoming one. Fading
         * both layers at once makes their combined alpha dip to 75% halfway
         * through the blend, which exposes the differently framed poster
         * below as a brief flash. The upper layer alone supplies the blend.
         */
        if (first) first.style.opacity = '1';
        if (second) second.style.opacity = String(video2ReadyRef.current ? crossfade : 0);
        if (transitionRef.current) {
          transitionRef.current.style.opacity = String(video2FailedRef.current ? crossfade : 0);
        }

        const pointer = pointerRef.current;
        pointer.x = damp(pointer.x, pointer.targetX, 0.12, deltaSeconds);
        pointer.y = damp(pointer.y, pointer.targetY, 0.12, deltaSeconds);

        beginFrame(deltaSeconds);

        const stage = stageRef.current;
        stage?.style.setProperty('--media-x', `${pointer.x * 3}px`);
        stage?.style.setProperty('--media-y', `${pointer.y * 2}px`);
        stage?.style.setProperty('--charge', chargeRef.current.toFixed(3));

        const bands = readAudioBands(now);
        rendererRef.current?.setFrameScale(frameScaleRef.current);
        rendererRef.current?.update({
          progress: visualProgress,
          deltaSeconds,
          pointerX: pointer.x,
          pointerY: pointer.y,
          charge: chargeRef.current,
          audioLow: bands.low,
          audioMid: bands.mid,
          audioHigh: bands.high,
        });
        // The object's own light spills out of the canvas and into the interface.
        stage?.style.setProperty('--glow', (rendererRef.current?.getGlow() ?? 0).toFixed(3));


        stage?.style.setProperty('--invite', endFrame(now).toFixed(3));

        const integrity = rendererRef.current?.getIntegrity() ?? 1;
        telemetry.integrity = integrity;
        if (integrityRef.current) {
          const reading = Math.round(integrity * 100);
          const text = reading > 0 ? `${String(reading).padStart(3, '0')}%` : 'LOST';
          if (integrityRef.current.textContent !== text) integrityRef.current.textContent = text;
        }

        if (progressRef.current) {
          progressRef.current.textContent = String(Math.round(displayProgress * 100)).padStart(3, '0');
        }

        const nextCue = failureHoldActive ? 'failure' : cueForProgress(displayProgress);
        if (nextCue !== latestCue) {
          latestCue = nextCue;
          setCue(nextCue);
        }

        const nextChapter = chapterIdForProgress(displayProgress);
        if (nextChapter !== latestChapter) {
          latestChapter = nextChapter;
          setChapterId(nextChapter);
        }

        const firstMetrics = scrubbers?.first.getMetrics();
        const secondMetrics = scrubbers?.second.getMetrics();
        const rendererMetrics = rendererRef.current?.getDiagnostics();
        telemetry.progress = displayProgress;
        telemetry.targetProgress = targetProgress;
        telemetry.cue = nextCue;
        telemetry.video1Target = firstMetrics?.targetTime ?? 0;
        telemetry.video1Presented = firstMetrics?.presentedTime ?? 0;
        telemetry.video2Target = secondMetrics?.targetTime ?? 0;
        telemetry.video2Presented = secondMetrics?.presentedTime ?? 0;
        telemetry.webglTier = rendererMetrics?.tier ?? 'fallback';
        telemetry.fps = rendererMetrics?.fps ?? 0;
        telemetry.drawCalls = rendererMetrics?.drawCalls ?? 0;
        telemetry.dpr = rendererMetrics?.dpr ?? window.devicePixelRatio;
        telemetry.charge = chargeRef.current;
        telemetry.contacts = contactsRef.current;
        telemetry.strikes = strikesRef.current;

        if (debugRef.current) {
          debugRef.current.textContent = [
            `progress ${displayProgress.toFixed(4)} / ${targetProgress.toFixed(4)}`,
            `video1 ${firstMetrics?.presentedTime.toFixed(2) ?? '--'} / ${firstMetrics?.targetTime.toFixed(2) ?? '--'}`,
            `video2 ${secondMetrics?.presentedTime.toFixed(2) ?? '--'} / ${secondMetrics?.targetTime.toFixed(2) ?? '--'}`,
            `source ${sources.resolution}`,
            `webgl ${rendererMetrics?.tier ?? 'fallback'} · ${rendererMetrics?.fps ?? '--'} fps · ${rendererMetrics?.drawCalls ?? 0} calls`,
            `dpr ${rendererMetrics?.dpr.toFixed(2) ?? '--'}`,
            `viewport ${window.innerWidth}×${window.innerHeight}`,
          ].join('\n');
        }
      }

      frameId = window.requestAnimationFrame(update);
    };

    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('orientationchange', measure, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    frameId = window.requestAnimationFrame(update);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    advance,
    beginFrame,
    chargeRef,
    contactsRef,
    endFrame,
    onProgress,
    onVisibilityChange,
    readAudioBands,
    requestOpeningFilm,
    sources.resolution,
    strikesRef,
    telemetry,
  ]);

  const { destroyed } = interaction;
  const [primary, secondary] = (destroyed && destroyedCueCopy[cue]) || cueCopy[cue];
  const finaleVisible = cue === 'final';
  const fallbackVisible = webglFailed && (cue === 'object' || cue === 'origin' || cue === 'stability');
  const artifactInteractive = cue === 'object' || cue === 'origin' || cue === 'stability';
  interaction.exposedRef.current = artifactInteractive && !webglFailed && !destroyed;

  const replay = (): void => {
    stopCinematic();
    scrubbersRef.current?.first.reset();
    scrubbersRef.current?.second.reset();
    rendererRef.current?.reset();
    failureSeenRef.current = false;
    failureHoldUntilRef.current = 0;
    displayProgressRef.current = 0;
    interaction.reset();
    setHasScrolled(false);
    onReplay();
  };

  return (
    <main>
      <section className="experience" ref={sectionRef} aria-label="The Vault containment sequence">
        <div
          className={`stage cue-${cue}`}
          ref={stageRef}
          onPointerMove={(event) => {
            pointerRef.current.targetX = (event.clientX / window.innerWidth) * 2 - 1;
            pointerRef.current.targetY = (event.clientY / window.innerHeight) * 2 - 1;
          }}
          onPointerLeave={() => {
            pointerRef.current.targetX = 0;
            pointerRef.current.targetY = 0;
          }}
        >
          <MediaStack
            sources={sources}
            posterRef={posterRef}
            transitionRef={transitionRef}
            video1Ref={video1Ref}
            video2Ref={video2Ref}
            onMediaError={onMediaError}
            onPosterReady={() => setPosterReady(true)}
            onUnlockReady={() => {
              setVideo1Ready(true);
              scrubbersRef.current?.first.update(0, performance.now(), true);
            }}
            onOpeningReady={() => {
              setVideo2Ready(true);
              scrubbersRef.current?.second.update(0, performance.now(), true);
            }}
            onOpeningFailed={() => setVideo2Failed(true)}
          />

          <canvas ref={canvasRef} className={`vault-canvas${webglFailed ? ' is-fallback' : ''}`} aria-hidden="true" />
          <div className="stage-shade" aria-hidden="true" />
          {fallbackVisible && <div className="artifact-fallback is-visible" aria-hidden="true" />}
          {artifactInteractive && !webglFailed && destroyed && (
            <p className="artifact-guidance is-lost">NOTHING LEFT TO TOUCH</p>
          )}
          {artifactInteractive && !webglFailed && !destroyed && (
            <ArtifactSurface
              phase={interaction.phase}
              isHolding={interaction.isHolding}
              onHoldStart={interaction.beginHold}
              onHoldMove={interaction.trackHold}
              onHoldEnd={interaction.endHold}
              onNudge={interaction.nudge}
            />
          )}

          {authorized && !finaleVisible && (
            <StageHud
              cue={cue}
              soundEnabled={soundEnabled}
              cinematicRunning={cinematicRunning}
              showIntegrity={artifactInteractive && !webglFailed}
              destroyed={destroyed}
              progressRef={progressRef}
              integrityRef={integrityRef}
              onToggleCinematic={toggleCinematic}
              onOpenAbout={onOpenAbout}
              onToggleSound={onToggleSound}
            />
          )}

          {authorized && !finaleVisible && <ChapterRail activeId={chapterId} onSeek={seek} />}

          {authorized && !hasScrolled && (
            <div className="scroll-cue">
              <span>SCROLL TO RELEASE</span>
              <span className="scroll-cue__line" aria-hidden="true" />
              <button className="text-button" type="button" onClick={toggleCinematic}>
                OR PLAY IT FOR ME
              </button>
            </div>
          )}

          {/* Held back until the gate is out of the way: the opening beat is no
              longer hidden by the stylesheet, and the gate's backdrop is close
              to clear at its centre. Keyed on the cue so each beat remounts and
              replays its entrance instead of the text swapping in place. */}
          {authorized && (hasScrolled || cue !== 'idle') && (
            <>
              <div className="narrative" key={`${cue}-${destroyed}`} aria-hidden="true">
                <p className="narrative__primary">{primary}</p>
                {secondary && <p className="narrative__secondary">{secondary}</p>}
              </div>
              {/* One quiet announcement per beat, kept out of the visual layer
                  so it cannot be hidden mid-utterance by the finale. */}
              <p className="visually-hidden" aria-live="polite">
                {primary}{secondary ? `. ${secondary}` : ''}
              </p>
            </>
          )}

          {finaleVisible && (
            <Finale
              contacts={contactsRef.current}
              strikes={strikesRef.current}
              resonant={interaction.phase.resonant}
              destroyed={destroyed}
              onAbout={onOpenAbout}
              onReplay={replay}
            />
          )}

          {import.meta.env.DEV && <pre className={`debug-panel${debugVisible ? ' is-visible' : ''}`} ref={debugRef} />}
        </div>
      </section>
    </main>
  );
};
