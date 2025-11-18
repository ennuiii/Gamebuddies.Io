import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Header.css';

const Header = ({ onNavigateHome, onNavigateGames, isInLobby }) => {
  const navigate = useNavigate();

  const handleHomeClick = (e) => {
    if (isInLobby && onNavigateHome) {
      e.preventDefault();
      onNavigateHome();
    }
    // If not in lobby, let the Link component handle navigation normally
  };

  const handleGamesClick = (e) => {
    e.preventDefault();
    if (isInLobby && onNavigateGames) {
      onNavigateGames();
    } else {
      // If on homepage, scroll to games section
      const gamesSection = document.getElementById('games-section');
      if (gamesSection) {
        gamesSection.scrollIntoView({ behavior: 'smooth' });
      } else {
        // If not on homepage, navigate to homepage first, then scroll
        navigate('/', { replace: true });
        setTimeout(() => {
          const gamesSection = document.getElementById('games-section');
          if (gamesSection) {
            gamesSection.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      }
    }
  };

  return (
    <>
      <motion.header 
        className="header"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="container">
          <div className="header-content">
            <Link to="/" className="logo" onClick={handleHomeClick}>
              <span className="logo-text">Game</span>
              <span className="logo-text accent">Buddies</span>
              <span className="logo-dot">.io</span>
            </Link>
            
            <nav className="nav">
              <Link to="/" className="nav-link" onClick={handleHomeClick}>
                Home
              </Link>
              <button className="nav-link nav-button" onClick={handleGamesClick}>
                Games
              </button>
            </nav>
          </div>
        </div>
      </motion.header>
    </>
  );
};

export default Header; 