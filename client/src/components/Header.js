import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './Header.css';

const Header = ({ onNavigateHome, onNavigateGames, isInLobby }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    console.log('🚪 [HEADER] Logging out...');

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('❌ [HEADER] Logout error:', error);
        alert('Failed to log out. Please try again.');
      } else {
        console.log('✅ [HEADER] Logged out successfully');
        navigate('/');
      }
    } catch (err) {
      console.error('❌ [HEADER] Logout exception:', err);
      alert('An error occurred during logout.');
    } finally {
      setIsLoggingOut(false);
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

            <div className="header-right">
              <nav className="nav">
                <Link to="/" className="nav-link" onClick={handleHomeClick}>
                  Home
                </Link>
                <button className="nav-link nav-button" onClick={handleGamesClick}>
                  Games
                </button>
              </nav>

              {!loading && (
                <div className="auth-section">
                  {isAuthenticated && user ? (
                    <div className="user-section">
                      <span className="user-info">
                        {user.is_guest ? (
                          <>
                            <span className="user-icon">👤</span>
                            <span className="user-name">Guest</span>
                          </>
                        ) : (
                          <>
                            <span className="user-icon">🎮</span>
                            <span className="user-name">
                              {user.display_name || user.username || user.email?.split('@')[0]}
                            </span>
                          </>
                        )}
                      </span>
                      <button
                        onClick={handleLogout}
                        className="logout-button"
                        disabled={isLoggingOut}
                      >
                        {isLoggingOut ? 'Logging out...' : 'Logout'}
                      </button>
                    </div>
                  ) : (
                    <Link to="/login" className="login-link">
                      Login
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.header>
    </>
  );
};

export default Header; 