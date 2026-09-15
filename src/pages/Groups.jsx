// UI connector: the groups page. Create, join, expand and copy invite codes.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { copyText } from '../clipboard.js';
import GroupsView from '../ui/GroupsView.jsx';

const COPIED_MS = 2000;

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [create, setCreate] = useState({ name: '', busy: false });
  const [join, setJoin] = useState({ code: '', busy: false, error: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchGroups = async () => {
    try {
      setGroups(await api.getGroups());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const submitCreate = async () => {
    if (!create.name.trim()) return;
    setCreate(c => ({ ...c, busy: true }));
    setError('');
    try {
      await api.createGroup(create.name.trim());
      setCreate(c => ({ ...c, name: '' }));
      await fetchGroups();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreate(c => ({ ...c, busy: false }));
    }
  };

  const submitJoin = async () => {
    if (!join.code.trim()) return;
    setJoin(j => ({ ...j, busy: true, error: '' }));
    try {
      await api.joinGroup(join.code.trim());
      setJoin(j => ({ ...j, code: '' }));
      await fetchGroups();
    } catch (err) {
      setJoin(j => ({ ...j, error: err.message }));
    } finally {
      setJoin(j => ({ ...j, busy: false }));
    }
  };

  const toggle = async (group) => {
    if (expandedId === group.id) {
      setExpandedId(null);
      setMembers([]);
      return;
    }
    setExpandedId(group.id);
    setLoadingMembers(true);
    setCopied(false);
    try {
      setMembers(await api.getGroupMembers(group.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMembers(false);
    }
  };

  const copy = async (code) => {
    await copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <GroupsView
      loading={loading}
      error={error}
      groups={groups}
      create={create}
      join={join}
      expandedId={expandedId}
      members={members}
      loadingMembers={loadingMembers}
      copied={copied}
      onCreateName={(name) => setCreate(c => ({ ...c, name }))}
      onCreate={submitCreate}
      onInviteCode={(code) => setJoin(j => ({ ...j, code }))}
      onJoin={submitJoin}
      onToggle={toggle}
      onCopy={copy}
    />
  );
}
