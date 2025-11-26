import { useEffect, useRef, DependencyList } from 'react';
import { getSupabaseClient } from './supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface RealtimeSubscriptionOptions<T extends Record<string, unknown>> {
  table: string;
  filters?: Record<string, string>;
  onInsert?: (newRecord: T, payload: RealtimePostgresChangesPayload<T>) => void;
  onUpdate?: (
    newRecord: T,
    oldRecord: T,
    payload: RealtimePostgresChangesPayload<T>
  ) => void;
  onDelete?: (oldRecord: T, payload: RealtimePostgresChangesPayload<T>) => void;
  dependencies?: DependencyList;
  enabled?: boolean;
}

export const useRealtimeSubscription = <T extends Record<string, unknown>>({
  table,
  filters = {},
  onInsert,
  onUpdate,
  onDelete,
  dependencies = [],
  enabled = true,
}: RealtimeSubscriptionOptions<T>): RealtimeChannel | null => {
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) {
      console.log(`🔔 [REALTIME] Subscription disabled for table: ${table}`);
      return;
    }

    const filterString = (filters as Record<string, string>).filter;
    if (filterString && filterString.includes('eq.null')) {
      console.log(`🔔 [REALTIME] Skipping subscription for ${table} - incomplete filter`);
      return;
    }

    console.log(`🔔 [REALTIME] Setting up subscription for table: ${table}`, filters);

    const setupSubscription = async (): Promise<void> => {
      try {
        const supabase = await getSupabaseClient();
        if (!supabase) {
          console.error(`❌ [REALTIME] Cannot setup subscription - Supabase client not available`);
          return;
        }

        if (channelRef.current) {
          console.log(`🧹 [REALTIME] Cleaning up existing subscription for ${table}`);
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
          subscriptionRef.current = null;
        }

        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const channelName = `${table}_changes_${timestamp}_${randomId}`;

        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: table,
              ...filters,
            },
            (payload: RealtimePostgresChangesPayload<T>) => {
              console.log(`🔔 [REALTIME] ${table} change:`, payload);

              switch (payload.eventType) {
                case 'INSERT':
                  if (onInsert) onInsert(payload.new as T, payload);
                  break;
                case 'UPDATE':
                  if (onUpdate) onUpdate(payload.new as T, payload.old as T, payload);
                  break;
                case 'DELETE':
                  if (onDelete) onDelete(payload.old as T, payload);
                  break;
                default:
                  console.log(`🔔 [REALTIME] Unknown event type`);
              }
            }
          );

        const subscription = channel.subscribe((status) => {
          console.log(`🔔 [REALTIME] Subscription status for ${table}:`, status);
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [REALTIME] Successfully subscribed to ${table}`);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.error(`❌ [REALTIME] Subscription error for ${table}:`, status);
          }
        });

        channelRef.current = channel;
        subscriptionRef.current = subscription as unknown as RealtimeChannel;
      } catch (error) {
        console.error(`❌ [REALTIME] Error setting up subscription for ${table}:`, error);
      }
    };

    setupSubscription();

    return () => {
      console.log(`🧹 [REALTIME] Cleaning up subscription for ${table}`);
      let cleanupCancelled = false;

      if (channelRef.current) {
        const channelToRemove = channelRef.current;
        getSupabaseClient().then(async (supabase) => {
          if (!cleanupCancelled && supabase && channelToRemove) {
            try {
              await supabase.removeChannel(channelToRemove);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return subscriptionRef.current;
};

export default useRealtimeSubscription;
