-- =====================================================
-- Database Log Retention and Cleanup Functions
-- =====================================================
-- This migration adds functions to clean up old log data
-- and prevent unbounded database growth.
--
-- Run this migration to implement automatic log retention.
-- =====================================================

-- Function to cleanup old log data
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS TABLE(
    status_history_deleted INTEGER,
    room_events_deleted INTEGER,
    api_requests_deleted INTEGER,
    connection_metrics_deleted INTEGER,
    total_deleted INTEGER
) AS $$
DECLARE
    v_status_history_deleted INTEGER := 0;
    v_room_events_deleted INTEGER := 0;
    v_api_requests_deleted INTEGER := 0;
    v_connection_metrics_deleted INTEGER := 0;
    v_total_deleted INTEGER := 0;
BEGIN
    -- Delete player status history older than 90 days
    DELETE FROM public.player_status_history
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_status_history_deleted = ROW_COUNT;

    -- Delete room events older than 90 days
    DELETE FROM public.room_events
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_room_events_deleted = ROW_COUNT;

    -- Delete API requests older than 30 days
    DELETE FROM public.api_requests
    WHERE requested_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_api_requests_deleted = ROW_COUNT;

    -- Delete connection metrics older than 7 days
    DELETE FROM public.connection_metrics
    WHERE created_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS v_connection_metrics_deleted = ROW_COUNT;

    -- Calculate total
    v_total_deleted := v_status_history_deleted + v_room_events_deleted +
                       v_api_requests_deleted + v_connection_metrics_deleted;

    -- Log the cleanup operation
    INSERT INTO public.connection_metrics (metric_type, metric_value, tags)
    VALUES (
        'logs_cleaned',
        v_total_deleted,
        jsonb_build_object(
            'status_history', v_status_history_deleted,
            'room_events', v_room_events_deleted,
            'api_requests', v_api_requests_deleted,
            'connection_metrics', v_connection_metrics_deleted,
            'timestamp', NOW()
        )
    );

    -- Return summary
    RETURN QUERY SELECT
        v_status_history_deleted,
        v_room_events_deleted,
        v_api_requests_deleted,
        v_connection_metrics_deleted,
        v_total_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to get log statistics
CREATE OR REPLACE FUNCTION public.get_log_statistics()
RETURNS TABLE(
    table_name TEXT,
    total_rows BIGINT,
    rows_older_than_30_days BIGINT,
    rows_older_than_90_days BIGINT,
    oldest_entry TIMESTAMP WITH TIME ZONE,
    newest_entry TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Player status history stats
    RETURN QUERY
    SELECT
        'player_status_history'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days')::BIGINT,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days')::BIGINT,
        MIN(created_at),
        MAX(created_at)
    FROM public.player_status_history;

    -- Room events stats
    RETURN QUERY
    SELECT
        'room_events'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days')::BIGINT,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days')::BIGINT,
        MIN(created_at),
        MAX(created_at)
    FROM public.room_events;

    -- API requests stats
    RETURN QUERY
    SELECT
        'api_requests'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE requested_at < NOW() - INTERVAL '30 days')::BIGINT,
        COUNT(*) FILTER (WHERE requested_at < NOW() - INTERVAL '90 days')::BIGINT,
        MIN(requested_at),
        MAX(requested_at)
    FROM public.api_requests;

    -- Connection metrics stats
    RETURN QUERY
    SELECT
        'connection_metrics'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days')::BIGINT,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days')::BIGINT,
        MIN(created_at),
        MAX(created_at)
    FROM public.connection_metrics;
END;
$$ LANGUAGE plpgsql;

-- Schedule automatic cleanup (runs weekly on Sundays at 2 AM)
-- Note: Requires pg_cron extension
SELECT cron.schedule(
    'cleanup-old-logs-weekly',
    '0 2 * * 0',  -- Every Sunday at 2 AM
    'SELECT public.cleanup_old_logs();'
);

-- Create a view for easy log monitoring
CREATE OR REPLACE VIEW public.log_retention_status AS
SELECT
    table_name,
    total_rows,
    rows_older_than_30_days,
    rows_older_than_90_days,
    ROUND(100.0 * rows_older_than_30_days / NULLIF(total_rows, 0), 2) as pct_older_than_30_days,
    ROUND(100.0 * rows_older_than_90_days / NULLIF(total_rows, 0), 2) as pct_older_than_90_days,
    oldest_entry,
    newest_entry,
    EXTRACT(EPOCH FROM (newest_entry - oldest_entry)) / 86400 as age_range_days
FROM public.get_log_statistics();

-- Grant permissions
GRANT SELECT ON public.log_retention_status TO anon, authenticated;

COMMENT ON FUNCTION public.cleanup_old_logs() IS
'Deletes log data older than retention periods: 90 days for events/history, 30 days for API requests, 7 days for metrics';

COMMENT ON FUNCTION public.get_log_statistics() IS
'Returns statistics about log tables including row counts and age distribution';

COMMENT ON VIEW public.log_retention_status IS
'Provides an overview of log data retention status across all log tables';
