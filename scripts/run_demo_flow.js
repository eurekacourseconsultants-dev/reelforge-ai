#!/usr/bin/env node
/**
 * run_demo_flow.js — LaunchSteady Demo Generator
 * Drives Puppeteer through a flow config, records raw video.
 * Output: /tmp/demo_raw_{demo_type}.mp4
 * Actions log: /tmp/demo_actions_{demo_type}.json
 */

const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const fs = require('fs');
const path = require('path');

// ─── CLI args ────────────────────────────────────────────────────────────────
const [,, demoType, variablesJson] = process.argv;
if (!demoType) { console.error('Usage: node run_demo_flow.js <demo_type> <variables_json>'); process.exit(1); }

const variables = variablesJson ? JSON.parse(variablesJson) : {};
const flowPath = path.join(__dirname, 'demo_flows', `${demoType}.json`);
if (!fs.existsSync(flowPath)) { console.error(`Flow config not found: ${flowPath}`); process.exit(1); }

const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
const actionsLog = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function interpolate(str) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] ?? `{{${k}}}`);
}

// Ease-out cubic: t in [0,1] → value in [0,1]
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ─── Cursor injection ─────────────────────────────────────────────────────────
async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('__demo_cursor')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = '__demo_cursor';
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.style.cssText = `
      position: fixed;
      top: -100px;
      left: -100px;
      z-index: 999999;
      pointer-events: none;
      transform: translate(0, 0);
      transition: top 0ms linear, left 0ms linear;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5));
    `;
    svg.innerHTML = `
      <polygon points="2,2 2,20 7,15 11,22 13,21 9,14 16,14" 
               fill="white" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>
    `;
    document.body.appendChild(svg);
  });
}

async function moveCursor(page, x, y) {
  await page.evaluate((x, y) => {
    const el = document.getElementById('__demo_cursor');
    if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
  }, x, y);
}

// Smooth glide — step-based with per-step screen updates (works correctly with recorder)
async function glideCursor(page, fromX, fromY, toX, toY) {
  const STEPS = 40;
  const STEP_MS = 16; // 16ms per step = ~60fps, forces a repaint each step
  for (let i = 1; i <= STEPS; i++) {
    const progress = i / STEPS;
    const t = easeOut(progress);
    const jitter = (1 - progress) * 2.5;
    const jx = (Math.random() - 0.5) * jitter;
    const jy = (Math.random() - 0.5) * jitter;
    const x = fromX + (toX - fromX) * t + jx;
    const y = fromY + (toY - fromY) * t + jy;
    await moveCursor(page, x, y);
    await sleep(STEP_MS);
  }
  await moveCursor(page, toX, toY);
}

// ─── Get element center ───────────────────────────────────────────────────────
async function getElementCenter(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  const box = await el.boundingBox();
  if (!box) return null;
  // Slightly off-center — looks more human
  return {
    x: box.x + box.width * 0.42 + (Math.random() - 0.5) * 4,
    y: box.y + box.height * 0.45 + (Math.random() - 0.5) * 3,
  };
}

// Find element by visible text content
async function getElementByText(page, text) {
  return page.evaluateHandle((text) => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.children.length === 0 && el.textContent && el.textContent.includes(text)) {
        return el;
      }
    }
    // Fallback: any element containing the text
    for (const el of all) {
      if (el.textContent && el.textContent.includes(text)) return el;
    }
    return null;
  }, text);
}

// ─── Scroll to element ────────────────────────────────────────────────────────
async function scrollToTarget(page, target) {
  // Multi-flick scroll: fast flick, then precise snap
  const targetY = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return el.getBoundingClientRect().top + window.scrollY;
  }, target);

  if (targetY === null) throw new Error(`Scroll target not found: ${target}`);

  const currentY = await page.evaluate(() => window.scrollY);
  const distance = targetY - currentY;

  // Flick: scroll 85% of the way fast
  const flickTarget = currentY + distance * 0.85;
  const FLICK_STEPS = 25;
  for (let i = 1; i <= FLICK_STEPS; i++) {
    const t = easeOut(i / FLICK_STEPS);
    await page.evaluate((y) => window.scrollTo(0, y), currentY + (flickTarget - currentY) * t);
    await sleep(18);
  }
  await sleep(80);

  // Precise snap: re-measure (accounts for any layout shift during scroll)
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, target);
  await sleep(300); // settle: scroll
}

