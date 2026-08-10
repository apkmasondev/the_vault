import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { asset, MEDIA } from './constants';
import { EntryGate } from '../components/EntryGate';
import { Experience } from '../components/Experience';
import { ReducedMotionExperience } from '../components/ReducedMotionExperience';
import { useReducedMotion } from '../hooks/useReducedMotion';

const AUDIO_PREFERENCE_KEY = 'vault.audio.enabled';

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
  const [soundEnabled, setSoundEnabled] = useState(storedAudioPreference);
  const [mediaError, setMediaError] = useState(false);
  const audioRef = useRef<AudioEngine | null>(null);
  const reducedMotion = useReducedMotion();

  const getAudio = useCallback((): AudioEngine => {
    const audio = audioRef.current ?? new AudioEngine(asset(MEDIA.soundtrack));
    audioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    document.body.classList.toggle('is-entry-locked', !authorized);
    return () => document.body.classList.remove('is-entry-locked');
  }, [authorized]);

  useEffect(() => () => audioRef.current?.dispose(), []);

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
    window.setTimeout(() => setAuthorized(true), 720);
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
      {reducedMotion ? (
        <ReducedMotionExperience
          authorized={authorized}
          soundEnabled={soundEnabled}
          onLoadProgress={setLoadProgress}
          onToggleSound={toggleSound}
          onReplay={replay}
        />
      ) : (
        <Experience
          authorized={authorized}
          soundEnabled={soundEnabled}
          onLoadProgress={setLoadProgress}
          onMediaError={() => setMediaError(true)}
          onToggleSound={toggleSound}
          onProgress={updateAudio}
          onArtifactPulse={pulseAudio}
          onVisibilityChange={updateVisibility}
          onReplay={replay}
        />
      )}

      {!authorized && (
        <EntryGate
          ready={loadProgress === 100}
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
