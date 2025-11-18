import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Legal.css';

const Legal = () => {
  const location = useLocation();

  // Scroll to section if hash is present
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
            <li><a href="#impressum">Impressum</a></li>
            <li><a href="#privacy">Privacy & Cookies</a></li>
            <li><a href="#terms">Terms of Service</a></li>
          </ul>
        </nav>
      </aside>

      <main className="legal-content">
        {/* SECTION 1: IMPRESSUM */}
        <section id="impressum" className="legal-section">
          <h1>Impressum</h1>
          <p className="legal-subtitle">Legal Notice according to § 5 TMG (German Telemedia Act)</p>

          <h2>Service Provider</h2>
          <p>
            <strong>[Your Name or Company Name]</strong><br />
            [Street Address]<br />
            [Postal Code] [City]<br />
            Deutschland
          </p>

          <h2>Contact / Kontakt</h2>
          <p>
            Email: contact@gamebuddies.io<br />
            {/* Phone: [Optional] */}
          </p>

          <h2>VAT ID / Umsatzsteuer-ID</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß §27a UStG:<br />
            [If applicable: DE123456789]<br />
            <em>If you don't have a VAT ID, state: "Not applicable - small business according to §19 UStG"</em>
          </p>

          <h2>EU Dispute Resolution / EU-Streitschlichtung</h2>
          <p>
            The European Commission provides a platform for online dispute resolution (ODR):<br />
            <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p>
            Our email address can be found above in the contact section.
          </p>

          <h2>Consumer Dispute Resolution</h2>
          <p>
            We are not obliged or willing to participate in dispute resolution proceedings before
            a consumer arbitration board.
          </p>
        </section>

        <hr className="legal-divider" />

        {/* SECTION 2: PRIVACY & COOKIES */}
        <section id="privacy" className="legal-section">
          <h1>Privacy Policy & Cookies</h1>
          <p className="legal-subtitle">Datenschutzerklärung (GDPR Compliance)</p>

          <p className="effective-date">Last updated: November 18, 2025</p>

          <h2>1. Data Controller</h2>
          <p>
            Responsible for data processing on this website:<br />
            <strong>[Your Name/Company]</strong><br />
            [Address]<br />
            Email: privacy@gamebuddies.io
          </p>

          <h2>2. Data We Collect</h2>

          <h3>2.1 Account Data</h3>
          <ul>
            <li><strong>Guest Usernames:</strong> Display names you choose when joining rooms</li>
            <li><strong>Player IDs:</strong> Unique identifiers (UUID) assigned to your session</li>
            <li><strong>Creation Timestamp:</strong> When you created your guest account</li>
          </ul>
          <p><strong>Legal Basis:</strong> Legitimate interest (GDPR Art. 6(1)(f)) - necessary for service provision</p>

          <h3>2.2 Session Data</h3>
          <ul>
            <li><strong>Room Codes:</strong> 6-character codes for game rooms you create or join</li>
            <li><strong>Session Tokens:</strong> JWT tokens for authentication (expires after 3 hours)</li>
            <li><strong>Connection Status:</strong> Whether you're connected, in-game, or in lobby</li>
            <li><strong>Game State:</strong> Your current position/state within a game</li>
          </ul>
          <p><strong>Legal Basis:</strong> Legitimate interest (GDPR Art. 6(1)(f)) - necessary for multiplayer gameplay</p>

          <h3>2.3 Technical Data</h3>
          <ul>
            <li><strong>IP Addresses:</strong> Logged for security and fraud prevention</li>
            <li><strong>Socket Connection IDs:</strong> For real-time communication management</li>
            <li><strong>Browser Information:</strong> Standard HTTP headers (User-Agent, etc.)</li>
          </ul>
          <p><strong>Legal Basis:</strong> Legitimate interest (GDPR Art. 6(1)(f)) - security and service quality</p>

          <h3>2.4 Preferences</h3>
          <ul>
            <li><strong>UI Theme:</strong> Your light/dark mode preference (stored in browser)</li>
          </ul>
          <p><strong>Legal Basis:</strong> Consent (GDPR Art. 6(1)(a)) - optional personalization</p>

          <h2>3. How We Use Your Data</h2>
          <p>We use the collected data to:</p>
          <ul>
            <li>Provide multiplayer game sessions and room management</li>
            <li>Enable real-time communication between players</li>
            <li>Authenticate users and prevent unauthorized access</li>
            <li>Detect and prevent abuse, cheating, or malicious behavior</li>
            <li>Maintain service quality and troubleshoot technical issues</li>
            <li>Improve our services based on usage patterns</li>
          </ul>

          <h2>4. Data Retention</h2>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Data Type</th>
                <th>Retention Period</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Active game sessions</td>
                <td>Until room ends or 24 hours (whichever is first)</td>
              </tr>
              <tr>
                <td>Guest accounts</td>
                <td>90 days of inactivity</td>
              </tr>
              <tr>
                <td>Audit logs (room events, status changes)</td>
                <td>30 days</td>
              </tr>
              <tr>
                <td>Connection metrics</td>
                <td>90 days</td>
              </tr>
              <tr>
                <td>Session tokens</td>
                <td>3 hours (automatic expiration)</td>
              </tr>
            </tbody>
          </table>

          <h2>5. Third-Party Services (Data Processors)</h2>
          <p>We use the following third-party services to operate our platform:</p>

          <h3>5.1 Supabase (Database Hosting)</h3>
          <ul>
            <li><strong>Purpose:</strong> Stores all user data, rooms, and game sessions</li>
            <li><strong>Data shared:</strong> All collected data (see sections 2.1-2.3)</li>
            <li><strong>Location:</strong> EU region (configurable)</li>
            <li><strong>Privacy Policy:</strong> <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">https://supabase.com/privacy</a></li>
            <li><strong>GDPR Compliance:</strong> Data Processing Agreement (DPA) in place</li>
          </ul>

          <h3>5.2 Render.com (Application Hosting)</h3>
          <ul>
            <li><strong>Purpose:</strong> Hosts the application servers</li>
            <li><strong>Data shared:</strong> HTTP request logs (including IP addresses)</li>
            <li><strong>Location:</strong> Frankfurt, Germany (EU region)</li>
            <li><strong>Privacy Policy:</strong> <a href="https://render.com/privacy" target="_blank" rel="noopener noreferrer">https://render.com/privacy</a></li>
            <li><strong>GDPR Compliance:</strong> EU hosting, DPA available</li>
          </ul>

          <h3>5.3 External Game Servers</h3>
          <ul>
            <li><strong>Purpose:</strong> Host individual games (e.g., DDF, SUSD, BingoBuddies)</li>
            <li><strong>Data shared:</strong> Session tokens, room codes, player names</li>
            <li><strong>Location:</strong> Various Render.com regions</li>
            <li><strong>Note:</strong> Each game is a separate data processor</li>
          </ul>

          <h2>6. Data Transfers to Third Countries</h2>
          <p>
            Some of our service providers may be located in the United States or other non-EU countries.
            We ensure adequate protection through:
          </p>
          <ul>
            <li>EU Standard Contractual Clauses (SCCs)</li>
            <li>GDPR-compliant Data Processing Agreements</li>
            <li>Preference for EU-based hosting when available</li>
          </ul>

          <h2>7. Your Rights Under GDPR</h2>
          <p>As a user in the European Union, you have the following rights:</p>

          <h3>7.1 Right to Access (Article 15)</h3>
          <p>
            You can request a copy of all personal data we hold about you.<br />
            <strong>How:</strong> Contact privacy@gamebuddies.io or use "Download My Data" in Settings (coming soon)
          </p>

          <h3>7.2 Right to Rectification (Article 16)</h3>
          <p>
            You can request correction of inaccurate personal data.<br />
            <strong>How:</strong> Contact privacy@gamebuddies.io
          </p>

          <h3>7.3 Right to Erasure / "Right to be Forgotten" (Article 17)</h3>
          <p>
            You can request deletion of your personal data.<br />
            <strong>How:</strong> Contact privacy@gamebuddies.io or use "Delete Account" in Settings (coming soon)
          </p>

          <h3>7.4 Right to Data Portability (Article 20)</h3>
          <p>
            You can receive your data in a machine-readable format (JSON).<br />
            <strong>How:</strong> Use "Download My Data" feature (coming soon)
          </p>

          <h3>7.5 Right to Object (Article 21)</h3>
          <p>
            You can object to processing based on legitimate interest.<br />
            <strong>How:</strong> Contact privacy@gamebuddies.io
          </p>

          <h3>7.6 Right to Restriction of Processing (Article 18)</h3>
          <p>
            You can request temporary restriction of data processing.<br />
            <strong>How:</strong> Contact privacy@gamebuddies.io
          </p>

          <h3>7.7 Right to Withdraw Consent</h3>
          <p>
            For data processed based on consent (e.g., theme preference), you can withdraw consent at any time.<br />
            <strong>How:</strong> Use "Cookie Settings" in the footer or clear your browser storage
          </p>

          <h2>8. Right to Lodge a Complaint</h2>
          <p>
            You have the right to lodge a complaint with a supervisory authority if you believe your
            data protection rights have been violated.
          </p>
          <p>
            <strong>German Federal Commissioner for Data Protection and Freedom of Information (BfDI):</strong><br />
            Graurheindorfer Str. 153<br />
            53117 Bonn, Deutschland<br />
            Website: <a href="https://www.bfdi.bund.de/" target="_blank" rel="noopener noreferrer">https://www.bfdi.bund.de/</a><br />
            Email: poststelle@bfdi.bund.de
          </p>

          <h2>9. Cookies & Browser Storage</h2>
          <p>
            We use browser storage (sessionStorage and localStorage) to provide our service.
            Technically, we do <strong>not use traditional HTTP cookies</strong>, but EU law treats
            browser storage similarly.
          </p>

          <h3>9.1 Essential Storage (No Consent Required)</h3>
          <p>These items are necessary for the service to function:</p>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Storage Key</th>
                <th>Purpose</th>
                <th>Expiration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>gamebuddies_roomCode</td>
                <td>Current game room identifier</td>
                <td>Session (cleared when browser closes)</td>
              </tr>
              <tr>
                <td>gamebuddies_playerName</td>
                <td>Your chosen display name</td>
                <td>Session</td>
              </tr>
              <tr>
                <td>gamebuddies_playerId</td>
                <td>Your unique player ID (UUID)</td>
                <td>Session</td>
              </tr>
              <tr>
                <td>gamebuddies_sessionToken</td>
                <td>Authentication token (JWT)</td>
                <td>Session (max 3 hours)</td>
              </tr>
              <tr>
                <td>gamebuddies_isHost</td>
                <td>Whether you're the room host</td>
                <td>Session</td>
              </tr>
              <tr>
                <td>gamebuddies_returnUrl</td>
                <td>Navigation state for returning to lobby</td>
                <td>Session</td>
              </tr>
              <tr>
                <td>gamebuddies:return-session</td>
                <td>Complete session recovery data</td>
                <td>Session</td>
              </tr>
            </tbody>
          </table>

          <h3>9.2 Non-Essential Storage (Consent Required)</h3>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Storage Key</th>
                <th>Purpose</th>
                <th>Expiration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>gamebuddies-theme</td>
                <td>Your UI theme preference (light/dark mode)</td>
                <td>Permanent (until cleared)</td>
              </tr>
            </tbody>
          </table>
          <p>
            <strong>Note:</strong> The theme preference requires your consent via the cookie banner.
            The service works fully without this preference.
          </p>

          <h3>9.3 Managing Storage</h3>
          <p>You can manage browser storage through:</p>
          <ul>
            <li><strong>Cookie Settings:</strong> Link in the footer (opens preference modal)</li>
            <li><strong>Browser Settings:</strong> Clear browsing data in your browser settings</li>
            <li><strong>Withdraw Consent:</strong> Reopen cookie banner and deselect preferences</li>
          </ul>

          <h2>10. Security Measures</h2>
          <p>We implement industry-standard security measures to protect your data:</p>
          <ul>
            <li><strong>HTTPS Encryption:</strong> All communication is encrypted in transit (TLS/SSL)</li>
            <li><strong>JWT Authentication:</strong> Secure token-based authentication with expiration</li>
            <li><strong>Rate Limiting:</strong> Protection against brute-force attacks and DDoS</li>
            <li><strong>Content Security Policy (CSP):</strong> Prevents cross-site scripting (XSS) attacks</li>
            <li><strong>Helmet.js Security Headers:</strong> Additional HTTP security headers</li>
            <li><strong>Input Validation:</strong> All user input is validated and sanitized</li>
            <li><strong>Session Expiration:</strong> Automatic logout after 24 hours of inactivity</li>
          </ul>

          <h2>11. Children's Privacy</h2>
          <p>
            Our service is not directed at children under 13 years of age. We do not knowingly
            collect personal data from children under 13.
          </p>
          <p>
            If you are a parent or guardian and believe your child under 13 has provided us with
            personal data, please contact us immediately at privacy@gamebuddies.io and we will
            delete it promptly.
          </p>

          <h2>12. Data Breach Notification</h2>
          <p>
            In the event of a data breach that poses a risk to your rights and freedoms, we will:
          </p>
          <ul>
            <li>Notify the relevant supervisory authority (BfDI) within 72 hours</li>
            <li>Notify affected users without undue delay if high risk is determined</li>
            <li>Provide information about the nature of the breach and mitigation steps</li>
          </ul>

          <h2>13. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices
            or legal requirements. The "Last updated" date at the top indicates the most recent revision.
          </p>
          <p>
            Material changes will be communicated via:
          </p>
          <ul>
            <li>Notice on the website homepage</li>
            <li>Email notification (if you have provided an email address)</li>
          </ul>

          <h2>14. Contact Us</h2>
          <p>
            For any questions about this Privacy Policy or our data practices, please contact:<br />
            <strong>Email:</strong> privacy@gamebuddies.io<br />
            <strong>Postal Address:</strong> See Impressum section above
          </p>
        </section>

        <hr className="legal-divider" />

        {/* SECTION 3: TERMS OF SERVICE */}
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
            GameBuddies.io is a multiplayer game platform that connects users to various browser-based
            games. The Service includes:
          </p>
          <ul>
            <li>Room creation and management</li>
            <li>Multiplayer game lobbies</li>
            <li>Real-time communication between players</li>
            <li>Integration with external game servers</li>
          </ul>

          <h2>3. Guest Accounts</h2>
          <p>
            Currently, our Service operates on a guest account basis:
          </p>
          <ul>
            <li><strong>No Registration Required:</strong> You can join without creating an account</li>
            <li><strong>Display Name:</strong> You choose a display name when joining rooms</li>
            <li><strong>Temporary:</strong> Guest accounts may be deleted after 90 days of inactivity</li>
            <li><strong>No Password:</strong> Sessions are managed via browser storage</li>
          </ul>

          <h2>4. User Conduct</h2>
          <p>You agree to use the Service responsibly. You shall NOT:</p>
          <ul>
            <li>Use offensive, abusive, or inappropriate display names</li>
            <li>Harass, threaten, or harm other users</li>
            <li>Cheat, exploit bugs, or use automated tools (bots)</li>
            <li>Disrupt the Service or interfere with other users' enjoyment</li>
            <li>Impersonate others or misrepresent your identity</li>
            <li>Attempt to gain unauthorized access to the Service or other users' data</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Use the Service for commercial purposes without permission</li>
          </ul>

          <h2>5. Intellectual Property Rights</h2>
          <p>
            <strong>Platform:</strong> GameBuddies.io platform and its original content are owned by
            [Your Name/Company] and protected by copyright, trademark, and other intellectual property laws.
          </p>
          <p>
            <strong>Individual Games:</strong> Each game accessible through our platform is owned by
            its respective developers and subject to their own terms.
          </p>
          <p>
            <strong>User Content:</strong> You retain ownership of any content you create (e.g., room names,
            chat messages). By using the Service, you grant us a license to use this content solely for
            providing the Service.
          </p>

          <h2>6. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, either
            express or implied, including but not limited to:
          </p>
          <ul>
            <li>Implied warranties of merchantability or fitness for a particular purpose</li>
            <li>Warranty of non-infringement</li>
            <li>Warranty of uninterrupted or error-free service</li>
            <li>Warranty of compatibility with all devices or browsers</li>
          </ul>
          <p>
            We do not guarantee that:
          </p>
          <ul>
            <li>The Service will be available at all times</li>
            <li>The Service will be free from errors or bugs</li>
            <li>External games will always be accessible</li>
            <li>Your data will never be lost (though we make reasonable efforts to prevent this)</li>
          </ul>

          <h2>7. Limitation of Liability</h2>
          <p>
            Under German law (Bürgerliches Gesetzbuch - BGB), our liability is limited as follows:
          </p>
          <ul>
            <li><strong>Unlimited Liability:</strong> For intentional misconduct (Vorsatz) and gross negligence (grobe Fahrlässigkeit)</li>
            <li><strong>Unlimited Liability:</strong> For injury to life, body, or health</li>
            <li><strong>Unlimited Liability:</strong> Under the Product Liability Act (Produkthaftungsgesetz)</li>
            <li><strong>Limited Liability:</strong> For slight negligence (leichte Fahrlässigkeit), we are only liable
            for breach of essential contractual obligations (wesentliche Vertragspflichten)</li>
          </ul>
          <p>
            In no event shall we be liable for:
          </p>
          <ul>
            <li>Indirect, incidental, special, or consequential damages</li>
            <li>Loss of profits, revenue, or data</li>
            <li>Interruption of business</li>
            <li>Actions or content of other users</li>
            <li>Issues with external game servers not operated by us</li>
          </ul>

          <h2>8. Service Modifications and Termination</h2>
          <p>
            We reserve the right to:
          </p>
          <ul>
            <li>Modify, suspend, or discontinue the Service (or any part of it) at any time</li>
            <li>Update these Terms with reasonable notice</li>
            <li>Remove or modify game integrations</li>
          </ul>
          <p>
            We may suspend or terminate your access to the Service immediately if:
          </p>
          <ul>
            <li>You violate these Terms</li>
            <li>You engage in abusive or harmful behavior</li>
            <li>Required by law or legal process</li>
            <li>Your account has been inactive for more than 90 days</li>
          </ul>

          <h2>9. Age Restrictions</h2>
          <p>
            You must be at least 13 years old to use this Service. If you are under 18, you must
            have permission from a parent or guardian.
          </p>
          <p>
            We comply with:
          </p>
          <ul>
            <li>COPPA (Children's Online Privacy Protection Act) - USA</li>
            <li>GDPR-K (GDPR provisions for children) - EU</li>
          </ul>

          <h2>10. Governing Law and Jurisdiction</h2>
          <p>
            These Terms are governed by the laws of the Federal Republic of Germany (Bundesrepublik Deutschland),
            excluding the UN Convention on Contracts for the International Sale of Goods (CISG).
          </p>
          <p>
            Any disputes arising from or relating to these Terms or the Service shall be subject to the
            exclusive jurisdiction of the courts in [Your City], Germany.
          </p>
          <p>
            <strong>For consumers within the EU:</strong> Nothing in this clause affects your statutory
            rights under consumer protection laws.
          </p>

          <h2>11. Dispute Resolution</h2>
          <p>
            The European Commission provides a platform for online dispute resolution (ODR):
          </p>
          <p>
            <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p>
            We are not obliged or willing to participate in dispute resolution proceedings before a
            consumer arbitration board (Verbraucherschlichtungsstelle).
          </p>

          <h2>12. Severability</h2>
          <p>
            If any provision of these Terms is found to be invalid or unenforceable, the remaining
            provisions shall remain in full force and effect.
          </p>

          <h2>13. Entire Agreement</h2>
          <p>
            These Terms, together with our Privacy Policy, constitute the entire agreement between
            you and GameBuddies.io regarding the use of the Service.
          </p>

          <h2>14. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Changes will be effective:
          </p>
          <ul>
            <li>Immediately upon posting for minor changes (e.g., clarifications)</li>
            <li>30 days after notice for material changes</li>
          </ul>
          <p>
            Continued use of the Service after changes constitutes acceptance of the updated Terms.
          </p>

          <h2>15. Contact Information</h2>
          <p>
            For questions about these Terms, please contact:<br />
            <strong>Email:</strong> legal@gamebuddies.io<br />
            <strong>Postal Address:</strong> See Impressum section above
          </p>
        </section>

        {/* Back to top button */}
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
