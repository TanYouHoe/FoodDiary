// UI connector: the Security tab state. Replace or set up the authenticator,
// make new backup codes, sign out everywhere, and for the owner load users and
// reset another user's factor. Returns the props of src/ui/SecurityTabView.jsx.

import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useTotpSetup } from './useTotpSetup.js';
import { useCopy } from './useCopy.js';
import { SECURITY_MODES, toSecurityState, toUserRows, backupCodesText } from '../ui/two-factor.js';

// enabled: the tab is open. showUsers: the user may list users (logic/access.js).
export function useSecurity({ enabled, showUsers }) {
  const { user, signIn, logout } = useAuth();
  const totp = useTotpSetup();
  const copy = useCopy();
  const [mode, setMode] = useState(SECURITY_MODES.idle);
  const [currentCode, setCurrentCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (enabled && showUsers) loadUsers();
  }, [enabled, showUsers]);

  const showCodes = (codes) => {
    copy.reset();
    setBackupCodes(codes);
    setMode(SECURITY_MODES.codes);
  };

  const cancel = () => {
    totp.clear();
    setCurrentCode('');
    setError('');
    setMode(SECURITY_MODES.idle);
  };

  const replace = () => {
    setError('');
    if (user.totp_enabled) {
      setCurrentCode('');
      setMode(SECURITY_MODES.replaceCode);
    } else {
      run(async () => { await totp.start(); setMode(SECURITY_MODES.setup); });
    }
  };

  const submitCurrentCode = () => run(async () => {
    if (mode === SECURITY_MODES.replaceCode) {
      await totp.start(currentCode);
      setMode(SECURITY_MODES.setup);
    } else {
      showCodes(await api.regenerateBackupCodes(currentCode));
    }
    setCurrentCode('');
  });

  // The popup stays open, so the new session is adopted at once.
  const confirmSetup = () => run(async () => {
    const result = await totp.confirm();
    signIn(result);
    showCodes(result.backupCodes);
  });

  const logoutAll = () => run(async () => {
    await api.logoutAll();
    logout();
  });

  const reset = (id) => run(async () => {
    await api.resetUserTotp(id);
    setConfirmResetId(null);
    await loadUsers();
  });

  return {
    state: toSecurityState(user),
    mode,
    currentCode,
    error,
    busy,
    setup: {
      qrDataUrl: totp.qrDataUrl,
      secret: totp.setup?.secret ?? '',
      otpauthUrl: totp.setup?.otpauthUrl,
      code: totp.code,
      error,
      busy,
      onCode: totp.setCode,
      onSubmit: confirmSetup,
    },
    backup: {
      codes: backupCodes,
      copied: copy.copied,
      copyError: copy.error,
      onCopy: () => copy.copy(backupCodesText(backupCodes)),
      onDone: () => { setBackupCodes([]); setMode(SECURITY_MODES.idle); },
    },
    showUsers,
    userRows: toUserRows(users, user),
    usersLoading,
    confirmResetId,
    onReplace: replace,
    onRegenerate: () => { setError(''); setCurrentCode(''); setMode(SECURITY_MODES.regenerateCode); },
    onCurrentCode: setCurrentCode,
    onSubmitCurrentCode: submitCurrentCode,
    onCancel: cancel,
    onLogoutAll: logoutAll,
    onAskReset: setConfirmResetId,
    onCancelReset: () => setConfirmResetId(null),
    onReset: reset,
  };
}
