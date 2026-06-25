const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEMO_TYPE = process.argv[2] || 'signup_login';
const ACTIONS_LOG = `/tmp/demo_actions_${DEMO_TYPE}.json`;
const VIDEO_IN = `/tmp/demo_raw_${DEMO_TYPE}.mp4`;
const VIDEO_OUT = `/tmp/demo_final_${DEMO_TYPE}.mp4`;

// Source capture dimensions
const SRC_W = 1280;
const SRC_H = 800;

// Output portrait dimensions
const OUT_W = 1080;
const OUT_H = 1920;

// Portrait crop window on source — maintain 9:16 ratio
// At 1x zoom (full page view), we show a 450x800 slice of the 1280x800 source
// This gets scaled up to 1080x1920
const CROP_W_MAX = 450;  // portrait crop width at zoom=1 (450/800 = 9:16 ✓... wait: 450*1920/1080=800 ✓)
const CROP_H_MAX = SRC_H; // always full height at zoom=1

// At max zoom (focused on element), crop window shrinks to ~280x498
const CROP_W_MIN = 280;
const CROP_H_MIN = Math.round(CROP_W_MIN * OUT_H / OUT_W); // 280*1920/1080 = 498

// ---------------------------------------------------------------------------
// Pacing hints — how long to hold on each step type
// ---------------------------------------------------------------------------
const PACING = {
  navigate:  { transition: 0.0, hold: 0.8 },  // page load — brief settle
  scroll:    { transition: 1.5, hold: 0.5 },
  type:      { transition: 0.6, hold: 0.0 },   // hold is covered by typing duration
  click:     { transition: 0.5, hold: 1.2 },   // hold after click to show result
  hover:     { transition: 0.7, hold: 1.5 },   // settle + linger on important elements
  select:    { transition: 0.5, hold: 0.8 },
  default:   { transition: 0.6, hold: 1.0 },
};

