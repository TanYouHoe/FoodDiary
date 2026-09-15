// UI connector: the Security tab state. Replace or set up the authenticator,
// make new backup codes, sign out everywhere, and for the owner load users and
// reset another user's factor (with the owner's own code or backup code).
// Returns the props of src/ui/SecurityTabView.jsx.

import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useTotpSetup } from './useTotpSetup.js';
import { useCopy } from './useCopy.js';
import { needsFactorProof } from '../../logic/two-factor.js';
import { SECURITY_MODES, toSecurityState, toUserRows, backupCodesText } from '../ui/two-factor.js';

// { code } or { backupCode } from a field and its switch.
const proofFrom = (value, useBackup) => (useBackup ? { backupCode: value } : { code: value });

// enabled: the tab is open. showUsers: the user may list users (logic/access.js).
export function useSecurity({ enabled, showUsers }) {
  const { user, logout } = useAuth();
  const totp = useTotpSetup();
  const copy = useCopy();
  const [mode, setMode] = useState(SECURITY_MODES.idle);
  const [currentCode, setCurrentCode] = useState('');
  const [useBackup, setUseBackup] = useState(false); // the current-code field takes a backup code
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState(null);
  const [resetCode, setResetCode] = useState('');
  const [resetUseBackup, setResetUseBackup] = useState(false);

  const factorEnabled = Boolean(user.totp_enabled);

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

  const askCurrentCode = (nextMode) => {
    setError('');
    setCurrentCode('');
    setUseBackup(false);
    setMode(nextMode);
  };

  const cancel = () => {
    // A setup on screen has a pending secret on the server; forget it there too.
    if (mode === SECURITY_MODES.setup) totp.cancel().catch(() => {});
    else totp.clear();
    setCurrentCode('');
    setUseBackup(false);
    setError('');
    setMode(SECURITY_MODES.idle);
  };

  const replace = () => {
    setError('');
    if (factorEnabled) {
      askCurrentCode(SECURITY_MODES.replaceCode);
    } else {
      run(async () => { await totp.start(); setMode(SECURITY_MODES.setup); });
    }
  };

  const submitCurrentCode = () => run(async () => {
    const proof = proofFrom(currentCode, useBackup);
    if (mode === SECURITY_MODES.replaceCode) {
      await totp.start(proof);
      setMode(SECURITY_MODES.setup);
    } else {
      showCodes(await api.regenerateBackupCodes(proof));
    }
    setCurrentCode('');
    setUseBackup(false);
  });

  // useTotpSetup adopts the new session; the popup stays open for the codes.
  const confirmSetup = () => run(async () => {
    const result = await totp.confirm();
    showCodes(result.backupCodes);
  });

  const logoutAll = () => run(async () => {
    await api.logoutAll();
    logout();
  });

  const askReset = (id) => {
    setError('');
    setResetCode('');
    setResetUseBackup(false);
    setConfirmResetId(id);
  };

  const reset = (id) => run(async () => {
    await api.resetUserTotp(id, needsFactorProof({ totpEnabled: factorEnabled }) ? proofFrom(resetCode, resetUseBackup) : undefined);
    setConfirmResetId(null);
    setResetCode('');
    await loadUsers();
  });

  return {
    state: toSecurityState(user),
    mode,
    currentCode,
    useBackup,
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
    resetNeedsProof: needsFactorProof({ totpEnabled: factorEnabled }),
    resetCode,
    resetUseBackup,
    onReplace: replace,
    onRegenerate: () => askCurrentCode(SECURITY_MODES.regenerateCode),
    onCurrentCode: setCurrentCode,
    onToggleBackup: () => { setCurrentCode(''); setUseBackup(b => !b); },
    onSubmitCurrentCode: submitCurrentCode,
    onCancel: cancel,
    onLogoutAll: logoutAll,
    onAskReset: askReset,
    onCancelReset: () => setConfirmResetId(null),
    onResetCode: setResetCode,
    onToggleResetBackup: () => { setResetCode(''); setResetUseBackup(b => !b); },
    onReset: reset,
  };
}
