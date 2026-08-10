interface AudioToggleProps {
  readonly enabled: boolean;
  readonly onToggle: () => void;
}

export const AudioToggle = ({ enabled, onToggle }: AudioToggleProps) => (
  <button
    className="audio-toggle"
    type="button"
    aria-label={enabled ? 'Turn sound off' : 'Turn sound on'}
    aria-pressed={enabled}
    onClick={onToggle}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" />
      {enabled ? (
        <path className="audio-toggle__waves" d="M17 8.2c1 .9 1.5 2.2 1.5 3.8S18 14.9 17 15.8M19.5 5.8c1.8 1.6 2.8 3.7 2.8 6.2s-1 4.6-2.8 6.2" />
      ) : (
        <path d="m17.2 9.2 4.6 4.6m0-4.6-4.6 4.6" />
      )}
    </svg>
    <span>{enabled ? 'SOUND ON' : 'SOUND OFF'}</span>
  </button>
);