// Steps that deserve extra hold (important moments)
const IMPORTANT_STEPS = new Set([
  'landing_land', 'landing_cta', 'billing_summary',
  'success_land', 'login_cta_hold', 'signup_cta_hold',
  'package_standard', 'package_cta_hold',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Cubic ease-in-out: maps t in [0,1] → eased value in [0,1]
// In ffmpeg expression form
function easeExpr(t_expr, dur) {
  // normalised progress p = (t - start) / dur
  // ease = p < 0.5 ? 4p³ : 1 - (-2p+2)³/2
  const p = `((${t_expr})/${dur})`;
  return `if(lt(${p},0.5),4*pow(${p},3),1-pow(-2*${p}+2,3)/2)`;
}

// Build a piecewise eased expression for a property across keyframes
function buildExpr(keyframes, prop) {
  if (keyframes.length === 0) return '0';
  let expr = `${keyframes[keyframes.length - 1][prop]}`;
  for (let i = keyframes.length - 2; i >= 0; i--) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const dur = b.t - a.t;
    if (dur <= 0) {
      expr = `if(gte(t,${a.t}),${a[prop]},${expr})`;
      continue;
    }
    const ease = easeExpr(`t-${a.t}`, dur);
    const lerp = `(${a[prop]}+(${b[prop]}-${a[prop]})*${ease})`;
    expr = `if(between(t,${a.t},${b.t}),${lerp},${expr})`;
  }
  return expr;
}

// Clamp crop window so it never goes outside source bounds
function clampCrop(cx, cy, cw, ch) {
  cw = Math.min(cw, SRC_W);
  ch = Math.min(ch, SRC_H);
  let x = Math.round(cx - cw / 2);
  let y = Math.round(cy - ch / 2);
  x = Math.max(0, Math.min(SRC_W - cw, x));
  y = Math.max(0, Math.min(SRC_H - ch, y));
  return { x, y, w: Math.round(cw), h: Math.round(ch) };
}

// Given a bbox, compute the crop window centred on that element
// zoom=1 → full portrait view, zoom=0 → tightest zoom
function cropForBBox(bbox, zoom = 0.3) {
  const cw = CROP_W_MIN + (CROP_W_MAX - CROP_W_MIN) * zoom;
  const ch = Math.round(cw * OUT_H / OUT_W);
  const cx = bbox.centerX;
  const cy = bbox.centerY;
  return clampCrop(cx, cy, cw, ch);
}

// Default centred portrait crop (no specific element — show middle of page)
function defaultCrop(zoom = 1.0) {
  const cw = CROP_W_MIN + (CROP_W_MAX - CROP_W_MIN) * zoom;
  const ch = Math.round(cw * OUT_H / OUT_W);
  return clampCrop(SRC_W / 2, SRC_H / 2, cw, ch);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const actions = JSON.parse(fs.readFileSync(ACTIONS_LOG, 'utf8'));

// Get total video duration
const durationRaw = execSync(
  `ffprobe -v error -show_entries format=duration -of csv=p=0 "${VIDEO_IN}"`
).toString().trim();
const totalDuration = parseFloat(durationRaw);
console.log(`Source video: ${totalDuration.toFixed(2)}s`);

// ---------------------------------------------------------------------------
// Build keyframe timeline from actions log
// ---------------------------------------------------------------------------
const keyframes = [];

function addKF(t, crop, label) {
  keyframes.push({ t: Math.max(0, parseFloat(t.toFixed(3))), ...crop, label });
}

for (let i = 0; i < actions.length; i++) {
  const action = actions[i];
  const pacing = PACING[action.type] || PACING.default;
  const important = IMPORTANT_STEPS.has(action.stepId);
  const holdMultiplier = important ? 1.8 : 1.0;

  const t = action.t;

  if (action.type === 'navigate') {
    // On navigation: zoom out to full portrait view centred on page
    const crop = defaultCrop(1.0);
    addKF(t, crop, `${action.stepId}_land`);
    addKF(t + 0.6, crop, `${action.stepId}_settle`);
    continue;
  }

  if (action.type === 'scroll') {
    // During scroll: slowly pan the crop window downward
    const cropStart = defaultCrop(0.9);
    const cropEnd = clampCrop(SRC_W / 2, SRC_H * 0.7, CROP_W_MAX * 0.9, CROP_H_MAX * 0.9);
    addKF(t, cropStart, `${action.stepId}_start`);
    addKF(t + (pacing.transition * 2), cropEnd, `${action.stepId}_end`);
    continue;
  }

  if (!action.bbox) continue;

  const bbox = action.bbox;

  // Zoom level based on action type
  let zoom = 0.25; // default: tight zoom on element
  if (action.type === 'type') zoom = 0.2;
  if (action.type === 'hover' && important) zoom = 0.15;

  // Transition in: ease from previous position to this element
  const cropFocused = cropForBBox(bbox, zoom);
  addKF(t, cropFocused, `${action.stepId}_focus`);

  // Hold on element
  const holdDuration = (pacing.hold + (important ? 1.0 : 0)) * holdMultiplier;
  if (holdDuration > 0) {
    addKF(t + holdDuration, cropFocused, `${action.stepId}_hold`);
  }

  // Brief zoom-out between steps (except before navigation)
  const next = actions[i + 1];
  if (next && next.type !== 'navigate' && next.type !== 'scroll') {
    const tOut = t + holdDuration + 0.2;
    const cropOut = defaultCrop(0.75);
    addKF(tOut, cropOut, `${action.stepId}_zoomout`);
  }
}

// Final frame — zoom out to full view
addKF(totalDuration - 0.1, defaultCrop(1.0), 'end');

// Sort keyframes by time and remove duplicates
keyframes.sort((a, b) => a.t - b.t);
const deduped = [keyframes[0]];
for (let i = 1; i < keyframes.length; i++) {
  if (keyframes[i].t > deduped[deduped.length - 1].t + 0.05) {
    deduped.push(keyframes[i]);
  }
}

console.log(`Generated ${deduped.length} keyframes`);
deduped.forEach(kf => console.log(`  t=${kf.t.toFixed(2)} [${kf.label}] crop=${kf.w}x${kf.h} @ (${kf.x},${kf.y})`));

// ---------------------------------------------------------------------------
// Build ffmpeg filter chain
// ---------------------------------------------------------------------------
const xExpr = buildExpr(deduped, 'x');
const yExpr = buildExpr(deduped, 'y');
const wExpr = buildExpr(deduped, 'w');
const hExpr = buildExpr(deduped, 'h');

// ffmpeg zoompan approach: crop dynamic window, scale to output
// Use fps filter first to ensure stable frame timing
const filterChain = [
  `fps=25`,
  `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}'`,
  `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
].join(',');

console.log('\nRunning ffmpeg...');

const cmd = [
  'ffmpeg -y',
  `-i "${VIDEO_IN}"`,
  `-vf "${filterChain}"`,
  `-c:v libx264 -crf 18 -preset slow`,
  `-pix_fmt yuv420p`,
  `-movflags +faststart`,
  `"${VIDEO_OUT}"`,
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\nDone. Output: ${VIDEO_OUT}`);
} catch (e) {
  console.error('ffmpeg failed:', e.message);
  process.exit(1);
}
