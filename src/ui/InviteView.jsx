// UI: the account invite page. While the invite is checked, a wait line; a
// valid invite shows the create-account form and the Google button; an invalid
// one says so. Slot: `loginLink` (a link to the login page).
// state: 'checking' | 'valid' | 'invalid' (invitePageState in ./invites.js).

export default function InviteView({ state, form, showGoogle, googleButtonRef, loginLink, onField, onSubmit }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">Food Diary</h1>
        <p className="login-tagline">First Bite</p>

        {state === 'checking' && <div className="loading">Checking your invite...</div>}

        {state === 'invalid' && (
          <>
            <div className="error-message">
              This account invite link does not work. It may be used, revoked or expired. Ask the owner for a new one.
            </div>
            <p className="login-register-link">{loginLink}</p>
          </>
        )}

        {state === 'valid' && (
          <>
            <p className="login-register-link">You are invited. Create your account.</p>
            {form.error && <div className="error-message">{form.error}</div>}

            <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="login-form">
              <div className="form-group">
                <label htmlFor="reg-name">Name</label>
                <input id="reg-name" type="text" value={form.name} onChange={(e) => onField('name', e.target.value)} required placeholder="Your name" autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="reg-email">Email</label>
                <input id="reg-email" type="email" value={form.email} onChange={(e) => onField('email', e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="form-group">
                <label htmlFor="reg-password">Password</label>
                <input id="reg-password" type="password" value={form.password} onChange={(e) => onField('password', e.target.value)} required placeholder="Choose a password" />
              </div>
              <div className="form-group">
                <label htmlFor="reg-confirm">Confirm Password</label>
                <input id="reg-confirm" type="password" value={form.confirm} onChange={(e) => onField('confirm', e.target.value)} required placeholder="Confirm your password" />
              </div>
              <button type="submit" className="btn-primary" disabled={form.loading}>
                {form.loading ? 'Creating...' : 'Create Account'}
              </button>
            </form>

            {showGoogle && (
              <>
                <div className="login-divider">
                  <span>or</span>
                </div>
                <div ref={googleButtonRef} className="google-btn-container" />
              </>
            )}

            <p className="login-register-link">Already have an account? {loginLink}</p>
          </>
        )}
      </div>
    </div>
  );
}
