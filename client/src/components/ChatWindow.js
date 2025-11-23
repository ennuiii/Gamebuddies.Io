import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ messages, onSendMessage, currentPlayerName }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const chatMessagesDiv = messagesEndRef.current?.parentNode;
    if (chatMessagesDiv) {
      const isScrolledToBottom = chatMessagesDiv.scrollHeight - chatMessagesDiv.clientHeight <= chatMessagesDiv.scrollTop + 1;
      
      const lastMessage = messages[messages.length - 1];
      const isMyMessage = lastMessage && lastMessage.playerName === currentPlayerName;

      // Only scroll to bottom if it's my message, or if user is already scrolled to bottom
      if (isMyMessage || isScrolledToBottom) {
        scrollToBottom();
      }
    }
  }, [messages, currentPlayerName]);

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
