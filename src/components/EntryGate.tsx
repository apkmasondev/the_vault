import { useEffect, useRef, useState } from 'react';

const HOLD_DURATION_MS = 900;

interface EntryGateProps {
  readonly ready: boolean;
  readonly loadProgress: number;
  readonly defaultSound: boolean;
  readonly onGesture: () => void;
  readonly onAuthorize: (soundEnabled: boolean) => void;
}

export const EntryGate = ({
  ready,
  loadProgress,
  defaultSound,
  onGesture,
  onAuthorize,
}: EntryGateProps) => {
  const [holding, setHolding] = useState(false);
  const [granted, setGranted] = useState(false);
  const timerRef = useRef<number | null>(null);

  const cancelHold = (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setHolding(false);
  };

  const grant = (soundEnabled: boolean): void => {
    cancelHold();
    setGranted(true);
    onAuthorize(soundEnabled);
  };

  const startHold = (): void => {
    if (!ready || granted || timerRef.current !== null) return;
    onGesture();
    setHolding(true);
    timerRef.current = window.setTimeout(() => grant(defaultSound), HOLD_DURATION_MS);
  };

  useEffect(() => cancelHold, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    startHold();
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!granted) cancelHold();
  };

  return (
    <div className={`entry-gate${granted ? ' is-granted' : ''}`} aria-live="polite">
      <div className="entry-gate__frame" aria-hidden="true" />
      <div className="entry-gate__heading">
        <p className="eyebrow">Containment system V-07</p>
        <h1>THE VAULT</h1>
      </div>

      {!ready ? (
        <div className="loader" role="status">
          <span className="loader__line" aria-hidden="true">
            <span style={{ transform: `scaleX(${loadProgress / 100})` }} />
          </span>
          <span>INITIALIZING CONTAINMENT SYSTEM</span>
          <span className="loader__value">{String(loadProgress).padStart(2, '0')}%</span>
        </div>
      ) : (
        <div className="authorization">
          <button
            className={`hold-control${holding ? ' is-holding' : ''}`}
            type="button"
            disabled={granted}
            aria-label="Hold to authorize access"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startHold();
            }}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onLostPointerCapture={cancelHold}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
          >
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="hold-control__track" cx="60" cy="60" r="54" />
              <circle className="hold-control__progress" cx="60" cy="60" r="54" />
            </svg>
            <span className="hold-control__core" />
          </button>
          <p className="authorization__label">
            {granted ? 'ACCESS GRANTED' : holding ? 'AUTHORIZING' : 'HOLD TO AUTHORIZE'}
          </p>
          {!granted && (
            <button className="text-button" type="button" onClick={() => grant(false)}>
              ENTER MUTED
            </button>
          )}
        </div>
      )}
    </div>
  );
};
