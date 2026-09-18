import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthGate } from 'family-auth/react'
import { AuthProvider } from './AuthContext.jsx'
import App from './App.jsx'
import './index.css'
import './update-banner.css'

// The shared auth module owns every sign-in screen: the Google button, the
// authenticator step, the enrollment and the backup codes. It renders this app
// only once somebody is signed in, and hands it the session.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate appName="Food Diary">
      {(session) => (
        <BrowserRouter>
          <AuthProvider session={session}>
            <App />
          </AuthProvider>
        </BrowserRouter>
      )}
    </AuthGate>
  </StrictMode>,
)
