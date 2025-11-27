import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Gamepad2, Users, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFriends } from '../contexts/FriendContext';
import './MobileBottomNav.css';

interface MobileBottomNavProps {
  onNavigateHome: () => void;
  onNavigateGames: () => void;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onNavigateHome,
  onNavigateGames,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { toggleFriendList, isFriendListOpen, pendingRequests, onlineFriends } = useFriends();

  const handleAccountClick = (): void => {
    if (isAuthenticated) {
      navigate('/account');
    } else {
      navigate('/login');
    }
  };

  const isHomePage = location.pathname === '/' || location.pathname.startsWith('/lobby/');
  const isAccountPage = location.pathname === '/account';
  const isLoginPage = location.pathname === '/login';

  // Badge count for friends (pending requests take priority)
  const friendsBadgeCount = pendingRequests.length > 0 ? pendingRequests.length : onlineFriends.size;
  const showFriendsBadge = friendsBadgeCount > 0;

  return (
    <nav className="mobile-bottom-nav">
      <button
        className={`nav-item ${isHomePage && !isFriendListOpen ? 'active' : ''}`}
        onClick={onNavigateHome}
        aria-label="Home"
      >
        <Home className="nav-icon" />
        <span className="nav-label">Home</span>
      </button>

      <button
        className="nav-item"
        onClick={onNavigateGames}
        aria-label="Games"
      >
        <Gamepad2 className="nav-icon" />
        <span className="nav-label">Games</span>
      </button>

      <button
        className={`nav-item ${isFriendListOpen ? 'active' : ''}`}
        onClick={toggleFriendList}
        aria-label="Friends"
      >
        <Users className="nav-icon" />
        <span className="nav-label">Friends</span>
        {showFriendsBadge && (
          <span className={`nav-badge ${pendingRequests.length > 0 ? 'pending' : ''}`}>
            {friendsBadgeCount > 99 ? '99+' : friendsBadgeCount}
          </span>
        )}
      </button>

      <button
        className={`nav-item ${isAccountPage || isLoginPage ? 'active' : ''}`}
        onClick={handleAccountClick}
        aria-label={isAuthenticated ? 'Account' : 'Login'}
      >
        <User className="nav-icon" />
        <span className="nav-label">{isAuthenticated ? 'Account' : 'Login'}</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
