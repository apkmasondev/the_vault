import { useEffect, useMemo, useRef, useState } from 'react';
import { asset, MEDIA, SCROLL_DAMPING_SECONDS, TIMELINE, VIDEO_DURATION_FALLBACK } from '../app/constants';
import { VideoScrubber } from '../media/VideoScrubber';
import { selectVideoSources } from '../media/videoSources';
import { clamp, damp, smoothstep } from '../utils/math';
import {
  cueForProgress,
  type TimelineCue,
  video1TimeForProgress,
  video2TimeForProgress,
} from '../utils/timeline';
import type { VaultRenderer } from '../webgl/VaultRenderer';
import { AudioToggle } from './AudioToggle';
import { Finale } from './Finale';

const MINIMUM_FAILURE_DURATION_MS = 1_800;

interface ExperienceProps {
  readonly authorized: boolean;
  readonly soundEnabled: boolean;
  readonly onLoadProgress: (progress: number) => void;
  readonly onMediaError: () => void;
  readonly onToggleSound: () => void;
  readonly onProgress: (progress: number) => void;
  readonly onArtifactPulse: () => void;
  readonly onVisibilityChange: (visible: boolean) => void;
  readonly onReplay: () => void;
}

const cueCopy: Record<TimelineCue, readonly [string, string?]> = {
  idle: ['', undefined],
  sequence: ['MECHANICAL LOCK', 'SEQUENCE ACTIVE'],
  disengaged: ['LOCK STATUS', 'DISENGAGED'],
  released: ['CONTAINMENT RELEASED', undefined],
  warning: ['DO NOT OPEN.', undefined],
  opening: ['CONTAINMENT APERTURE', 'OPENING'],
  object: ['OBJECT: UNKNOWN', undefined],
  origin: ['ORIGIN: UNKNOWN', undefined],
  stability: ['STABILITY: 03%', undefined],
  failure: ['CONTAINMENT FAILURE', undefined],
  final: ['THE VAULT', 'AN INTERACTIVE WEBGL EXPERIMENT'],
};

