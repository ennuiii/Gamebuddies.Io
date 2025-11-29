import React, { useState, useRef, FormEvent, ChangeEvent } from 'react';
import './ChatWindow.css';

interface ChatMessage {
  id?: string;
  playerName: string;
  message: string;
  type?: 'system' | 'user';
  isOwnMessage?: boolean;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  currentPlayerName: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, onSendMessage, currentPlayerName }) => {
  const [newMessage, setNewMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>Lobby Chat</h3>
      </div>
      <div
        className="chat-messages"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.map((msg, index) => {
          // Use isOwnMessage flag if set, otherwise fall back to name comparison
          const isMe = msg.isOwnMessage !== undefined
            ? msg.isOwnMessage
            : msg.playerName === currentPlayerName;
          const isSystem = msg.type === 'system';

          return (
            <div
              key={msg.id || index}
              className={`chat-message ${isMe ? 'me' : ''} ${isSystem ? 'system' : ''}`}
              role="article"
              aria-label={isSystem ? `System: ${msg.message}` : `${msg.playerName} says: ${msg.message}`}
            >
              {!isSystem && <span className="chat-sender">{msg.playerName}</span>}
              <span className="chat-text">{msg.message}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSubmit} role="search">
        <label htmlFor="chat-input" className="visually-hidden">
          Type a chat message
        </label>
        <input
          id="chat-input"
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
          maxLength={200}
          aria-label="Chat message input"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatWindow;
