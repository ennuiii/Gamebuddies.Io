import React, { useState, useEffect, useMemo } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import './TugOfWar.css';

const TugOfWar = ({ playerName }) => {
  const { socket, socketId } = useSocket();
  const [gameState, setGameState] = useState({ position: 50, redWins: 0, blueWins: 0 });
  const [lastWinner, setLastWinner] = useState(null);
  const [isPulling, setIsPulling] = useState(false);

  // Assign team deterministically based on socket ID
  const myTeam = useMemo(() => {
    if (!socketId) return 'red';
    const sum = socketId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return sum % 2 === 0 ? 'red' : 'blue';
  }, [socketId]);

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (data) => {
      setGameState({
        position: data.position,
        redWins: data.redWins,
        blueWins: data.blueWins
      });
      
      if (data.winner) {
        setLastWinner(data.winner);
        setTimeout(() => setLastWinner(null), 2000);
      }
    };

    socket.on('tugOfWar:update', handleUpdate);
    return () => socket.off('tugOfWar:update', handleUpdate);
  }, [socket]);

  const handlePull = (e) => {
    // Prevent default touch behaviors
    if (e.type === 'touchstart') e.preventDefault();
    
    setIsPulling(true);
    setTimeout(() => setIsPulling(false), 100);

    if (socket) {
      socket.emit('tugOfWar:pull', { team: myTeam, playerName });
    }
  };

  return (
    <div className={`tug-of-war ${myTeam}-team`}>
      <div className="tow-header">
        <h3>⚔️ Team Battle</h3>
        <div className="tow-scores">
          <span className="score red" title="Red Team Wins">{gameState.redWins}</span>
          <span className="vs">VS</span>
          <span className="score blue" title="Blue Team Wins">{gameState.blueWins}</span>
        </div>
      </div>

      <div className="tow-arena">
        <div className="rope-track">
          <div className="center-marker"></div>
          <div 
            className="knot" 
            style={{ left: `${gameState.position}%` }}
          >
            <div className="knot-marker"></div>
          </div>
          {/* Visual indicators of territory */}
          <div className="territory red" style={{ width: `${gameState.position}%` }}></div>
          <div className="territory blue" style={{ width: `${100 - gameState.position}%` }}></div>
        </div>
        
        {lastWinner && (
          <div className={`winner-overlay ${lastWinner}`}>
            {lastWinner === 'red' ? '🔴 RED WINS!' : '🔵 BLUE WINS!'}
          </div>
        )}
      </div>

      <div className="tow-controls">
        <div className="team-indicator">
          You are on <span className={`team-name ${myTeam}`}>{myTeam.toUpperCase()}</span>
        </div>
        <button 
          className={`pull-btn ${myTeam} ${isPulling ? 'pulling' : ''}`}
          onMouseDown={handlePull}
          onTouchStart={handlePull}
        >
          PULL!
        </button>
      </div>
    </div>
  );
};

export default TugOfWar;
