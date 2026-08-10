import { useState } from 'react';
import { asset, MEDIA } from '../app/constants';
import { AudioToggle } from './AudioToggle';

interface ReducedMotionExperienceProps {
  readonly authorized: boolean;
  readonly soundEnabled: boolean;
  readonly onLoadProgress: (progress: number) => void;
  readonly onToggleSound: () => void;
  readonly onReplay: () => void;
}

const reducedCopy = [
  ['MECHANICAL LOCK', 'SEQUENCE READY'],
  ['CONTAINMENT RELEASED', 'DO NOT OPEN.'],
  ['OBJECT: UNKNOWN', 'ORIGIN: UNKNOWN'],
  ['STABILITY: 03%', 'CONTAINMENT FAILURE'],
  ['THE VAULT', 'AN INTERACTIVE WEBGL EXPERIMENT'],
] as const;

export const ReducedMotionExperience = ({
  authorized,
  soundEnabled,
  onLoadProgress,
  onToggleSound,
  onReplay,
}: ReducedMotionExperienceProps) => {
  const [step, setStep] = useState(0);
  const [primary, secondary] = reducedCopy[step]!;
  const final = step === reducedCopy.length - 1;

  const replay = (): void => {
    setStep(0);
    onReplay();
  };

  return (
    <main className={`reduced-experience reduced-experience--step-${step}`}>
      <img
        className="reduced-experience__image reduced-experience__image--closed"
        src={asset(MEDIA.poster)}
        alt="A sealed industrial containment vault"
        fetchPriority="high"
        onLoad={() => onLoadProgress(100)}
      />
      <img
        className="reduced-experience__image reduced-experience__image--open"
        src={asset(MEDIA.transition)}
        alt="The open containment vault filled with light and fog"
      />
      {step >= 2 && step < 4 && <div className="artifact-fallback" aria-hidden="true" />}
      {authorized && (
        <>
          <AudioToggle enabled={soundEnabled} onToggle={onToggleSound} />
          <div className="reduced-experience__copy" aria-live="polite">
            <p>{primary}</p>
            <span>{secondary}</span>
          </div>
          <button
            className="outline-button reduced-experience__action"
            type="button"
            onClick={final ? replay : () => setStep((current) => Math.min(current + 1, reducedCopy.length - 1))}
          >
            {final ? 'REPLAY' : 'CONTINUE SEQUENCE'}
          </button>
        </>
      )}
    </main>
  );
};
