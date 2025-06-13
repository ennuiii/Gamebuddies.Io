import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Header.css';

const Header = () => {
  return (
    <motion.header 
      className="header"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container">
        <div className="header-content">
          <Link to="/" className="logo">
            <span className="logo-text">Game</span>
            <span className="logo-text accent">Buddies</span>
            <span className="logo-dot">.io</span>
          </Link>
          
          <nav className="nav">
            <Link to="/" className="nav-link">Home</Link>
            <a href="#games-section" className="nav-link">Games</a>
          </nav>
        </div>
      </div>
    </motion.header>
  );
};

export default Header; 