import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { queryClient } from './api/queries';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { platform } from './platform';
import { router } from './routes';
import './styles/app.css';
import { ThemeProvider } from './themes/ThemeProvider';

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  // selfnotes:// links (Android widgets). Signed out, RequireAuth sends them through the login page.
  platform.onDeepLink((path) => void router.navigate(path));
}

// Android: the server URL comes from the native SessionStore, before anything asks for it.
// (No top-level await: older Android WebViews cannot parse it.)
platform.init().then(render, (err: unknown) => {
  console.error('Platform init failed, using the default server URL', err);
  render();
});
