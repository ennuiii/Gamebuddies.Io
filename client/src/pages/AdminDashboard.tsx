import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './AdminDashboard.css';

interface Metrics {
  registeredUsers: number;
  totalUsers: number;
  premiumUsers: number;
  activeRooms: number;
  totalSessions: number;
}

interface RecentUser {
  id: string;
  username: string;
  email: string;
  premium_tier: string;
  created_at: string;
}

interface Player {
  name: string;
  role: string;
}

interface LiveRoom {
  roomCode: string;
  hostName: string;
  currentGame: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  streamerMode: boolean;
  players: Player[];
  createdAt: string;
}

interface OnlineStats {
  totalConnections: number;
}

interface Stats {
  metrics: Metrics;
  recentUsers: RecentUser[];
  gameStats: Record<string, number>;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [onlineStats, setOnlineStats] = useState<OnlineStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchAllData = useCallback(async (showRefreshing = false): Promise<void> => {
    if (showRefreshing) setRefreshing(true);
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      const [statsRes, roomsRes, onlineRes] = await Promise.all([
        fetch('/api/admin/dashboard-stats', { headers }),
        fetch('/api/admin/live-rooms', { headers }),
        fetch('/api/admin/online-stats', { headers }),
      ]);

      const [statsData, roomsData, onlineData] = await Promise.all([
        statsRes.json(),
        roomsRes.json(),
        onlineRes.json(),
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

  const handleRefresh = (): void => {
    fetchAllData(true);
  };

  if (loading) return <div className="admin-page">Loading Dashboard...</div>;
  if (!stats) return <div className="admin-page">Failed to load stats</div>;

  const { metrics, recentUsers, gameStats } = stats;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Registered Users</h3>
          <div className="value">{metrics.registeredUsers}</div>
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
                </tr>
              </thead>
              <tbody>
                {liveRooms.map((room) => (
                  <tr key={room.roomCode}>
                    <td>
                      <code className="room-code">{room.roomCode}</code>
                    </td>
                    <td>{room.hostName}</td>
                    <td>{room.currentGame}</td>
                    <td>
                      {room.playerCount}/{room.maxPlayers}
                    </td>
                    <td>
                      <span className={`status-badge ${room.status}`}>{room.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No active rooms right now</div>
          )}
        </div>

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
              {recentUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    <span className={`tier-badge ${u.premium_tier}`}>{u.premium_tier}</span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Popular Games</h2>
          <div className="game-stats-list">
            {Object.entries(gameStats)
              .sort(([, a], [, b]) => b - a)
              .map(([game, count]) => (
                <div key={game} className="stat-row">
                  <span className="stat-label">{game}</span>
                  <span className="stat-value">{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
