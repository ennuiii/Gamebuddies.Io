#!/usr/bin/env node
/**
 * Build Script for GameBuddies Server
 *
 * Compiles TypeScript and copies plain .js files to dist/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building GameBuddies Server...\n');

// Step 1: Compile TypeScript
console.log('📦 Compiling TypeScript...');
try {
  execSync('tsc', { stdio: 'inherit' });
  console.log('✅ TypeScript compilation complete\n');
} catch (error) {
  console.error('❌ TypeScript compilation failed');
  process.exit(1);
}

// Step 2: Copy .js files that aren't compiled
console.log('📋 Copying plain JavaScript files...');

const copyJsFiles = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) {
    console.log(`⚠️  Skipping ${srcDir} (doesn't exist)`);
    return 0;
  }

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const files = fs.readdirSync(srcDir);
  let copied = 0;

  files.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      copied += copyJsFiles(srcPath, destPath);
    } else if (file.endsWith('.js') && !file.endsWith('.test.js') && !file.endsWith('.spec.js')) {
      // Check if there's a corresponding .ts file that would have been compiled
      const tsEquivalent = srcPath.replace(/\.js$/, '.ts');
      if (!fs.existsSync(tsEquivalent)) {
        // No .ts file exists, so copy this .js file
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ ${srcPath} → ${destPath}`);
        copied++;
      }
    }
  });

  return copied;
};

// Copy from each directory
let totalCopied = 0;
const directories = ['lib', 'routes', 'services', 'middlewares', 'config'];

directories.forEach(dir => {
  const srcDir = path.join(__dirname, '..', dir);
  const destDir = path.join(__dirname, '..', 'dist', dir);
  const count = copyJsFiles(srcDir, destDir);
  if (count > 0) {
    totalCopied += count;
  }
});

console.log(`\n✅ Copied ${totalCopied} JavaScript files\n`);

console.log('🎉 Build complete!');
console.log('\n📊 Output directory: dist/');
console.log('🚀 Run with: node dist/index.js\n');
