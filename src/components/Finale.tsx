interface FinaleProps {
  readonly onReplay: () => void;
}

export const Finale = ({ onReplay }: FinaleProps) => (
  <div className="finale">
    <p className="eyebrow">SESSION ARCHIVE // V-07</p>
    <h2>THE VAULT</h2>
    <p className="finale__lead">
      Direct contact amplified the signal. Containment failed at three percent stability.
    </p>
    <dl className="finale__record">
      <div><dt>OBJECT</dt><dd>UNCLASSIFIED</dd></div>
      <div><dt>ORIGIN</dt><dd>UNRESOLVED</dd></div>
      <div><dt>EVENT</dt><dd>BREACH RECORDED</dd></div>
    </dl>
    <div className="finale__actions">
      <button type="button" className="outline-button" onClick={onReplay}>REPLAY SEQUENCE</button>
      <a href="https://apkmason.dev" target="_blank" rel="noreferrer">VISIT APKMASON.DEV</a>
    </div>
  </div>
);
