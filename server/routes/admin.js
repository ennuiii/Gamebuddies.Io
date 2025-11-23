const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const router = express.Router();

// Middleware to ensure only admins can access these routes
router.use(requireAuth);
router.use(requireAdmin);

// GET /api/admin/affiliates
router.get('/affiliates', async (req, res) => {
  try {
    // Join with users to get usernames if needed
    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .select(`
        *,
        user:users(username, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, affiliates: data });
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/affiliates (Create new affiliate)
router.post('/affiliates', async (req, res) => {
  try {
    const { code, userId, commissionRate } = req.body;

    if (!code) return res.status(400).json({ error: 'Code is required' });

    // Check if code exists
    const { data: existing } = await supabaseAdmin
      .from('affiliates')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (existing) return res.status(400).json({ error: 'Code already taken' });

    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .insert({
        code: code.toUpperCase(),
        user_id: userId || null, // Optional linking to existing user
        commission_rate: commissionRate || 0.20,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, affiliate: data });
  } catch (error) {
    console.error('Error creating affiliate:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
