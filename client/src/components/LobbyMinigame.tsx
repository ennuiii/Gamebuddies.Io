import React, { useState, useEffect, useRef, MouseEvent } from 'react';
import './LobbyMinigame.css';

const GAME_DURATION = 10;

interface LeaderboardEntry {
  playerName: string;
  score: number;
}

interface DotPosition {
  top: string;
  left: string;
}

interface LobbyMinigameProps {
  onScore: (score: number, timestamp: number) => void;
  leaderboard?: LeaderboardEntry[];
}

const LobbyMinigame: React.FC<LobbyMinigameProps> = ({ onScore, leaderboard = [] }) => {
  const [dotPos, setDotPos] = useState<DotPosition>({ top: '50%', left: '50%' });
  const [score, setScore] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(GAME_DURATION);
  const [gameActive, setGameActive] = useState<boolean>(false);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (gameActive) {
      setTimer(GAME_DURATION);
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setGameActive(false);
            setGameOver(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameActive]);

  const moveDot = (): void => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      const dotSize = 40;
      const maxTop = height - dotSize - 10;
      const maxLeft = width - dotSize - 10;

      const top = Math.max(10, Math.floor(Math.random() * maxTop));
      const left = Math.max(10, Math.floor(Math.random() * maxLeft));

      setDotPos({ top: `${top}px`, left: `${left}px` });
    }
  };

  const startGame = (): void => {
    setScore(0);
    setGameOver(false);
    setGameActive(true);
    setIsPlaying(true);
    moveDot();
  };

  const handleDotClick = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    if (!gameActive) return;

    setScore((prev) => prev + 1);
    onScore(score + 1, Date.now());

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
            style={{ top: dotPos.top, left: dotPos.left }}
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
          {leaderboard.length > 0 ? (
            leaderboard.slice(0, 5).map((entry, i) => (
              <li key={i}>
                <span className="rank">#{i + 1}</span>
                <span className="name">{entry.playerName}</span>
                <span className="score">{entry.score}</span>
              </li>
            ))
          ) : (
            <li className="empty">No scores yet</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default LobbyMinigame;
