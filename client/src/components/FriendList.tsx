import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useFriends, Friend, PendingRequest } from '../contexts/FriendContext';
import { useAuth } from '../contexts/AuthContext';
import './FriendList.css';

interface AddResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface FriendItemProps {
  friend: Friend;
  isOnline: boolean;
  onInvite: () => void;
  isCurrentlyInLobby: boolean;
}

const FriendItem: React.FC<FriendItemProps> = ({ friend, isOnline, onInvite, isCurrentlyInLobby }) => (
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
      {isOnline && isCurrentlyInLobby && (
        <button className="invite-btn" onClick={onInvite}>
          Invite
        </button>
      )}
    </div>
  </div>
);

const FriendList: React.FC = () => {
  const { isAuthenticated } = useAuth();
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
    currentLobbyThumbnail,
    isFriendListOpen,
    setIsFriendListOpen,
  } = useFriends();

  // Hide friend list for non-authenticated users
  if (!isAuthenticated) {
    return null;
  }

  const [activeTab, setActiveTab] = useState<'online' | 'all' | 'pending' | 'add'>('online');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [addUsername, setAddUsername] = useState<string>('');
  const [addResult, setAddResult] = useState<AddResult | null>(null);

  const handleAddFriend = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const result = await sendFriendRequest(addUsername);
    setAddResult(result);
    if (result.success) setAddUsername('');
  };

  // Filter friends
  const onlineList = friends.filter((f) => onlineFriends.has(f.id));
  const allList = friends.filter(
    (f) =>
      f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isFriendListOpen) {
    return (
      <button
        className="friend-list-toggle"
        onClick={() => setIsFriendListOpen(true)}
        aria-label={`Open friends list. ${onlineList.length} online${pendingRequests.length > 0 ? `, ${pendingRequests.length} pending requests` : ''}`}
        aria-expanded="false"
      >
        <span className="icon" aria-hidden="true">👥</span>
        {onlineList.length > 0 && <span className="badge" aria-hidden="true">{onlineList.length}</span>}
        {pendingRequests.length > 0 && (
          <span className="badge pending" aria-hidden="true">{pendingRequests.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="friend-list-container">
      <div className="friend-list-header">
        <h3 id="friend-list-title">Friends</h3>
        <button
          className="close-btn"
          onClick={() => setIsFriendListOpen(false)}
          aria-label="Close friends list"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="friend-tabs" role="tablist" aria-label="Friend list tabs">
        <button
          role="tab"
          aria-selected={activeTab === 'online'}
          aria-controls="online-tab-panel"
          className={activeTab === 'online' ? 'active' : ''}
          onClick={() => setActiveTab('online')}
        >
          Online ({onlineList.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'all'}
          aria-controls="all-tab-panel"
          className={activeTab === 'all' ? 'active' : ''}
          onClick={() => setActiveTab('all')}
        >
          All
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'pending'}
          aria-controls="pending-tab-panel"
          className={activeTab === 'pending' ? 'active' : ''}
          onClick={() => setActiveTab('pending')}
        >
          Pending {pendingRequests.length > 0 && `(${pendingRequests.length})`}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'add'}
          aria-controls="add-tab-panel"
          className={activeTab === 'add' ? 'active' : ''}
          onClick={() => setActiveTab('add')}
        >
          Add
        </button>
      </div>

      <div className="friend-list-content">
        {activeTab === 'online' && (
          <div className="list online-list">
            {onlineList.length === 0 ? (
              <p className="empty">No friends online</p>
            ) : (
              onlineList.map((friend) => (
                <FriendItem
                  key={friend.friendshipId || friend.id}
                  friend={friend}
                  isOnline={true}
                  onInvite={() =>
                    inviteFriend(friend.id, currentRoomCode, currentLobbyGameName, currentLobbyThumbnail)
                  }
                  isCurrentlyInLobby={isCurrentlyInLobby}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'all' && (
          <div className="list all-list">
            <input
              type="text"
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="friend-search"
              aria-label="Search friends by username"
            />
            {allList.map((friend) => (
              <FriendItem
                key={friend.friendshipId || friend.id}
                friend={friend}
                isOnline={onlineFriends.has(friend.id)}
                onInvite={() =>
                  inviteFriend(friend.id, currentRoomCode, currentLobbyGameName, currentLobbyThumbnail)
                }
                isCurrentlyInLobby={isCurrentlyInLobby}
              />
            ))}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="list pending-list">
            {pendingRequests.map((req) => (
              <div key={req.id} className="pending-item">
                <div className="info">
                  <span className="username">{req.user?.username || req.from_username || 'Unknown'}</span>
                  <span className="type">{req.type === 'sent' ? 'Sent' : 'Received'}</span>
                </div>
                <div className="actions">
                  {req.type !== 'sent' && (
                    <button
                      className="accept-btn"
                      onClick={() => acceptFriendRequest(req.id)}
                      aria-label={`Accept friend request from ${req.user?.username || req.from_username || 'user'}`}
                    >
                      <span aria-hidden="true">✓</span>
                    </button>
                  )}
                  <button
                    className="reject-btn"
                    onClick={() => rejectFriendRequest(req.id)}
                    aria-label={`${req.type === 'sent' ? 'Cancel' : 'Reject'} friend request ${req.type === 'sent' ? 'to' : 'from'} ${req.user?.username || req.from_username || 'user'}`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setAddUsername(e.target.value)}
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

export default FriendList;
