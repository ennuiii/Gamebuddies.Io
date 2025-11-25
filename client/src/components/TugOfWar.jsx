import React, { useState, useEffect, useMemo } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import './TugOfWar.css';

const TugOfWar = ({ playerName }) => {
  const { socket, socketRef, socketId } = useSocket();

  // Use socketRef.current as fallback when React state hasn't updated yet
  // This fixes race condition where socket state is null immediately after joining
  const activeSocket = socket || socketRef?.current;

  const [gameState, setGameState] = useState({ position: 50, redWins: 0, blueWins: 0 });
  const [lastWinner, setLastWinner] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [myTeam, setMyTeam] = useState(null); // Will be assigned by server

  useEffect(() => {
    if (!activeSocket) return;

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

    const handleYourTeam = (data) => {
      if (data.team) {
        setMyTeam(data.team);
      }
    };

    activeSocket.on('tugOfWar:update', handleUpdate);
    activeSocket.on('tugOfWar:yourTeam', handleYourTeam);

    return () => {
      activeSocket.off('tugOfWar:update', handleUpdate);
      activeSocket.off('tugOfWar:yourTeam', handleYourTeam);
    };
  }, [activeSocket]);

  const handlePull = (e) => {
    // Prevent default touch behaviors
    if (e.type === 'touchstart') {
      e.preventDefault();
    }

    if (!activeSocket) return;

    setIsPulling(true);
    setTimeout(() => setIsPulling(false), 100);

    // Send pull request (server assigns team if null)
    activeSocket.emit('tugOfWar:pull', {
      team: myTeam,
      playerName
    });
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
          {myTeam ? (
            <>You are on <span className={`team-name ${myTeam}`}>{myTeam.toUpperCase()}</span> team</>
          ) : (
            <>Click PULL to join a team!</>
          )}
        </div>
        <button
          className={`pull-btn ${myTeam || 'neutral'} ${isPulling ? 'pulling' : ''}`}
          onMouseDown={handlePull}
          onTouchStart={handlePull}
          disabled={!activeSocket} // Always enabled if socket connected
        >
          {myTeam ? 'PULL!' : 'JOIN & PULL!'}
        </button>
      </div>
    </div>
  );
};

export default TugOfWar;
