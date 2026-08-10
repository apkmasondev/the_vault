import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  asset,
  MEDIA,
  RAMPS,
  SCROLL_DAMPING_SECONDS,
  TIMELINE,
  VIDEO_DURATION_FALLBACK,
} from '../app/constants';
import type { AudioBands } from '../audio/AudioEngine';
import type { Telemetry } from '../app/telemetry';
import { ScrollDirector } from '../media/ScrollDirector';
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
import type { VaultRenderer } from '../webgl/VaultRenderer';
import { AudioToggle } from './AudioToggle';
import { ChapterRail } from './ChapterRail';
import { Finale } from './Finale';

const MINIMUM_FAILURE_DURATION_MS = 1_800;
/** How long a hands-off run of the entire timeline takes. */
const CINEMATIC_DURATION_MS = 62_000;
/** Seconds of continuous contact needed to bring the core to full charge. */
const CHARGE_SECONDS = 1.5;
/** A release at or above this counts toward the hidden resonance. */
const RESONANT_CHARGE = 0.8;
const RESONANT_RELEASES = 3;
/** Horizontal travel that turns a hold into a rotation drag. */
const DRAG_THRESHOLD_PX = 10;
const SCROLL_KEYS = new Set([
  'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar',
]);

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
  readonly onFracture: () => void;
  readonly onVisibilityChange: (visible: boolean) => void;
  readonly onCinematicChange: (running: boolean) => void;
  readonly onOpenAbout: () => void;
  readonly onReplay: () => void;
}

