import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './fonts.css'; // Self-hosted fonts for GDPR compliance
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
