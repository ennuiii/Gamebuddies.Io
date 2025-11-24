-- Create Friendships Table
CREATE TABLE public.friendships (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL, -- The person who sent the request
    friend_id uuid NOT NULL, -- The person receiving the request
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    
    CONSTRAINT friendships_pkey PRIMARY KEY (id),
    CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
    CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.users(id),
    -- Prevent duplicate requests between the same two people
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id),
    -- Prevent self-friending
    CONSTRAINT no_self_friendship CHECK (user_id != friend_id)
);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Policies ( Simplified for context )
-- Users can see friendships where they are the sender OR the receiver
CREATE POLICY "Users can view their own friendships" ON public.friendships
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Users can insert requests where they are the sender
CREATE POLICY "Users can send friend requests" ON public.friendships
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update status (accept/block) if they are involved
CREATE POLICY "Users can update their friendships" ON public.friendships
    FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);