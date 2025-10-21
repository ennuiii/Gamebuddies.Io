# GameBuddies E2E Test Suite

Comprehensive end-to-end tests for GameBuddies lobby creation, streamer mode, game workflows, and Socket.IO functionality.

## Test Coverage

### Socket.IO Tests (`socket-io.spec.ts`)
40+ test scenarios covering:

**Connection**
- WebSocket connection and disconnection
- Error handling for connection failures

**Lobby Creation**
- Basic lobby creation
- Public/private lobbies
- Custom max players
- Multiple lobby configurations

**Streamer Mode**
- Enable/disable streamer mode
- Streamer mode functionality validation

**Game Selection**
- Select different game types (Skribbl, Gartic, GeoGuessr, etc.)
- Multiple game selections
- Start game and navigate to game URL

**Player Management**
- Players joining rooms
- Multiple players in single room
- Players leaving rooms
- Disconnect handling
- Full room prevention

**Host Management**
- Host transfer to another player
- Host kick player functionality
- Auto host transfer when host leaves

**Error Handling**
- Invalid room codes
- Missing player names
- Full room errors

**Socket Room Subscription**
- Real-time updates subscription

### Browser UI Tests (`client-ui.spec.ts`)
29+ test scenarios covering:

**Homepage Navigation**
- Homepage loading
- Create/Join room display
- Games section navigation
- Theme toggling (light/dark)

**Lobby Workflows**
- Create basic lobby
- Create with custom settings
- Create public/private lobbies

**Streamer Mode UI**
- Enable streamer mode in UI
- Room code hiding/blurring

**Game Selection**
- Select games from picker
- Display available games
- Start game and navigate

**Join Room**
- Join existing room with code
- Error handling for invalid codes

**Lobby Management**
- Leave lobby
- Display player list

**Responsive Design**
- Mobile viewport (375x667)
- Tablet viewport (768x1024)

### API Tests (`ads-api.spec.ts` & `health.spec.ts`)
- Health check endpoint
- Ad configuration API
- Ad impression tracking

## Running Tests

### Prerequisites

1. **Install Playwright browsers** (if running UI tests):
   ```bash
   npx playwright install
   ```

2. **Set up environment**: Tests run in two modes:

   **Test Mode (Mock Database)**
   - No Supabase credentials required
   - Uses in-memory database
   - Fast and isolated
   - Ideal for CI/CD

   **Production Mode (Real Supabase)**
   - Requires valid Supabase credentials in `.env`
   - Tests against real database
   - More realistic scenarios

### Run All Tests

```bash
npm run test:e2e
```

### Run Specific Test Files

```bash
# Socket.IO tests only
npx playwright test e2e/socket-io.spec.ts

# UI tests only
npx playwright test e2e/client-ui.spec.ts

# API tests only
npx playwright test e2e/health.spec.ts e2e/ads-api.spec.ts
```

### Run Tests in UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

This opens Playwright's interactive test runner where you can:
- See tests run in real-time
- Debug failing tests
- Inspect DOM state
- View network requests

### Run Tests with Browser Visible

```bash
npm run test:e2e:headed
```

### Run Tests in Test Mode (Mock Database)

```bash
TEST_MODE=true npm run test:e2e
```

## Test Mode vs Production Mode

### Test Mode (Automatic)
Playwright is configured to automatically run the server in test mode:
- Sets `TEST_MODE=true` environment variable
- Server uses `MockDatabaseService` instead of Supabase
- All data stored in-memory
- Fast test execution
- No external dependencies

### Production Mode
To test against real Supabase:
1. Update `.env` with valid credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```
2. Remove TEST_MODE from playwright.config.ts
3. Run tests normally

## Mock Database Service

The `MockDatabaseService` (lib/mockDatabase.js) provides:
- Full DatabaseService API compatibility
- In-memory storage for rooms, users, participants
- Realistic room code generation
- UUID generation for IDs
- Event logging
- Game state management

All Socket.IO handlers work identically with both real and mock database.

## Test Structure

### Helper Functions

**`waitForEvent<T>(socket, event, timeout)`**
- Wait for specific Socket.IO event
- Returns event data
- Throws on timeout

**`connectSocket(socket)`**
- Connect socket and wait for confirmation
- Handles connection errors
- Returns promise

**`typeWithDelay(page, selector, text)`**
- Simulate realistic user typing
- Used in UI tests

### Test Patterns

**Socket.IO Tests**:
```typescript
test('should create a room', async () => {
  await connectSocket(socket);

  socket.emit('createRoom', {
    playerName: 'TestHost',
    maxPlayers: 10,
    streamerMode: false,
  });

  const data = await waitForEvent<any>(socket, 'roomCreated');

  expect(data.roomCode).toBeDefined();
  expect(data.room.players.length).toBe(1);
});
```

**UI Tests**:
```typescript
test('should create lobby', async ({ page }) => {
  await page.goto(CLIENT_URL);

  const input = page.locator('input[placeholder*="name"]');
  await input.fill('TestPlayer');

  const button = page.locator('button:has-text("Create")');
  await button.click();

  await expect(page.locator('.lobby')).toBeVisible();
});
```

## Debugging Tests

### View Test Report

After tests run:
```bash
npx playwright show-report
```

### Enable Debug Mode

```bash
DEBUG=pw:api npm run test:e2e
```

### Run Single Test

```bash
npx playwright test -g "should create a basic lobby"
```

### Inspect Element States

Use `page.pause()` in your test:
```typescript
test('debug test', async ({ page }) => {
  await page.goto(CLIENT_URL);
  await page.pause(); // Opens inspector
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
- name: Run E2E Tests
  run: |
    cd server
    npm run test:e2e
  env:
    TEST_MODE: true
```

### Test Reports

Playwright generates HTML reports automatically:
- Location: `server/playwright-report/`
- Contains screenshots of failures
- Shows test traces
- Network activity logs

## Common Issues

### "Timeout waiting for event"
- Server might not be running
- Check server logs for errors
- Verify Socket.IO connection established

### "Element not found"
- UI might have changed
- Update selectors in test
- Check if element is conditionally rendered

### "Port already in use"
- Another server instance running
- Kill process: `pkill -f "node.*index"`
- Or use different port in config

## Best Practices

1. **Keep tests independent**: Each test should work in isolation
2. **Clean up resources**: Disconnect sockets, close pages
3. **Use realistic data**: Test with actual usernames and room codes
4. **Test edge cases**: Full rooms, disconnects, invalid input
5. **Verify both client and server**: Check events on both sides
6. **Use appropriate timeouts**: Allow time for async operations

## Contributing

When adding new tests:

1. **Follow existing patterns**: Use helper functions
2. **Group related tests**: Use `test.describe()`
3. **Clear test names**: Describe what test does
4. **Test both success and failure**: Happy path + error cases
5. **Update this README**: Document new test scenarios

## Test Metrics

Current test count: **69 test scenarios**
- Socket.IO: 40 tests
- Browser UI: 18 tests
- API/Health: 11 tests

Target coverage:
- ✅ Room creation workflows
- ✅ Streamer mode
- ✅ Game selection
- ✅ Multi-player scenarios
- ✅ Host management
- ✅ Error handling
- ✅ Responsive design
