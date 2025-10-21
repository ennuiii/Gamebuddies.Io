# Server Refactoring Plan

## Current Issue
The `server/index.js` file is 3672 lines, which is far too large for maintainability. It contains:
- Express app configuration
- CORS setup
- Socket.IO handlers
- API routes
- Game proxy configuration
- Cleanup tasks
- And much more

## Refactoring Strategy

### New File Structure

```
server/
├── index.ts                    # Entry point (< 100 lines)
├── app.ts                      # Express app setup (< 200 lines)
├── socket.ts                   # Socket.IO setup and handlers (< 500 lines)
├── config/
│   ├── constants.ts           # ✅ Already created
│   ├── cors.ts                # ✅ Already created
│   └── gameProxies.ts         # Game proxy configuration
├── lib/
│   ├── logger.ts              # ✅ Already created
│   ├── errors.ts              # ✅ Already created
│   ├── apiKeyManager.ts       # ✅ Already created
│   ├── adManager.ts           # ✅ Already created
│   ├── connectionManager.js   # Existing
│   ├── lobbyManager.js        # Existing
│   ├── statusSyncManager.js   # Existing
│   └── gameProxyManager.ts    # NEW - Manage game proxies
├── middlewares/
│   ├── requestId.ts           # ✅ Already created
│   ├── auth.ts                # NEW - Authentication middleware
│   └── validation.ts          # Move from lib/validation
├── routes/
│   ├── ads.ts                 # ✅ Already created
│   ├── api.ts                 # NEW - Main API routes
│   ├── rooms.ts               # NEW - Room management routes
│   ├── players.ts             # NEW - Player management routes
│   ├── gameApiV2.js           # Existing
│   ├── gameApiV2_DDFCompatibility.js  # Existing
│   └── games.js               # Existing
└── services/
    └── gameKeepAlive.js       # Existing
```

### Phase 1: Core Infrastructure ✅
- [x] Create TypeScript configuration
- [x] Create type definitions
- [x] Convert constants to TypeScript
- [x] Convert logger to TypeScript
- [x] Convert errors to TypeScript
- [x] Convert CORS config to TypeScript
- [x] Convert requestId middleware to TypeScript

### Phase 2: AdSense Integration ✅
- [x] Create AdSense React components
- [x] Create ad manager library
- [x] Create ad tracking API routes
- [x] Create database migration

### Phase 3: Refactor Monolithic Server (IN PROGRESS)
- [ ] Extract game proxy configuration
- [ ] Extract Socket.IO handlers
- [ ] Extract API routes
- [ ] Create new Express app setup
- [ ] Create new entry point
- [ ] Update imports throughout

### Phase 4: Testing
- [ ] Test TypeScript compilation
- [ ] Test AdSense integration
- [ ] Test refactored server
- [ ] Run integration tests

## Benefits of Refactoring

1. **Maintainability**: Smaller files are easier to understand and modify
2. **Type Safety**: TypeScript catches errors at compile time
3. **Testability**: Smaller modules are easier to test in isolation
4. **Performance**: Better code organization enables optimization
5. **Collaboration**: Multiple developers can work on different modules
6. **Documentation**: TypeScript types serve as inline documentation

## Migration Strategy

### Gradual Migration
- Keep existing index.js working
- Create new TypeScript files alongside
- Gradually migrate functionality
- Test each migration step
- Once complete, replace index.js with index.ts

### Backwards Compatibility
- Maintain existing API contracts
- Keep socket.io event names the same
- Preserve database schema
- No breaking changes for clients

## Next Steps

1. Create `server/config/gameProxies.ts` - Extract game proxy configuration
2. Create `server/socket.ts` - Extract Socket.IO handlers
3. Create `server/routes/rooms.ts` - Extract room management routes
4. Create `server/routes/players.ts` - Extract player management routes
5. Create `server/app.ts` - Express app setup
6. Create `server/index.ts` - New entry point
7. Update all imports and test

## File Size Targets

- Entry point (index.ts): < 100 lines
- App setup (app.ts): < 200 lines
- Socket handlers (socket.ts): < 500 lines
- Route files: < 300 lines each
- Lib files: < 400 lines each
- Middleware: < 150 lines each

## Refactoring Principles

1. **Single Responsibility**: Each file has one clear purpose
2. **DRY**: Don't Repeat Yourself - shared logic in lib/
3. **SOLID**: Follow SOLID principles for better architecture
4. **Type Safety**: Use TypeScript for all new code
5. **Error Handling**: Consistent error handling with custom error classes
6. **Logging**: Use Winston logger throughout
7. **Documentation**: JSDoc comments for all public functions
