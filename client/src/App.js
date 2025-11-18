import React, { useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { LazySocketProvider } from './contexts/LazySocketContext';
import { NotificationProvider } from './contexts/NotificationContext'; // Import NotificationProvider
import Notification from './components/Notification'; // Import Notification component
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import Legal from './pages/Legal';
// GameBuddiesReturnHandler removed - using simpler URL-based return flow
import DebugPanel from './components/DebugPanel';
import './App.css';

function AppContent() {
  const [isInLobby, setIsInLobby] = useState(false);
  const [lobbyLeaveFn, setLobbyLeaveFn] = useState(null);
  const navigate = useNavigate();

  console.log('🏠 [APP DEBUG] App component rendering:', {
    timestamp: new Date().toISOString(),
    location: window.location.href,
    isInLobby
  });

  const handleNavigateHome = useCallback(() => {
    if (isInLobby && lobbyLeaveFn) {
      lobbyLeaveFn();
      // Scroll to top after leaving lobby
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else {
      navigate('/', { replace: true });
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isInLobby, lobbyLeaveFn, navigate]);

  const handleNavigateGames = useCallback(() => {
    if (isInLobby && lobbyLeaveFn) {
      lobbyLeaveFn();
      // After leaving lobby, scroll to games section
      setTimeout(() => {
        const gamesSection = document.getElementById('games-section');
        if (gamesSection) {
          gamesSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // Already on homepage, just scroll to games
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
      <Notification /> {/* Display Notification component here */}
      <DebugPanel />
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              setIsInLobby={setIsInLobby}
              setLobbyLeaveFn={setLobbyLeaveFn}
            />
          }
        />
        <Route
          path="/lobby/:roomCode"
          element={
            <HomePage
              setIsInLobby={setIsInLobby}
              setLobbyLeaveFn={setLobbyLeaveFn}
            />
          }
        />
        <Route path="/legal" element={<Legal />} />
        <Route path="/impressum" element={<Legal />} />
        <Route path="/privacy" element={<Legal />} />
        <Route path="/datenschutz" element={<Legal />} />
        <Route path="/terms" element={<Legal />} />
        <Route
          path="/*"
          element={
            <HomePage
              setIsInLobby={setIsInLobby}
              setLobbyLeaveFn={setLobbyLeaveFn}
            />
          }
        />
      </Routes>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LazySocketProvider>
        <NotificationProvider> {/* Wrap with NotificationProvider */}
          <Router>
            <AppContent />
          </Router>
        </NotificationProvider>
      </LazySocketProvider>
    </ThemeProvider>
  );
}

export default App; 