import React from 'react';
import MascotCustomizer from './MascotCustomizer';
import './AvatarCustomizer.css';

interface AvatarData {
  avatar_style?: string;
  avatar_seed?: string;
  avatar_options?: Record<string, unknown>;
}

interface AvatarCustomizerProps {
  currentStyle?: string;
  currentSeed?: string;
  currentOptions?: Record<string, unknown>;
  username?: string;
  onSave: (data: AvatarData) => void;
  onCancel: () => void;
  loading?: boolean;
  isPremium?: boolean;
  userRole?: string;
  userLevel?: number;
}

const AvatarCustomizer: React.FC<AvatarCustomizerProps> = ({
  currentOptions = {},
  onSave,
  onCancel,
  loading = false,
  isPremium = false,
  userRole = 'user',
  userLevel = 1,
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