const cueCopy: Record<TimelineCue, readonly [string, string?]> = {
  idle: ['', undefined],
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
  final: ['THE VAULT', 'AN INTERACTIVE WEBGL EXPERIMENT'],
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const authorizedRef = useRef(authorized);
  const displayProgressRef = useRef(0);
  const pointerRef = useRef({ targetX: 0, targetY: 0, x: 0, y: 0 });
  const rendererRef = useRef<VaultRenderer | null>(null);
  const scrubbersRef = useRef<{ first: VideoScrubber; second: VideoScrubber } | null>(null);
  const failureHoldUntilRef = useRef(0);
  const failureSeenRef = useRef(false);
  const interactionTimerRef = useRef<number | null>(null);
  const fractureTimerRef = useRef<number | null>(null);
  // Read inside the animation loop so a late-arriving second video cannot force
  // the loop to be torn down and restarted mid-scroll.
  const video2ReadyRef = useRef(false);
  const video2FailedRef = useRef(false);
  // Scroll geometry, kept outside the loop so seeking can use it too.
  const sectionTopRef = useRef(0);
  const scrollDistanceRef = useRef(1);
  const frameScaleRef = useRef(1);
  const directorRef = useRef(new ScrollDirector());
  const cinematicRef = useRef(false);
  const contactsRef = useRef(0);
  const chargeRef = useRef(0);
  const holdRef = useRef({ active: false, dragging: false, startX: 0, startY: 0, lastX: 0 });
  const resonantReleasesRef = useRef(0);
  const [posterReady, setPosterReady] = useState(false);
  const [video1Ready, setVideo1Ready] = useState(false);
  const [video2Ready, setVideo2Ready] = useState(false);
  const [video2Failed, setVideo2Failed] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [cue, setCue] = useState<TimelineCue>('idle');
  const [chapterId, setChapterId] = useState(() => chapterIdForProgress(0));
  const [debugVisible, setDebugVisible] = useState(false);
  const [artifactResponding, setArtifactResponding] = useState(false);
  const [charging, setCharging] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [fractured, setFractured] = useState(false);
  const [resonant, setResonant] = useState(false);
  const sources = useMemo(selectVideoSources, []);

  authorizedRef.current = authorized;
  video2ReadyRef.current = video2Ready;
  video2FailedRef.current = video2Failed;
  cinematicRef.current = cinematicRunning;
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

  useEffect(() => () => {
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    if (fractureTimerRef.current !== null) window.clearTimeout(fractureTimerRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let renderer: VaultRenderer | null = null;

    const initialize = async (): Promise<void> => {
      try {
        const module = await import('../webgl/VaultRenderer');
        if (disposed) return;
        renderer = new module.VaultRenderer(canvas, setWebglFailed);
        rendererRef.current = renderer;
        setWebglReady(true);
      } catch {
        if (!disposed) {
          setWebglFailed(true);
          setWebglReady(true);
        }
      }
    };

    void initialize();
    return () => {
      disposed = true;
      renderer?.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const second = video2Ref.current;
    if (!authorized || !second) return;
    second.preload = 'auto';
    second.load();
  }, [authorized]);

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

  const stopCinematic = useCallback((): void => {
    if (!directorRef.current.isRunning && !cinematicRef.current) return;
    directorRef.current.stop();
    cinematicRef.current = false;
    onCinematicChange(false);
  }, [onCinematicChange]);

  // Any real navigation intent hands control straight back to the visitor.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (SCROLL_KEYS.has(event.key)) stopCinematic();
    };
    window.addEventListener('wheel', stopCinematic, { passive: true });
    window.addEventListener('touchmove', stopCinematic, { passive: true });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('wheel', stopCinematic);
      window.removeEventListener('touchmove', stopCinematic);
      window.removeEventListener('keydown', handleKey);
    };
  }, [stopCinematic]);

  const seek = useCallback((progress: number, smooth = true): void => {
    stopCinematic();
    window.scrollTo({
      top: sectionTopRef.current + clamp(progress) * scrollDistanceRef.current,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, [stopCinematic]);

  const toggleCinematic = useCallback((): void => {
    if (directorRef.current.isRunning) {
      stopCinematic();
      return;
    }
    const top = sectionTopRef.current;
    const end = top + scrollDistanceRef.current;
    // Restarting from the end rewinds first, otherwise there is nothing to play.
    const from = window.scrollY >= end - 2 ? top : window.scrollY;
    if (from !== window.scrollY) window.scrollTo({ top: from, behavior: 'auto' });
    directorRef.current.start(from, end, CINEMATIC_DURATION_MS, performance.now());
    cinematicRef.current = true;
    onCinematicChange(true);
  }, [onCinematicChange]);

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
        frameScaleRef.current = frame.height / window.innerHeight;
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
        const directed = directorRef.current.step(now);
        if (directed !== null) window.scrollTo(0, directed);
        else if (cinematicRef.current) stopCinematic();

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

        const crossfade = video2ReadyRef.current || video2FailedRef.current
          ? smoothstep(RAMPS.crossfadeStart, RAMPS.crossfadeEnd, displayProgress)
          : 0;
        if (first) first.style.opacity = String(1 - crossfade);
        if (second) second.style.opacity = String(video2ReadyRef.current ? crossfade : 0);
        if (transitionRef.current) {
          transitionRef.current.style.opacity = String(video2FailedRef.current ? crossfade : 0);
        }

        const pointer = pointerRef.current;
        pointer.x = damp(pointer.x, pointer.targetX, 0.12, deltaSeconds);
        pointer.y = damp(pointer.y, pointer.targetY, 0.12, deltaSeconds);

        const hold = holdRef.current;
        chargeRef.current = hold.active && !hold.dragging
          ? Math.min(1, chargeRef.current + deltaSeconds / CHARGE_SECONDS)
          : Math.max(0, chargeRef.current - deltaSeconds * 3);
        if (hold.active && !hold.dragging) onChargeChange(chargeRef.current);

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
    onChargeChange,
    onProgress,
    onVisibilityChange,
    readAudioBands,
    sources.resolution,
    stopCinematic,
    telemetry,
  ]);

  const [primary, secondary] = cueCopy[cue];
  const finaleVisible = cue === 'final';
  const fallbackVisible = webglFailed && (cue === 'object' || cue === 'origin' || cue === 'stability');
  const artifactInteractive = cue === 'object' || cue === 'origin' || cue === 'stability';

  const beginHold = (clientX: number, clientY: number): void => {
    holdRef.current = {
      active: true,
      dragging: false,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
    };
    setCharging(true);
    onChargeStart();
  };

  const trackHold = (clientX: number, clientY: number): void => {
    const hold = holdRef.current;
    if (!hold.active) return;
    const delta = clientX - hold.lastX;
    hold.lastX = clientX;
    const travelled = Math.hypot(clientX - hold.startX, clientY - hold.startY);
    if (!hold.dragging && travelled > DRAG_THRESHOLD_PX) {
      // Moving is a different gesture from holding, so the charge is given back.
      hold.dragging = true;
      chargeRef.current = 0;
      setCharging(false);
      setCarrying(true);
      onChargeRelease(0);
    }
    if (!hold.dragging) return;
    // The object is carried to the pointer, and spun by the sideways component.
    rendererRef.current?.setGrab(
      true,
      (clientX / window.innerWidth) * 2 - 1,
      (clientY / window.innerHeight) * 2 - 1,
    );
    rendererRef.current?.addSpin((delta / window.innerWidth) * 9);
  };

  const noteFracture = (): void => {
    contactsRef.current += 1;
    onFracture();
    setFractured(true);
    if (fractureTimerRef.current !== null) window.clearTimeout(fractureTimerRef.current);
    fractureTimerRef.current = window.setTimeout(() => setFractured(false), 2_200);
  };

  const endHold = (): void => {
    const hold = holdRef.current;
    if (!hold.active) return;
    const charge = chargeRef.current;
    const wasDragging = hold.dragging;
    holdRef.current = { active: false, dragging: false, startX: 0, startY: 0, lastX: 0 };
    setCharging(false);
    setCarrying(false);
    chargeRef.current = 0;
    // Letting go hard enough breaks it open rather than simply setting it down.
    if (rendererRef.current?.releaseGrab()) noteFracture();
    onChargeRelease(wasDragging ? 0 : charge);
    if (wasDragging || !rendererRef.current?.release(charge)) return;

    contactsRef.current += 1;
    if (charge >= RESONANT_CHARGE) {
      resonantReleasesRef.current += 1;
      if (resonantReleasesRef.current >= RESONANT_RELEASES) setResonant(true);
    }
    setArtifactResponding(true);
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => setArtifactResponding(false), 1_600);
  };

  const replay = (): void => {
    stopCinematic();
    scrubbersRef.current?.first.reset();
    scrubbersRef.current?.second.reset();
    rendererRef.current?.reset();
    failureSeenRef.current = false;
    failureHoldUntilRef.current = 0;
    displayProgressRef.current = 0;
    contactsRef.current = 0;
    chargeRef.current = 0;
    resonantReleasesRef.current = 0;
    holdRef.current = { active: false, dragging: false, startX: 0, startY: 0, lastX: 0 };
    rendererRef.current?.setGrab(false);
    setArtifactResponding(false);
    setCarrying(false);
    setCharging(false);
    setFractured(false);
    setResonant(false);
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
          <div className="media-stack" aria-hidden="true">
            <img
              ref={posterRef}
              className="media-layer media-poster"
              src={asset(MEDIA.poster)}
              alt=""
              draggable={false}
              fetchPriority="high"
              decoding="sync"
              onLoad={() => setPosterReady(true)}
              onError={() => {
                setPosterReady(true);
                onMediaError();
              }}
            />
            <img
              ref={transitionRef}
              className="media-layer transition-fallback"
              src={asset(MEDIA.transition)}
              alt=""
              draggable={false}
            />
            <video
              ref={video1Ref}
              className="media-layer video-layer video-layer--first"
              src={sources.unlock}
              muted
              playsInline
              preload="metadata"
              disablePictureInPicture
              draggable={false}
              tabIndex={-1}
              onLoadedMetadata={(event) => {
                event.currentTarget.pause();
                setVideo1Ready(true);
                scrubbersRef.current?.first.update(0, performance.now(), true);
              }}
              onError={() => {
                setVideo1Ready(true);
                onMediaError();
              }}
            />
            <video
              ref={video2Ref}
              className="media-layer video-layer video-layer--second"
              src={sources.opening}
              muted
              playsInline
              preload="none"
              disablePictureInPicture
              draggable={false}
              tabIndex={-1}
              onLoadedData={(event) => {
                event.currentTarget.pause();
                setVideo2Ready(true);
                scrubbersRef.current?.second.update(0, performance.now(), true);
              }}
              onError={() => {
                setVideo2Failed(true);
                onMediaError();
              }}
            />
          </div>

          <canvas ref={canvasRef} className={`vault-canvas${webglFailed ? ' is-fallback' : ''}`} aria-hidden="true" />
          <div className="stage-shade" aria-hidden="true" />
          {fallbackVisible && <div className="artifact-fallback is-visible" aria-hidden="true" />}
          {artifactInteractive && !webglFailed && (
            <>
              <button
                className={`artifact-hit-target${charging ? ' is-charging' : ''}${carrying ? ' is-carrying' : ''}`}
                type="button"
                aria-label="Hold the object to charge it, or drag to carry it"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  beginHold(event.clientX, event.clientY);
                }}
                onPointerMove={(event) => trackHold(event.clientX, event.clientY)}
                onPointerUp={endHold}
                onPointerCancel={endHold}
                onLostPointerCapture={endHold}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  if (!holdRef.current.active) beginHold(0, 0);
                }}
                onKeyUp={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  endHold();
                }}
              />
              <p className={`artifact-guidance${artifactResponding ? ' is-responding' : ''}${charging ? ' is-charging' : ''}`}>
                {fractured
                  ? 'STRUCTURE BREACHED · IT IS CLOSING ITSELF'
                  : carrying
                    ? 'THE OBJECT FOLLOWS YOU · THROW IT'
                    : resonant
                      ? 'RESONANCE SUSTAINED · SIGNAL DECODED'
                      : charging
                        ? 'CHARGING — RELEASE TO DISCHARGE'
                        : artifactResponding
                          ? 'CONTACT REGISTERED · RESONANCE AMPLIFIED'
                          : 'HOLD IT STILL TO CHARGE · DRAG TO CARRY'}
              </p>
            </>
          )}

          {authorized && !finaleVisible && (
            <div className="hud">
              <div className="hud__identity"><span>V-07</span><span>CONTAINMENT</span></div>
              <div className="hud__status"><span>SYSTEM</span><span>{cue === 'failure' ? 'CRITICAL' : 'MONITORING'}</span></div>
              <div className="hud__progress"><span ref={progressRef}>000</span><span>/ 100</span></div>
              <div className="hud__controls">
                <button
                  className="hud__button"
                  type="button"
                  aria-pressed={cinematicRunning}
                  onClick={toggleCinematic}
                >
                  {cinematicRunning ? 'STOP' : 'AUTO'}
                </button>
                <button className="hud__button" type="button" onClick={onOpenAbout}>
                  ABOUT
                </button>
                <AudioToggle enabled={soundEnabled} onToggle={onToggleSound} />
              </div>
            </div>
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

          {/* Keyed on the cue so each beat remounts and replays its entrance
              instead of the text swapping in place. */}
          <div className="narrative" key={cue} aria-hidden="true">
            <p className="narrative__primary">{primary}</p>
            {secondary && <p className="narrative__secondary">{secondary}</p>}
          </div>
          {/* One quiet announcement per beat, kept out of the visual layer so it
              cannot be hidden mid-utterance by the finale. */}
          <p className="visually-hidden" aria-live="polite">
            {primary}{secondary ? `. ${secondary}` : ''}
          </p>

          {finaleVisible && (
            <Finale
              contacts={contactsRef.current}
              resonant={resonant}
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
