// End-to-end tests that load the real extension into Chrome and Firefox.
//
// Instead of logging into Gmail, every request to https://mail.google.com is
// intercepted and answered with test/fixtures/gmail.html. The browser still
// thinks it is on mail.google.com, so the manifest's content script matches
// and runs exactly as it would on the real site.
//
// Run with `npm test`. Pick browsers with BROWSERS=chrome or BROWSERS=firefox.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = path.resolve(import.meta.dirname, '..');
const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/gmail.html'), 'utf8');
const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox';
const browsers = (process.env.BROWSERS ?? 'chrome,firefox').split(',');

// Copy only the files that ship, so the test sees what users install.
function packageExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-theme-ext-'));
  const shipped = ['manifest.json', 'contentScript.js', 'popup.html', 'images'];
  for (const entry of shipped) {
    fs.cpSync(path.join(root, entry), path.join(dir, entry), { recursive: true });
  }
  return dir;
}

async function launch(browserName, extensionDir, scheme) {
  if (browserName === 'chrome') {
    const browser = await puppeteer.launch({
      headless: true,
      enableExtensions: true,
      pipe: true,
      // Chrome's sandbox is unavailable when running as root (e.g. containers).
      args: process.getuid?.() === 0 || process.env.CI ? ['--no-sandbox'] : [],
    });
    await browser.installExtension(extensionDir);
    return browser;
  }
  // Firefox can't emulate prefers-color-scheme over WebDriver BiDi, so set
  // the content colour scheme with a pref instead (0 = dark, 1 = light).
  const browser = await puppeteer.launch({
    browser: 'firefox',
    headless: true,
    extraPrefsFirefox: {
      'layout.css.prefers-color-scheme.content-override': scheme === 'dark' ? 0 : 1,
    },
  });
  await browser.installExtension(extensionDir);
  return browser;
}

async function openFakeGmail(browser, scheme) {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  await page.setRequestInterception(true);
  page.on('request', (request) =>
    request.respond({ status: 200, contentType: 'text/html', body: fixture }),
  );
  if (browser.protocol === 'cdp') {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  }
  await page.goto(GMAIL_URL);
  return page;
}

const hasDarkStyle = (page) => page.evaluate(() => !!document.getElementById('dark-mode-style'));

const waitForDarkStyle = (page, present) =>
  page.waitForFunction(
    (present) => !!document.getElementById('dark-mode-style') === present,
    { timeout: 5000 },
    present,
  );

// Read the colour the user actually sees at (x, y), after filters are applied.
async function pixelAt(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, encoding: 'base64' });
  const decoder = await page.browser().newPage();
  try {
    return await decoder.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const ctx = new OffscreenCanvas(1, 1).getContext('2d');
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    }, `data:image/png;base64,${png}`);
  } finally {
    await decoder.close();
  }
}

const brightness = ([r, g, b]) => (r + g + b) / 3;

for (const browserName of browsers) {
  describe(browserName, () => {
    const extensionDir = packageExtension();
    after(() => fs.rmSync(extensionDir, { recursive: true, force: true }));

    describe('system theme: light', () => {
      let browser, page;
      before(async () => {
        browser = await launch(browserName, extensionDir, 'light');
        page = await openFakeGmail(browser, 'light');
        // Give the content script (run_at: document_idle) a chance to run.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
      after(() => browser?.close());

      it('leaves Gmail untouched', async () => {
        assert.equal(await hasDarkStyle(page), false);
        assert.ok(brightness(await pixelAt(page, 400, 300)) > 240, 'background should stay white');
      });
    });

    describe('system theme: dark', () => {
      let browser, page;
      before(async () => {
        browser = await launch(browserName, extensionDir, 'dark');
        page = await openFakeGmail(browser, 'dark');
        await waitForDarkStyle(page, true);
      });
      after(() => browser?.close());

      it('injects the dark mode stylesheet', async () => {
        const filter = await page.evaluate(() => getComputedStyle(document.documentElement).filter);
        assert.match(filter, /invert/);
      });

      it('renders the page background dark', async () => {
        const pixel = await pixelAt(page, 400, 300);
        assert.ok(brightness(pixel) < 40, `background should be dark, got rgb(${pixel})`);
      });

      it('keeps images in their original colours', async () => {
        const box = await page.$eval('#photo', (el) => el.getBoundingClientRect().toJSON());
        const [r, g, b] = await pixelAt(page, box.x + box.width / 2, box.y + box.height / 2);
        assert.ok(r > 150 && g < 100 && b < 100, `image should stay red, got rgb(${[r, g, b]})`);
      });

      it('re-applies the stylesheet if Gmail removes it', async () => {
        await page.evaluate(() => document.getElementById('dark-mode-style').remove());
        await waitForDarkStyle(page, true);
      });
    });

    // Switching the colour scheme of a running browser is only scriptable over
    // CDP, so this one is Chrome only. The code path is the same in Firefox.
    if (browserName === 'chrome') {
      describe('system theme changes while Gmail is open', () => {
        let browser, page;
        before(async () => {
          browser = await launch(browserName, extensionDir, 'light');
          page = await openFakeGmail(browser, 'light');
        });
        after(() => browser?.close());

        it('follows light → dark → light', async () => {
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
          await waitForDarkStyle(page, true);
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
          await waitForDarkStyle(page, false);
        });
      });
    }
  });
}
