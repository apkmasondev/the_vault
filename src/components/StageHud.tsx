import type { RefObject } from 'react';
import type { TimelineCue } from '../utils/timeline';
import { AudioToggle } from './AudioToggle';

interface StageHudProps {
  readonly cue: TimelineCue;
  readonly soundEnabled: boolean;
  readonly cinematicRunning: boolean;
  /** Integrity is only meaningful while there is an object to damage. */
  readonly showIntegrity: boolean;
  readonly destroyed: boolean;
  readonly progressRef: RefObject<HTMLSpanElement | null>;
  readonly integrityRef: RefObject<HTMLSpanElement | null>;
  readonly onToggleCinematic: () => void;
  readonly onOpenAbout: () => void;
  readonly onToggleSound: () => void;
}

const systemStatus = (cue: TimelineCue): string => {
  if (cue === 'failure') return 'CRITICAL';
  if (cue === 'collapse') return 'NO SIGNAL';
  return 'MONITORING';
};

/**
 * The instrument frame around the chamber. The two figures that change every
 * frame — progress and integrity — are written straight into their nodes by the
 * animation loop through these refs, rather than through React state.
 */
export const StageHud = ({
  cue,
  soundEnabled,
  cinematicRunning,
  showIntegrity,
  destroyed,
  progressRef,
  integrityRef,
  onToggleCinematic,
  onOpenAbout,
  onToggleSound,
}: StageHudProps) => (
  <div className="hud">
    <div className="hud__identity"><span>V-07</span><span>CONTAINMENT</span></div>
    <div className="hud__status">
      <span>SYSTEM</span>
      <span>{systemStatus(cue)}</span>
    </div>
    {/* Damage is permanent, so it has to be legible before it matters. Without
        this the object simply explodes for no visible reason. */}
    {showIntegrity && (
      <div className={`hud__integrity${destroyed ? ' is-lost' : ''}`}>
        <span>INTEGRITY</span>
        <span ref={integrityRef}>100%</span>
      </div>
    )}
    <div className="hud__progress"><span ref={progressRef}>000</span><span>/ 100</span></div>
    <div className="hud__controls">
      <button
        className="hud__button"
        type="button"
        aria-pressed={cinematicRunning}
        onClick={onToggleCinematic}
      >
        {cinematicRunning ? 'STOP' : 'AUTO'}
      </button>
      <button className="hud__button" type="button" onClick={onOpenAbout}>
        ABOUT
      </button>
      <AudioToggle enabled={soundEnabled} onToggle={onToggleSound} />
    </div>
  </div>
);
