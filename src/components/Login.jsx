import React, { useEffect, useRef, useState } from 'react';

function Login({ onLogin, error }) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    const interval = setInterval(() => {
      if (window.google?.accounts?.id && buttonRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              onLogin(response.credential);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 300,
        });
        setReady(true);
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [clientId, onLogin]);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-title">Sign in to continue</div>
        <div className="login-subtitle">Use your Gmail account to access your files.</div>
        {!clientId && (
          <div className="login-error">
            Missing `VITE_GOOGLE_CLIENT_ID` in `.env`.
          </div>
        )}
        <div className="login-button" ref={buttonRef} />
        {!ready && clientId && (
          <div className="login-note">Loading Google Sign-In...</div>
        )}
        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}

export default Login;
