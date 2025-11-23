import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ messages, onSendMessage, currentPlayerName }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
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
          onChange={(e) => setNewMessage(e.target.value)}
          maxLength={200}
        />
        <button type="submit" disabled={!newMessage.trim()}>Send</button>
      </form>
    </div>
  );
};

export default ChatWindow;
