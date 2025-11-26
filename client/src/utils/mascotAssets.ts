export interface MascotAvatar {
  id: string;
  name: string;
  src: string;
  premium: boolean;
}

export interface MascotAssets {
  avatars: MascotAvatar[];
}

export const MASCOT_ASSETS: MascotAssets = {
  avatars: [
    { id: 'group1', name: 'Classic Team', src: '/avatars/group1.jpeg', premium: false },
    { id: 'group2', name: 'Action Squad', src: '/avatars/group2.jpeg', premium: false },
    { id: 'pixel_party', name: 'Pixel Party', src: '/avatars/avatargroup1.jpeg', premium: true },
    { id: 'adventurer_guild', name: 'Adventurer Guild', src: '/avatars/avatargroup2.jpeg', premium: true },
  ],
};

export interface MascotConfig {
  avatarId: string;
}

export const getDefaultMascotConfig = (): MascotConfig => ({
  avatarId: 'group1',
});
