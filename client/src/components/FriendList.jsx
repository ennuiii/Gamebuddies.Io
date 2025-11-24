import React, { useState } from 'react';
import { useFriends } from '../contexts/FriendContext';
import './FriendList.css';

const FriendList = () => {
  const {
    friends,
    pendingRequests,
    onlineFriends,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    inviteFriend,
    isCurrentlyInLobby,
    currentRoomCode,
    currentLobbyGameName,
    currentLobbyThumbnail
  } = useFriends();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('online'); // online, all, pending, add
  const [searchQuery, setSearchQuery] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addResult, setAddResult] = useState(null);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    const result = await sendFriendRequest(addUsername);
    setAddResult(result);
    if (result.success) setAddUsername('');
  };

  // Filter friends
  const onlineList = friends.filter(f => onlineFriends.has(f.id));
  const allList = friends.filter(f => 
    f.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) {
    return (
      <div className="friend-list-toggle" onClick={() => setIsOpen(true)}>
        <span className="icon">👥</span>
        {onlineList.length > 0 && <span className="badge">{onlineList.length}</span>}
        {pendingRequests.length > 0 && <span className="badge pending">{pendingRequests.length}</span>}
      </div>
    );
  }

  return (
    <div className="friend-list-container">
      <div className="friend-list-header">
        <h3>Friends</h3>
        <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
      </div>

      <div className="friend-tabs">
        <button className={activeTab === 'online' ? 'active' : ''} onClick={() => setActiveTab('online')}>
          Online ({onlineList.length})
        </button>
        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
          All
        </button>
        <button className={activeTab === 'pending' ? 'active' : ''} onClick={() => setActiveTab('pending')}>
          Pending {pendingRequests.length > 0 && `(${pendingRequests.length})`}
        </button>
        <button className={activeTab === 'add' ? 'active' : ''} onClick={() => setActiveTab('add')}>
          Add
        </button>
      </div>

      <div className="friend-list-content">
        {activeTab === 'online' && (
          <div className="list online-list">
            {onlineList.length === 0 ? <p className="empty">No friends online</p> : 
              onlineList.map(friend => (
                <FriendItem
                  key={friend.friendshipId || friend.id}
                  friend={friend}
                  isOnline={true}
                  onInvite={() => inviteFriend(friend.id, currentRoomCode, currentLobbyGameName, currentLobbyThumbnail)}
                  isCurrentlyInLobby={isCurrentlyInLobby}
                />
              ))
            }
          </div>
        )}

        {activeTab === 'all' && (
          <div className="list all-list">
            <input 
              type="text" 
              placeholder="Search friends..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="friend-search"
            />
            {allList.map(friend => (
              <FriendItem
                key={friend.friendshipId || friend.id}
                friend={friend}
                isOnline={onlineFriends.has(friend.id)}
                onInvite={() => inviteFriend(friend.id, currentRoomCode, currentLobbyGameName, currentLobbyThumbnail)}
                isCurrentlyInLobby={isCurrentlyInLobby}
              />
            ))}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="list pending-list">
            {pendingRequests.map(req => (
              <div key={req.id} className="pending-item">
                <div className="info">
                  <span className="username">{req.user.username}</span>
                  <span className="type">{req.type === 'sent' ? 'Sent' : 'Received'}</span>
                </div>
                <div className="actions">
                  {req.type === 'received' && (
                    <button className="accept-btn" onClick={() => acceptFriendRequest(req.id)}>✓</button>
                  )}
                  <button className="reject-btn" onClick={() => rejectFriendRequest(req.id)}>✕</button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && <p className="empty">No pending requests</p>}
          </div>
        )}

        {activeTab === 'add' && (
          <div className="add-friend-section">
            <form onSubmit={handleAddFriend}>
              <input 
                type="text" 
                placeholder="Enter username..." 
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                required
              />
              <button type="submit">Send Request</button>
            </form>
            {addResult && (
              <p className={`message ${addResult.success ? 'success' : 'error'}`}>
                {addResult.message || addResult.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const FriendItem = ({ friend, isOnline, onInvite, isCurrentlyInLobby }) => (
  <div className="friend-item">
    <div className="avatar-wrapper">
      <img src={friend.avatar_url || '/avatars/free/Gabu.png'} alt={friend.username} />
      <span className={`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
    </div>
    <div className="info">
      <span className="username">{friend.username}</span>
      <span className="level">Lvl {friend.level || 1}</span>
    </div>
    <div className="actions">
      {isOnline && isCurrentlyInLobby && ( // Only show invite button if online AND in a lobby
        <button className="invite-btn" onClick={onInvite}>
          Invite
        </button>
      )}
    </div>
  </div>
);

export default FriendList;
