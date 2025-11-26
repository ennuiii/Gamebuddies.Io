import React from 'react';
import './Footer.css';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-section">
          <p className="footer-copyright">© {currentYear} GameBuddies.io - All rights reserved</p>
        </div>

        <div className="footer-section">
          <nav className="footer-nav">
            <a href="/legal#impressum" className="footer-link">
              Impressum
            </a>
            <span className="footer-separator">|</span>
            <a href="/legal#privacy" className="footer-link">
              Privacy
            </a>
            <span className="footer-separator">|</span>
            <a href="/legal#terms" className="footer-link">
              Terms
            </a>
          </nav>
        </div>

        <div className="footer-section">
          <p className="footer-tagline">Play together, compete together</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
