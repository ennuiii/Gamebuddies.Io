import React from 'react';
import './Skeleton.css';

// ===========================================
// BASE SKELETON COMPONENT
// ===========================================

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
}) => {
  const variantClass = variant !== 'rectangular' ? `skeleton--${variant}` : '';

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
};

// ===========================================
// ROOM CARD SKELETON
// ===========================================

export const RoomCardSkeleton: React.FC = () => (
  <div className="room-card-skeleton" aria-hidden="true">
    <div className="room-card-skeleton__header">
      <div className="skeleton room-card-skeleton__thumbnail" />
      <div className="room-card-skeleton__info">
        <div className="skeleton room-card-skeleton__title" />
        <div className="room-card-skeleton__meta">
          <div className="skeleton room-card-skeleton__code" />
          <div className="skeleton room-card-skeleton__badge" />
        </div>
      </div>
    </div>
    <div className="room-card-skeleton__details">
      <div className="skeleton room-card-skeleton__detail-line" />
      <div className="skeleton room-card-skeleton__detail-line" />
    </div>
    <div className="skeleton room-card-skeleton__button" />
  </div>
);

// ===========================================
// PLAYER CARD SKELETON
// ===========================================

export const PlayerCardSkeleton: React.FC = () => (
  <div className="player-card-skeleton" aria-hidden="true">
    <div className="player-card-skeleton__content">
      <div className="skeleton player-card-skeleton__avatar" />
      <div className="player-card-skeleton__info">
        <div className="skeleton player-card-skeleton__name" />
        <div className="player-card-skeleton__badges">
          <div className="skeleton player-card-skeleton__badge" />
          <div className="skeleton player-card-skeleton__badge" />
        </div>
      </div>
    </div>
  </div>
);

// ===========================================
// FRIEND ITEM SKELETON
// ===========================================

interface FriendItemSkeletonProps {
  showInvite?: boolean;
}

export const FriendItemSkeleton: React.FC<FriendItemSkeletonProps> = ({ showInvite = false }) => (
  <div className="friend-item-skeleton" aria-hidden="true">
    <div className="skeleton friend-item-skeleton__avatar" />
    <div className="friend-item-skeleton__info">
      <div className="skeleton friend-item-skeleton__name" />
      <div className="skeleton friend-item-skeleton__level" />
    </div>
    {showInvite && <div className="skeleton friend-item-skeleton__button" />}
  </div>
);

// ===========================================
// CHAT MESSAGE SKELETON
// ===========================================

interface ChatMessageSkeletonProps {
  isMe?: boolean;
  bubbleWidth?: 'short' | 'medium' | 'long';
}

export const ChatMessageSkeleton: React.FC<ChatMessageSkeletonProps> = ({
  isMe = false,
  bubbleWidth = 'medium',
}) => (
  <div
    className={`chat-message-skeleton ${isMe ? 'chat-message-skeleton--me' : ''}`}
    aria-hidden="true"
  >
    {!isMe && <div className="skeleton chat-message-skeleton__sender" />}
    <div
      className={`skeleton chat-message-skeleton__bubble chat-message-skeleton__bubble--${bubbleWidth}`}
    />
  </div>
);

// ===========================================
// LIST SKELETON WRAPPERS
// ===========================================

interface RoomCardSkeletonListProps {
  count?: number;
}

export const RoomCardSkeletonList: React.FC<RoomCardSkeletonListProps> = ({ count = 3 }) => (
  <div className="skeleton-rooms-list" role="status" aria-label="Loading rooms">
    {Array.from({ length: count }).map((_, i) => (
      <RoomCardSkeleton key={i} />
    ))}
  </div>
);

interface PlayerCardSkeletonListProps {
  count?: number;
}

export const PlayerCardSkeletonList: React.FC<PlayerCardSkeletonListProps> = ({ count = 3 }) => (
  <div className="skeleton-players-grid" role="status" aria-label="Loading players">
    {Array.from({ length: count }).map((_, i) => (
      <PlayerCardSkeleton key={i} />
    ))}
  </div>
);

interface FriendItemSkeletonListProps {
  count?: number;
  showInvite?: boolean;
}

export const FriendItemSkeletonList: React.FC<FriendItemSkeletonListProps> = ({
  count = 3,
  showInvite = false,
}) => (
  <div className="skeleton-friends-list" role="status" aria-label="Loading friends">
    {Array.from({ length: count }).map((_, i) => (
      <FriendItemSkeleton key={i} showInvite={showInvite} />
    ))}
  </div>
);

interface ChatMessageSkeletonListProps {
  count?: number;
}

export const ChatMessageSkeletonList: React.FC<ChatMessageSkeletonListProps> = ({ count = 3 }) => (
  <div className="skeleton-messages-list" role="status" aria-label="Loading messages">
    <ChatMessageSkeleton bubbleWidth="long" />
    <ChatMessageSkeleton isMe bubbleWidth="medium" />
    <ChatMessageSkeleton bubbleWidth="short" />
  </div>
);
