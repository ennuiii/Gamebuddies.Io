"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middlewares/auth");
const router = express_1.default.Router();
// GET /api/friends
// List all accepted friends
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch friendships where status is 'accepted'
        const { data: friendships, error } = await supabase_1.supabaseAdmin
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
        if (error)
            throw error;
        // Format the response to be a flat list of "friend" objects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const friends = friendships.map(f => {
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
    }
    catch (error) {
        console.error('❌ [FRIENDS] List error:', error);
        res.status(500).json({ error: 'Failed to fetch friends' });
    }
});
// GET /api/friends/pending
// List pending requests (sent and received)
router.get('/pending', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: requests, error } = await supabase_1.supabaseAdmin
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
        if (error)
            throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pending = requests.map(r => ({
            id: r.id,
            type: r.user_id === userId ? 'sent' : 'received',
            user: r.user_id === userId ? r.receiver : r.sender,
            createdAt: r.created_at
        }));
        res.json({ success: true, pending });
    }
    catch (error) {
        console.error('❌ [FRIENDS] Pending list error:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
});
// POST /api/friends/request
// Send a friend request by username
router.post('/request', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { username } = req.body;
        if (!username) {
            res.status(400).json({ error: 'Username is required' });
            return;
        }
        // Find target user
        const { data: targetUser, error: userError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        if (userError || !targetUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (targetUser.id === userId) {
            res.status(400).json({ error: 'Cannot add yourself as a friend' });
            return;
        }
        // Check if friendship already exists
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('friendships')
            .select('*')
            .or(`and(user_id.eq.${userId},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${userId})`)
            .single();
        if (existing) {
            const existingFriendship = existing;
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
        const { error: insertError } = await supabase_1.supabaseAdmin
            .from('friendships')
            .insert({
            user_id: userId,
            friend_id: targetUser.id,
            status: 'pending'
        });
        if (insertError)
            throw insertError;
        res.json({ success: true, message: 'Friend request sent' });
    }
    catch (error) {
        console.error('❌ [FRIENDS] Send request error:', error);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
});
// PUT /api/friends/:id/accept
// Accept a friend request
router.put('/:id/accept', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const friendshipId = req.params.id;
        // Verify the request exists and is intended for this user
        const { data: friendship, error: fetchError } = await supabase_1.supabaseAdmin
            .from('friendships')
            .select('*')
            .eq('id', friendshipId)
            .single();
        if (fetchError || !friendship) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        const typedFriendship = friendship;
        if (typedFriendship.friend_id !== userId) {
            res.status(403).json({ error: 'Not authorized to accept this request' });
            return;
        }
        if (typedFriendship.status !== 'pending') {
            res.status(400).json({ error: `Request is already ${typedFriendship.status}` });
            return;
        }
        // Update status
        const { error: updateError } = await supabase_1.supabaseAdmin
            .from('friendships')
            .update({ status: 'accepted', updated_at: new Date() })
            .eq('id', friendshipId);
        if (updateError)
            throw updateError;
        res.json({ success: true, message: 'Friend request accepted' });
    }
    catch (error) {
        console.error('❌ [FRIENDS] Accept error:', error);
        res.status(500).json({ error: 'Failed to accept request' });
    }
});
// DELETE /api/friends/:id
// Remove friend or cancel/reject request
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const friendshipId = req.params.id;
        // Verify ownership
        const { data: friendship, error: fetchError } = await supabase_1.supabaseAdmin
            .from('friendships')
            .select('*')
            .eq('id', friendshipId)
            .single();
        if (fetchError || !friendship) {
            res.status(404).json({ error: 'Friendship not found' });
            return;
        }
        const typedFriendship = friendship;
        if (typedFriendship.user_id !== userId && typedFriendship.friend_id !== userId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        // Delete record
        const { error: deleteError } = await supabase_1.supabaseAdmin
            .from('friendships')
            .delete()
            .eq('id', friendshipId);
        if (deleteError)
            throw deleteError;
        res.json({ success: true, message: 'Removed successfully' });
    }
    catch (error) {
        console.error('❌ [FRIENDS] Remove error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});
exports.default = router;
//# sourceMappingURL=friends.js.map