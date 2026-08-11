import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtifactPhase } from '../components/ArtifactSurface';
import { HoldGesture } from '../interaction/holdGesture';
import { clamp } from '../utils/math';
import type { VaultRenderer } from '../webgl/VaultRenderer';

/** Seconds of continuous contact needed to bring the core to full charge. */
const CHARGE_SECONDS = 1.5;
/** A release at or above this counts toward the hidden resonance. */
const RESONANT_CHARGE = 0.8;
const RESONANT_RELEASES = 3;
/** Seconds of being ignored before the object starts asking to be touched. */
const INVITE_DELAY_SECONDS = 4;
const INVITE_RAMP_SECONDS = 2;
/** How long each announcement stays on screen after the event that caused it. */
const STRUCK_MS = 1_500;
const FRACTURED_MS = 2_200;
const RESPONDING_MS = 1_600;

interface InteractionCallbacks {
  readonly onChargeStart: () => void;
  readonly onChargeChange: (amount: number) => void;
  readonly onChargeRelease: (amount: number) => void;
  readonly onWallImpact: (force: number) => void;
  readonly onDestroyed: () => void;
  readonly onFracture: () => void;
}

export interface ArtifactInteraction {
  readonly phase: ArtifactPhase;
  readonly destroyed: boolean;
  /** Written into by the caller each render, from the current cue. */
  readonly exposedRef: React.RefObject<boolean>;
  readonly chargeRef: React.RefObject<number>;
  readonly contactsRef: React.RefObject<number>;
  readonly strikesRef: React.RefObject<number>;
  readonly isHolding: () => boolean;
  readonly beginHold: (clientX: number, clientY: number) => void;
  readonly trackHold: (clientX: number, clientY: number) => void;
  readonly endHold: () => void;
  readonly nudge: (directionX: number, directionY: number) => void;
  /**
   * The two halves of a frame, which cannot be merged: charge has to be settled
   * before the renderer is stepped because it is an input to that step, and
   * strikes only exist afterwards because the physics produces them during it.
   */
  readonly beginFrame: (deltaSeconds: number) => void;
  /** Returns how strongly the object is currently asking to be touched. */
  readonly endFrame: (now: number) => number;
  readonly reset: () => void;
}

/**
 * Everything the visitor does to the object, and everything that follows from
 * it: charging, carrying, throwing, the wall strikes the physics reports back,
 * and the invitation the object extends when it is ignored.
 *
 * Some of this can only be observed from inside the animation loop — a wall
 * strike happens during the physics step, not in response to an event — so the
 * hook exposes `advance` rather than trying to be purely reactive.
 */
