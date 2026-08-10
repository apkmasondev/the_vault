interface FinaleProps {
  readonly contacts: number;
  readonly resonant: boolean;
  readonly onAbout: () => void;
  readonly onReplay: () => void;
}

const lead = (contacts: number, resonant: boolean): string => {
  if (resonant) {
    return 'You held it until it answered. Whatever came back through the breach was not a containment failure — it was a reply.';
  }
  return contacts > 0
    ? 'You reached in, and it reached back. The chamber gave way a few seconds later.'
    : 'You never touched it. The chamber gave way anyway, in its own time.';
};

export const Finale = ({ contacts, resonant, onAbout, onReplay }: FinaleProps) => (
  <div className="finale">
    <p className="eyebrow">SESSION ARCHIVE // V-07</p>
    <h2>THE VAULT</h2>
    <p className="finale__lead">{lead(contacts, resonant)}</p>
    <dl className="finale__record">
      <div><dt>OBJECT</dt><dd>UNCLASSIFIED</dd></div>
      <div><dt>ORIGIN</dt><dd>{resonant ? 'RESPONDING' : 'UNRESOLVED'}</dd></div>
      <div><dt>CONTACTS</dt><dd>{String(contacts).padStart(2, '0')}</dd></div>
      <div><dt>EVENT</dt><dd>{resonant ? 'RESONANCE LOGGED' : 'BREACH RECORDED'}</dd></div>
    </dl>
    <div className="finale__actions">
      <button type="button" className="outline-button" onClick={onReplay}>REPLAY SEQUENCE</button>
      <button type="button" className="outline-button" onClick={onAbout}>HOW THIS WORKS</button>
      <a href="https://apkmason.dev" target="_blank" rel="noreferrer">VISIT APKMASON.DEV</a>
    </div>
  </div>
);
