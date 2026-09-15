// UI connector: one authenticator setup. Asks the server for a secret, draws
// its QR code, holds the confirm-code field, confirms and cancels. Each call
// throws on failure; the caller shows the error.

import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useQrCode } from './useQrCode.js';

export function useTotpSetup() {
  const { adoptSession } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl }
  const [code, setCode] = useState('');
  const qrDataUrl = useQrCode(setup?.otpauthUrl);

  // proof: { code } or { backupCode } for the enabled factor, when replacing it.
  const start = async (proof) => {
    setSetup(await api.setupTotp(proof));
    setCode('');
  };

  // Returns { backupCodes, token, user }. The new session is adopted at once:
  // the server has already ended the old token.
  const confirm = async () => {
    const result = await api.enableTotp(code);
    adoptSession(result);
    setSetup(null);
    setCode('');
    return result;
  };

  const clear = () => {
    setSetup(null);
    setCode('');
  };

  // Forgets the pending secret here and on the server.
  const cancel = async () => {
    clear();
    await api.cancelTotpSetup();
  };

  return { setup, code, setCode, qrDataUrl, start, confirm, clear, cancel };
}
