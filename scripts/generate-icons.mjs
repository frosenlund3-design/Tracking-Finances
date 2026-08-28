/**
 * Renders the app icon to the PNG sizes a home-screen install needs.
 *
 * Committed as static files rather than generated at runtime: an installed app
 * must be able to show its own icon while offline, and the launcher reads it
 * before any of our code runs.
 *
 *   node scripts/generate-icons.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'icons');

/** `padding` leaves the safe area maskable icons need (min 10% each side). */
function markup({ size, padding, radius, background }) {
  const inner = size - padding * 2;
  return `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:${background};
                display:flex;align-items:center;justify-content:center">
      <div style="width:${inner}px;height:${inner}px;border-radius:${radius}px;
                  background:linear-gradient(160deg,#3d8ae8 0%,#2a78d6 55%,#1f5fae 100%);
                  display:flex;align-items:center;justify-content:center;
                  font-family:ui-sans-serif,-apple-system,'Segoe UI',Roboto,sans-serif;
                  font-weight:600;letter-spacing:-0.04em;color:#fff;
                  font-size:${Math.round(inner * 0.42)}px;
                  box-shadow:inset 0 ${Math.round(inner * 0.01)}px 0 rgba(255,255,255,.28)">kr</div>
    </div></body></html>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, padding: 0, radius: 42, background: 'transparent' },
  { file: 'icon-512.png', size: 512, padding: 0, radius: 112, background: 'transparent' },
  // Maskable icons get cropped to whatever shape the launcher uses, so the
  // glyph sits inside a 20% safe margin on a filled background.
  { file: 'icon-maskable-192.png', size: 192, padding: 20, radius: 34, background: '#1f5fae' },
  { file: 'icon-maskable-512.png', size: 512, padding: 54, radius: 92, background: '#1f5fae' },
  // iOS ignores transparency and does its own rounding, so this one is square.
  { file: 'apple-touch-icon.png', size: 180, padding: 0, radius: 0, background: '#2a78d6' },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

await fs.mkdir(OUT, { recursive: true });

for (const target of TARGETS) {
  const page = await browser.newPage({
    viewport: { width: target.size, height: target.size },
    deviceScaleFactor: 1,
  });
  await page.setContent(markup(target));
  await page.screenshot({
    path: path.join(OUT, target.file),
    omitBackground: target.background === 'transparent',
  });
  await page.close();
  console.log(`[icons] ${target.file} (${target.size}px)`);
}

await browser.close();