// ─── Human typing ─────────────────────────────────────────────────────────────
async function humanType(page, selector, text) {
  await page.focus(selector);
  await sleep(80 + Math.random() * 60);
  for (const char of text) {
    await page.keyboard.type(char);
    // Tight but varied: 35–75ms between keystrokes
    await sleep(35 + Math.random() * 40);
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────
async function handleNavigate(page, step, cursorPos) {
  const url = interpolate(step.url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await injectCursor(page);
  await moveCursor(page, cursorPos.x, cursorPos.y);
  await sleep(200); // settle: fresh page navigation
}

async function handleWait(page, step) {
  await sleep(step.duration ?? 1000);
}

async function handleScroll(page, step, cursorPos) {
  await scrollToTarget(page, step.target);
  // After scroll, reset cursor to centre of current viewport
  // so next glide always starts from a visible position
  const viewportCentre = await page.evaluate(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }));
  await moveCursor(page, viewportCentre.x, viewportCentre.y);
  cursorPos.x = viewportCentre.x;
  cursorPos.y = viewportCentre.y;
  await sleep(500); // recorder needs 2-3 frames to capture cursor at new position before glide
}

async function handleClick(page, step, cursorPos) {
  let center;

  if (step.textContains) {
    // Find by visible text
    const el = await getElementByText(page, step.textContains);
    const box = await el.asElement()?.boundingBox();
    if (!box) throw new Error(`textContains element not found: "${step.textContains}"`);
    center = {
      x: box.x + box.width * 0.42,
      y: box.y + box.height * 0.45,
    };
  } else {
    center = await getElementCenter(page, step.selector);
    if (!center) throw new Error(`Selector not found: ${step.selector}`);
  }

  // Glide cursor to element
  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(120);

  // DOM click (bypasses opacity/pointer-events issues from .animate transitions)
  if (step.textContains) {
    await page.evaluate((text) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent && el.textContent.includes(text)) { el.click(); return; }
      }
    }, step.textContains);
  } else {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
    }, step.selector);
  }

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleClickNavigate(page, step, cursorPos) {
  let center;

  if (step.textContains) {
    const el = await getElementByText(page, step.textContains);
    const box = await el.asElement()?.boundingBox();
    if (!box) throw new Error(`textContains element not found: "${step.textContains}"`);
    center = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
  } else {
    center = await getElementCenter(page, step.selector);
    if (!center) throw new Error(`Selector not found for click_navigate: ${step.selector}`);
  }

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(120); // post-click pause

  // Fire DOM click + wait for navigation
  const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);

  if (step.textContains) {
    await page.evaluate((text) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent && el.textContent.includes(text)) { el.click(); return; }
      }
    }, step.textContains);
  } else {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
    }, step.selector);
  }

  await navPromise;

  // Verify we actually navigated somewhere expected
  const currentUrl = page.url();
  if (step.expected_url_contains && !currentUrl.includes(step.expected_url_contains)) {
    throw new Error(
      `click_navigate on step "${step.id}": expected URL to contain "${step.expected_url_contains}" but got "${currentUrl}"`
    );
  }

  await injectCursor(page);
  await moveCursor(page, cursorPos.x, cursorPos.y);
  await sleep(200); // settle: fresh page navigation

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleType(page, step, cursorPos) {
  const value = interpolate(step.value);
  const center = await getElementCenter(page, step.selector);
  if (!center) throw new Error(`Type target not found: ${step.selector}`);

  // Glide to field, click it, then type
  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(80);
  await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, step.selector);
  await sleep(60);
  await humanType(page, step.selector, value);

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleSelect(page, step, cursorPos) {
  const center = await getElementCenter(page, step.selector);
  if (!center) throw new Error(`Select target not found: ${step.selector}`);

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(80);
  await page.select(step.selector, step.value);
  await sleep(100);

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleHover(page, step, cursorPos) {
  const center = await getElementCenter(page, step.selector);
  if (!center) { console.warn(`  Hover target not found (skipping): ${step.selector}`); return; }

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(150 + Math.random() * 200); // hover dwell: 150–350ms

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleVisualClick(page, step, cursorPos) {
  // Move cursor and do mouse down/up — does NOT trigger navigation
  const center = await getElementCenter(page, step.selector);
  if (!center) throw new Error(`visual_click target not found: ${step.selector}`);

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(80);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

// Click the nearest ancestor div of a text node — used for custom checkboxes
async function handleClickByText(page, step, cursorPos) {
  const text = step.containsText;
  // Find the outer container, then click its FIRST CHILD div (the 18x18 checkbox box)
  const box = await page.evaluate((text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!el) break;
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            // Found the outer clickable container — get its first child div (the checkbox box)
            const checkboxBox = el.querySelector('div');
            if (checkboxBox) {
              const r = checkboxBox.getBoundingClientRect();
              if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, found: true };
            }
          }
          el = el.parentElement;
        }
      }
    }
    return { found: false };
  }, text);

  if (!box || !box.found) throw new Error(`click_by_text: could not find checkbox for "${text}"`);

  await glideCursor(page, cursorPos.x, cursorPos.y, box.x, box.y);
  await sleep(80);

  // Click the inner checkbox div directly
  await page.evaluate((text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!el) break;
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            el.click(); // click the outer div which has the onClick handler
            return;
          }
          el = el.parentElement;
        }
      }
    }
  }, text);

  await sleep(150);
  cursorPos.x = box.x;
  cursorPos.y = box.y;
}

