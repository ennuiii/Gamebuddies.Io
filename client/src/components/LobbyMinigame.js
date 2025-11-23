import React, { useState, useEffect, useRef } from 'react';
import './LobbyMinigame.css';

const GAME_DURATION = 10; // seconds

const LobbyMinigame = ({ onScore, leaderboard = [] }) => {
  const [dotPos, setDotPos] = useState({ top: '50%', left: '50%' });
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timer, setTimer] = useState(GAME_DURATION);
  const [gameActive, setGameActive] = useState(false); // True when game is in progress
  const [gameOver, setGameOver] = useState(false);
  const containerRef = useRef(null);
  const timerRef = useRef(null); // To hold the interval ID

  // Start/Stop Timer
  useEffect(() => {
    if (gameActive) {
      setTimer(GAME_DURATION); // Reset timer when game starts
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setGameActive(false);
            setGameOver(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameActive]);

  const moveDot = () => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      const dotSize = 40; // Approx dot size
      const maxTop = height - dotSize - 10; // 10px padding
      const maxLeft = width - dotSize - 10;
      
      const top = Math.max(10, Math.floor(Math.random() * maxTop));
      const left = Math.max(10, Math.floor(Math.random() * maxLeft));
      
      setDotPos({ top: `${top}px`, left: `${left}px` });
    }
  };

  const startGame = () => {
    setScore(0);
    setGameOver(false);
    setGameActive(true);
    setIsPlaying(true);
    moveDot();
  };

  const handleDotClick = (e) => {
    e.stopPropagation();
    if (!gameActive) return; // Only allow clicks when game is active
    
    setScore(prev => prev + 1);
    onScore(score + 1, Date.now()); // Emit current score + 1
    
    moveDot();
  };

  return (
    <div className="lobby-minigame">
      <div className="minigame-header">
        <h3>⚡ Reflex Trainer</h3>
        <div className="minigame-stats">
          <div className="my-score">Score: {score}</div>
          {gameActive && <div className="game-timer">Time: {timer}s</div>}
        </div>
      </div>
      
      <div className="minigame-area" ref={containerRef}>
        {!gameActive && !gameOver && (
          <div className="start-overlay" onClick={startGame}>
            Click to Start!
          </div>
        )}
        {gameActive && (
          <button 
            className="game-dot"
            style={{ top: dotPos.top, left: dotPos.top }} // Use dotPos.top for left and top
            onMouseDown={handleDotClick}
          />
        )}
        {gameOver && (
          <div className="game-over-overlay">
            <h4>Game Over!</h4>
            <p>Your score: {score}</p>
            <button onClick={startGame}>Play Again</button>
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
