import React, { useState, MouseEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
// BUG FIX #14: Import level curve from shared constants
import { calculateLevelProgress } from '@shared/constants/levels';
import './Header.css';

interface HeaderProps {
  onNavigateHome?: () => void;
  onNavigateGames?: () => void;
  isInLobby?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onNavigateHome, onNavigateGames, isInLobby }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading, session, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  // BUG FIX #14: Use shared level curve constant
  const { percent, nextLevelXp } = user?.level
    ? calculateLevelProgress(user.xp || 0, user.level)
    : { percent: 0, nextLevelXp: 500 };

  console.log('🎯 [HEADER] Rendering with auth state:', {
    loading,
    isAuthenticated,
    hasUser: !!user,
    hasSession: !!session,
    userName: user?.username || user?.display_name,
    timestamp: new Date().toISOString(),
  });

  const handleHomeClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (isInLobby && onNavigateHome) {
      e.preventDefault();
      onNavigateHome();
      return;
    }

    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGamesClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    if (isInLobby && onNavigateGames) {
      onNavigateGames();
    } else {
      const gamesSection = document.getElementById('games-section');
      if (gamesSection) {
        gamesSection.scrollIntoView({ behavior: 'smooth' });
      } else {
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

  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    console.log('🚪 [HEADER] Logging out...');

    try {
      await signOut();
      console.log('✅ [HEADER] Logged out successfully');

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
      <header className="header">
        <div className="container">
          <div className="header-content">
            <Link to="/" className="logo" onClick={handleHomeClick}>
              <img src="/logo.png" alt="GameBuddies.io" className="logo-image" />
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
                {isAuthenticated && user ? (
                  <div className="user-section">
                    {/* Level Badge & XP Bar */}
                    <div
                      className="level-container"
                      title={`Level ${user.level || 1} (${user.xp || 0} / ${nextLevelXp} XP)`}
                    >
                      <div className="level-badge">
                        <span>Lvl {user.level || 1}</span>
                      </div>
                      <div className="xp-bar-container">
                        <div className="xp-bar-fill" style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    {/* Achievement Points Badge */}
                    {!user.is_guest && (
                      <button
                        onClick={() => navigate('/achievements')}
                        className="achievement-points-badge"
                        title={`${user.achievement_points || 0} Achievement Points - Click to view achievements`}
                        aria-label="View your achievements"
                      >
                        <span className="trophy-icon">🏆</span>
                        <span className="points-value">{user.achievement_points || 0}</span>
                      </button>
                    )}

                    {/* Notification Bell */}
                    {!user.is_guest && <NotificationBell />}

                    <button
                      onClick={() => navigate('/account')}
                      className="user-info user-info-button"
                      title="View Account Settings"
                      aria-label="View your account settings"
                    >
                      {user.is_guest ? (
                        <>
                          <span className="user-icon">👤</span>
                          <span className="user-name">Guest</span>
                        </>
                      ) : (
                        <>
                          <span className="user-icon">
                            {user.premium_tier === 'lifetime'
                              ? '⭐'
                              : user.premium_tier === 'monthly'
                                ? '💎'
                                : '🎮'}
                          </span>
                          <span className="user-name">
                            {user.display_name || user.username || user.email?.split('@')[0]}
                          </span>
                          {user.role === 'admin' ? (
                            <span className="premium-badge lifetime">💻 ADMIN</span>
                          ) : user.premium_tier === 'lifetime' ? (
                            <span className="premium-badge lifetime">PREMIUM</span>
                          ) : user.premium_tier === 'monthly' ? (
                            <span className="premium-badge monthly">PRO</span>
                          ) : null}
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="logout-button"
                      disabled={isLoggingOut}
                      aria-label={isLoggingOut ? 'Logging out' : 'Log out of your account'}
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
      </header>
    </>
  );
};

export default Header;
