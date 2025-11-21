// Registry of available full mascot avatars
// To add new avatars:
// 1. Add the file to client/public/avatars/
// 2. Add an entry here with a unique ID and the filename

export const MASCOT_ASSETS = {
  avatars: [
    { id: 'group1', name: 'Classic Team', src: '/avatars/group1.jpeg', premium: false },
    { id: 'group2', name: 'Action Squad', src: '/avatars/group2.jpeg', premium: false },
    { id: 'pixel_party', name: 'Pixel Party', src: '/avatars/avatargroup1.jpeg', premium: true },
    { id: 'adventurer_guild', name: 'Adventurer Guild', src: '/avatars/avatargroup2.jpeg', premium: true }
  ]
};

export const getDefaultMascotConfig = () => ({
  avatarId: 'group1'
});
