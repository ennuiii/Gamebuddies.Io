import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../stores/useChatStore';
import { useLobbyStore } from '../stores/useLobbyStore';
import { useUserStore } from '../stores/useUserStore';
import socketService from '../utils/socket';
import logger from '../utils/logger';
import './RoomChat.css';

const RoomChat: React.FC = () => {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isChatOpen, unreadCount, addMessage, setChatOpen, markAsRead } =
    useChatStore();
  const { roomCode } = useLobbyStore();
  const { playerName } = useUserStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isChatOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  // Listen for chat messages from server
  useEffect(() => {
    const handleChatMessage = (data: {
      playerName: string;
      message: string;
      timestamp?: number;
    }) => {
      logger.socket('chatMessage received', data);
      addMessage({
        playerName: data.playerName,
        message: data.message,
        type: 'message',
      });
    };

    socketService.on('chatMessage', handleChatMessage);

    return () => {
      socketService.off('chatMessage', handleChatMessage);
    };
  }, [addMessage]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputMessage.trim() || !roomCode || !playerName) {
      return;
    }

    // Send message via socket
    socketService.sendChatMessage(roomCode, inputMessage.trim(), playerName);

    // Clear input
    setInputMessage('');
  };

  const toggleChat = () => {
    setChatOpen(!isChatOpen);
    if (!isChatOpen) {
      markAsRead();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageClass = (type: string) => {
    return `chat-message chat-message-${type}`;
  };

  return (
    <div className={`room-chat ${isChatOpen ? 'room-chat-open' : ''}`}>
      <button className="chat-toggle-button" onClick={toggleChat}>
        <span className="chat-icon">💬</span>
        {!isChatOpen && unreadCount > 0 && (
          <span className="chat-unread-badge">{unreadCount}</span>
        )}
      </button>

      {isChatOpen && (
        <div className="chat-container">
          <div className="chat-header">
            <h3>Room Chat</h3>
            <button className="chat-close-button" onClick={toggleChat}>
              ✕
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={getMessageClass(msg.type)}>
                  <div className="chat-message-header">
                    <span className="chat-message-author">{msg.playerName}</span>
                    <span className="chat-message-time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="chat-message-content">{msg.message}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              maxLength={200}
              disabled={!socketService.isConnected()}
            />
            <button
              type="submit"
              className="chat-send-button"
              disabled={!inputMessage.trim() || !socketService.isConnected()}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default RoomChat;