// ─── Main runner ──────────────────────────────────────────────────────────────
(async () => {
  console.log(`Running demo flow: ${demoType}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--run-all-compositor-stages-before-draw',
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  // Force 60fps tick rate in headless
  const client = await page.createCDPSession();
  await client.send('Animation.setPlaybackRate', { playbackRate: 1 });

  const recorder = new PuppeteerScreenRecorder(page, {
    followNewTab: false,
    fps: 30,
    videoFrame: { width: 1280, height: 800 },
    videoCrf: 18,
    videoCodec: 'libx264',
    videoPreset: 'ultrafast',
    aspectRatio: '16:9',
  });

  const outputVideo = `/tmp/demo_raw_${demoType}.mp4`;
  console.log('Starting recording...');
  await recorder.start(outputVideo);

  // Cursor position state (shared across steps)
  const cursorPos = { x: 640, y: 400 };

  try {
    for (const step of flow.steps) {
      console.log(`Step: ${step.id} — ${step.desc}`);
      actionsLog.push({ step: step.id, ts: Date.now() });

      switch (step.action) {
        case 'navigate':
          await handleNavigate(page, step, cursorPos);
          break;
        case 'wait':
          await handleWait(page, step);
          break;
        case 'scroll':
          await handleScroll(page, step, cursorPos);
          break;
        case 'click':
          await handleClick(page, step, cursorPos);
          break;
        case 'click_navigate':
          await handleClickNavigate(page, step, cursorPos);
          break;
        case 'type':
          await handleType(page, step, cursorPos);
          break;
        case 'select':
          await handleSelect(page, step, cursorPos);
          break;
        case 'hover':
          await handleHover(page, step, cursorPos);
          break;
        case 'visual_click':
          await handleVisualClick(page, step, cursorPos);
          break;
        case 'click_by_text':
          await handleClickByText(page, step, cursorPos);
          break;
        default:
          console.warn(`  Unknown action "${step.action}" — skipping`);
      }
    }
  } catch (err) {
    console.error(`Demo flow failed: ${err.message}`);
    await recorder.stop();
    await browser.close();
    process.exit(1);
  }

  await recorder.stop();
  await browser.close();
  console.log('Recording stopped.');

  fs.writeFileSync(
    `/tmp/demo_actions_${demoType}.json`,
    JSON.stringify(actionsLog, null, 2)
  );

  console.log(`Video saved: ${outputVideo}`);
  console.log(`Actions log: /tmp/demo_actions_${demoType}.json`);
})();
