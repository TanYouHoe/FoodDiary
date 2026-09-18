// UI: the Account tab of the settings popup.
//
// Everything about signing in - the authenticator, the backup codes, the trusted
// browsers, who may sign in and what each role may do - lives on the shared
// module's own pages at /accounts. This tab says who you are and sends you
// there, rather than keeping a second copy of those screens.

export default function AccountTabView({ user, canManageAccounts, accountsUrl = '/accounts/' }) {
  return (
    <div className="settings-section">
      <p className="settings-hint">
        Signed in as <strong>{user?.name}</strong> ({user?.email}).
      </p>
      <p className="settings-hint">
        Your authenticator app, your backup codes and the browsers that skip the code are
        {canManageAccounts
          ? ' on the Accounts pages, together with the people and roles of this app.'
          : ' on the Accounts pages.'}
      </p>
      <p>
        <a className="btn" href={accountsUrl}>
          {canManageAccounts ? 'Open the Accounts pages' : 'Open my account'}
        </a>
      </p>
      {!canManageAccounts && (
        <p className="settings-hint">
          Only somebody who can manage users adds a person here. Ask them for access.
        </p>
      )}
    </div>
  );
}
