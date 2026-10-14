#!/usr/bin/env node
// Source unique de la CSP : écrit la même politique dans vercel.json, _headers et la balise meta de chaque page.
// connect-src = 'self' + l'URL EXACTE du projet Supabase (lue dans config.js) ; sans URL, 'self' seulement.
// Usage : node tools/set-csp.js        (à relancer après avoir renseigné SUPABASE_URL ; node tests/static-checks.js le vérifie)
const fs=require("fs"), path=require("path"); const ROOT=path.resolve(__dirname,".."), R=path.join(ROOT,"public");
const cfg=fs.readFileSync(R+"/config.js","utf8"); const m=cfg.match(/SUPABASE_URL:\s*"([^"]*)"/); const url=m?m[1].trim():"";
let origin=""; if(url){ if(!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url)){ console.error("SUPABASE_URL invalide : attendu https://xxxx.supabase.co (https, nom de domaine, sans chemin, port, joker ni caractère spécial)"); process.exit(1); } origin=url.toLowerCase(); }
// Coach (option) : origine EXACTE du webhook n8n, https obligatoire, ajoutée à connect-src
const cm=cfg.match(/CHAT_WEBHOOK_URL:\s*"([^"]*)"/); const curl=cm?cm[1].trim():""; let corigin="";
if(curl){ const m=/^(https:\/\/[a-z0-9]([a-z0-9.-]{0,120})(:\d{2,5})?)(\/[A-Za-z0-9._~%\/-]{0,160})?$/i.exec(curl); if(!m){ console.error("CHAT_WEBHOOK_URL invalide : attendu https://hote[/chemin] (https obligatoire, sans identifiants, paramètres ni joker)"); process.exit(1); } corigin=m[1].toLowerCase(); }
const base=["default-src 'none'","script-src 'self'","style-src 'self'","img-src 'self' data:","font-src 'self'","connect-src 'self'"+(origin?" "+origin:"")+(corigin&&corigin!==origin?" "+corigin:""),"manifest-src 'self'","base-uri 'none'","form-action 'self'","object-src 'none'","worker-src 'none'"];
const meta=base.join("; "), header=[...base,"frame-ancestors 'none'","upgrade-insecure-requests"].join("; ");
for(const f of fs.readdirSync(R).filter(f=>f.endsWith(".html"))){ const s=fs.readFileSync(R+"/"+f,"utf8"); const t=s.replace(/(http-equiv="Content-Security-Policy" content=")[^"]*(")/,(_,a,b)=>a+meta+b); if(t!==s) fs.writeFileSync(R+"/"+f,t); }
const v=JSON.parse(fs.readFileSync(ROOT+"/vercel.json","utf8")); for(const h of v.headers[0].headers) if(h.key==="Content-Security-Policy") h.value=header; fs.writeFileSync(ROOT+"/vercel.json",JSON.stringify(v,null,2)+"\n");
let h=fs.readFileSync(R+"/_headers","utf8"); h=h.replace(/^(\s*Content-Security-Policy: ).*$/m,(_,a)=>a+header); fs.writeFileSync(R+"/_headers",h);
console.log("CSP mise à jour. connect-src : 'self'"+(origin?" "+origin:" (aucune URL Supabase dans config.js)")+(corigin?" + Coach "+corigin:""));
