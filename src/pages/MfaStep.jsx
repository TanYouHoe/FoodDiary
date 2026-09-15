// UI connector: the code step after a correct password or Google sign-in. The
// pending mfa token lives in AuthContext (memory only).

import { useState } from 'react';
import { useAuth } from '../AuthContext';
import MfaStepView from '../ui/MfaStepView.jsx';

export default function MfaStep() {
  const { verifyMfa, cancelMfa } = useAuth();
  const [form, setForm] = useState({ useBackup: false, code: '', backupCode: '', error: '', loading: false });

  const patch = (next) => setForm(f => ({ ...f, ...next }));

  const submit = async () => {
    patch({ error: '', loading: true });
    try {
      await verifyMfa(form.useBackup ? { backup_code: form.backupCode } : { code: form.code });
    } catch (err) {
      patch({ error: err.message || 'Verification failed', loading: false });
    }
  };

  return (
    <MfaStepView
      form={form}
      onField={(key, value) => patch({ [key]: value })}
      onToggleBackup={() => patch({ useBackup: !form.useBackup, error: '' })}
      onSubmit={submit}
      onCancel={cancelMfa}
    />
  );
}
