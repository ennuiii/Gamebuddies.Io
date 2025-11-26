import React, { useState, useRef, FormEvent, ChangeEvent } from 'react';
import './ChatWindow.css';

interface ChatMessage {
  id?: string;
  playerName: string;
  message: string;
  type?: 'system' | 'user';
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
      <div className="chat-messages">
        {messages.map((msg, index) => {
          const isMe = msg.playerName === currentPlayerName;
          const isSystem = msg.type === 'system';

          return (
            <div
              key={msg.id || index}
              className={`chat-message ${isMe ? 'me' : ''} ${isSystem ? 'system' : ''}`}
            >
              {!isSystem && <span className="chat-sender">{msg.playerName}</span>}
              <span className="chat-text">{msg.message}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
          maxLength={200}
        />
        <button type="submit" disabled={!newMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatWindow;
