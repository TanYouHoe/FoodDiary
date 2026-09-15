// UI connector: the account invites tab state. Loads the list when enabled,
// creates an invite (keeps its link to show once), copies the link, revokes.

import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { copyText } from '../clipboard.js';
import { toInviteRows } from '../ui/invites.js';

// enabled: load only while the owner has the tab open.
export function useAccountInvites(enabled) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setInvites(await api.getAccountInvites());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const invite = await api.createAccountInvite();
      setCreated({ url: invite.url });
      setCopied(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await copyText(created.url);
      setCopied(true);
    } catch {
      setError('Could not copy the link. Select it and copy it by hand.');
    }
  };

  const revoke = async (id) => {
    setError('');
    try {
      await api.revokeAccountInvite(id);
      setConfirmRevokeId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return {
    rows: toInviteRows(invites),
    loading,
    error,
    created,
    creating,
    copied,
    confirmRevokeId,
    create,
    copy,
    dismissCreated: () => setCreated(null),
    askRevoke: setConfirmRevokeId,
    cancelRevoke: () => setConfirmRevokeId(null),
    revoke,
  };
}
