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
 */
export const useRealtimeSubscription = ({
  table,
  filters = {},
  onInsert,
  onUpdate,
  onDelete,
  dependencies = []
}) => {
  const subscriptionRef = useRef(null);

  useEffect(() => {
    console.log(`🔔 [REALTIME] Setting up subscription for table: ${table}`, filters);

    const setupSubscription = async () => {
      try {
        const supabase = await getSupabaseClient();
        if (!supabase) {
          console.error(`❌ [REALTIME] Cannot setup subscription - Supabase client not available`);
          return;
        }

        // Create subscription
        let subscription = supabase
          .channel(`${table}_changes`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: table,
              ...filters
            },
            (payload) => {
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
          )
          .subscribe((status) => {
            console.log(`🔔 [REALTIME] Subscription status for ${table}:`, status);
          });

        subscriptionRef.current = subscription;
      } catch (error) {
        console.error(`❌ [REALTIME] Error setting up subscription for ${table}:`, error);
      }
    };

    setupSubscription();

    // Cleanup function
    return () => {
      console.log(`🧹 [REALTIME] Cleaning up subscription for ${table}`);
      if (subscriptionRef.current) {
        getSupabaseClient().then(supabase => {
          if (supabase) {
            supabase.removeChannel(subscriptionRef.current);
          }
        });
        subscriptionRef.current = null;
      }
    };
  }, dependencies);

  return subscriptionRef.current;
};

export default useRealtimeSubscription; 