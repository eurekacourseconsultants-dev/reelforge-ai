#!/usr/bin/env node
/**
 * composite_demo.js — LaunchSteady Demo Compositor
 * Simple scale pass — no mockup, no chromakey.
 *
 * Desktop: scales 1280x800 → 1920x1080 (16:9 landscape)
 * Mobile:  scales 390x844  → 1080x1920 (9:16 portrait)
 *
 * Usage:
 *   node scripts/composite_demo.js <demo_type>
 *   node scripts/composite_demo.js <demo_type> --mobile
 */

const { execSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const isMobile = args.includes('--mobile');
const demoType = args.filter(a => !a.startsWith('--'))[0];

if (!demoType) {
  console.error('Usage: node composite_demo.js <demo_type> [--mobile]');
  process.exit(1);
}

const mode      = isMobile ? 'mobile' : 'desktop';
const inputVideo  = `/tmp/demo_raw_${demoType}_${mode}.mp4`;
const outputVideo = `/tmp/demo_final_${demoType}_${mode}.mp4`;
const outW      = isMobile ? 1080 : 1920;
const outH      = isMobile ? 1920 : 1080;

if (!fs.existsSync(inputVideo)) {
  console.error(`Input video not found: ${inputVideo}`);
  process.exit(1);
}

console.log(`Compositing [${mode}]: ${inputVideo} → ${outputVideo}`);

// Desktop: bottom-anchored crop so CTA buttons near bottom of viewport are kept.
// Mobile: center crop is fine — UI scrolls vertically.
// Desktop: scale+crop with top bias so CTA stays in frame
// Mobile: scale+pad so nothing gets cropped off
const vfFilter = isMobile
  ? `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}:0:440`
  : `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}:0:120`;

const cmd = [
  'ffmpeg -y',
  `-i "${inputVideo}"`,
  `-vf "${vfFilter}"`,
  '-c:v libx264',
  '-crf 18',
  '-preset fast',
  '-pix_fmt yuv420p',
  '-movflags +faststart',
  `"${outputVideo}"`,
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`Done: ${outputVideo}`);
} catch (err) {
  console.error('ffmpeg failed:', err.message);
  process.exit(1);
}
