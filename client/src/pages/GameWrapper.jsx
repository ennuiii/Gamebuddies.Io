import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './GameWrapper.css';

const GameWrapper = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Hide scrollbar for game view
    document.body.style.overflow = 'hidden';
    
    return () => {
      // Restore scrollbar when leaving
      document.body.style.overflow = 'auto';
    };
  }, []);

  const handleBackToHome = () => {
    navigate('/');
  };

  return (
    <div className="game-wrapper">
      <div className="game-header">
        <button 
          className="back-button" 
          onClick={handleBackToHome}
          aria-label="Back to home"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Games
        </button>
        <div className="game-info">
          Playing: {gameId.charAt(0).toUpperCase() + gameId.slice(1)}
        </div>
      </div>
      
      <iframe
        src={`/${gameId}`}
        className="game-iframe"
        title={gameId}
        allowFullScreen
      />
    </div>
  );
};

export default GameWrapper; 
