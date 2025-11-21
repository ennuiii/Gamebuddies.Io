const { Jimp, loadFont, HorizontalAlign, VerticalAlign } = require('jimp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DIR = path.join(__dirname, '../public/ad_frames');
const AVATARS_DIR = path.join(__dirname, '../public/avatars');
const ASSETS_DIR = path.join(__dirname, '../../client/public');
const OUTPUT_VIDEO = path.join(__dirname, '../public/gamebuddies_ad.mp4');

// Font paths
const FONT_64_WHITE = path.join(__dirname, '../node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-64-white/open-sans-64-white.fnt');
const FONT_32_WHITE = path.join(__dirname, '../node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-32-white/open-sans-32-white.fnt');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
// Helper to save
async function saveImage(image, filename) {
  const buffer = await image.getBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);
  console.log(`Saved ${filename}`);
}

async function createTextSlide(text, filename, color = 0x000000ff) {
  const image = new Jimp({ width: 1280, height: 720, color: color });
  const font = await loadFont(FONT_64_WHITE);
  
  image.print({
    font: font,
    x: 0,
    y: 0,
    text: text,
    maxWidth: 1280,
    maxHeight: 720,
    alignmentX: HorizontalAlign.CENTER,
    alignmentY: VerticalAlign.MIDDLE
  });

  await saveImage(image, filename);
}

async function createLogoSlide(filename) {
  const image = new Jimp({ width: 1280, height: 720, color: 0x1a1a2eff });
  const logoPath = path.join(ASSETS_DIR, 'logo.png');
  
  if (fs.existsSync(logoPath)) {
    const logo = await Jimp.read(logoPath);
    logo.contain({ w: 800, h: 400 });
    image.composite(logo, 1280/2 - 400, 720/2 - 200);
  }
  
  const font = await loadFont(FONT_64_WHITE);
  image.print({
    font,
    x: 0,
    y: 500,
    text: "GameBuddies.io",
    maxWidth: 1280,
    maxHeight: 200,
    alignmentX: HorizontalAlign.CENTER,
    alignmentY: VerticalAlign.MIDDLE
  });

  await saveImage(image, filename);
}

async function createAvatarSlide(avatarPath, name, filename) {
  const bg = new Jimp({ width: 1280, height: 720, color: 0x1a1a2eff });
  
  const avatar = await Jimp.read(avatarPath);
  avatar.contain({ w: 600, h: 600 });
  
  bg.composite(avatar, 1280/2 - 300, 720/2 - 350);
  
  const font = await loadFont(FONT_32_WHITE);
  bg.print({
    font,
    x: 0,
    y: 600,
    text: name,
    maxWidth: 1280,
    maxHeight: 100,
    alignmentX: HorizontalAlign.CENTER,
    alignmentY: VerticalAlign.MIDDLE
  });

  await saveImage(bg, filename);
}

async function main() {
  console.log('🎥 Generating Video Ad Frames...');
  
  let frameIdx = 1;
  const nextFrame = () => `frame_${String(frameIdx++).padStart(3, '0')}.png`;

  // 1. Logo
  await createLogoSlide(nextFrame());
  
  // 2. Intro Text
  await createTextSlide('Choose Your Character', nextFrame(), 0x2196F3ff);
  
  // 3. Avatars (Top 3 from each category)
  const types = ['free', 'premium'];
  for (const type of types) {
    const dir = path.join(AVATARS_DIR, type);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
      let count = 0;
      for (const file of files) {
        if (count++ >= 3) break;
        const name = path.parse(file).name.toUpperCase();
        await createAvatarSlide(path.join(dir, file), name, nextFrame());
      }
    }
  }
  
  // 4. Outro
  await createTextSlide('Play Free Now!', nextFrame(), 0x4CAF50ff);
  
  console.log('🎞️  Stitching video with ffmpeg...');
  
  // FFmpeg: 2 seconds per slide (-framerate 0.5)
  // scale to even dimensions to satisfy some codecs
  const cmd = `ffmpeg -y -framerate 0.5 -i "${path.join(OUTPUT_DIR, 'frame_%03d.png')}" -vf "scale=1280:720" -c:v libx264 -r 30 -pix_fmt yuv420p "${OUTPUT_VIDEO}"`;
  
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✨ Video created successfully: ${OUTPUT_VIDEO}`);
    console.log('   (Served at http://localhost:XXXX/ad/gamebuddies_ad.mp4 if static middleware is set)');
  } catch (e) {
    console.error('❌ FFmpeg failed:', e.message);
  }
}

main().catch(console.error);
