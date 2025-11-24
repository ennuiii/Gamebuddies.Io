const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('../middlewares/auth');
const router = express.Router();

// GET /api/friends
// List all accepted friends
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch friendships where status is 'accepted'
    const { data: friendships, error } = await supabaseAdmin
      .from('friendships')
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at,
        sender:users!user_id(id, username, display_name, avatar_url, avatar_style, avatar_seed, avatar_options, level),
        receiver:users!friend_id(id, username, display_name, avatar_url, avatar_style, avatar_seed, avatar_options, level)
      `)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (error) throw error;

    // Format the response to be a flat list of "friend" objects
    const friends = friendships.map(f => {
      const isSender = f.user_id === userId;
      const friendData = isSender ? f.receiver : f.sender;
      return {
        friendshipId: f.id,
        ...friendData,
        status: 'accepted', // Explicitly state status
        friendedAt: f.created_at
      };
    });

    res.json({ success: true, friends });
  } catch (error) {
    console.error('❌ [FRIENDS] List error:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// GET /api/friends/pending
// List pending requests (sent and received)
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: requests, error } = await supabaseAdmin
      .from('friendships')
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at,
        sender:users!user_id(id, username, display_name, avatar_url),
        receiver:users!friend_id(id, username, display_name, avatar_url)
      `)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'pending');

    if (error) throw error;

    const pending = requests.map(r => ({
      id: r.id,
      type: r.user_id === userId ? 'sent' : 'received',
      user: r.user_id === userId ? r.receiver : r.sender,
      createdAt: r.created_at
    }));

    res.json({ success: true, pending });
  } catch (error) {
    console.error('❌ [FRIENDS] Pending list error:', error);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// POST /api/friends/request
// Send a friend request by username
router.post('/request', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { username } = req.body;

    if (!username) return res.status(400).json({ error: 'Username is required' });

    // Find target user
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot add yourself as a friend' });
    }

    // Check if friendship already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .or(`and(user_id.eq.${userId},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${userId})`)
      .single();

    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
      if (existing.status === 'blocked') return res.status(400).json({ error: 'Unable to send request' });
      if (existing.status === 'pending') return res.status(400).json({ error: 'Request already pending' });
    }

    // Create request
    const { error: insertError } = await supabaseAdmin
      .from('friendships')
      .insert({
        user_id: userId,
        friend_id: targetUser.id,
        status: 'pending'
      });

    if (insertError) throw insertError;

    res.json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    console.error('❌ [FRIENDS] Send request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// PUT /api/friends/:id/accept
// Accept a friend request
router.put('/:id/accept', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendshipId = req.params.id;

    // Verify the request exists and is intended for this user
    const { data: friendship, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .single();

    if (fetchError || !friendship) return res.status(404).json({ error: 'Request not found' });

    if (friendship.friend_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to accept this request' });
    }

    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${friendship.status}` });
    }

    // Update status
    const { error: updateError } = await supabaseAdmin
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date() })
      .eq('id', friendshipId);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    console.error('❌ [FRIENDS] Accept error:', error);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// DELETE /api/friends/:id
// Remove friend or cancel/reject request
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendshipId = req.params.id;

    // Verify ownership
    const { data: friendship, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .single();

    if (fetchError || !friendship) return res.status(404).json({ error: 'Friendship not found' });

    if (friendship.user_id !== userId && friendship.friend_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete record
    const { error: deleteError } = await supabaseAdmin
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Removed successfully' });
  } catch (error) {
    console.error('❌ [FRIENDS] Remove error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

module.exports = router;
