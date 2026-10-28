// Mesure de couverture du code navigateur (public/*.js) : lance toute la suite avec le hook de couverture préchargé,
// agrège la couverture V8 de Chromium avec monocart, écrit les rapports dans coverage/ et échoue sous le seuil (COV_MIN, 80 % par défaut).
// Le gate porte sur la couverture de lignes STANDARD (istanbul/lcov), pas sur la métrique V8 stricte par octets (indicative, plus pessimiste).
// Usage : node tests/coverage.js [nom …]   (sans nom : toute la suite)   |   seuil : COV_MIN=85 node tests/coverage.js
const { spawnSync } = require("child_process"), fs = require("fs"), path = require("path");
const { CoverageReport } = require("monocart-coverage-reports");
const REPO = path.resolve(__dirname, ".."), COV = path.join(REPO, "coverage"), V8DIR = path.join(COV, ".v8");
const THRESHOLD = +(process.env.COV_MIN || 80);
// modules applicatifs mesurés (le reste : vendor tiers, config de test, pages = exclu)
const SCOPE = /\/(app|coach|auth|planai|consent)\.js$/;

fs.rmSync(COV, { recursive: true, force: true });
fs.mkdirSync(V8DIR, { recursive: true });

// 1) lance la suite ; chaque processus de test précharge le hook qui collecte la couverture V8
const names = process.argv.slice(2).filter(a => !a.startsWith("--"));
console.log("Couverture : exécution de la suite (COVERAGE=1)…\n");
const run = spawnSync(process.execPath, [path.join(__dirname, "run-all.js"), ...names], {
  cwd: REPO, stdio: "inherit",
  env: { ...process.env, COVERAGE: "1", NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require ${path.join(__dirname, "coverage-hook.js")}`.trim() }
});

(async () => {
  const files = fs.existsSync(V8DIR) ? fs.readdirSync(V8DIR).filter(f => f.endsWith(".json")) : [];
  if (!files.length) { console.error("\nAucune donnée de couverture collectée (le hook navigateur n'a rien écrit)."); process.exit(1); }
  const mcr = new CoverageReport({
    name: "Pacebook — couverture du code navigateur (public/)",
    outputDir: COV,
    reports: [["v8"], ["lcovonly"], ["json-summary"], ["console-details", { metrics: ["lines", "functions", "branches"] }]],
    entryFilter: (e) => SCOPE.test(e.url),
    cleanCache: true
  });
  for (const f of files) { try { await mcr.add(JSON.parse(fs.readFileSync(path.join(V8DIR, f), "utf8"))); } catch (e) {} }
  const res = await mcr.generate();
  // couverture de lignes STANDARD (istanbul/lcov) : métrique conventionnelle, lue depuis coverage/lcov.info
  let found = 0, hit = 0;
  try {
    for (const r of fs.readFileSync(path.join(COV, "lcov.info"), "utf8").split("end_of_record")) {
      const sf = (r.match(/SF:(.*)/) || [])[1]; if (!sf || !SCOPE.test("/" + path.basename(sf.trim()))) continue;
      for (const m of r.matchAll(/^DA:\d+,(\d+)$/gm)) { found++; if (+m[1] > 0) hit++; }
    }
  } catch (e) {}
  const pct = found ? Math.round(1000 * hit / found) / 10 : 0;
  const v8 = res && res.summary && res.summary.lines && typeof res.summary.lines.pct === "number" ? res.summary.lines.pct : 0;
  console.log(`\nCouverture de lignes : ${pct}%  (${hit}/${found})  —  seuil ${THRESHOLD}%  —  rapport : coverage/index.html`);
  console.log(`(métrique V8 stricte par octets, indicative : ${v8}%)`);
  // la correction des tests est jugée par le job « tests » : ici on n'échoue que sur la couverture (un test rouge
  // n'exerce pas son code → couverture plus basse, déjà prise en compte par le seuil). On signale quand même l'échec.
  if (run.status !== 0) console.error("ATTENTION : la suite de tests a échoué (code " + run.status + ") — vu par le job « tests » ; ici seul le seuil de couverture décide.");
  process.exit(pct >= THRESHOLD ? 0 : 1);
})();
