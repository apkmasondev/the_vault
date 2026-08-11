interface FinaleProps {
  readonly contacts: number;
  readonly strikes: number;
  readonly resonant: boolean;
  readonly destroyed: boolean;
  /** Reduced-motion observation mode never offers direct specimen contact. */
  readonly observationOnly?: boolean;
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

export const operatorTrace = ({
  contacts,
  strikes,
  resonant,
  destroyed,
  observationOnly,
}: Pick<FinaleProps, 'contacts' | 'strikes' | 'resonant' | 'destroyed' | 'observationOnly'>): string => {
  if (observationOnly) return 'OBSERVATION MODE — NO CONTACT REQUESTED';
  if (destroyed) return 'OPERATOR CAUSED TOTAL SPECIMEN LOSS';
  if (resonant) return 'SPECIMEN ACKNOWLEDGED OPERATOR';
  if (strikes >= 3) return 'REPEATED FORCE RECORDED';
  if (strikes > 0) return 'FORCE APPLIED TO SPECIMEN';
  if (contacts > 0) return 'DIRECT CONTACT CONFIRMED';
  return 'OPERATOR REFUSED CONTACT';
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
      <p className="finale__operator">
        <span>OPERATOR TRACE //</span>
        {operatorTrace(props)}
      </p>
      {destroyed && (
        <p className="finale__note">
          It cannot be put back. Run the sequence again and it will be whole, and you can decide
          differently.
        </p>
      )}
      <div className="finale__actions">
        <button type="button" className="archive-action archive-action--primary" onClick={onReplay}>
          <span className="archive-action__index" aria-hidden="true">01 // RESET</span>
          <span className="archive-action__label">REPLAY SEQUENCE</span>
          <span className="archive-action__mark" aria-hidden="true">↺</span>
        </button>
        <button type="button" className="archive-action" onClick={onAbout}>
          <span className="archive-action__index" aria-hidden="true">02 // DOSSIER</span>
          <span className="archive-action__label">OPEN CASE FILE</span>
          <span className="archive-action__mark" aria-hidden="true">→</span>
        </button>
        <a className="archive-link" href="https://apkmason.dev" target="_blank" rel="noreferrer">
          <span className="archive-link__index" aria-hidden="true">EXTERNAL //</span>
          <span>APKMASON.DEV</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
};
