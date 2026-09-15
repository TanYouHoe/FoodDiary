// UI: the login card and the create-account dialog.

export default function LoginView({
  login, register, showGoogle, googleButtonRef,
  onLoginField, onLogin, onOpenRegister, onCloseRegister, onRegisterField, onRegister,
}) {
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
          Don't have an account?{' '}
          <button type="button" className="link-btn" onClick={onOpenRegister}>
            Create one
          </button>
        </p>
      </div>

      {register.open && (
        <div className="modal-overlay" onClick={onCloseRegister}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Account</h3>
              <button className="modal-close" onClick={onCloseRegister}>&times;</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); onRegister(); }}>
              {register.error && <div className="error-message">{register.error}</div>}
              <div className="form-group">
                <label htmlFor="reg-name">Name</label>
                <input
                  id="reg-name"
                  type="text"
                  value={register.name}
                  onChange={(e) => onRegisterField('name', e.target.value)}
                  required
                  placeholder="Your name"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  value={register.email}
                  onChange={(e) => onRegisterField('email', e.target.value)}
                  required
                  placeholder="you@example.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  value={register.password}
                  onChange={(e) => onRegisterField('password', e.target.value)}
                  required
                  placeholder="Choose a password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-confirm">Confirm Password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  value={register.confirm}
                  onChange={(e) => onRegisterField('confirm', e.target.value)}
                  required
                  placeholder="Confirm your password"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onCloseRegister}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={register.loading}>
                  {register.loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
