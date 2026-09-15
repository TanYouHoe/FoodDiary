// UI: the groups page. Create, join, and expand a group to see its members.

export default function GroupsView({
  loading, error, groups, create, join, expandedId, members, loadingMembers, copied,
  onCreateName, onCreate, onInviteCode, onJoin, onToggle, onCopy,
}) {
  if (loading) return <div className="loading">Loading groups...</div>;

  return (
    <div className="groups-page">
      <h2>Groups</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="groups-actions">
        <form className="inline-form inline-form-row" onSubmit={(e) => { e.preventDefault(); onCreate(); }}>
          <h3>Create Group</h3>
          <div className="form-row">
            <input
              type="text"
              value={create.name}
              onChange={(e) => onCreateName(e.target.value)}
              placeholder="Group name"
              required
            />
            <button type="submit" className="btn-primary" disabled={create.busy}>
              {create.busy ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>

        <form className="inline-form inline-form-row" onSubmit={(e) => { e.preventDefault(); onJoin(); }}>
          <h3>Join Group</h3>
          {join.error && <div className="error-message">{join.error}</div>}
          <div className="form-row">
            <input
              type="text"
              value={join.code}
              onChange={(e) => onInviteCode(e.target.value)}
              placeholder="Invite code"
              required
            />
            <button type="submit" className="btn-primary" disabled={join.busy}>
              {join.busy ? 'Joining...' : 'Join'}
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
                onClick={() => onToggle(g)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onToggle(g); }}
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
                      <button className="btn-sm btn-secondary" onClick={() => onCopy(g.invite_code)}>
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
