import React from 'react';
import './RotateDevicePrompt.css';

interface RotateDevicePromptProps {
  message?: string;
  showIcon?: boolean;
}

const RotateDevicePrompt: React.FC<RotateDevicePromptProps> = ({
  message = 'Please rotate your device to landscape mode for the best experience',
  showIcon = true,
}) => {
  return (
    <div className="rotate-device-prompt">
      <div className="rotate-device-content">
        {showIcon && (
          <div className="rotate-device-icon">
            <svg
              width="80"
              height="80"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="4"
                y="2"
                width="12"
                height="20"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M19 8L21 10L19 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M21 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        )}
        <p className="rotate-device-message">{message}</p>
        <div className="rotate-device-animation">
          <div className="phone-portrait">
            <div className="phone-screen"></div>
          </div>
          <div className="rotation-arrow">→</div>
          <div className="phone-landscape">
            <div className="phone-screen"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RotateDevicePrompt;
