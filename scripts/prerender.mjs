// Bakes the JS-rendered header, page content and footer into each page's HTML
// so the site reads correctly with JavaScript off and for crawlers.
// main.js still re-renders on load (progressive enhancement), so the JSON
// editor in /admin keeps working unchanged.
//
// Usage (from repo root, needs Playwright + Chromium):
//   python3 -m http.server 8123 &   node scripts/prerender.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8123';
const pages = ['index', 'resume', 'projects', 'speaking', 'writing', 'contact'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

for (const name of pages) {
  await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#page-mount > *');
  const parts = await page.evaluate(() => ({
    header: document.getElementById('header-mount').innerHTML,
    main: document.getElementById('page-mount').innerHTML,
    footer: document.getElementById('footer-mount').innerHTML,
  }));
  let html = readFileSync(`${name}.html`, 'utf8');
  const fill = (re, inner) => { html = html.replace(re, (_, a, b) => `${a}${inner}${b}`); };
  fill(/(<header class="site-header" id="header-mount">)[\s\S]*?(<\/header>)/, parts.header);
  fill(/(<main class="main" id="page-mount">)[\s\S]*?(<\/main>)/, parts.main);
  fill(/(<footer class="site-footer" id="footer-mount">)[\s\S]*?(<\/footer>)/, parts.footer);
  writeFileSync(`${name}.html`, html);
  console.log('prerendered', name);
}
await browser.close();
