import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Keys that shove the object, so the physics is reachable without a pointer. */
const NUDGE_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface ArtifactPhase {
  readonly charging: boolean;
  readonly carrying: boolean;
  readonly struck: boolean;
  readonly fractured: boolean;
  readonly resonant: boolean;
  readonly responding: boolean;
}

interface ArtifactSurfaceProps {
  readonly phase: ArtifactPhase;
  readonly onHoldStart: (clientX: number, clientY: number) => void;
  readonly onHoldMove: (clientX: number, clientY: number) => void;
  readonly onHoldEnd: () => void;
  readonly onHoldCancel: () => void;
  readonly onNudge: (directionX: number, directionY: number) => void;
  /** True while a hold is in progress, so a key repeat cannot start a second. */
  readonly isHolding: () => boolean;
  readonly inspecting: boolean;
  readonly onToggleInspection: () => void;
}

/**
 * What the object says about itself, in the order that matters: the rarest and
 * most recent event wins, so a breach is never buried under a standing hint.
 */
const promptFor = ({ fractured, struck, carrying, resonant, charging, responding }: ArtifactPhase): string => {
  if (fractured) return 'STRUCTURE BREACHED · IT IS CLOSING ITSELF';
  if (struck) return 'IMPACT ON CONTAINMENT WALL · SURFACE GLOWING';
  if (carrying) return 'THE OBJECT FOLLOWS YOU · THROW IT AT THE WALL';
  if (resonant) return 'RESONANCE SUSTAINED · SIGNAL DECODED';
  if (charging) return 'CHARGING — RELEASE TO DISCHARGE';
  if (responding) return 'CONTACT REGISTERED · RESONANCE AMPLIFIED';
  return 'HOLD IT STILL TO CHARGE · DRAG TO CARRY';
};

/** The invisible target over the object, and the line of text beneath it. */
export const ArtifactSurface = ({
  phase,
  onHoldStart,
  onHoldMove,
  onHoldEnd,
  onHoldCancel,
  onNudge,
  isHolding,
  inspecting,
  onToggleInspection,
}: ArtifactSurfaceProps) => {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const nudge = NUDGE_KEYS[event.key];
    if (nudge) {
      // Held down, the repeats stack into a throw, which is the only way to
      // reach the wall without a pointer.
      event.preventDefault();
      onNudge(nudge[0], nudge[1]);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!isHolding()) onHoldStart(0, 0);
  };

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onHoldEnd();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || isHolding()) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onHoldStart(event.clientX, event.clientY);
  };

  const responding = phase.responding || phase.struck;

  return (
    <>
      <button
        className={`artifact-hit-target${phase.charging ? ' is-charging' : ''}${phase.carrying ? ' is-carrying' : ''}`}
        type="button"
        aria-label="The object. Hold to charge it, drag to carry it, or use the arrow keys to push it against the walls of the chamber."
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => onHoldMove(event.clientX, event.clientY)}
        onPointerUp={onHoldEnd}
        onPointerCancel={onHoldCancel}
        onLostPointerCapture={onHoldCancel}
        onBlur={onHoldCancel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      />
      <div className="artifact-instruments">
        <span className="artifact-instruments__label">V–07 / FIELD CONTROL</span>
        <button className="artifact-inspect" type="button" aria-pressed={inspecting} onClick={onToggleInspection}>
          <span className="artifact-inspect__icon" aria-hidden="true">{inspecting ? '−' : '+'}</span>
          {inspecting ? 'SEAL THE CORE' : 'EXPOSE THE CORE'}
          <span className="artifact-inspect__state" aria-hidden="true">{inspecting ? 'OPEN' : 'SEALED'}</span>
        </button>
        <span className="artifact-instruments__reading" role="status">
          {inspecting ? 'SHELL DISPLACED · INTERNAL SIGNAL ACTIVE' : '20 SEGMENTS · UNKNOWN ALLOY'}
        </span>
      </div>
      <p className={`artifact-guidance${responding ? ' is-responding' : ''}${phase.charging ? ' is-charging' : ''}`}>
        {promptFor(phase)}
      </p>
    </>
  );
};
