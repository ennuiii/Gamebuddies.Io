import { useEffect, useRef } from 'react';
import { getSupabaseClient } from './supabase';

/**
 * Custom hook for Supabase Realtime subscriptions
 * @param {string} table - Table name to subscribe to
 * @param {Object} filters - Filters for the subscription
 * @param {Function} onInsert - Callback for INSERT events
 * @param {Function} onUpdate - Callback for UPDATE events
 * @param {Function} onDelete - Callback for DELETE events
 * @param {Array} dependencies - Dependencies array for useEffect
 * @param {boolean} enabled - Whether to enable the subscription (default: true)
 */
export const useRealtimeSubscription = ({
  table,
  filters = {},
  onInsert,
  onUpdate,
  onDelete,
  dependencies = [],
  enabled = true,
}) => {
  const subscriptionRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    // Skip if not enabled or if filters are incomplete
    if (!enabled) {
      console.log(`🔔 [REALTIME] Subscription disabled for table: ${table}`);
      return;
    }

    // Check if filters have required values (especially for room-specific subscriptions)
    const filterString = filters.filter;
    if (filterString && filterString.includes('eq.null')) {
      console.log(`🔔 [REALTIME] Skipping subscription for ${table} - incomplete filter`);
      return;
    }

    console.log(`🔔 [REALTIME] Setting up subscription for table: ${table}`, filters);

    const setupSubscription = async () => {
      try {
        const supabase = await getSupabaseClient();
        if (!supabase) {
          console.error(`❌ [REALTIME] Cannot setup subscription - Supabase client not available`);
          return;
        }

        // Clean up any existing subscription first
        if (channelRef.current) {
          console.log(`🧹 [REALTIME] Cleaning up existing subscription for ${table}`);
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
          subscriptionRef.current = null;
        }

        // Generate unique channel name to avoid conflicts
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const channelName = `${table}_changes_${timestamp}_${randomId}`;

        // Create subscription
        const channel = supabase.channel(channelName).on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: table,
            ...filters,
          },
          payload => {
            console.log(`🔔 [REALTIME] ${table} change:`, payload);

            switch (payload.eventType) {
              case 'INSERT':
                if (onInsert) onInsert(payload.new, payload);
                break;
              case 'UPDATE':
                if (onUpdate) onUpdate(payload.new, payload.old, payload);
                break;
              case 'DELETE':
                if (onDelete) onDelete(payload.old, payload);
                break;
              default:
                console.log(`🔔 [REALTIME] Unknown event type: ${payload.eventType}`);
            }
          }
        );

        const subscription = await channel.subscribe(status => {
          console.log(`🔔 [REALTIME] Subscription status for ${table}:`, status);
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [REALTIME] Successfully subscribed to ${table}`);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.error(`❌ [REALTIME] Subscription error for ${table}:`, status);
          }
        });

        channelRef.current = channel;
        subscriptionRef.current = subscription;
      } catch (error) {
        console.error(`❌ [REALTIME] Error setting up subscription for ${table}:`, error);
      }
    };

    setupSubscription();

    // Cleanup function
    return () => {
      console.log(`🧹 [REALTIME] Cleaning up subscription for ${table}`);
      if (channelRef.current) {
        getSupabaseClient().then(async supabase => {
          if (supabase && channelRef.current) {
            try {
              await supabase.removeChannel(channelRef.current);
              console.log(`✅ [REALTIME] Successfully cleaned up subscription for ${table}`);
            } catch (error) {
              console.error(`❌ [REALTIME] Error cleaning up subscription for ${table}:`, error);
            }
          }
        });
        channelRef.current = null;
        subscriptionRef.current = null;
      }
    };
  }, dependencies);

  return subscriptionRef.current;
};

export default useRealtimeSubscription;
