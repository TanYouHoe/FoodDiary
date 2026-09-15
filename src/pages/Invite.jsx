// UI connector: the account invite page at /invite/:code, reachable signed out.
// Checks the code, then signs up with it by password or by Google.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api.js';
import { useGoogleButton } from '../hooks/useGoogleButton.js';
import { checkPasswordConfirmation } from '../../logic/accounts.js';
import { invitePageState } from '../ui/invites.js';
import InviteView from '../ui/InviteView.jsx';

export default function Invite() {
  const { code } = useParams();
  const { register, googleLogin } = useAuth();
  const [check, setCheck] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', error: '', loading: false });

  const patchForm = (patch) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    let live = true;
    setCheck(null);
    api.checkAccountInvite(code)
      .then(result => { if (live) setCheck(result); })
      .catch(() => { if (live) setCheck({ valid: false }); });
    return () => { live = false; };
  }, [code]);

  const state = invitePageState(check);

  // Runs a sign-up call with the form's loading and error state.
  const attempt = async (call, fallbackError) => {
    patchForm({ error: '', loading: true });
    try {
      await call();
    } catch (err) {
      patchForm({ error: err.message || fallbackError, loading: false });
    }
  };

  const google = useGoogleButton(
    (credential) => attempt(() => googleLogin(credential, code), 'Google sign-up failed'),
    state === 'valid',
  );

  const submit = () => {
    const mismatch = checkPasswordConfirmation(form.password, form.confirm);
    if (mismatch) {
      patchForm({ error: mismatch });
      return;
    }
    attempt(() => register(form.name, form.email, form.password, code), 'Registration failed');
  };

  return (
    <InviteView
      state={state}
      form={form}
      showGoogle={google.show}
      googleButtonRef={google.ref}
      loginLink={<Link to="/" className="link-btn">Log in</Link>}
      onField={(key, value) => patchForm({ [key]: value })}
      onSubmit={submit}
    />
  );
}
