// UI connector: the required setup screen. Starts a setup once (a reload gets
// the same pending secret back), confirms the first code, and keeps the screen
// up while the backup codes are shown; "I saved them" lets the app open.

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useTotpSetup } from '../hooks/useTotpSetup.js';
import { useCopy } from '../hooks/useCopy.js';
import { enrollStage, backupCodesText } from '../ui/two-factor.js';
import EnrollView from '../ui/EnrollView.jsx';

export default function Enroll() {
  const { holdEnrollment, logout } = useAuth();
  const totp = useTotpSetup();
  const copy = useCopy();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { backupCodes, token, user } after confirm
  const started = useRef(false);

  const begin = async () => {
    setError('');
    try {
      await totp.start();
    } catch (err) {
      setError(err.message || 'Could not start the setup');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError('');
    // Held before the new session is adopted, so the codes stay on screen.
    holdEnrollment(true);
    try {
      setResult(await totp.confirm());
    } catch (err) {
      holdEnrollment(false);
      setError(err.message || 'Could not confirm the code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <EnrollView
      stage={enrollStage({ setup: totp.setup, backupCodes: result?.backupCodes, error })}
      error={error}
      setup={{
        qrDataUrl: totp.qrDataUrl,
        secret: totp.setup?.secret ?? '',
        otpauthUrl: totp.setup?.otpauthUrl,
        code: totp.code,
        error,
        busy,
        onCode: totp.setCode,
        onSubmit: confirm,
      }}
      backup={{
        codes: result?.backupCodes ?? [],
        copied: copy.copied,
        copyError: copy.error,
        onCopy: () => copy.copy(backupCodesText(result.backupCodes)),
        onDone: () => holdEnrollment(false),
      }}
      onRetry={begin}
      onLogout={logout}
    />
  );
}
