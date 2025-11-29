import React, { useState, useEffect, MouseEvent, TouchEvent } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';
import './TugOfWar.css';

interface GameState {
  position: number;
  redWins: number;
  blueWins: number;
}

interface TugOfWarProps {
  playerName: string;
}

type Team = 'red' | 'blue' | null;

const TugOfWar: React.FC<TugOfWarProps> = ({ playerName }) => {
  const { socket, socketRef } = useSocket();
  const activeSocket = socket || socketRef?.current;

  const [gameState, setGameState] = useState<GameState>({ position: 50, redWins: 0, blueWins: 0 });
  const [lastWinner, setLastWinner] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [myTeam, setMyTeam] = useState<Team>(null);

  useEffect(() => {
    if (!activeSocket) return;

    const handleUpdate = (data: GameState & { winner?: string }): void => {
      setGameState({
        position: data.position,
        redWins: data.redWins,
        blueWins: data.blueWins,
      });

      if (data.winner) {
        setLastWinner(data.winner);
        setTimeout(() => setLastWinner(null), 2000);
      }
    };

    const handleYourTeam = (data: { team?: Team }): void => {
      if (data.team) {
        setMyTeam(data.team);
      }
    };

    activeSocket.on(SERVER_EVENTS.MINIGAME.TUG_UPDATE, handleUpdate);
    activeSocket.on(SERVER_EVENTS.MINIGAME.TUG_YOUR_TEAM, handleYourTeam);

    return () => {
      activeSocket.off(SERVER_EVENTS.MINIGAME.TUG_UPDATE, handleUpdate);
      activeSocket.off(SERVER_EVENTS.MINIGAME.TUG_YOUR_TEAM, handleYourTeam);
    };
  }, [activeSocket]);

  const handlePull = (e: MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>): void => {
    if (e.type === 'touchstart') {
      e.preventDefault();
    }

    if (!activeSocket) return;

    setIsPulling(true);
    setTimeout(() => setIsPulling(false), 100);

    activeSocket.emit(SOCKET_EVENTS.MINIGAME.TUG_PULL, {
      team: myTeam,
      playerName,
    });
  };

  return (
    <div className={`tug-of-war ${myTeam}-team`}>
      <div className="tow-header">
        <div className="tow-title-group">
          <p className="tow-eyebrow">Waiting Room Mini-Game</p>
          <h3>Team Battle Tug of War</h3>
        </div>
        <div className="tow-scores">
          <div className="score-chip red">
            <span>Red</span>
            <strong>{gameState.redWins}</strong>
          </div>
          <div className="score-chip blue">
            <span>Blue</span>
            <strong>{gameState.blueWins}</strong>
          </div>
        </div>
      </div>

      <div className="tow-arena">
        <div className="tow-team-card red">
          <div className="tow-avatar" />
          <span className="team-label">Red Crew</span>
        </div>

        <div className="rope-stage">
          <div className="rope-shadow" />
          <div className="rope-track">
            <div className="center-marker" />
            <div className="rope-line" />
            <div className="knot" style={{ left: `${gameState.position}%` }}>
              <div className="knot-marker" />
            </div>
            <div className="territory red" style={{ width: `${gameState.position}%` }} />
            <div className="territory blue" style={{ width: `${100 - gameState.position}%` }} />
          </div>

          {lastWinner && (
            <div className={`winner-overlay ${lastWinner}`}>
              {lastWinner === 'red' ? 'Red Crew Wins!' : 'Blue Crew Wins!'}
            </div>
          )}
        </div>

        <div className="tow-team-card blue">
          <div className="tow-avatar" />
          <span className="team-label">Blue Crew</span>
        </div>
      </div>

      <div className="tow-controls">
        <div className="team-indicator">
          {myTeam ? (
            <>
              You are on <span className={`team-name ${myTeam}`}>{myTeam.toUpperCase()}</span>
            </>
          ) : (
            <>Tap Pull to auto-assign a team.</>
          )}
        </div>
        <button
          className={`pull-btn ${myTeam || 'neutral'} ${isPulling ? 'pulling' : ''}`}
          onMouseDown={handlePull}
          onTouchStart={handlePull}
          disabled={!activeSocket}
        >
          {myTeam ? 'Pull!' : 'Join & Pull'}
        </button>
      </div>
    </div>
  );
};

export default TugOfWar;
