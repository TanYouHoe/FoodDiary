import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create group
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // Join group
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Expanded group
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchGroups = async () => {
    try {
      const data = await api.getGroups();
      setGroups(data.groups || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.createGroup(newGroupName.trim());
      setNewGroupName('');
      await fetchGroups();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      await api.joinGroup(inviteCode.trim());
      setInviteCode('');
      await fetchGroups();
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const toggleExpand = async (group) => {
    if (expandedId === group.id) {
      setExpandedId(null);
      setMembers([]);
      return;
    }
    setExpandedId(group.id);
    setLoadingMembers(true);
    setCopied(false);
    try {
      const data = await api.getGroupMembers(group.id);
      setMembers(data.members || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMembers(false);
    }
  };

  const copyInviteCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <div className="loading">Loading groups...</div>;

  return (
    <div className="groups-page">
      <h2>Groups</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="groups-actions">
        <form className="inline-form inline-form-row" onSubmit={handleCreate}>
          <h3>Create Group</h3>
          <div className="form-row">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              required
            />
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>

        <form className="inline-form inline-form-row" onSubmit={handleJoin}>
          <h3>Join Group</h3>
          {joinError && <div className="error-message">{joinError}</div>}
          <div className="form-row">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code"
              required
            />
            <button type="submit" className="btn-primary" disabled={joining}>
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <p>You are not in any groups yet. Create one or join with an invite code.</p>
        </div>
      ) : (
        <div className="group-list">
          {groups.map((g) => (
            <div key={g.id} className={`group-card ${expandedId === g.id ? 'expanded' : ''}`}>
              <div
                className="group-card-header"
                onClick={() => toggleExpand(g)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(g); }}
              >
                <div className="group-card-info">
                  <span className="group-name">{g.name}</span>
                  <span className="badge badge-role">{g.role || 'member'}</span>
                  {g.member_count != null && (
                    <span className="group-member-count">
                      {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className="expand-icon">{expandedId === g.id ? '▾' : '▸'}</span>
              </div>

              {expandedId === g.id && (
                <div className="group-card-body">
                  {g.invite_code && (
                    <div className="invite-code-section">
                      <span className="invite-label">Invite Code:</span>
                      <code className="invite-code">{g.invite_code}</code>
                      <button
                        className="btn-sm btn-secondary"
                        onClick={() => copyInviteCode(g.invite_code)}
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}

                  <h4>Members</h4>
                  {loadingMembers ? (
                    <p>Loading members...</p>
                  ) : members.length === 0 ? (
                    <p>No members found.</p>
                  ) : (
                    <ul className="members-list">
                      {members.map((m) => (
                        <li key={m.user_id || m.id} className="member-item">
                          <span className="member-name">{m.name || m.email}</span>
                          <span className="badge badge-role">{m.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