export const useArtifactInteraction = (
  rendererRef: React.RefObject<VaultRenderer | null>,
  callbacks: InteractionCallbacks,
): ArtifactInteraction => {
  const gestureRef = useRef(new HoldGesture());
  const chargeRef = useRef(0);
  const contactsRef = useRef(0);
  const strikesRef = useRef(0);
  const resonantReleasesRef = useRef(0);
  const lastTouchedAtRef = useRef(0);
  const exposedRef = useRef(false);
  const wasExposedRef = useRef(false);
  const respondingTimerRef = useRef<number | null>(null);
  const fractureTimerRef = useRef<number | null>(null);
  const struckTimerRef = useRef<number | null>(null);

  const [charging, setCharging] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [struck, setStruck] = useState(false);
  const [fractured, setFractured] = useState(false);
  const [resonant, setResonant] = useState(false);
  const [responding, setResponding] = useState(false);
  const [destroyed, setDestroyed] = useState(false);

  // Held in a ref so `advance` can stay stable across renders; the loop that
  // calls it must not be torn down every time a prop identity changes.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => () => {
    if (respondingTimerRef.current !== null) window.clearTimeout(respondingTimerRef.current);
    if (fractureTimerRef.current !== null) window.clearTimeout(fractureTimerRef.current);
    if (struckTimerRef.current !== null) window.clearTimeout(struckTimerRef.current);
  }, []);

  /** Any contact restarts the clock on the object asking to be noticed. */
  const noteContact = useCallback((): void => {
    lastTouchedAtRef.current = performance.now();
  }, []);

  const announce = useCallback((
    set: (value: boolean) => void,
    timer: React.RefObject<number | null>,
    duration: number,
  ): void => {
    set(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set(false), duration);
  }, []);

  const beginHold = useCallback((clientX: number, clientY: number): void => {
    noteContact();
    gestureRef.current.begin(clientX, clientY, performance.now());
    setCharging(true);
    callbacksRef.current.onChargeStart();
  }, [noteContact]);

  const trackHold = useCallback((clientX: number, clientY: number): void => {
    const gesture = gestureRef.current;
    if (!gesture.active) return;
    noteContact();

    const { dragging, becameDrag, deltaX } = gesture.move(clientX, clientY, performance.now(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });

    if (becameDrag) {
      // Moving is a different gesture from holding, so the charge is given back.
      chargeRef.current = 0;
      setCharging(false);
      setCarrying(true);
      callbacksRef.current.onChargeRelease(0);
    }
    if (!dragging) return;
    // The object is carried to the pointer, and spun by the sideways component.
    rendererRef.current?.setGrab(
      true,
      (clientX / window.innerWidth) * 2 - 1,
      (clientY / window.innerHeight) * 2 - 1,
    );
    rendererRef.current?.addSpin((deltaX / window.innerWidth) * 9);
  }, [noteContact, rendererRef]);

  const endHold = useCallback((): void => {
    const gesture = gestureRef.current;
    if (!gesture.active) return;
    noteContact();
    const charge = chargeRef.current;
    const { dragging: wasDragging, throwX, throwY } = gesture.end();
    setCharging(false);
    setCarrying(false);
    chargeRef.current = 0;

    // Letting go hard enough breaks it open rather than simply setting it down.
    if (rendererRef.current?.releaseGrab(throwX, throwY)) {
      contactsRef.current += 1;
      callbacksRef.current.onFracture();
      announce(setFractured, fractureTimerRef, FRACTURED_MS);
    }
    callbacksRef.current.onChargeRelease(wasDragging ? 0 : charge);
    if (wasDragging || !rendererRef.current?.release(charge)) return;

    contactsRef.current += 1;
    if (charge >= RESONANT_CHARGE) {
      resonantReleasesRef.current += 1;
      if (resonantReleasesRef.current >= RESONANT_RELEASES) setResonant(true);
    }
    announce(setResponding, respondingTimerRef, RESPONDING_MS);
  }, [announce, noteContact, rendererRef]);

  const nudge = useCallback((directionX: number, directionY: number): void => {
    noteContact();
    rendererRef.current?.nudge(directionX, directionY);
  }, [noteContact, rendererRef]);

  const beginFrame = useCallback((deltaSeconds: number): void => {
    const gesture = gestureRef.current;
    // Charge builds only while the object is held still; moving it is a
    // different intent and gives the charge back.
    const holdingStill = gesture.active && !gesture.isDragging;
    chargeRef.current = holdingStill
      ? Math.min(1, chargeRef.current + deltaSeconds / CHARGE_SECONDS)
      : Math.max(0, chargeRef.current - deltaSeconds * 3);
    if (holdingStill) callbacksRef.current.onChargeChange(chargeRef.current);
  }, []);

  const endFrame = useCallback((now: number): number => {
    const renderer = rendererRef.current;

    // Wall strikes originate inside the physics step, so they are collected
    // here rather than raised from an event.
    const impact = renderer?.consumeImpact() ?? 0;
    if (impact > 0) {
      strikesRef.current += 1;
      callbacksRef.current.onWallImpact(impact);
      announce(setStruck, struckTimerRef, STRUCK_MS);
    }
    if (renderer?.consumeDestruction()) {
      setDestroyed(true);
      callbacksRef.current.onDestroyed();
    }

    // Left alone once it is out, the object starts inviting contact. Most
    // visitors have no reason to suspect it can be touched at all. The wait is
    // measured from the object appearing, not from page load, or it arrives
    // already asking and the invitation means nothing.
    const exposed = exposedRef.current;
    if (exposed && !wasExposedRef.current) lastTouchedAtRef.current = now;
    wasExposedRef.current = exposed;
    const idleSeconds = (now - lastTouchedAtRef.current) / 1000;
    const inviting = exposed
      ? clamp((idleSeconds - INVITE_DELAY_SECONDS) / INVITE_RAMP_SECONDS)
      : 0;
    renderer?.setInviting(inviting);
    return inviting;
  }, [announce, rendererRef]);

  const reset = useCallback((): void => {
    gestureRef.current.end();
    rendererRef.current?.setGrab(false);
    chargeRef.current = 0;
    contactsRef.current = 0;
    strikesRef.current = 0;
    resonantReleasesRef.current = 0;
    setCharging(false);
    setCarrying(false);
    setStruck(false);
    setFractured(false);
    setResonant(false);
    setResponding(false);
    setDestroyed(false);
  }, [rendererRef]);

  return {
    phase: { charging, carrying, struck, fractured, resonant, responding },
    destroyed,
    exposedRef,
    chargeRef,
    contactsRef,
    strikesRef,
    isHolding: () => gestureRef.current.active,
    beginHold,
    trackHold,
    endHold,
    nudge,
    beginFrame,
    endFrame,
    reset,
  };
};
