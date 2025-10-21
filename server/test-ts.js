#!/usr/bin/env node

process.env.TEST_MODE = 'true';

try {
  require('./dist/index.js');
} catch (error) {
  console.error('\n❌ RUNTIME ERROR:');
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
