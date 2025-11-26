import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
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
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import PasswordReset from './pages/PasswordReset';
import Premium from './pages/Premium';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';
import Account from './pages/Account';
import AdminAffiliates from './pages/AdminAffiliates';
import AdminDashboard from './pages/AdminDashboard';
import AdminRoute from './components/AdminRoute';
import DebugPanel from './components/DebugPanel';
import FriendList from './components/FriendList';
import GameInviteToast from './components/GameInviteToast';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

export interface HomePageProps {
  setIsInLobby: Dispatch<SetStateAction<boolean>>;
  setLobbyLeaveFn: Dispatch<SetStateAction<(() => void) | null>>;
}

function AppContent(): React.ReactElement {
  const [isInLobby, setIsInLobby] = useState<boolean>(false);
  const [lobbyLeaveFn, setLobbyLeaveFn] = useState<(() => void) | null>(null);
  const navigate = useNavigate();

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
      <Header
        onNavigateHome={handleNavigateHome}
        onNavigateGames={handleNavigateGames}
        isInLobby={isInLobby}
      />
      <Notification />
      <DebugPanel />
      <FriendList />
      <GameInviteToast />
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary>
              <HomePage setIsInLobby={setIsInLobby} setLobbyLeaveFn={setLobbyLeaveFn} />
            </ErrorBoundary>
          }
        />
        <Route
          path="/lobby/:roomCode"
          element={
            <ErrorBoundary>
              <HomePage setIsInLobby={setIsInLobby} setLobbyLeaveFn={setLobbyLeaveFn} />
            </ErrorBoundary>
          }
        />
        <Route
          path="/login"
          element={
            <ErrorBoundary>
              <LoginPage />
            </ErrorBoundary>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/password-reset" element={<PasswordReset />} />
        <Route
          path="/premium"
          element={
            <ErrorBoundary>
              <Premium />
            </ErrorBoundary>
          }
        />
        <Route
          path="/account"
          element={
            <ErrorBoundary>
              <Account />
            </ErrorBoundary>
          }
        />
        <Route
          path="/admin/affiliates"
          element={
            <ErrorBoundary>
              <AdminRoute>
                <AdminAffiliates />
              </AdminRoute>
            </ErrorBoundary>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <ErrorBoundary>
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            </ErrorBoundary>
          }
        />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/impressum" element={<Legal />} />
        <Route path="/privacy" element={<Legal />} />
        <Route path="/datenschutz" element={<Legal />} />
        <Route path="/terms" element={<Legal />} />
        <Route
          path="/*"
          element={
            <ErrorBoundary>
              <HomePage setIsInLobby={setIsInLobby} setLobbyLeaveFn={setLobbyLeaveFn} />
            </ErrorBoundary>
          }
        />
      </Routes>
      <Footer />
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
