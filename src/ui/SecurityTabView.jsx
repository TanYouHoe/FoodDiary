// UI: the Security tab of the settings popup. Factor status, replace or set up
// the authenticator, new backup codes, sign out everywhere, and for the owner
// the user list with a two-factor reset per other user.
// state: toSecurityState; mode: SECURITY_MODES; userRows: toUserRows (./two-factor.js).
// setup: TotpSetupPanel props. backup: BackupCodesPanel props.

import TotpSetupPanel from './TotpSetupPanel.jsx';
import BackupCodesPanel from './BackupCodesPanel.jsx';
import { SECURITY_MODES, currentCodePrompt } from './two-factor.js';

export default function SecurityTabView({
  state, mode, currentCode, error, busy, setup, backup, showUsers, userRows, usersLoading, confirmResetId,
  onReplace, onRegenerate, onCurrentCode, onSubmitCurrentCode, onCancel, onLogoutAll, onAskReset, onCancelReset, onReset,
}) {
  const prompt = currentCodePrompt(mode);
  return (
    <>
      {error && mode !== SECURITY_MODES.setup && <div className="error-message">{error}</div>}

      <div className="settings-group">
        <div className="settings-group-header">
          <span className="settings-group-label">Two-factor sign-in</span>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-name">Authenticator app</span>
              <span className="settings-item-desc">{state.status}</span>
            </div>
            {mode === SECURITY_MODES.idle && (
              <div className="settings-item-actions">
                <button type="button" className="btn-secondary btn-sm" onClick={onReplace} disabled={busy}>{state.replaceLabel}</button>
                {state.canRegenerate && (
                  <button type="button" className="btn-secondary btn-sm" onClick={onRegenerate} disabled={busy}>New backup codes</button>
                )}
              </div>
            )}
          </div>
        </div>

        {prompt && (
          <form onSubmit={(e) => { e.preventDefault(); onSubmitCurrentCode(); }} className="login-form">
            <div className="form-group">
              <label htmlFor="security-current-code">{prompt}</label>
              <input
                id="security-current-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                value={currentCode} onChange={(e) => onCurrentCode(e.target.value)} required placeholder="123456" autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Checking...' : 'Continue'}</button>
            </div>
          </form>
        )}

        {mode === SECURITY_MODES.setup && <TotpSetupPanel {...setup} onCancel={onCancel} />}
        {mode === SECURITY_MODES.codes && <BackupCodesPanel {...backup} />}
      </div>

      <div className="settings-separator" />

      <div className="settings-group">
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-name">Sign out everywhere</span>
              <span className="settings-item-desc">Ends every session on every device, this one included.</span>
            </div>
            <div className="settings-item-actions">
              <button type="button" className="btn-danger btn-sm" onClick={onLogoutAll} disabled={busy}>Sign out everywhere</button>
            </div>
          </div>
        </div>
      </div>

      {showUsers && (
        <>
          <div className="settings-separator" />
          <div className="settings-group">
            <div className="settings-group-header">
              <span className="settings-group-label">Users</span>
            </div>
            {usersLoading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="settings-list">
                {userRows.map(row => (
                  <div key={row.id} className="settings-item">
                    <div className="settings-item-info">
                      <span className="settings-item-name">{row.name}</span>
                      <span className="settings-item-desc">{row.email} · Two-factor: {row.twoFactor}</span>
                    </div>
                    {row.canReset && (
                      <div className="settings-item-actions">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => onAskReset(row.id)}>Reset two-factor</button>
                      </div>
                    )}
                    {confirmResetId === row.id && row.canReset && (
                      <div className="settings-item-confirm">
                        <span>Reset? {row.name} must set up an authenticator again, and every session of theirs ends.</span>
                        <button type="button" className="btn-secondary btn-sm" onClick={onCancelReset}>No</button>
                        <button type="button" className="btn-danger btn-sm" onClick={() => onReset(row.id)}>Yes</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
