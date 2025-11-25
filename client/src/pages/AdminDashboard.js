import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [liveRooms, setLiveRooms] = useState([]);
  const [onlineStats, setOnlineStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Authorization': `Bearer ${session.access_token}` };

      // Fetch all data in parallel
      const [statsRes, roomsRes, onlineRes] = await Promise.all([
        fetch('/api/admin/dashboard-stats', { headers }),
        fetch('/api/admin/live-rooms', { headers }),
        fetch('/api/admin/online-stats', { headers })
      ]);

      const [statsData, roomsData, onlineData] = await Promise.all([
        statsRes.json(),
        roomsRes.json(),
        onlineRes.json()
      ]);

      if (statsData.success) setStats(statsData);
      if (roomsData.success) setLiveRooms(roomsData.rooms || []);
      if (onlineData.success) setOnlineStats(onlineData.stats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleRefresh = () => {
    fetchAllData(true);
  };

  if (loading) return <div className="admin-page">Loading Dashboard...</div>;
  if (!stats) return <div className="admin-page">Failed to load stats</div>;

  const { metrics, recentUsers, gameStats } = stats;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Registered Users</h3>
          <div className="value">
            {metrics.registeredUsers}
            <span style={{display: 'block', fontSize: '0.4em', opacity: 0.6, fontWeight: 'normal', marginTop: '5px'}}>
              {metrics.totalUsers} total (inc. guests)
            </span>
          </div>
        </div>
        <div className="metric-card highlight">
          <h3>Premium Members</h3>
          <div className="value">{metrics.premiumUsers}</div>
        </div>
        <div className="metric-card">
          <h3>Active Rooms</h3>
          <div className="value">{metrics.activeRooms}</div>
        </div>
        <div className="metric-card">
          <h3>Total Games Played</h3>
          <div className="value">{metrics.totalSessions}</div>
        </div>
        {onlineStats && (
          <div className="metric-card online">
            <h3>Online Now</h3>
            <div className="value">{onlineStats.totalConnections || 0}</div>
          </div>
        )}
      </div>

      <div className="dashboard-content">
        {/* Live Rooms Panel */}
        <div className="panel wide">
          <h2>Live Rooms ({liveRooms.length})</h2>
          {liveRooms.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Room Code</th>
                  <th>Host</th>
                  <th>Game</th>
                  <th>Players</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {liveRooms.map(room => (
                  <tr key={room.roomCode}>
                    <td>
                      <code className="room-code">{room.roomCode}</code>
                      {room.streamerMode && <span className="streamer-badge" title="Streamer Mode">🎥</span>}
                    </td>
                    <td>{room.hostName}</td>
                    <td>
                      <span className={`game-badge ${room.currentGame}`}>
                        {room.currentGame}
                      </span>
                    </td>
                    <td>
                      <span className="player-count">{room.playerCount}/{room.maxPlayers}</span>
                      <div className="player-list-mini">
                        {room.players.slice(0, 5).map((p, i) => (
                          <span key={i} className="player-name-mini" title={p.name}>
                            {p.role === 'host' ? '👑' : '👤'} {p.name}
                          </span>
                        ))}
                        {room.players.length > 5 && <span className="more">+{room.players.length - 5} more</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${room.status}`}>
                        {room.status}
                      </span>
                    </td>
                    <td>{new Date(room.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No active rooms right now</div>
          )}
        </div>

        {/* Recent Users Table */}
        <div className="panel">
          <h2>Newest Members</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Tier</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <span className="username">{u.username}</span>
                      <span className="email">{u.email}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`tier-badge ${u.premium_tier}`}>
                      {u.premium_tier}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Game Popularity */}
        <div className="panel">
          <h2>Popular Games (Last 500 Sessions)</h2>
          <div className="game-stats-list">
            {Object.entries(gameStats)
              .sort(([,a], [,b]) => b - a)
              .map(([game, count]) => (
                <div key={game} className="stat-row">
                  <span className="stat-label">{game}</span>
                  <div className="stat-bar-container">
                    <div
                      className="stat-bar"
                      style={{ width: `${(count / 500) * 100 * 5}%` }} /* Scale up for visibility */
                    ></div>
                  </div>
                  <span className="stat-value">{count}</span>
                </div>
              ))}
            {Object.keys(gameStats).length === 0 && <div className="empty">No game data yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
