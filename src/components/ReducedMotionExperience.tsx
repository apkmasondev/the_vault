import { useEffect, useRef, useState } from 'react';
import { asset, MEDIA } from '../app/constants';
import { AudioToggle } from './AudioToggle';
import { Finale } from './Finale';

interface ReducedMotionExperienceProps {
  readonly authorized: boolean;
  readonly soundEnabled: boolean;
  readonly onLoadProgress: (progress: number) => void;
  readonly onToggleSound: () => void;
  readonly onOpenAbout: () => void;
  readonly onReplay: () => void;
}

const reducedCopy = [
  ['MECHANICAL LOCK', 'SEQUENCE READY'],
  ['CONTAINMENT RELEASED', 'DO NOT OPEN.'],
  ['OBJECT: UNKNOWN', 'NO MATCH ON RECORD'],
  ['IT IS AWAKE', 'CONTAINMENT FAILURE'],
  ['THE VAULT', 'AN INTERACTIVE WEBGL EXPERIMENT'],
] as const;

export const ReducedMotionExperience = ({
  authorized,
  soundEnabled,
  onLoadProgress,
  onToggleSound,
  onOpenAbout,
  onReplay,
}: ReducedMotionExperienceProps) => {
  const [step, setStep] = useState(0);
  const posterRef = useRef<HTMLImageElement>(null);
  const [primary, secondary] = reducedCopy[step]!;
  const final = step === reducedCopy.length - 1;

  // A cached poster can finish loading before React attaches onLoad, so the
  // ready state is also confirmed from the element itself on mount.
  useEffect(() => {
    if (posterRef.current?.complete) onLoadProgress(100);
  }, [onLoadProgress]);

  const replay = (): void => {
    setStep(0);
    onReplay();
  };

  return (
    <main className={`reduced-experience reduced-experience--step-${step}`}>
      <img
        ref={posterRef}
        className="reduced-experience__image reduced-experience__image--closed"
        src={asset(MEDIA.poster)}
        alt="A sealed industrial containment vault"
        draggable={false}
        fetchPriority="high"
        onLoad={() => onLoadProgress(100)}
        onError={() => onLoadProgress(100)}
      />
      <img
        className="reduced-experience__image reduced-experience__image--open"
        src={asset(MEDIA.transition)}
        alt="The open containment vault filled with light and fog"
        draggable={false}
      />
      {step >= 2 && step < 4 && <div className="artifact-fallback" aria-hidden="true" />}
      {authorized && (
        <>
          {!final && (
            <div className="hud__controls">
              <button className="hud__button" type="button" onClick={onOpenAbout}>ABOUT</button>
              <AudioToggle enabled={soundEnabled} onToggle={onToggleSound} />
            </div>
          )}
          {final ? (
            <Finale
              contacts={0}
              strikes={0}
              resonant={false}
              destroyed={false}
              onAbout={onOpenAbout}
              onReplay={replay}
            />
          ) : (
            <>
              <div className="reduced-experience__copy" aria-live="polite">
                <p>{primary}</p>
                <span>{secondary}</span>
              </div>
              <button
                className="outline-button reduced-experience__action"
                type="button"
                onClick={() => setStep((current) => Math.min(current + 1, reducedCopy.length - 1))}
              >
                CONTINUE SEQUENCE
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
};
