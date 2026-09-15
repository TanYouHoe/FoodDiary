// UI: the login card. Sign-up is by invite only, so the card offers no sign-up.

export default function LoginView({ login, showGoogle, googleButtonRef, onLoginField, onLogin }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">Food Diary</h1>
        <p className="login-tagline">First Bite</p>

        {login.error && <div className="error-message">{login.error}</div>}

        <form onSubmit={(e) => { e.preventDefault(); onLogin(); }} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={login.email}
              onChange={(e) => onLoginField('email', e.target.value)}
              required
              placeholder="Username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={login.password}
              onChange={(e) => onLoginField('password', e.target.value)}
              required
              placeholder="Password"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={login.loading}>
            {login.loading ? 'Please wait...' : 'Login'}
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

        <p className="login-register-link">
          Sign-up is by invite only. Ask the owner for an account invite link.
        </p>
      </div>
    </div>
  );
}
