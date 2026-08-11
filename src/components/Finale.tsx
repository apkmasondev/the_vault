interface FinaleProps {
  readonly contacts: number;
  readonly strikes: number;
  readonly resonant: boolean;
  readonly destroyed: boolean;
  readonly onAbout: () => void;
  readonly onReplay: () => void;
}

/**
 * Destroying the object outranks everything else that could have happened to
 * it: there is nothing left to have resonated with or reached back.
 */
const lead = ({ contacts, resonant, destroyed }: FinaleProps): string => {
  if (destroyed) {
    return 'You broke it against the walls until there was nothing left to break. Whatever had been sealed in here for all those years did not survive the afternoon it was found.';
  }
  if (resonant) {
    return 'You held it until it answered. Whatever came back through the breach was not a containment failure — it was a reply.';
  }
  return contacts > 0
    ? 'You reached in, and it reached back. The chamber gave way a few seconds later.'
    : 'You never touched it. The chamber gave way anyway, in its own time.';
};

export const Finale = (props: FinaleProps) => {
  const { contacts, strikes, resonant, destroyed, onAbout, onReplay } = props;

  return (
    <div className={`finale${destroyed ? ' finale--destroyed' : ''}`}>
      <p className="eyebrow">SESSION ARCHIVE // V-07</p>
      <h2>{destroyed ? 'NOTHING TO REPORT' : 'THE VAULT'}</h2>
      <p className="finale__lead">{lead(props)}</p>
      <dl className="finale__record">
        <div><dt>OBJECT</dt><dd>{destroyed ? 'DESTROYED' : 'UNCLASSIFIED'}</dd></div>
        <div>
          <dt>ORIGIN</dt>
          <dd>{destroyed ? 'UNRECOVERABLE' : resonant ? 'RESPONDING' : 'UNRESOLVED'}</dd>
        </div>
        <div><dt>CONTACTS</dt><dd>{String(contacts).padStart(2, '0')}</dd></div>
        <div><dt>IMPACTS</dt><dd>{String(strikes).padStart(2, '0')}</dd></div>
        <div className="finale__record-event">
          <dt>EVENT</dt>
          <dd>{destroyed ? 'SPECIMEN LOST' : resonant ? 'RESONANCE LOGGED' : 'BREACH RECORDED'}</dd>
        </div>
      </dl>
      {destroyed && (
        <p className="finale__note">
          It cannot be put back. Run the sequence again and it will be whole, and you can decide
          differently.
        </p>
      )}
      <div className="finale__actions">
        <button type="button" className="outline-button" onClick={onReplay}>REPLAY SEQUENCE</button>
        <button type="button" className="outline-button" onClick={onAbout}>HOW THIS WORKS</button>
        <a href="https://apkmason.dev" target="_blank" rel="noreferrer">VISIT APKMASON.DEV</a>
      </div>
    </div>
  );
};
