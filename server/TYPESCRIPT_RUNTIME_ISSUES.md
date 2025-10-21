# TypeScript Runtime Issues

## Summary
The TypeScript code compiles successfully, but fails at runtime with module resolution errors.

## Root Cause
TypeScript's compiler (`tsc`) only compiles `.ts` files to `.js` files in the `dist/` folder.
It does NOT copy plain `.js` files that are imported by the TypeScript code.

## The Problem

### What Happens:
1. `index.ts` imports: `import { db } from './lib/supabase';`
2. TypeScript compiles this to: `const supabase_1 = require('./lib/supabase');`
3. At runtime, Node.js looks for `dist/lib/supabase.js` (relative to `dist/index.js`)
4. **ERROR:** `dist/lib/supabase.js` doesn't exist because `lib/supabase.js` wasn't copied

### Files in dist/lib/ (compiled from .ts files):
✅ adManager.js (from adManager.ts)
✅ apiKeyManager.js (from apiKeyManager.ts)
✅ connectionManager.js (COPIED MANUALLY)
✅ errors.js (from errors.ts)
✅ logger.js (from logger.ts)

### Files MISSING from dist/lib/ (plain .js files not copied):
❌ supabase.js
❌ mockDatabase.js
❌ validation.js
❌ lobbyManager.js
❌ statusSyncManager.js
❌ enhancedConnectionManager.js

### Files MISSING from dist/routes/:
❌ gameApiV2.js (COPIED MANUALLY but may have dependencies)
❌ gameApiV2_DDFCompatibility.js (COPIED MANUALLY)
❌ games.js (COPIED MANUALLY)

### Files MISSING from dist/services/:
❌ gameKeepAlive.js (COPIED MANUALLY)

## Solutions

### Option 1: Copy .js Files to dist/ (Quick Fix)
```bash
# Copy all missing .js files
cp lib/supabase.js dist/lib/
cp lib/mockDatabase.js dist/lib/
cp lib/validation.js dist/lib/
cp lib/lobbyManager.js dist/lib/
cp lib/statusSyncManager.js dist/lib/
cp lib/enhancedConnectionManager.js dist/lib/
```

**Pros:** Fast, works immediately
**Cons:** Must manually copy files every time you build

### Option 2: Use Build Script (Recommended)
Create `scripts/build.js`:
```javascript
const { execSync } = require('child_process');
const fs = require('fs-extra');

// Compile TypeScript
execSync('tsc', { stdio: 'inherit' });

// Copy .js files
fs.copySync('lib', 'dist/lib', {
  filter: (src) => src.endsWith('.js')
});
fs.copySync('routes', 'dist/routes', {
  filter: (src) => src.endsWith('.js')
});
fs.copySync('services', 'dist/services', {
  filter: (src) => src.endsWith('.js')
});

console.log('✅ Build complete');
```

Update package.json:
```json
{
  "scripts": {
    "build": "node scripts/build.js"
  }
}
```

**Pros:** Automated, reliable
**Cons:** Requires build script maintenance

### Option 3: Convert ALL .js to .ts (Best Long-term)
Convert remaining .js files to TypeScript:
- lib/supabase.js → lib/supabase.ts
- lib/mockDatabase.js → lib/mockDatabase.ts
- lib/validation.js → lib/validation.ts
- etc.

**Pros:** Full type safety, no copying needed
**Cons:** Time-consuming, requires fixing type errors

### Option 4: Use ts-node in Production
```json
{
  "scripts": {
    "start": "ts-node index.ts"
  }
}
```

**Pros:** No compilation needed
**Cons:** Slower startup, not recommended for production

## Recommended Approach

1. **Short-term:** Use Option 2 (Build Script)
2. **Long-term:** Gradually convert .js → .ts (Option 3)

## Current Status

- ✅ TypeScript compiles without errors
- ✅ Types are correct
- ❌ Runtime fails with module not found errors
- ⚠️ Need to copy .js files OR convert to .ts

## Next Steps

1. Choose a solution (recommend Option 2)
2. Test compiled server
3. Update documentation
4. Eventually convert remaining .js to .ts
