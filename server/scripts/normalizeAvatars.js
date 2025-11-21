const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const AVATARS_DIR = path.join(__dirname, '../public/avatars');
const TARGET_SIZE = 512;

async function processDirectory(type) {
  const dirPath = path.join(AVATARS_DIR, type);
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (file.toLowerCase().endsWith('.png')) {
      const filePath = path.join(dirPath, file);
      console.log(`Processing ${type}/${file}...`);
      
      try {
        const image = await Jimp.read(filePath);
        
        // 1. Auto-crop: Remove transparent whitespace from edges
        image.autocrop({ tolerance: 0.01 });
        
        // 2. Contain: Scale the cropped image to fit within 512x512, centered
        // This ensures the 'content' (the mascot) is as big as possible
        image.contain({ w: TARGET_SIZE, h: TARGET_SIZE });
        
        // 3. Write back
        console.log('Writing file...');
        const buffer = await image.getBuffer('image/png');
        fs.writeFileSync(filePath, buffer);
        console.log(`✅ Normalized ${file}`);
      } catch (err) {
        console.error(`❌ Failed to process ${file}:`, err.message);
      }
    } else {
      console.log(`Skipping ${file} (not PNG)`);
    }
  }
}

async function main() {
  console.log('🖼️  Starting Avatar Normalization...');
  console.log('   Target Size: 512x512');
  console.log('   Action: Trim whitespace + Scale to Fit (Contain)');
  
  await processDirectory('free');
  await processDirectory('premium');
  
  console.log('✨ Done!');
}

main();
