// Renders each slide's overlay to PNG with Playwright.
// usage: node render.js <slides.json> <outDir> <slotsWithMediaCsv>
// A slide whose slot has media gets a transparent "band" so the photo/video shows through;
// otherwise the band gets a designed placeholder.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [, , cfgPath, outDir, withMediaCsv = ''] = process.argv;
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const withMedia = new Set(withMediaCsv.split(',').filter(Boolean).map(Number));

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = s => esc(s).replace(/\[\[(.+?)\]\]/g, '<span class="gold">$1</span>').replace(/\{\{(.+?)\}\}/g, '<span class="teal">$1</span>');

const BAND_Y = 555, BAND_H = 810;
const css = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;background:transparent;overflow:hidden}
body{font-family:"Heebo",sans-serif;direction:rtl;color:#fff;position:relative}
.tint{position:absolute;inset:0;background:rgba(12,32,52,.72)}
.solid{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#1c4468 0%,#12304d 45%,#0c2238 100%)}
.top{position:absolute;top:150px;right:84px;left:84px}
.chip{display:inline-block;background:#e3c14e;color:#0f2a43;font-weight:800;font-size:30px;padding:6px 26px;border-radius:40px;margin-bottom:22px}
h1{font-weight:900;font-size:76px;line-height:1.18;text-wrap:balance;text-shadow:0 4px 24px rgba(0,0,0,.45)}
.gold{color:#e3c14e}.teal{color:#7fe0d3;font-weight:700}
.band{position:absolute;top:${BAND_Y}px;left:0;width:1080px;height:${BAND_H}px}
.ph{background:linear-gradient(135deg,#0d2740,#16395c 55%,#0b2034);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:46px;
  background-image:linear-gradient(rgba(127,224,211,.06) 2px,transparent 2px),linear-gradient(90deg,rgba(127,224,211,.06) 2px,transparent 2px),linear-gradient(135deg,#0d2740,#16395c 55%,#0b2034);
  background-size:60px 60px,60px 60px,100% 100%;border-top:3px solid rgba(227,193,78,.35);border-bottom:3px solid rgba(227,193,78,.35)}
.ph .ic{font-size:190px;line-height:1;filter:drop-shadow(0 12px 30px rgba(0,0,0,.5))}
.ph .tools{display:flex;gap:18px;direction:ltr}
.ph .tools span{font-weight:700;font-size:34px;color:#e8eef3;border:2px solid rgba(127,224,211,.55);background:rgba(127,224,211,.1);padding:10px 24px;border-radius:40px}
.bottom{position:absolute;top:${BAND_Y + BAND_H + 90}px;right:84px;left:84px}
.bar{width:110px;height:7px;border-radius:4px;background:#e3c14e;margin-bottom:34px}
.cap{font-size:46px;font-weight:500;color:#e8eef3;line-height:1.4}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px}
.end .nm{font-weight:900;font-size:150px;line-height:1.1}
.end .sb{font-size:52px;color:#dbe5ed;margin-top:24px;line-height:1.4}
.end .ln{width:200px;height:7px;border-radius:4px;background:#e3c14e;margin:70px 0}
.end .ct{font-weight:800;font-size:62px;color:#e3c14e}
.end .ph2{font-weight:900;font-size:120px;margin-top:40px;direction:ltr;unicode-bidi:isolate}
.end .au{font-size:40px;color:#7fe0d3;margin-top:90px}
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < cfg.slides.length; i++) {
    const s = cfg.slides[i];
    let body;
    if (s.end) {
      body = `<div class="solid"></div><div class="end"><div class="nm">${esc(s.name)}</div><div class="sb">${esc(s.sub)}</div><div class="ln"></div><div class="ct">${esc(s.cta)}</div><div class="ph2">${esc(s.phone)}</div><div class="au">${esc(s.aud)}</div></div>`;
    } else {
      const media = withMedia.has(s.slot);
      const band = media ? '' :
        `<div class="band ph"><div class="ic">${s.icon || ''}</div><div class="tools"><span>ChatGPT</span><span>Claude</span><span>Gemini</span><span>NotebookLM</span></div></div>`;
      body = `${media ? `<div class="tint" style="clip-path:polygon(0 0,100% 0,100% ${BAND_Y}px,0 ${BAND_Y}px,0 ${BAND_Y + BAND_H}px,100% ${BAND_Y + BAND_H}px,100% 100%,0 100%)"></div>` : '<div class="solid"></div>'}
        <div class="top"><span class="chip">${esc(s.tag)}</span><h1>${fmt(s.title)}</h1></div>
        ${band}
        <div class="bottom"><div class="bar"></div><div class="cap">${fmt(s.caption)}</div></div>`;
    }
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>${css}</style></head><body>${body}</body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, `slide${i + 1}.png`), omitBackground: true });
  }
  await browser.close();
})();
