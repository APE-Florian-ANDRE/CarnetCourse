// Hook de couverture préchargé dans chaque processus de test (via NODE_OPTIONS=--require, posé par tests/coverage.js).
// Patche chromium.launch pour démarrer la couverture V8 sur chaque page et l'écrire dans coverage/.v8 à la fermeture.
// Ne fait rien hors mesure de couverture (gardé par COVERAGE=1). N'est jamais chargé par l'application.
if (process.env.COVERAGE) try {
  const fs = require("fs"), path = require("path");
  const REPO = path.resolve(__dirname, ".."), PUB = path.join(REPO, "public");
  const COVDIR = path.join(REPO, "coverage", ".v8");
  fs.mkdirSync(COVDIR, { recursive: true });
  let seq = 0;
  // source réelle du fichier servi : on ne mesure que les pages qui chargent le VRAI fichier (certains tests du moteur de plan
  // servent une copie modifiée d'app.js — offsets V8 décalés, non fusionnable avec l'original ; on l'ignore pour ne pas fausser la mesure).
  const canon = new Map();
  const canonical = (p) => { if (!canon.has(p)) { try { canon.set(p, fs.readFileSync(path.join(PUB, p), "utf8")); } catch (x) { canon.set(p, null); } } return canon.get(p); };
  // remappe une copie servie par un test vers le fichier canonique quand l'injection est en FIN d'IIFE (window.__T={...} inséré
  // avant « })(); ») : tout le corps partage le même préfixe d'octets, donc la couverture du préfixe commun est valable pour l'original.
  const remap = (e, c) => {
    if (e.source === c) return e;
    let L = 0; const a = e.source, n = Math.min(a.length, c.length);
    while (L < n && a.charCodeAt(L) === c.charCodeAt(L)) L++;
    if (L < c.length - 3000) return null;   // divergence tôt (ex. injection après "use strict") : offsets décalés, non remappable
    const functions = [];
    for (const f of e.functions || []) {
      const ranges = (f.ranges || []).filter((r) => r.startOffset < L).map((r) => ({ ...r, endOffset: Math.min(r.endOffset, L) }));
      if (ranges.length) functions.push({ ...f, ranges });
    }
    return { ...e, source: c, functions };
  };
  // écrit la couverture d'une page (une seule fois), URL normalisée au chemin (sinon le port aléatoire du serveur de test fragmenterait la mesure)
  const dump = async (page) => {
    if (!page || page.__covDone) return; page.__covDone = true;
    try {
      await page.__covStarted;
      const list = await page.coverage.stopJSCoverage();
      const keep = [];
      for (const e of list) {
        if (!e || typeof e.url !== "string" || !e.source) continue;
        let p; try { p = new URL(e.url).pathname; } catch (x) { continue; }
        if (!/\.js$/.test(p)) continue;               // seulement les scripts du site
        const c = canonical(p.replace(/^\//, "")); if (c == null) continue;
        const m = remap(e, c); if (!m) continue;      // copie modifiée non remappable : ignorée
        keep.push({ ...m, url: p });                  // ex. http://127.0.0.1:53421/app.js -> /app.js
      }
      if (keep.length) fs.writeFileSync(path.join(COVDIR, process.pid + "-" + (seq++) + ".json"), JSON.stringify(keep));
    } catch (x) {}
  };
  const wrapPage = (page) => {
    if (page.__covStarted) return page;   // idempotent : browser.newPage() passe par un contexte déjà patché (sinon « JSCoverage already enabled »)
    try { page.__covStarted = page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {}); }
    catch (x) { page.__covStarted = Promise.resolve(); }
    const close = page.close.bind(page);
    page.close = async (...a) => { await dump(page); return close(...a); };
    return page;
  };
  const pw = require("playwright"), ct = pw.chromium, launch = ct.launch.bind(ct);
  ct.launch = async (...a) => {
    const br = await launch(...a);
    const nc = br.newContext.bind(br);
    br.newContext = async (...x) => { const c = await nc(...x); const np = c.newPage.bind(c); c.newPage = async (...y) => wrapPage(await np(...y));
      const cclose = c.close.bind(c); c.close = async (...y) => { for (const p of c.pages()) await dump(p); return cclose(...y); };   // capte aussi la couverture quand le test ferme son contexte
      return c; };
    const bnp = br.newPage.bind(br);
    br.newPage = async (...x) => wrapPage(await bnp(...x));
    const close = br.close.bind(br);
    br.close = async (...x) => { for (const c of br.contexts()) for (const p of c.pages()) await dump(p); return close(...x); };
    return br;
  };
} catch (x) {}
