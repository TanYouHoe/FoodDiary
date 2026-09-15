// UI connector: one authenticator setup. Asks the server for a new secret,
// draws its QR code, holds the confirm-code field and confirms. The caller
// handles errors (each call throws) and decides when to adopt the new session.

import { useState } from 'react';
import { api } from '../api.js';
import { setToken } from '../token-store.js';
import { useQrCode } from './useQrCode.js';

export function useTotpSetup() {
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl }
  const [code, setCode] = useState('');
  const qrDataUrl = useQrCode(setup?.otpauthUrl);

  // currentCode: a code from the enabled factor, when replacing it.
  const start = async (currentCode) => {
    setSetup(await api.setupTotp(currentCode));
    setCode('');
  };

  // Returns { backupCodes, token, user }. The new token is stored at once: the
  // server has already ended the old one.
  const confirm = async () => {
    const result = await api.enableTotp(code);
    setToken(result.token);
    setSetup(null);
    setCode('');
    return result;
  };

  const clear = () => {
    setSetup(null);
    setCode('');
  };

  return { setup, code, setCode, qrDataUrl, start, confirm, clear };
}
