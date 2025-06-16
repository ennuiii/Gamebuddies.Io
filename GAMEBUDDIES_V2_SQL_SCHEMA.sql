-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  key_hash character varying NOT NULL UNIQUE,
  game_id character varying,
  name character varying NOT NULL,
  description text,
  permissions jsonb DEFAULT '["read", "write"]'::jsonb,
  rate_limit integer DEFAULT 1000,
  is_active boolean DEFAULT true,
  last_used timestamp with time zone,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp with time zone,
  created_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id),
  CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.api_requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  api_key_id uuid,
  method character varying NOT NULL,
  endpoint text NOT NULL,
  status_code integer,
  requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  response_time_ms integer,
  ip_address inet,
  user_agent text,
  request_data jsonb DEFAULT '{}'::jsonb,
  response_data jsonb DEFAULT '{}'::jsonb,
  error_message text,
  CONSTRAINT api_requests_pkey PRIMARY KEY (id),
  CONSTRAINT api_requests_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id)
);
CREATE TABLE public.game_sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  game_id character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::character varying, 'completed'::character varying, 'abandoned'::character varying]::text[])),
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  game_state jsonb DEFAULT '{}'::jsonb,
  game_result jsonb DEFAULT '{}'::jsonb,
  started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  ended_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT game_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT game_sessions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT game_sessions_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id)
);
CREATE TABLE public.games (
  id character varying NOT NULL,
  name character varying NOT NULL,
  display_name character varying NOT NULL,
  description text,
  thumbnail_url text,
  base_url text NOT NULL,
  is_external boolean DEFAULT false,
  requires_api_key boolean DEFAULT false,
  min_players integer DEFAULT 2,
  max_players integer DEFAULT 10,
  supports_spectators boolean DEFAULT false,
  settings_schema jsonb DEFAULT '{}'::jsonb,
  default_settings jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  maintenance_mode boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT games_pkey PRIMARY KEY (id)
);
CREATE TABLE public.room_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  user_id uuid,
  event_type character varying NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_events_pkey PRIMARY KEY (id),
  CONSTRAINT room_events_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT room_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.room_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role character varying NOT NULL DEFAULT 'player'::character varying CHECK (role::text = ANY (ARRAY['host'::character varying, 'player'::character varying, 'spectator'::character varying]::text[])),
  is_connected boolean DEFAULT true,
  last_ping timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  socket_id character varying,
  is_ready boolean DEFAULT false,
  in_game boolean DEFAULT false,
  current_location character varying DEFAULT 'lobby'::character varying CHECK (current_location::text = ANY (ARRAY['lobby'::character varying, 'game'::character varying, 'disconnected'::character varying]::text[])),
  game_data jsonb DEFAULT '{}'::jsonb,
  joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  left_at timestamp with time zone,
  CONSTRAINT room_members_pkey PRIMARY KEY (id),
  CONSTRAINT room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id),
  CONSTRAINT room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.rooms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  room_code character varying NOT NULL UNIQUE,
  host_id uuid NOT NULL,
  status character varying NOT NULL DEFAULT 'lobby'::character varying CHECK (status::text = ANY (ARRAY['lobby'::character varying, 'in_game'::character varying, 'returning'::character varying]::text[])),
  current_game character varying CHECK (current_game::text = ANY (ARRAY[NULL::character varying, 'ddf'::character varying, 'schooled'::character varying, 'chess'::character varying, 'poker'::character varying, 'trivia'::character varying, 'custom'::character varying]::text[])),
  game_started_at timestamp with time zone,
  game_settings jsonb DEFAULT '{}'::jsonb,
  max_players integer DEFAULT 10 CHECK (max_players >= 2 AND max_players <= 50),
  is_public boolean DEFAULT true,
  allow_spectators boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  username character varying NOT NULL UNIQUE,
  display_name character varying,
  avatar_url text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  is_guest boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);