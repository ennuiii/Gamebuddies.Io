import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './AdminAffiliates.css';

interface Affiliate {
  id: string;
  code: string;
  name?: string;
  commission_rate: number;
  total_earnings: number;
  status: string;
  created_at: string;
}

const AdminAffiliates: React.FC = () => {
  const { user } = useAuth();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [newCode, setNewCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(0.2);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const fetchAffiliates = async (): Promise<void> => {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/affiliates', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setAffiliates(data.affiliates);
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

  const handleAdd = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ code: newCode, commissionRate, name, email, notes }),
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
      setError((err as Error).message);
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="Streamer Name"
              />
            </div>
            <div className="form-group">
              <label>Email (Optional):</label>
              <input
                type="email"
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
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
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewCode(e.target.value.toUpperCase())
                }
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
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setCommissionRate(parseFloat(e.target.value))
                }
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Notes (Internal):</label>
            <textarea
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Payment details, contacts, etc."
              rows={3}
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
            {affiliates.map((aff) => (
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
