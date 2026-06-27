#!/usr/bin/env node
/**
 * composite_demo.js — LaunchSteady Demo Compositor
 * Composites raw 1280x800 screen recording onto laptop mockup,
 * outputs 1080x1920 portrait MP4 for social/demo use.
 *
 * Input:  /tmp/demo_raw_{demo_type}.mp4        (from run_demo_flow.js)
 * Mockup: scripts/assets/laptop_mockup.png     (2588x4637 portrait, green screen)
 * Output: /tmp/demo_final_{demo_type}.mp4
 *
 * Mockup screen area (at 2588x4637 source):
 *   x: 52, y: 1252, w: 2484, h: 2087
 *
 * At 1080px output width (scale factor 0.4173):
 *   mockup scaled: 1080x1934
 *   screen x: 22, screen y: 522, screen w: 1037, screen h: 871
 *   recording scaled to 1037 wide → 648 tall, centered → y offset 634
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [,, demoType] = process.argv;
if (!demoType) {
  console.error('Usage: node composite_demo.js <demo_type>');
  process.exit(1);
}

const inputVideo  = `/tmp/demo_raw_${demoType}.mp4`;
const outputVideo = `/tmp/demo_final_${demoType}.mp4`;
const mockupPath  = path.join(__dirname, 'assets', 'laptop_mockup_1080.png');

if (!fs.existsSync(inputVideo)) {
  console.error(`Input video not found: ${inputVideo}`);
  process.exit(1);
}
if (!fs.existsSync(mockupPath)) {
  console.error(`Mockup not found: ${mockupPath}`);
  console.error('Copy Gemini_Generated_Image_hwi4zbhwi4zbhwi4.png to scripts/assets/laptop_mockup.png');
  process.exit(1);
}

// ─── Layout constants ─────────────────────────────────────────────────────────
// Output canvas
const OUT_W = 1080;
const OUT_H = 1920;

// Mockup source: 2588x4637
// Scale mockup to fit 1080 wide
const MOCKUP_SCALE_W = 1080;
const MOCKUP_SCALE_H = 1934; // Math.round(4637 * (1080/2588))

// Center mockup vertically on 1920 canvas
const MOCKUP_Y = Math.round((OUT_H - MOCKUP_SCALE_H) / 2); // -7 → clamp to 0
const MOCKUP_Y_CLAMPED = Math.max(0, MOCKUP_Y); // 0

// Screen area on scaled mockup
const SCREEN_X = 22;   // 52 * 0.4173
const SCREEN_Y = 522;  // 1252 * 0.4173
const SCREEN_W = 1037; // 2484 * 0.4173
const SCREEN_H = 871;  // 2087 * 0.4173

// Recording is 1280x800 (16:10)
// Scale to fit SCREEN_W → recording scaled height
const REC_SCALED_W = SCREEN_W;                                        // 1037
const REC_SCALED_H = Math.round(800 * (SCREEN_W / 1280));            // 648

// Center recording vertically within screen area
const REC_Y_OFFSET = Math.round((SCREEN_H - REC_SCALED_H) / 2);     // 111
const REC_X = SCREEN_X;                                               // 22
const REC_Y = SCREEN_Y + MOCKUP_Y_CLAMPED + REC_Y_OFFSET;           // 633

const durRaw = require('child_process').execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputVideo}"`).toString().trim();
const DURATION = parseFloat(durRaw).toFixed(3);
console.log(`Input duration: ${DURATION}s`);

console.log('Compositing demo video...');
console.log(`  Input:   ${inputVideo}`);
console.log(`  Mockup:  ${mockupPath}`);
console.log(`  Output:  ${outputVideo}`);
console.log(`  Recording overlay: x=${REC_X} y=${REC_Y} w=${REC_SCALED_W} h=${REC_SCALED_H}`);

// ─── ffmpeg filter_complex ────────────────────────────────────────────────────
//
// [0] = raw recording (1280x800)
// [1] = laptop mockup PNG (2588x4637)
//
// Steps:
// 1. Scale recording to fit screen area width
// 2. Create blank 1080x1920 black canvas
// 3. Scale mockup to 1080 wide
// 4. Overlay mockup onto canvas (centered)
// 5. Overlay scaled recording onto screen area position
//
const filter = [
  // Scale recording to screen width
  `[0:v]scale=${REC_SCALED_W}:${REC_SCALED_H}[rec_scaled]`,

  // Black 1080x1920 canvas (color source, duration matches input)
  `color=black:s=${OUT_W}x${OUT_H}:r=30:d=${DURATION}[canvas]`,

  // Scale mockup to 1080 wide
  `[1:v]copy[mockup_scaled]`,

  // Overlay mockup onto canvas
  `[canvas][mockup_scaled]overlay=0:${MOCKUP_Y_CLAMPED}[with_mockup]`,

  // Overlay recording onto screen area
  `[with_mockup][rec_scaled]overlay=${REC_X}:${REC_Y}[out]`,
].join(';');

const cmd = [
  'ffmpeg -y',
  `-i "${inputVideo}"`,
  `-i "${mockupPath}"`,
  `-filter_complex "${filter}"`,
  `-map "[out]"`,
  '-shortest',
  `-map 0:a?`,           // pass audio through if present (optional)
  `-c:v libx264`,
  `-crf 18`,
  `-preset fast`,
  `-pix_fmt yuv420p`,
  `-movflags +faststart`,
  `"${outputVideo}"`,
].join(' ');

console.log('\nRunning ffmpeg...');
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\nDone: ${outputVideo}`);
} catch (err) {
  console.error('ffmpeg failed:', err.message);
  process.exit(1);
}
