#!/usr/bin/env node
/* Génère ios/PaceRun/Engine/engine.js à partir du moteur de plan du site (public/app.js).
   Une seule source de vérité : l'app iPhone exécute exactement le même moteur que le site, via JavaScriptCore.
   On prend la partie « calculs » d'app.js (de `const DAYS = [` jusqu'avant `const setT=`, aucune dépendance au DOM)
   et on ajoute une petite façade `PaceRun.plan(docJson)` qui renvoie un JSON prêt à afficher.
   Usage : node ios/tools/build-engine.js [--check]   (--check : échoue si le fichier généré n'est pas à jour) */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "public", "app.js");
const OUT = path.join(ROOT, "ios", "PaceRun", "Engine", "engine.js");

const lines = fs.readFileSync(SRC, "utf8").split("\n");
const from = lines.findIndex(l => l.startsWith("const DAYS = ["));
const to = lines.findIndex(l => l.startsWith("const setT="));
if (from < 0 || to < 0 || to <= from) { console.error("build-engine : repères introuvables dans public/app.js (const DAYS / const setT)"); process.exit(1); }

const facade = `
/* ---------- façade PaceRun (générée par ios/tools/build-engine.js) ---------- */
globalThis.PaceRun = {
  example: () => JSON.stringify(EXAMPLE),
  plan(docJson) {
    const d = JSON.parse(docJson || "{}");
    state = { ...state, profile: { ...EXAMPLE, ...(d.profile || {}) }, done: d.done || {}, feel: d.feel || {}, moves: {}, aip: null };
    P = profileNums(state.profile);
    plan = buildPlan(P);
    if (plan.unreal) P = { ...P, objectif: plan.unreal.used };
    E = energy(P, plan);
    const sport = evSport(P.sport), labels = sport ? PH_SPORT : PHASE_LABEL, st = effStart(state.profile);
    const pace = b => !sport && !b.noPace && b.lo && b.hi && b.z !== "rf" ? paceRangeTxt(E.vma, b.lo, b.hi) : null;
    const weeks = plan.map(wk => {
      const f = dayFuel(P, E, wk);
      const days = f.days.map(fd => {
        const d = wk.days[fd.i] || fd, r = d.run;
        return {
          i: fd.i, date: st ? addDays(st, (wk.w - 1) * 7 + fd.i) : null, kind: d.kind || (r ? r.type : "rest"),
          km: Math.round((fd.km || 0) * 10) / 10, min: Math.round(r ? sessionDur(r) : 0), kcal: Math.round(fd.kcal || 0),
          run: r ? { type: r.type, kind: r.kind || null, title: r.title, note: r.note || null, dplus: r.dplus || null,
            blocks: (r.blocks || []).map(b => ({ l: b.l, min: Math.round(b.min || 0), z: b.z || null, pace: pace(b), eff: b.eff || null,
              iv: b.iv ? { n: b.iv.n, on: b.iv.on, off: b.iv.off, onL: b.iv.onL, offL: b.iv.offL } : null })) } : null,
          renfo: d.renfo ? { t: d.renfo.t, m: d.renfo.m || "", rows: (d.renfo.rows || []).map(x => [String(x[0] || ""), String(x[1] || "")]) } : null
        };
      });
      return { w: wk.w, phase: wk.phase, phaseLabel: labels[wk.phase] || wk.phase, deload: !!wk.deload,
        km: Math.round(days.reduce((a, x) => a + x.km, 0) * 10) / 10, days };
    });
    return JSON.stringify({ start: st, vma: E.vma, sport: P.sport, objectif: P.objectif, raceDate: raceOn(state.profile),
      incomplete: !!P.incomplete, unreal: plan.unreal ? { used: plan.unreal.used } : null, weeks });
  }
};
`;

const body = `/* FICHIER GÉNÉRÉ : ne pas modifier. Source : public/app.js (lignes ${from + 1} à ${to}). Regénérer : node ios/tools/build-engine.js */
"use strict";
${lines.slice(from, to).join("\n")}
${facade}`;

if (process.argv.includes("--check")) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== body) { console.error("ios/PaceRun/Engine/engine.js n'est pas à jour : lance node ios/tools/build-engine.js"); process.exit(1); }
  console.log("engine.js à jour"); process.exit(0);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
console.log("engine.js généré (" + (to - from) + " lignes du moteur)");
