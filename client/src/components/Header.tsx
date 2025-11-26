import React, { useState, MouseEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

interface LevelCurveEntry {
  level: number;
  xp: number;
}

// Level Curve Configuration (Must match DB)
const LEVEL_CURVE: LevelCurveEntry[] = [
  { level: 1, xp: 0 },
  { level: 2, xp: 500 },
  { level: 3, xp: 1500 },
  { level: 4, xp: 3500 },
  { level: 5, xp: 7500 },
  { level: 6, xp: 15000 },
  { level: 7, xp: 25000 },
  { level: 8, xp: 40000 },
  { level: 9, xp: 65000 },
  { level: 10, xp: 100000 },
];

interface HeaderProps {
  onNavigateHome?: () => void;
  onNavigateGames?: () => void;
  isInLobby?: boolean;
}

interface ProgressResult {
  percent: number;
  currentLevelXp: number;
  nextLevelXp: number;
}

const Header: React.FC<HeaderProps> = ({ onNavigateHome, onNavigateGames, isInLobby }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading, session, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const calculateProgress = (): ProgressResult => {
    if (!user?.level) return { percent: 0, currentLevelXp: 0, nextLevelXp: 500 };

    const currentLevel = user.level;
    const currentTotalXp = user.xp || 0;

    // Find XP required for current and next level
    const currentLevelStart = LEVEL_CURVE.find((l) => l.level === currentLevel)?.xp || 0;
    const nextLevelStart = LEVEL_CURVE.find((l) => l.level === currentLevel + 1)?.xp;

    // If max level (no next level), show 100%
    if (nextLevelStart === undefined) {
      return { percent: 100, currentLevelXp: currentTotalXp, nextLevelXp: currentTotalXp };
    }

    const xpInThisLevel = currentTotalXp - currentLevelStart;
    const xpNeededForLevel = nextLevelStart - currentLevelStart;

    const percent = Math.min(100, Math.floor((xpInThisLevel / xpNeededForLevel) * 100));

    return { percent, currentLevelXp: currentTotalXp, nextLevelXp: nextLevelStart };
  };

  const { percent, nextLevelXp } = calculateProgress();

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
                    <button onClick={handleLogout} className="logout-button" disabled={isLoggingOut}>
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
