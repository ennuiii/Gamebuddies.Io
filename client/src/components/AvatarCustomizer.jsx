import React from 'react';
import MascotCustomizer from './MascotCustomizer';
import './AvatarCustomizer.css';

const AvatarCustomizer = ({
  currentOptions = {},
  onSave,
  onCancel,
  loading = false,
  isPremium = false,
  userRole = 'user',
  userLevel = 1
}) => {
  return (
    <div className="avatar-customizer">
      <MascotCustomizer
        currentConfig={currentOptions}
        onSave={onSave}
        onCancel={onCancel}
        loading={loading}
        isPremium={isPremium}
        userRole={userRole}
        userLevel={userLevel}
      />
    </div>
  );
};

export default AvatarCustomizer;
