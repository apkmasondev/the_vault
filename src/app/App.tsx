import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { asset, LOAD_WATCHDOG_MS, MEDIA } from './constants';
import { AboutPanel } from '../components/AboutPanel';
import { EntryGate } from '../components/EntryGate';
import { Experience, type VaultControls } from '../components/Experience';
import { ReducedMotionExperience } from '../components/ReducedMotionExperience';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { createTelemetry } from './telemetry';

const AUDIO_PREFERENCE_KEY = 'vault.audio.enabled';
const ABOUT_HASH = '#about';

const storedAudioPreference = (): boolean => {
  try {
    return window.localStorage.getItem(AUDIO_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const App = () => {
  const [authorized, setAuthorized] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(storedAudioPreference);
  const [mediaError, setMediaError] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(() => window.location.hash === ABOUT_HASH);
  const [cinematicRunning, setCinematicRunning] = useState(false);
  const audioRef = useRef<AudioEngine | null>(null);
  const authorizeTimerRef = useRef<number | null>(null);
  const telemetryRef = useRef(createTelemetry('—'));
  const controlsRef = useRef<VaultControls | null>(null);
  const reducedMotion = useReducedMotion();

  const readTelemetry = useCallback(() => telemetryRef.current, []);

  const getAudio = useCallback((): AudioEngine => {
    const audio = audioRef.current ?? new AudioEngine(asset(MEDIA.soundtrack));
    audioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    const locked = !authorized || aboutOpen;
    document.body.classList.toggle('is-entry-locked', locked);
    return () => document.body.classList.remove('is-entry-locked');
  }, [aboutOpen, authorized]);

  // The panel is linkable, and the back button closes it.
  useEffect(() => {
    const sync = (): void => setAboutOpen(window.location.hash === ABOUT_HASH);
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const openAbout = useCallback((): void => {
    if (window.location.hash !== ABOUT_HASH) window.history.pushState(null, '', ABOUT_HASH);
    setAboutOpen(true);
  }, []);

  const closeAbout = useCallback((): void => {
    if (window.location.hash === ABOUT_HASH) window.history.back();
    setAboutOpen(false);
  }, []);

  useEffect(() => () => audioRef.current?.dispose(), []);

  // A stalled asset — or a cached image whose load event fired before React
  // attached its handler — must never leave the loader hanging forever.
  useEffect(() => {
    if (loadProgress >= 100 || loadTimedOut) return;
    const timer = window.setTimeout(() => setLoadTimedOut(true), LOAD_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [loadProgress, loadTimedOut]);

  useEffect(() => () => {
    if (authorizeTimerRef.current !== null) window.clearTimeout(authorizeTimerRef.current);
  }, []);

  const rememberSound = useCallback((enabled: boolean): void => {
    try {
      window.localStorage.setItem(AUDIO_PREFERENCE_KEY, String(enabled));
    } catch {
      // The experience remains functional without persistent storage.
    }
  }, []);

  const authorize = useCallback((withSound: boolean): void => {
    const audio = getAudio();
    void audio.start(withSound);
    setSoundEnabled(withSound);
    rememberSound(withSound);
    if (authorizeTimerRef.current !== null) window.clearTimeout(authorizeTimerRef.current);
    authorizeTimerRef.current = window.setTimeout(() => setAuthorized(true), 720);
  }, [getAudio, rememberSound]);

  const prepareAudio = useCallback((): void => {
    const audio = getAudio();
    void audio.start(false);
  }, [getAudio]);

  const toggleSound = useCallback((): void => {
    const enabled = !soundEnabled;
    const audio = getAudio();
    void audio.start(enabled);
    setSoundEnabled(enabled);
    rememberSound(enabled);
  }, [getAudio, rememberSound, soundEnabled]);

  const replay = useCallback((): void => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    audioRef.current?.reset();
    setAuthorized(false);
  }, []);

  const updateAudio = useCallback((progress: number): void => {
    audioRef.current?.update(progress);
  }, []);

  const pulseAudio = useCallback((): void => audioRef.current?.impact(), []);

  const updateVisibility = useCallback((visible: boolean): void => {
    if (visible) void audioRef.current?.resume();
    else void audioRef.current?.suspend();
  }, []);

  return (
    <>
      {/* The visible wordmark belongs to the entry gate, which unmounts on
          entry, so the document heading is kept here instead. */}
      <h1 className="visually-hidden">The Vault — an interactive containment experiment</h1>

      {reducedMotion ? (
        <ReducedMotionExperience
          authorized={authorized}
          soundEnabled={soundEnabled}
          onLoadProgress={setLoadProgress}
          onToggleSound={toggleSound}
          onOpenAbout={openAbout}
          onReplay={replay}
        />
      ) : (
        <Experience
          authorized={authorized}
          soundEnabled={soundEnabled}
          cinematicRunning={cinematicRunning}
          telemetry={telemetryRef.current}
          controls={controlsRef}
          onLoadProgress={setLoadProgress}
          onMediaError={() => setMediaError(true)}
          onToggleSound={toggleSound}
          onProgress={updateAudio}
          onArtifactPulse={pulseAudio}
          onVisibilityChange={updateVisibility}
          onCinematicChange={setCinematicRunning}
          onOpenAbout={openAbout}
          onReplay={replay}
        />
      )}

      {aboutOpen && (
        <AboutPanel
          readTelemetry={readTelemetry}
          live={!reducedMotion}
          cinematicRunning={cinematicRunning}
          onSeek={(progress) => controlsRef.current?.seek(progress, false)}
          onToggleCinematic={() => {
            closeAbout();
            controlsRef.current?.toggleCinematic();
          }}
          onClose={closeAbout}
        />
      )}

      {!authorized && (
        <EntryGate
          ready={loadProgress >= 100 || loadTimedOut}
          loadProgress={loadProgress}
          defaultSound={soundEnabled}
          onGesture={prepareAudio}
          onAuthorize={authorize}
        />
      )}

      {mediaError && (
        <p className="system-message" role="status">
          VISUAL FEED DEGRADED — FALLBACK ACTIVE
        </p>
      )}
    </>
  );
};
