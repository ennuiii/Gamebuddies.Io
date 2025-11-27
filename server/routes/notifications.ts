import express, { Request, Response, Router } from 'express';
import { DatabaseService } from '../lib/supabase';
import { db } from '../lib/supabase';

// Middleware to ensure user is authenticated (mock or real)
// Ideally import from '../middlewares/auth' but we'll do a lightweight check here if needed
// For now, we assume the user ID is passed in the query or header if not using session middleware globally
// But wait, `app.ts` uses `authRouter` which likely sets session.
// Let's try to use standard auth middleware if available.
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';

const router: Router = express.Router();

/**
 * GET /api/notifications
 * Fetch unread notifications for the authenticated user.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Fetch unread notifications
    const { data: notifications, error } = await db.adminClient
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Notifications] Error fetching:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }

    res.json({
      success: true,
      notifications: notifications || []
    });
  } catch (error) {
    console.error('[Notifications] Unexpected error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a specific notification as read.
 */
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { error } = await db.adminClient
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      console.error('[Notifications] Error marking read:', error);
      return res.status(500).json({ success: false, error: 'Failed to mark as read' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Unexpected error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications for the user as read.
 */
router.post('/mark-all-read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { error } = await db.adminClient
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error('[Notifications] Error marking all read:', error);
      return res.status(500).json({ success: false, error: 'Failed to mark all as read' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Unexpected error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
