import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GameBuddiesReturnHandler from './components/GameBuddiesReturnHandler';
import DebugPanel from './components/DebugPanel';
import './App.css';

function App() {
  console.log('🏠 [APP DEBUG] App component rendering:', {
    timestamp: new Date().toISOString(),
    location: window.location.href,
    sessionStorage: {
      roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
      playerName: sessionStorage.getItem('gamebuddies_playerName'),
      isHost: sessionStorage.getItem('gamebuddies_isHost'),
      gameType: sessionStorage.getItem('gamebuddies_gameType'),
      returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
    }
  });

  return (
    <Router>
      <div className="App">
        <GameBuddiesReturnHandler />
        <DebugPanel />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/*" element={<HomePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App; 