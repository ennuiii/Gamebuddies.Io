import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './AdminAffiliates.css';

const AdminAffiliates = () => {
  const { user } = useAuth();
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [commissionRate, setCommissionRate] = useState(0.20);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchAffiliates = async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/admin/affiliates', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setAffiliates(data.affiliates);
      } else {
        console.error('Failed to fetch affiliates:', data.error);
      }
    } catch (err) {
      console.error('Error fetching affiliates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAffiliates();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ code: newCode, commissionRate, name, email, notes })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`Affiliate ${data.affiliate.code} created!`);
        setNewCode('');
        setName('');
        setEmail('');
        setNotes('');
        fetchAffiliates();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="admin-page">Loading...</div>;

  return (
    <div className="admin-page">
      <h1>Admin: Affiliate Management</h1>
      
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="add-affiliate-section">
        <h2>Add New Affiliate</h2>
        <form onSubmit={handleAdd}>
          <div className="form-row">
            <div className="form-group">
              <label>Name (Optional):</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="Streamer Name"
              />
            </div>
            <div className="form-group">
              <label>Email (Optional):</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Referral Code:</label>
              <input 
                type="text" 
                value={newCode} 
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="STREAMER123"
                required
              />
            </div>
            <div className="form-group">
              <label>Commission Rate (0.0 - 1.0):</label>
              <input 
                type="number" 
                step="0.01" 
                value={commissionRate} 
                onChange={(e) => setCommissionRate(parseFloat(e.target.value))}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Notes (Internal):</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment details, contacts, etc."
              rows="3"
              className="notes-input"
            />
          </div>
          <button type="submit">Create Affiliate</button>
        </form>
      </div>

      <div className="affiliates-list">
        <h2>Existing Affiliates</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Rate</th>
              <th>Total Earnings</th>
              <th>Status</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            {affiliates.map(aff => (
              <tr key={aff.id}>
                <td>{aff.name || '-'}</td>
                <td className="code-cell">{aff.code}</td>
                <td>{(aff.commission_rate * 100).toFixed(0)}%</td>
                <td>€{aff.total_earnings || 0}</td>
                <td>{aff.status}</td>
                <td>{new Date(aff.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminAffiliates;
