// UI: the backup codes, shown once after they are made, with copy and continue.

export default function BackupCodesPanel({ codes, copied, copyError, onCopy, onDone }) {
  return (
    <div className="backup-codes-panel">
      <p className="totp-help">
        Save these backup codes somewhere safe. Each code works once, if you lose your phone. They are shown only now.
      </p>
      <ul className="backup-codes">
        {codes.map(code => <li key={code}><code>{code}</code></li>)}
      </ul>
      {copyError && <div className="error-message">{copyError}</div>}
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onCopy}>{copied ? 'Copied!' : 'Copy'}</button>
        <button type="button" className="btn-primary" onClick={onDone}>I saved them</button>
      </div>
    </div>
  );
}
