// UI: binding an authenticator app. The QR code, the setup key in blocks, an
// otpauth:// link, and the field for the first code. Shared by the setup screen
// and the Security tab. qrDataUrl: an image data URL, or null while it is made.

import { groupSecret } from '../../logic/totp.js';

export default function TotpSetupPanel({ qrDataUrl, secret, otpauthUrl, code, error, busy, onCode, onSubmit, onCancel }) {
  return (
    <div className="totp-setup">
      <p className="totp-help">Scan the QR code with your authenticator app (Google Authenticator, Aegis, 1Password).</p>
      <div className="totp-qr">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="QR code for your authenticator app" width="200" height="200" />
          : <div className="loading">Making the QR code...</div>}
      </div>
      <p className="totp-help">Or enter this setup key:</p>
      <code className="totp-key">{groupSecret(secret)}</code>
      <a className="link-btn totp-open" href={otpauthUrl}>Open in authenticator app</a>

      {error && <div className="error-message">{error}</div>}
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="login-form">
        <div className="form-group">
          <label htmlFor="totp-confirm">Code from the app</label>
          <input
            id="totp-confirm" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
            value={code} onChange={(e) => onCode(e.target.value)} required placeholder="123456"
          />
        </div>
        <div className="modal-actions">
          {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Checking...' : 'Confirm'}</button>
        </div>
      </form>
    </div>
  );
}
