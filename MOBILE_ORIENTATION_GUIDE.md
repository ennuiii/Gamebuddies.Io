# Mobile Orientation & Landscape Mode Guide

## Overview

GameBuddies implements smart landscape orientation enforcement for mobile devices. This ensures the best gaming experience while allowing flexibility for browsing.

## Strategy

### **Hybrid Approach: Enforce When Needed**

- ✅ **Lobby/Room**: Force landscape (better player list, chat visibility)
- ✅ **In-Game**: Force landscape (optimal game experience)
- ❌ **Home/Browse**: Allow portrait (easier one-hand browsing)

### Why Not Always Landscape?

1. **Browsing games** - Users might want to scroll game list in portrait
2. **Quick joins** - Easier to type room codes in portrait
3. **User flexibility** - Let users choose for non-critical screens

## Implementation

### 1. **useOrientation Hook**

Detects device orientation in real-time:

```typescript
import { useOrientation } from '../hooks/useOrientation';

const MyComponent = () => {
  const { isPortrait, isLandscape, type, angle } = useOrientation();

  return <div>{isPortrait ? 'Portrait' : 'Landscape'}</div>;
};
```

### 2. **LandscapeEnforcer Component**

Wraps content and shows rotation prompt when needed:

```tsx
import LandscapeEnforcer from '../components/LandscapeEnforcer';

// Option 1: Enforce on game screens only (recommended)
<LandscapeEnforcer enforceOn="game-only">
  <RoomLobby />
</LandscapeEnforcer>

// Option 2: Always enforce landscape
<LandscapeEnforcer enforceOn="always">
  <GameContent />
</LandscapeEnforcer>

// Option 3: Never enforce (allow portrait)
<LandscapeEnforcer enforceOn="never">
  <HomeScreen />
</LandscapeEnforcer>

// Custom message
<LandscapeEnforcer
  enforceOn="game-only"
  message="Flip your phone to play with friends!"
>
  <Game />
</LandscapeEnforcer>
```

### 3. **RotateDevicePrompt Component**

Beautiful fullscreen prompt with animated icon:

```tsx
import RotateDevicePrompt from '../components/RotateDevicePrompt';

// Standalone usage (if you need manual control)
{isPortrait && <RotateDevicePrompt />}

// Custom message
<RotateDevicePrompt message="Rotate to continue playing!" />
```

### 4. **Fullscreen Landscape Helpers**

Request fullscreen + lock orientation:

```typescript
import { requestLandscapeFullscreen, exitFullscreen } from '../hooks/useOrientation';

// Enter fullscreen landscape (e.g., when game starts)
const handleStartGame = async () => {
  await requestLandscapeFullscreen();
  // Start game...
};

// Exit fullscreen (e.g., when returning to lobby)
const handleExitGame = () => {
  exitFullscreen();
  // Return to lobby...
};
```

## Recommended Usage

### **Room Lobby Component**

```tsx
import LandscapeEnforcer from '../components/LandscapeEnforcer';

const RoomLobby = () => {
  return (
    <LandscapeEnforcer enforceOn="always">
      {/* Room lobby content */}
      <PlayerList />
      <RoomChat />
      <GameSelection />
    </LandscapeEnforcer>
  );
};
```

### **Game Wrapper Component**

```tsx
import { requestLandscapeFullscreen } from '../hooks/useOrientation';
import LandscapeEnforcer from '../components/LandscapeEnforcer';

const GameWrapper = () => {
  useEffect(() => {
    // Auto-enter fullscreen landscape when game loads
    requestLandscapeFullscreen();

    return () => {
      exitFullscreen();
    };
  }, []);

  return (
    <LandscapeEnforcer enforceOn="always" message="Rotate to play!">
      <iframe src={gameUrl} />
    </LandscapeEnforcer>
  );
};
```

### **Home Page (No Enforcement)**

```tsx
const HomePage = () => {
  // No LandscapeEnforcer wrapper
  // Users can browse in portrait or landscape
  return (
    <div>
      <Header />
      <GameGrid />
    </div>
  );
};
```

## PWA Manifest

Updated to allow any orientation:

```json
{
  "orientation": "any"
}
```

This gives users flexibility while we enforce programmatically where needed.

## Browser Support

### Screen Orientation API

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| orientation.lock() | ✅ | ❌ | ✅ | ✅ |
| orientationchange event | ✅ | ✅ | ✅ | ✅ |
| Fullscreen API | ✅ | ✅ | ✅ | ✅ |

**Note:** Safari doesn't support `screen.orientation.lock()`, but the rotation prompt still works.

## Testing

### Desktop

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select a mobile device (e.g., iPhone 12)
4. Rotate the device icon
5. See rotation prompt appear in portrait mode

### Mobile

1. Open GameBuddies on your phone
2. Join a room or start a game
3. Hold phone in portrait
4. See rotation prompt
5. Rotate to landscape
6. Prompt disappears, game/lobby appears

## Customization

### Change Enforcement Rules

Edit `LandscapeEnforcer.tsx`:

```tsx
const shouldShowPrompt = (): boolean => {
  if (!isMobile) return false;
  if (enforceOn === 'never') return false;
  if (enforceOn === 'always') return orientation.isPortrait;

  // Custom logic: Check if in game route
  const isInGame = window.location.pathname.includes('/game');
  return orientation.isPortrait && isInGame;
};
```

### Customize Prompt Appearance

Edit `RotateDevicePrompt.css`:

```css
.rotate-device-prompt {
  background: linear-gradient(135deg, #your-color 0%, #your-color-2 100%);
}
```

## Best Practices

1. ✅ **Enforce in lobby/game** - Critical for UX
2. ✅ **Allow portrait for browsing** - User flexibility
3. ✅ **Use fullscreen API** - Immersive game experience
4. ✅ **Graceful degradation** - Works even if orientation lock fails
5. ✅ **Clear messaging** - Users know why they need to rotate
6. ❌ **Don't force globally** - Annoying for browsing

## Future Enhancements

- [ ] Add haptic feedback when rotating
- [ ] Track orientation analytics
- [ ] A/B test enforcement strategies
- [ ] Add "play in portrait anyway" option for advanced users
- [ ] Auto-rotate animation tutorial on first visit
