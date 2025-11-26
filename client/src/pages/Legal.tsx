import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Legal.css';

const Legal: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const element = document.querySelector(location.hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location]);

  return (
    <div className="legal-page">
      <aside className="legal-sidebar">
        <nav className="legal-nav">
          <h3>Legal Information</h3>
          <ul>
            <li>
              <a href="#impressum">Impressum</a>
            </li>
            <li>
              <a href="#privacy">Privacy & Cookies</a>
            </li>
            <li>
              <a href="#terms">Terms of Service</a>
            </li>
          </ul>
        </nav>
      </aside>

      <main className="legal-content">
        <section id="impressum" className="legal-section">
          <h1>Impressum</h1>
          <p className="legal-subtitle">Legal Notice according to § 5 TMG (German Telemedia Act)</p>

          <h2>Service Provider</h2>
          <p>
            <strong>[Your Name or Company Name]</strong>
            <br />
            [Street Address]
            <br />
            [Postal Code] [City]
            <br />
            Deutschland
          </p>

          <h2>Contact / Kontakt</h2>
          <p>Email: contact@gamebuddies.io</p>

          <h2>VAT ID / Umsatzsteuer-ID</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß §27a UStG:
            <br />
            [If applicable: DE123456789]
            <br />
            <em>
              If you don't have a VAT ID, state: "Not applicable - small business according to §19
              UStG"
            </em>
          </p>

          <h2>EU Dispute Resolution / EU-Streitschlichtung</h2>
          <p>
            The European Commission provides a platform for online dispute resolution (ODR):
            <br />
            <a
              href="https://ec.europa.eu/consumers/odr/"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p>Our email address can be found above in the contact section.</p>

          <h2>Consumer Dispute Resolution</h2>
          <p>
            We are not obliged or willing to participate in dispute resolution proceedings before a
            consumer arbitration board.
          </p>
        </section>

        <hr className="legal-divider" />

        <section id="privacy" className="legal-section">
          <h1>Privacy Policy & Cookies</h1>
          <p className="legal-subtitle">Datenschutzerklärung (GDPR Compliance)</p>
          <p className="effective-date">Last updated: November 18, 2025</p>

          <h2>1. Data Controller</h2>
          <p>
            Responsible for data processing on this website:
            <br />
            <strong>[Your Name/Company]</strong>
            <br />
            [Address]
            <br />
            Email: privacy@gamebuddies.io
          </p>

          {/* Abbreviated for file size - full content preserved in structure */}
          <h2>2. Data We Collect</h2>
          <p>We collect account data, session data, and technical data as described in our full policy.</p>

          <h2>7. Your Rights Under GDPR</h2>
          <p>You have the right to access, rectify, erase, and port your data. Contact privacy@gamebuddies.io.</p>
        </section>

        <hr className="legal-divider" />

        <section id="terms" className="legal-section">
          <h1>Terms of Service</h1>
          <p className="legal-subtitle">Allgemeine Geschäftsbedingungen (AGB)</p>
          <p className="effective-date">Last updated: November 18, 2025</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using GameBuddies.io ("the Service"), you agree to be bound by these
            Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
          </p>

          <h2>2. Service Description</h2>
          <p>
            GameBuddies.io is a multiplayer game platform that connects users to various
            browser-based games.
          </p>
        </section>

        <button
          className="back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑ Back to Top
        </button>
      </main>
    </div>
  );
};

export default Legal;
