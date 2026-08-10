import { useEffect, useRef } from 'react';
import { TIMELINE } from '../app/constants';
import type { TelemetryReader } from '../app/telemetry';
import { clamp } from '../utils/math';

interface Band {
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly kind: 'film' | 'webgl' | 'hold';
}

const BANDS: readonly Band[] = [
  { from: 0, to: TIMELINE.video1Start, label: 'SEALED', kind: 'hold' },
  { from: TIMELINE.video1Start, to: TIMELINE.video1End, label: 'UNLOCK FILM', kind: 'film' },
  { from: TIMELINE.video1End, to: TIMELINE.video2Start, label: 'WARNING', kind: 'hold' },
  { from: TIMELINE.video2Start, to: TIMELINE.video2End, label: 'OPENING FILM', kind: 'film' },
  { from: TIMELINE.video2End, to: TIMELINE.failureStart, label: 'LIVE WEBGL', kind: 'webgl' },
  { from: TIMELINE.failureStart, to: 1, label: 'BREACH', kind: 'hold' },
];

interface SequenceMapProps {
  readonly readTelemetry: TelemetryReader;
  readonly onSeek: (progress: number) => void;
}

/**
 * The timeline drawn as it actually runs: which stretch is a seeked film, which
 * is rendered live, and where the playhead sits at this instant. Dragging it
 * scrubs the sequence running behind the panel.
 */
export const SequenceMap = ({ readTelemetry, onSeek }: SequenceMapProps) => {
  const headRef = useRef<SVGGElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      const track = trackRef.current;
      const progress = clamp(readTelemetry().progress);
      headRef.current?.setAttribute('transform', `translate(${progress * 100} 0)`);
      track?.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [readTelemetry]);

  const seekFromClientX = (clientX: number): void => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    onSeek(clamp((clientX - bounds.left) / bounds.width));
  };

  return (
    <div className="sequence-map">
      <div
        className="sequence-map__track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Sequence position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) seekFromClientX(event.clientX);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        onKeyDown={(event) => {
          const step = event.key === 'ArrowRight' ? 0.05 : event.key === 'ArrowLeft' ? -0.05 : 0;
          if (step === 0) return;
          event.preventDefault();
          onSeek(clamp(readTelemetry().progress + step));
        }}
      >
        <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
          {BANDS.map((band) => (
            <rect
              key={band.label}
              className={`sequence-map__band sequence-map__band--${band.kind}`}
              x={band.from * 100}
              y={0}
              width={(band.to - band.from) * 100}
              height={12}
            />
          ))}
          <g ref={headRef} className="sequence-map__head">
            <rect x={-0.3} y={-2.5} width={0.6} height={17} />
          </g>
        </svg>
      </div>

      <ul className="sequence-map__legend">
        {BANDS.map((band) => (
          <li key={band.label} className={`sequence-map__key sequence-map__key--${band.kind}`}>
            <span aria-hidden="true" />
            {band.label}
            <em>{Math.round(band.from * 100)}–{Math.round(band.to * 100)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
};
