import express, { Response, Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';

const router: Router = express.Router();

// Type definitions
interface UserBasicInfo {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_style?: string | null;
  avatar_seed?: string | null;
  avatar_options?: Record<string, unknown> | null;
  level?: number;
}

interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  sender: UserBasicInfo;
  receiver: UserBasicInfo;
}

interface Friend extends UserBasicInfo {
  friendshipId: string;
  status: string;
  friendedAt: string;
}

interface PendingRequest {
  id: string;
  type: 'sent' | 'received';
  user: UserBasicInfo;
  createdAt: string;
}

// GET /api/friends
// List all accepted friends
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const friends: Friend[] = (friendships as any[]).map(f => {
      const isSender = f.user_id === userId;
      const friendData = isSender ? f.receiver : f.sender;
      return {
        friendshipId: f.id,
        ...friendData,
        status: 'accepted',
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
router.get('/pending', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending: PendingRequest[] = (requests as any[]).map(r => ({
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
// Send a friend request by username or userId
router.post('/request', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { username, targetUserId } = req.body;

    if (!username && !targetUserId) {
      res.status(400).json({ error: 'Username or targetUserId is required' });
      return;
    }

    let targetUser: { id: string } | null = null;

    if (targetUserId) {
      // Find target user by ID
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', targetUserId)
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      targetUser = data as { id: string };
    } else {
      // Find target user by username
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      targetUser = data as { id: string };
    }

    if (targetUser.id === userId) {
      res.status(400).json({ error: 'Cannot add yourself as a friend' });
      return;
    }

    // Check if friendship already exists
    const { data: existing } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .or(`and(user_id.eq.${userId},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${userId})`)
      .single();

    if (existing) {
      const existingFriendship = existing as { status: string };
      if (existingFriendship.status === 'accepted') {
        res.status(400).json({ error: 'Already friends' });
        return;
      }
      if (existingFriendship.status === 'blocked') {
        res.status(400).json({ error: 'Unable to send request' });
        return;
      }
      if (existingFriendship.status === 'pending') {
        res.status(400).json({ error: 'Request already pending' });
        return;
      }
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
router.put('/:id/accept', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const friendshipId = req.params.id;

    // Verify the request exists and is intended for this user
    const { data: friendship, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .single();

    if (fetchError || !friendship) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const typedFriendship = friendship as { friend_id: string; status: string };

    if (typedFriendship.friend_id !== userId) {
      res.status(403).json({ error: 'Not authorized to accept this request' });
      return;
    }

    if (typedFriendship.status !== 'pending') {
      res.status(400).json({ error: `Request is already ${typedFriendship.status}` });
      return;
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
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const friendshipId = req.params.id;

    // Verify ownership
    const { data: friendship, error: fetchError } = await supabaseAdmin
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .single();

    if (fetchError || !friendship) {
      res.status(404).json({ error: 'Friendship not found' });
      return;
    }

    const typedFriendship = friendship as { user_id: string; friend_id: string };

    if (typedFriendship.user_id !== userId && typedFriendship.friend_id !== userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
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

export default router;
