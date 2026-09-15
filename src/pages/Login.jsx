// UI connector: the login page. Password login and Google sign-in. Sign-up is
// by invite only (src/pages/Invite.jsx).

import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useGoogleButton } from '../hooks/useGoogleButton.js';
import LoginView from '../ui/LoginView.jsx';

export default function Login() {
  const { login, googleLogin } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: '', password: '', error: '', loading: false });

  const patchLogin = (patch) => setLoginForm(f => ({ ...f, ...patch }));

  // Runs an auth call with the form's loading and error state.
  const attempt = async (call, fallbackError) => {
    patchLogin({ error: '', loading: true });
    try {
      await call();
    } catch (err) {
      patchLogin({ error: err.message || fallbackError });
    } finally {
      patchLogin({ loading: false });
    }
  };

  const google = useGoogleButton((credential) => attempt(() => googleLogin(credential), 'Google login failed'));

  const submitLogin = () => attempt(() => login(loginForm.email, loginForm.password), 'Invalid credentials');

  return (
    <LoginView
      login={loginForm}
      showGoogle={google.show}
      googleButtonRef={google.ref}
      onLoginField={(key, value) => patchLogin({ [key]: value })}
      onLogin={submitLogin}
    />
  );
}
