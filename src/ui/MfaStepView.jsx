// UI: the code step of the login card, after a correct password or Google
// sign-in on an account with an authenticator app. A 6-digit code, or a backup code.
// form: { useBackup, code, backupCode, error, loading }.

export default function MfaStepView({ form, onField, onToggleBackup, onSubmit, onCancel }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">Food Diary</h1>
        <p className="login-tagline">First Bite</p>

        <p className="login-register-link">
          {form.useBackup ? 'Enter one of your backup codes.' : 'Enter the 6-digit code from your authenticator app.'}
        </p>
        {form.error && <div className="error-message">{form.error}</div>}

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="login-form">
          {form.useBackup ? (
            <div className="form-group">
              <label htmlFor="mfa-backup">Backup code</label>
              <input
                id="mfa-backup" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
                value={form.backupCode} onChange={(e) => onField('backupCode', e.target.value)}
                required placeholder="xxxx-xxxx" autoFocus
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="mfa-code">Code</label>
              <input
                id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                value={form.code} onChange={(e) => onField('code', e.target.value)}
                required placeholder="123456" autoFocus
              />
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={form.loading}>
            {form.loading ? 'Checking...' : 'Verify'}
          </button>
        </form>

        <p className="login-register-link">
          <button type="button" className="link-btn" onClick={onToggleBackup}>
            {form.useBackup ? 'Use the authenticator app' : 'Use a backup code'}
          </button>
        </p>
        <p className="login-register-link">
          <button type="button" className="link-btn" onClick={onCancel}>Back to sign in</button>
        </p>
      </div>
    </div>
  );
}
