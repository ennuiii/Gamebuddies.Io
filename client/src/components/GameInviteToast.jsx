import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriends } from '../contexts/FriendContext';
import './GameInviteToast.css';

const GameInviteToast = () => {
  const { gameInvites, dismissInvite } = useFriends();
  const navigate = useNavigate();

  // Debug: Log what invites we have
  console.log('🎮 [TOAST] Rendering with invites:', gameInvites);

  if (gameInvites.length === 0) return null;

  const handleAccept = (invite) => {
    navigate(`/lobby/${invite.roomId}`);
    dismissInvite(invite.id);
  };

  return (
    <div className="game-invite-container">
      {gameInvites.map(invite => (
        <div key={invite.id} className="game-invite-toast">
          <div className="invite-content">
            <div className="invite-header">
              <span className="invite-icon">🎮</span>
              <span className="invite-title">Game Invite</span>
            </div>
            <div className="invite-body">
              <p className="invite-message">
                <span className="host-name">{invite.hostName}</span> wants you to play
              </p>
              <div className="game-info-row">
                {invite.gameThumbnail && (
                  <img
                    src={invite.gameThumbnail}
                    alt={invite.gameName}
                    className="game-thumbnail"
                  />
                )}
                <p className="game-name-display">{invite.gameName}</p>
              </div>
            </div>
          </div>
          <div className="invite-actions">
            <button className="decline-btn" onClick={() => dismissInvite(invite.id)}>
              Decline
            </button>
            <button className="accept-btn" onClick={() => handleAccept(invite)}>
              Join
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GameInviteToast;
