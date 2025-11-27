import React, { useState, useCallback, Dispatch, SetStateAction, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './contexts/ThemeContext';
import { LazySocketProvider } from './contexts/LazySocketContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AuthProvider } from './contexts/AuthContext';
import { FriendProvider } from './contexts/FriendContext';
import Notification from './components/Notification';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import Legal from './pages/Legal';
import AuthCallback from './pages/AuthCallback';
import PasswordReset from './pages/PasswordReset';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';
import AdminRoute from './components/AdminRoute';
import DebugPanel from './components/DebugPanel';
import FriendList from './components/FriendList';
import GameInviteToast from './components/GameInviteToast';
import AchievementUnlockToast from './components/AchievementUnlockToast';
import { useAchievementNotifications } from './hooks/useAchievementNotifications';
import NotificationPoller from './components/NotificationPoller';
import ErrorBoundary from './components/ErrorBoundary';
import PageTransition from './components/PageTransition';
import MobileBottomNav from './components/MobileBottomNav';
import SkipLink from './components/SkipLink';
import './App.css';

// Easter egg: Console command to redeem achievement codes
// Usage: redeemCode("GAMEBUDDIES2024")
declare global {
  interface Window {
    redeemCode: (code: string) => Promise<void>;
  }
}

window.redeemCode = async (code: string): Promise<void> => {
  try {
    // Find Supabase auth token in localStorage (searches all keys for access_token)
    let accessToken: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const value = localStorage.getItem(key);
          if (value && value.includes('access_token')) {
            const data = JSON.parse(value);
            // Try different possible structures
            accessToken = data?.access_token
              || data?.currentSession?.access_token
              || data?.session?.access_token;
            if (accessToken) break;
          }
        } catch {
          // Not JSON or parsing error, skip
        }
      }
    }

    if (!accessToken) {
      console.error('❌ You must be logged in to redeem codes');
      console.log('Debug: localStorage keys:', Object.keys(localStorage));
      return;
    }

    console.log(`🎁 Redeeming code: ${code}...`);

    const response = await fetch('/api/achievements/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('🏆 Achievement unlocked!', data.achievement);
      console.log('Check your screen for the notification toast!');
    } else {
      console.error('❌', data.error);
    }
  } catch (error) {
    console.error('❌ Failed to redeem code:', error);
  }
};

// Lazy-loaded pages (code splitting)
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Premium = lazy(() => import('./pages/Premium'));
const Account = lazy(() => import('./pages/Account'));
const Achievements = lazy(() => import('./pages/Achievements'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminAffiliates = lazy(() => import('./pages/AdminAffiliates'));

// Loading fallback for lazy-loaded pages
const PageLoadingFallback = (): React.ReactElement => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <div className="loading-spinner" />
  </div>
);

export interface HomePageProps {
  setIsInLobby: Dispatch<SetStateAction<boolean>>;
  setLobbyLeaveFn: Dispatch<SetStateAction<(() => void) | null>>;
}

function AppContent(): React.ReactElement {
  const [isInLobby, setIsInLobby] = useState<boolean>(false);
  const [lobbyLeaveFn, setLobbyLeaveFn] = useState<(() => void) | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Listen for achievement unlock notifications
  useAchievementNotifications();

  console.log('🏠 [APP DEBUG] App component rendering:', {
    timestamp: new Date().toISOString(),
    location: window.location.href,
    isInLobby,
  });

  const handleNavigateHome = useCallback((): void => {
    if (isInLobby && lobbyLeaveFn) {
      lobbyLeaveFn();
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else {
      navigate('/', { replace: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isInLobby, lobbyLeaveFn, navigate]);

  const handleNavigateGames = useCallback((): void => {
    if (isInLobby && lobbyLeaveFn) {
      lobbyLeaveFn();
      setTimeout(() => {
        const gamesSection = document.getElementById('games-section');
        if (gamesSection) {
          gamesSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      const gamesSection = document.getElementById('games-section');
      if (gamesSection) {
        gamesSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [isInLobby, lobbyLeaveFn]);

  return (
    <div className="App">
      <SkipLink targetId="main-content" />
      <Header
        onNavigateHome={handleNavigateHome}
        onNavigateGames={handleNavigateGames}
        isInLobby={isInLobby}
      />
      <Notification />
      {(location.pathname === '/' || location.pathname.startsWith('/lobby/')) && (
        <div className="beta-disclaimer">
          <div className="beta-disclaimer-content">
            <span className="beta-badge">⚠️ BETA</span>
            <span className="beta-text">
              GameBuddies.io is currently in <strong>beta testing</strong>. Some features may not work as expected.
            </span>
          </div>
        </div>
      )}
      <DebugPanel />
      <FriendList />
      <GameInviteToast />
      <AchievementUnlockToast />
      <NotificationPoller />
      <main id="main-content" tabIndex={-1}>
        <Suspense fallback={<PageLoadingFallback />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <HomePage setIsInLobby={setIsInLobby} setLobbyLeaveFn={setLobbyLeaveFn} />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/lobby/:roomCode"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <HomePage setIsInLobby={setIsInLobby} setLobbyLeaveFn={setLobbyLeaveFn} />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/login"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <LoginPage />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/password-reset"
              element={
                <PageTransition>
                  <PasswordReset />
                </PageTransition>
              }
            />
            <Route
              path="/premium"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <Premium />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/account"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <Account />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/achievements"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <Achievements />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/achievements/:userId"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <Achievements />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/admin/affiliates"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <AdminRoute>
                      <AdminAffiliates />
                    </AdminRoute>
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            <Route
              path="/payment/success"
              element={
                <PageTransition>
                  <PaymentSuccess />
                </PageTransition>
              }
            />
            <Route
              path="/payment/cancel"
              element={
                <PageTransition>
                  <PaymentCancel />
                </PageTransition>
              }
            />
            <Route
              path="/legal"
              element={
                <PageTransition>
                  <Legal />
                </PageTransition>
              }
            />
            <Route
              path="/impressum"
              element={
                <PageTransition>
                  <Legal />
                </PageTransition>
              }
            />
            <Route
              path="/privacy"
              element={
                <PageTransition>
                  <Legal />
                </PageTransition>
              }
            />
            <Route
              path="/datenschutz"
              element={
                <PageTransition>
                  <Legal />
                </PageTransition>
              }
            />
            <Route
              path="/terms"
              element={
                <PageTransition>
                  <Legal />
                </PageTransition>
              }
            />
            <Route
              path="/*"
              element={
                <PageTransition>
                  <ErrorBoundary>
                    <HomePage setIsInLobby={setIsInLobby} setLobbyLeaveFn={setLobbyLeaveFn} />
                  </ErrorBoundary>
                </PageTransition>
              }
            />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </main>
      <Footer />
      <MobileBottomNav
        onNavigateHome={handleNavigateHome}
        onNavigateGames={handleNavigateGames}
      />
    </div>
  );
}

function App(): React.ReactElement {
  return (
    <ThemeProvider>
      <Router>
        <AuthProvider>
          <LazySocketProvider>
            <NotificationProvider>
              <FriendProvider>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </FriendProvider>
            </NotificationProvider>
          </LazySocketProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
