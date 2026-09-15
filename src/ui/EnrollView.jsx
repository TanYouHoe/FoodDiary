// UI: the required setup screen, shown instead of the app until the account
// has an authenticator app. stage: enrollStage (./two-factor.js).
// setup: TotpSetupPanel props. backup: BackupCodesPanel props.

import TotpSetupPanel from './TotpSetupPanel.jsx';
import BackupCodesPanel from './BackupCodesPanel.jsx';

export default function EnrollView({ stage, error, setup, backup, onRetry, onLogout }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">Food Diary</h1>
        <p className="login-tagline">Set up two-factor sign-in</p>

        {stage === 'loading' && <div className="loading">Preparing your setup key...</div>}

        {stage === 'error' && (
          <>
            <div className="error-message">{error}</div>
            <button type="button" className="btn-primary" onClick={onRetry}>Try again</button>
          </>
        )}

        {stage === 'scan' && (
          <>
            <p className="login-register-link">
              This account needs an authenticator app. Sign-in will ask for a code from it.
            </p>
            <TotpSetupPanel {...setup} />
          </>
        )}

        {stage === 'codes' && <BackupCodesPanel {...backup} />}

        <p className="login-register-link">
          <button type="button" className="link-btn" onClick={onLogout}>Log out</button>
        </p>
      </div>
    </div>
  );
}
