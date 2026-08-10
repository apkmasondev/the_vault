interface FinaleProps {
  readonly contacts: number;
  readonly onAbout: () => void;
  readonly onReplay: () => void;
}

export const Finale = ({ contacts, onAbout, onReplay }: FinaleProps) => (
  <div className="finale">
    <p className="eyebrow">SESSION ARCHIVE // V-07</p>
    <h2>THE VAULT</h2>
    <p className="finale__lead">
      {contacts > 0
        ? 'Direct contact amplified the signal. Containment failed at three percent stability.'
        : 'The object was never touched. Containment failed at three percent stability regardless.'}
    </p>
    <dl className="finale__record">
      <div><dt>OBJECT</dt><dd>UNCLASSIFIED</dd></div>
      <div><dt>ORIGIN</dt><dd>UNRESOLVED</dd></div>
      <div><dt>CONTACTS</dt><dd>{String(contacts).padStart(2, '0')}</dd></div>
      <div><dt>EVENT</dt><dd>BREACH RECORDED</dd></div>
    </dl>
    <div className="finale__actions">
      <button type="button" className="outline-button" onClick={onReplay}>REPLAY SEQUENCE</button>
      <button type="button" className="outline-button" onClick={onAbout}>HOW THIS WORKS</button>
      <a href="https://apkmason.dev" target="_blank" rel="noreferrer">VISIT APKMASON.DEV</a>
    </div>
  </div>
);