export const Experience = ({
  authorized,
  soundEnabled,
  onLoadProgress,
  onMediaError,
  onToggleSound,
  onProgress,
  onArtifactPulse,
  onVisibilityChange,
  onReplay,
}: ExperienceProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const transitionRef = useRef<HTMLImageElement>(null);
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
  const [posterReady, setPosterReady] = useState(false);
  const [video1Ready, setVideo1Ready] = useState(false);
  const [video2Ready, setVideo2Ready] = useState(false);
  const [video2Failed, setVideo2Failed] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [cue, setCue] = useState<TimelineCue>('idle');
  const [debugVisible, setDebugVisible] = useState(false);
  const [artifactResponding, setArtifactResponding] = useState(false);
  const sources = useMemo(selectVideoSources, []);

  authorizedRef.current = authorized;

  useEffect(() => {
    const progress = (posterReady ? 45 : 0) + (video1Ready ? 35 : 0) + (webglReady ? 20 : 0);
    onLoadProgress(progress);
  }, [onLoadProgress, posterReady, video1Ready, webglReady]);

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
    const handleScroll = (): void => {
      if (authorizedRef.current) setHasScrolled(true);
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (import.meta.env.DEV && event.key.toLowerCase() === 'd') {
        setDebugVisible((visible) => !visible);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true, once: true });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    let previousTime = performance.now();
    let displayProgress = 0;
    let latestCue: TimelineCue = 'idle';
    let sectionTop = 0;
    let scrollDistance = 1;
    let pageVisible = !document.hidden;

    const measure = (): void => {
      const section = sectionRef.current;
      if (!section) return;
      sectionTop = section.getBoundingClientRect().top + window.scrollY;
      scrollDistance = Math.max(1, section.offsetHeight - window.innerHeight);
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
        const targetProgress = authorizedRef.current
          ? clamp((window.scrollY - sectionTop) / scrollDistance)
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

        const crossfade = video2Ready || video2Failed
          ? smoothstep(0.552, 0.572, displayProgress)
          : 0;
        if (first) first.style.opacity = String(1 - crossfade);
        if (second) second.style.opacity = String(video2Ready ? crossfade : 0);
        if (transitionRef.current) {
          transitionRef.current.style.opacity = String(video2Failed ? crossfade : 0);
        }

        const pointer = pointerRef.current;
        pointer.x = damp(pointer.x, pointer.targetX, 0.12, deltaSeconds);
        pointer.y = damp(pointer.y, pointer.targetY, 0.12, deltaSeconds);
        stageRef.current?.style.setProperty('--media-x', `${pointer.x * 3}px`);
        stageRef.current?.style.setProperty('--media-y', `${pointer.y * 2}px`);
        rendererRef.current?.update(visualProgress, deltaSeconds, pointer.x, pointer.y);

        if (progressRef.current) {
          progressRef.current.textContent = String(Math.round(displayProgress * 100)).padStart(3, '0');
        }

        const nextCue = failureHoldActive ? 'failure' : cueForProgress(displayProgress);
        if (nextCue !== latestCue) {
          latestCue = nextCue;
          setCue(nextCue);
        }

        if (debugRef.current) {
          const firstMetrics = scrubbers?.first.getMetrics();
          const secondMetrics = scrubbers?.second.getMetrics();
          const rendererMetrics = rendererRef.current?.getDiagnostics();
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
  }, [onProgress, onVisibilityChange, sources.resolution, video2Failed, video2Ready]);

  const [primary, secondary] = cueCopy[cue];
  const finaleVisible = cue === 'final';
  const fallbackVisible = webglFailed && (cue === 'object' || cue === 'origin' || cue === 'stability');
  const artifactInteractive = cue === 'object' || cue === 'origin' || cue === 'stability';

  const pulseArtifact = (): void => {
    if (!rendererRef.current?.pulse()) return;
    onArtifactPulse();
    setArtifactResponding(true);
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => setArtifactResponding(false), 1_350);
  };

  const replay = (): void => {
    scrubbersRef.current?.first.reset();
    scrubbersRef.current?.second.reset();
    rendererRef.current?.reset();
    failureSeenRef.current = false;
    failureHoldUntilRef.current = 0;
    setArtifactResponding(false);
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
                className="artifact-hit-target"
                type="button"
                aria-label="Touch the artifact to amplify its resonance"
                onClick={pulseArtifact}
              />
              <p className={`artifact-guidance${artifactResponding ? ' is-responding' : ''}`}>
                {artifactResponding
                  ? 'CONTACT REGISTERED · RESONANCE AMPLIFIED'
                  : 'TOUCH / CLICK THE OBJECT'}
              </p>
            </>
          )}

          {authorized && !finaleVisible && (
            <div className="hud">
              <div className="hud__identity"><span>V-07</span><span>CONTAINMENT</span></div>
              <div className="hud__status"><span>SYSTEM</span><span>{cue === 'failure' ? 'CRITICAL' : 'MONITORING'}</span></div>
              <div className="hud__progress"><span ref={progressRef}>000</span><span>/ 100</span></div>
              <AudioToggle enabled={soundEnabled} onToggle={onToggleSound} />
            </div>
          )}

          {authorized && !hasScrolled && (
            <div className="scroll-cue"><span>SCROLL TO RELEASE</span><span className="scroll-cue__line" aria-hidden="true" /></div>
          )}

          <div className="narrative" aria-live="polite" aria-atomic="true" aria-hidden={finaleVisible}>
            <p className="narrative__primary">{primary}</p>
            {secondary && <p className="narrative__secondary">{secondary}</p>}
          </div>

          {finaleVisible && <Finale onReplay={replay} />}

          {import.meta.env.DEV && <pre className={`debug-panel${debugVisible ? ' is-visible' : ''}`} ref={debugRef} />}
        </div>
      </section>
    </main>
  );
};
