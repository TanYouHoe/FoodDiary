// UI connector: the login page. Password login, registration and Google sign-in.

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { GOOGLE_CLIENT_ID } from '../config.js';
import { loadGoogleIdentity } from '../google.js';
import { checkPasswordConfirmation } from '../../logic/accounts.js';
import LoginView from '../ui/LoginView.jsx';

const GOOGLE_BUTTON = { theme: 'outline', size: 'large', width: '100%', text: 'continue_with', shape: 'rectangular' };

export default function Login() {
  const { login, register, googleLogin } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: '', password: '', error: '', loading: false });
  const [registerForm, setRegisterForm] = useState({ open: false, name: '', email: '', password: '', confirm: '', error: '', loading: false });
  const googleButtonRef = useRef(null);

  const patchLogin = (patch) => setLoginForm(f => ({ ...f, ...patch }));
  const patchRegister = (patch) => setRegisterForm(f => ({ ...f, ...patch }));

  // Runs an auth call with the form's loading and error state.
  const attempt = async (patch, call, fallbackError) => {
    patch({ error: '', loading: true });
    try {
      await call();
    } catch (err) {
      patch({ error: err.message || fallbackError });
    } finally {
      patch({ loading: false });
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    return loadGoogleIdentity((identity) => {
      identity.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => attempt(patchLogin, () => googleLogin(response.credential), 'Google login failed'),
      });
      if (googleButtonRef.current) identity.renderButton(googleButtonRef.current, GOOGLE_BUTTON);
    });
  }, []);

  const submitLogin = () => attempt(patchLogin, () => login(loginForm.email, loginForm.password), 'Invalid credentials');

  const submitRegister = () => {
    const mismatch = checkPasswordConfirmation(registerForm.password, registerForm.confirm);
    if (mismatch) {
      patchRegister({ error: mismatch });
      return;
    }
    attempt(patchRegister, () => register(registerForm.name, registerForm.email, registerForm.password), 'Registration failed');
  };

  return (
    <LoginView
      login={loginForm}
      register={registerForm}
      showGoogle={Boolean(GOOGLE_CLIENT_ID)}
      googleButtonRef={googleButtonRef}
      onLoginField={(key, value) => patchLogin({ [key]: value })}
      onLogin={submitLogin}
      onOpenRegister={() => patchRegister({ open: true })}
      onCloseRegister={() => patchRegister({ open: false })}
      onRegisterField={(key, value) => patchRegister({ [key]: value })}
      onRegister={submitRegister}
    />
  );
}
