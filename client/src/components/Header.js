import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

const Header = ({ onNavigateHome, onNavigateGames, isInLobby }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading, session, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  console.log('🎯 [HEADER] Rendering with auth state:', {
    loading,
    isAuthenticated,
    hasUser: !!user,
    hasSession: !!session,
    userName: user?.username || user?.display_name,
    timestamp: new Date().toISOString()
  });

  const handleHomeClick = (e) => {
    if (isInLobby && onNavigateHome) {
      e.preventDefault();
      onNavigateHome();
      return;
    }

    if (location.pathname === '/') {
      // If already on home, smooth scroll to top
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // If not in lobby and not on home, let Link handle standard navigation
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
      await signOut();
      console.log('✅ [HEADER] Logged out successfully');

      // Clear the temporary session flag if it exists
      sessionStorage.removeItem('gamebuddies-session-temp');

      navigate('/');
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

              <div className="auth-section">
                {/* Debug info */}
                {/* {isAuthenticated && user && (
                  <div style={{display: 'none'}}>
                    Header Debug: Role={user.role}, Tier={user.premium_tier}
                  </div>
                )} */}
                {isAuthenticated && user ? (
                  <div className="user-section">
                    <button
                      onClick={() => navigate('/account')}
                      className="user-info user-info-button"
                      title="View Account Settings"
                    >
                      {user.is_guest ? (
                        <>
                          <span className="user-icon">👤</span>
                          <span className="user-name">Guest</span>
                        </>
                      ) : (
                        <>
                          <span className="user-icon">
                            {user.premium_tier === 'lifetime' ? '⭐' :
                             user.premium_tier === 'monthly' ? '💎' : '🎮'}
                          </span>
                          <span className="user-name">
                            {user.display_name || user.username || user.email?.split('@')[0]}
                          </span>
              {user.role === 'admin' ? (
                <span className="premium-badge lifetime">💻 ADMIN</span>
              ) : user.premium_tier === 'lifetime' ? (
                <span className="premium-badge lifetime">PREMIUM</span>
              ) : (
                <span className="premium-badge monthly">PRO</span>
              )}
                        </>
                      )}
                    </button>
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
                    {loading ? 'Loading...' : 'Login'}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.header>
    </>
  );
};

export default Header; 