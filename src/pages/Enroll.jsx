// UI connector: the required setup screen. Starts a setup once, confirms the
// first code, shows the backup codes, and adopts the new session on "I saved them".

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useTotpSetup } from '../hooks/useTotpSetup.js';
import { useCopy } from '../hooks/useCopy.js';
import { enrollStage, backupCodesText } from '../ui/two-factor.js';
import EnrollView from '../ui/EnrollView.jsx';

export default function Enroll() {
  const { signIn, logout } = useAuth();
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

  // One setup per visit: a second request would replace the secret on screen.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await totp.confirm());
    } catch (err) {
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
        onDone: () => signIn(result),
      }}
      onRetry={begin}
      onLogout={logout}
    />
  );
}
