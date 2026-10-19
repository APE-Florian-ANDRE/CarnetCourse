#!/usr/bin/env node
// Génère api/coach.js (fonction Vercel autonome) à partir du modèle, de system-prompt.txt et des règles de public/coach.js (source unique).
// Usage : node integrations/vercel/build-api.js      (à relancer si tu modifies le prompt, les messages fixes ou les règles de sécurité)
const fs=require("fs"), path=require("path"); const D=__dirname, N8N=path.join(D,"../n8n"), ROOT=path.resolve(D,"../..");
function build(){
  const system=fs.readFileSync(N8N+"/system-prompt.txt","utf8").trim(), coachSrc=fs.readFileSync(ROOT+"/public/coach.js","utf8");
  const m=/const norm=[\s\S]*?const RULES=\[[\s\S]*?\n\];\n/.exec(coachSrc), g=/function guard\(text\)\{[^\n]*\n/.exec(coachSrc);
  if(!m||!g) throw new Error("règles de sécurité introuvables dans public/coach.js");
  const msgs=fs.readFileSync(N8N+"/nodes/safe-msgs.js","utf8");
  return fs.readFileSync(D+"/coach.template.js","utf8").replace("__SYSTEM_PROMPT__",()=>JSON.stringify(system).slice(1,-1)).replace("/*__SAFETY__*/",()=>m[0]+g[0]).replace("/*__MSGS__*/",()=>msgs);
}
module.exports={build};
if(require.main===module){ fs.mkdirSync(ROOT+"/api",{recursive:true}); fs.writeFileSync(ROOT+"/api/coach.js",build()); console.log("api/coach.js écrit"); }
