import React from 'react';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const handleCookieSettings = () => {
    // This will be implemented when we add the cookie banner
    // For now, just alert the user
    alert('Cookie settings will be available once the cookie consent banner is implemented.');
  };

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-section">
          <p className="footer-copyright">
            © {currentYear} GameBuddies.io - All rights reserved
          </p>
        </div>

        <div className="footer-section">
          <nav className="footer-nav">
            <a href="/legal#impressum" className="footer-link">
              Impressum
            </a>
            <span className="footer-separator">|</span>
            <a href="/legal#privacy" className="footer-link">
              Privacy & Cookies
            </a>
            <span className="footer-separator">|</span>
            <a href="/legal#terms" className="footer-link">
              Terms
            </a>
            <span className="footer-separator">|</span>
            <button
              onClick={handleCookieSettings}
              className="footer-link footer-button"
            >
              Cookie Settings
            </button>
          </nav>
        </div>

        <div className="footer-section">
          <p className="footer-tagline">
            Play together, compete together
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
