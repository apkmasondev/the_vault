import { useCallback, useEffect, useRef } from 'react';
import { ScrollDirector } from '../media/ScrollDirector';
import { clamp } from '../utils/math';

/** How long a hands-off run of the entire timeline takes. */
const CINEMATIC_DURATION_MS = 62_000;
/** Keys that mean the visitor wants to move through the sequence themselves. */
const SCROLL_KEYS = new Set([
  'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar',
]);

export interface CinematicScroll {
  /** Where the scrolled section begins, in document coordinates. */
  readonly sectionTopRef: React.RefObject<number>;
  /** How far it can be scrolled before it ends. */
  readonly scrollDistanceRef: React.RefObject<number>;
  // Declared as properties rather than methods: they are destructured from the
  // returned object, and a method signature would carry a `this` to lose.
  /** `smooth` is for deliberate jumps; scrubbing wants the instant form. */
  readonly seek: (progress: number, smooth?: boolean) => void;
  readonly toggleCinematic: () => void;
  readonly stopCinematic: () => void;
  /** Applies the next hands-off scroll position, if a run is under way. */
  readonly advance: (now: number) => void;
}

/**
 * Scrolling under the visitor's control and scrolling on their behalf, which
 * are the same axis and therefore have to be one thing. Any real navigation
 * intent — a wheel, a drag, a navigation key — hands control straight back,
 * because a page that keeps moving after you try to stop it is broken.
 */
export const useCinematicScroll = (
  onCinematicChange: (running: boolean) => void,
  cinematicRunning: boolean,
): CinematicScroll => {
  const sectionTopRef = useRef(0);
  const scrollDistanceRef = useRef(1);
  const directorRef = useRef(new ScrollDirector());
  const runningRef = useRef(false);
  runningRef.current = cinematicRunning;

  const stopCinematic = useCallback((): void => {
    if (!directorRef.current.isRunning && !runningRef.current) return;
    directorRef.current.stop();
    runningRef.current = false;
    onCinematicChange(false);
  }, [onCinematicChange]);

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
    runningRef.current = true;
    onCinematicChange(true);
  }, [onCinematicChange, stopCinematic]);

  const advance = useCallback((now: number): void => {
    const directed = directorRef.current.step(now);
    if (directed !== null) window.scrollTo(0, directed);
    else if (runningRef.current) stopCinematic();
  }, [stopCinematic]);

  return { sectionTopRef, scrollDistanceRef, seek, toggleCinematic, stopCinematic, advance };
};
