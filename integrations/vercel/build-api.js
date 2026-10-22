#!/usr/bin/env node
// Génère api/coach.js et api/plan.js (fonctions Vercel autonomes) à partir des modèles, de system-prompt.txt et des règles de public/coach.js (source unique).
// Usage : node integrations/vercel/build-api.js      (à relancer si tu modifies le prompt, les messages fixes ou les règles de sécurité)
const fs=require("fs"), path=require("path"); const D=__dirname, N8N=path.join(D,"../n8n"), ROOT=path.resolve(D,"../..");
function parts(){
  const coachSrc=fs.readFileSync(ROOT+"/public/coach.js","utf8");
  const m=/const norm=[\s\S]*?const RULES=\[[\s\S]*?\n\];\n/.exec(coachSrc), g=/function guard\(text\)\{[^\n]*\n/.exec(coachSrc);
  if(!m||!g) throw new Error("règles de sécurité introuvables dans public/coach.js");
  return {safety:m[0]+g[0],msgs:fs.readFileSync(N8N+"/nodes/safe-msgs.js","utf8")};
}
// ajustement du plan par l'IA : même filet de sécurité et mêmes messages fixes que le Coach
function buildPlan(){ const x=parts(); return fs.readFileSync(D+"/plan.template.js","utf8").replace("/*__SAFETY__*/",()=>x.safety).replace("/*__MSGS__*/",()=>x.msgs); }
function build(){
  const system=fs.readFileSync(N8N+"/system-prompt.txt","utf8").trim(), coachSrc=fs.readFileSync(ROOT+"/public/coach.js","utf8");
  const m=/const norm=[\s\S]*?const RULES=\[[\s\S]*?\n\];\n/.exec(coachSrc), g=/function guard\(text\)\{[^\n]*\n/.exec(coachSrc);
  if(!m||!g) throw new Error("règles de sécurité introuvables dans public/coach.js");
  const msgs=fs.readFileSync(N8N+"/nodes/safe-msgs.js","utf8");
  return fs.readFileSync(D+"/coach.template.js","utf8").replace("__SYSTEM_PROMPT__",()=>JSON.stringify(system).slice(1,-1)).replace("/*__SAFETY__*/",()=>m[0]+g[0]).replace("/*__MSGS__*/",()=>msgs);
}
module.exports={build,buildPlan};
if(require.main===module){ fs.mkdirSync(ROOT+"/api",{recursive:true}); fs.writeFileSync(ROOT+"/api/coach.js",build()); fs.writeFileSync(ROOT+"/api/plan.js",buildPlan()); console.log("api/coach.js et api/plan.js écrits"); }
