// UI: the account invites tab of the settings popup. Create a link (shown
// once, with a copy button), list invites with status and dates, revoke.
// rows: toInviteRows (./invites.js). created: { url } after a create, else null.

import { INVITE_HELP_TEXT } from './invites.js';
import { TrashIcon } from './icons.jsx';

export default function InvitesTabView({
  rows, loading, error, created, creating, copied, confirmRevokeId,
  onCreate, onCopy, onDismissCreated, onAskRevoke, onCancelRevoke, onRevoke,
}) {
  return (
    <>
      <p className="patterns-intro">{INVITE_HELP_TEXT}</p>
      {error && <div className="error-message">{error}</div>}

      {created && (
        <div className="invite-code-section account-invite-created">
          <span className="invite-label">New account invite link. Copy it now; it is shown only once.</span>
          <code className="invite-code account-invite-link">{created.url}</code>
          <button className="btn-sm btn-secondary" onClick={onCopy}>{copied ? 'Copied!' : 'Copy'}</button>
          <button className="btn-sm btn-secondary" onClick={onDismissCreated}>Done</button>
        </div>
      )}

      <div className="settings-group">
        <div className="settings-group-header">
          <span className="settings-group-label">Account invites</span>
          <button className="btn-primary btn-sm" onClick={onCreate} disabled={creating}>
            {creating ? 'Creating...' : '+ New invite'}
          </button>
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="settings-group-empty">No account invites yet</div>
        ) : (
          <div className="settings-list">
            {rows.map((row) => (
              <div key={row.id} className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-name">
                    <span className="badge badge-role">{row.statusLabel}</span>
                  </span>
                  <span className="settings-item-desc">
                    {row.usedBy
                      ? `Used by ${row.usedBy} on ${row.usedOn}`
                      : `Created ${row.created} · Expires ${row.expires}`}
                  </span>
                </div>
                {row.canRevoke && (
                  <div className="settings-item-actions">
                    <button className="icon-btn icon-btn-delete" onClick={() => onAskRevoke(row.id)} title="Revoke">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                )}
                {confirmRevokeId === row.id && row.canRevoke && (
                  <div className="settings-item-confirm">
                    <span>Revoke?</span>
                    <button className="btn-secondary btn-sm" onClick={onCancelRevoke}>No</button>
                    <button className="btn-danger btn-sm" onClick={() => onRevoke(row.id)}>Yes</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
