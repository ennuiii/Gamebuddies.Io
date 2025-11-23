import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/admin/dashboard-stats', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        if (data.success) setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="admin-page">Loading Dashboard...</div>;
  if (!stats) return <div className="admin-page">Failed to load stats</div>;

  const { metrics, recentUsers, gameStats } = stats;

  return (
    <div className="admin-page">
      <h1>Admin Dashboard</h1>

      {/* Key Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Total Users</h3>
          <div className="value">{metrics.totalUsers}</div>
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
      </div>

      <div className="dashboard-content">
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
