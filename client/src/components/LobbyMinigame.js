import React, { useState, useEffect, useRef } from 'react';
import './LobbyMinigame.css';

const LobbyMinigame = ({ onScore, leaderboard = [] }) => {
  const [dotPos, setDotPos] = useState({ top: '50%', left: '50%' });
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef(null);

  const moveDot = () => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      // Keep dot within bounds (dot is ~40px)
      const maxTop = height - 50;
      const maxLeft = width - 50;
      
      const top = Math.max(10, Math.floor(Math.random() * maxTop));
      const left = Math.max(10, Math.floor(Math.random() * maxLeft));
      
      setDotPos({ top: `${top}px`, left: `${left}px` });
    }
  };

  const handleDotClick = (e) => {
    e.stopPropagation(); // Prevent bubble events
    if (!isPlaying) setIsPlaying(true);
    
    const newScore = score + 1;
    setScore(newScore);
    
    // Emit score
    onScore(newScore, Date.now());
    
    moveDot();
  };

  return (
    <div className="lobby-minigame">
      <div className="minigame-header">
        <h3>⚡ Reflex Trainer</h3>
        <div className="my-score">Score: {score}</div>
      </div>
      
      <div className="minigame-area" ref={containerRef}>
        <button 
          className="game-dot"
          style={{ top: dotPos.top, left: dotPos.left }}
          onMouseDown={handleDotClick} // Use MouseDown for faster response
        />
        {!isPlaying && (
          <div className="start-overlay" onClick={moveDot}>
            Click the dot to start!
          </div>
        )}
      </div>

      <div className="minigame-leaderboard">
        <h4>Top Reflexes</h4>
        <ul>
          {leaderboard.length > 0 ? leaderboard.slice(0, 5).map((entry, i) => (
            <li key={i}>
              <span className="rank">#{i+1}</span>
              <span className="name">{entry.playerName}</span>
              <span className="score">{entry.score}</span>
            </li>
          )) : (
            <li className="empty">No scores yet</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default LobbyMinigame;
