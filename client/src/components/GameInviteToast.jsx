import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriends } from '../contexts/FriendContext';
import './GameInviteToast.css';

const GameInviteToast = () => {
  const { gameInvites, dismissInvite } = useFriends();
  const navigate = useNavigate();

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
            <p className="invite-message">
              <span className="host-name">{invite.hostName}</span> invited you to play 
              <span className="game-name"> {invite.gameName}</span>!
            </p>
          </div>
          <div className="invite-actions">
            <button className="decline-btn" onClick={() => dismissInvite(invite.id)}>
              Decline
            </button>
            <button className="accept-btn" onClick={() => handleAccept(invite)}>
              Accept
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GameInviteToast;
