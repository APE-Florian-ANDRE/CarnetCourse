#!/usr/bin/env node
/* Serveur MCP (stdio) en LECTURE SEULE pour Pacebook. Aucune dépendance, aucun secret dans ce fichier.
   Il lit la ligne de l'utilisateur dans Supabase (table user_data) avec le JWT de CET utilisateur : les règles RLS du schéma garantissent qu'il ne voit que ses propres données.
   Environnement : SUPABASE_URL (https://xxxx.supabase.co), SUPABASE_ANON_KEY (clé publique « anon »), USER_JWT (jeton d'accès de l'utilisateur).
   Jamais d'écriture : seules des requêtes GET sont émises (vérifié par tests/n8n.js). Les notes libres du ressenti ne sont jamais renvoyées. */
"use strict";
const MAX=60000;
const TOOLS=[
  {name:"lire_profil",description:"Profil d'entraînement de l'utilisateur (sport, niveau, objectif, séances par semaine, début du plan). Le plan de chaque semaine se déduit de ces réglages. Lecture seule.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"lire_suivi",description:"Suivi hebdomadaire (poids, sommeil, fatigue, séances faites et prévues) : les 12 dernières semaines. Lecture seule.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"lire_ressenti",description:"Ressenti après séance (effort perçu, forme, douleur) : les 20 derniers, sans les notes libres. Lecture seule.",inputSchema:{type:"object",properties:{},additionalProperties:false}}
];
const num=(v,a,b)=>{ v=+v; return Number.isFinite(v)&&v>=a&&v<=b? Math.round(v*10)/10 : null; };
const str=(v,re,n)=> typeof v==="string"&&re.test(v)? v.slice(0,n) : null;
const iso=v=>str(v,/^\d{4}-\d{2}-\d{2}$/,10);
const pick={
  lire_profil(doc){ const p=doc&&doc.profile&&typeof doc.profile==="object"? doc.profile : {};
    return {sport:str(p.sport,/^(course|trail|vtt|force|forme)$/,10),niveau:str(p.niveau,/^(deb|int|conf)$/,4),objectif:str(p.objectif,/^(forme|5|10|21|42)$/,5),seances:num(p.seances,0,7),renfo:num(p.renfo,0,3),debut_du_plan:iso(p.start),date_course:iso(p.raceDate),age:num(p.age,10,110),poids_kg:num(String(p.poids).replace(",","."),20,400)}; },
  lire_suivi(doc){ const l=Array.isArray(doc&&doc.log)? doc.log : [];
    return l.filter(e=>e&&typeof e==="object"&&iso(e.date)).sort((a,b)=>a.date<b.date?1:-1).slice(0,12).map(e=>({date:e.date,poids_kg:num(String(e.poids).replace(",","."),20,400),sommeil_h:num(e.sommeil,0,24),fatigue:num(e.fatigue,0,5),faites:num(e.faites,0,14),prevues:num(e.prevues,0,14)})); },
  lire_ressenti(doc){ const f=doc&&doc.feel&&typeof doc.feel==="object"&&!Array.isArray(doc.feel)? doc.feel : {};
    return Object.entries(f).filter(([k,v])=>iso(k)&&v&&typeof v==="object"&&!v.x).sort((a,b)=>a[0]<b[0]?1:-1).slice(0,20).map(([k,v])=>({date:k,effort:num(v.rpe,1,10),forme:num(v.mood,1,5),douleur:+v.pain===2?2:+v.pain===1?1:0})); }
};
async function readDoc(env,fetchImpl){
  const url=String(env.SUPABASE_URL||""), key=String(env.SUPABASE_ANON_KEY||""), jwt=String(env.USER_JWT||"");
  if(!/^https:\/\/[a-z0-9.-]+$/i.test(url)||!key||!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)) throw new Error("configuration : SUPABASE_URL (https), SUPABASE_ANON_KEY et USER_JWT sont requis");
  const r=await fetchImpl(url+"/rest/v1/user_data?select=doc&limit=1",{method:"GET",headers:{apikey:key,Authorization:"Bearer "+jwt,Accept:"application/json"}});   // GET uniquement
  if(!r.ok) throw new Error("Supabase a répondu "+r.status);
  const t=await r.text(); if(t.length>5e6) throw new Error("réponse trop volumineuse"); const rows=JSON.parse(t);
  return Array.isArray(rows)&&rows[0]&&rows[0].doc&&typeof rows[0].doc==="object"? rows[0].doc : {};
}
async function handle(msg,env,fetchImpl){
  const id=msg.id, ok=result=>({jsonrpc:"2.0",id,result}), er=(code,message)=>({jsonrpc:"2.0",id,error:{code,message}});
  switch(msg.method){
    case "initialize": return ok({protocolVersion:typeof msg.params?.protocolVersion==="string"? msg.params.protocolVersion : "2024-11-05",capabilities:{tools:{}},serverInfo:{name:"carnet-coach-mcp",version:"1.0.0"}});
    case "ping": return ok({});
    case "tools/list": return ok({tools:TOOLS});
    case "tools/call": { const n=msg.params&&msg.params.name; if(!Object.hasOwn(pick,n)) return er(-32602,"outil inconnu");
      try{ const doc=await readDoc(env,fetchImpl); let t=JSON.stringify(pick[n](doc),null,1); if(t.length>MAX) t=t.slice(0,MAX); return ok({content:[{type:"text",text:t}]}); }
      catch(e){ return ok({isError:true,content:[{type:"text",text:"Erreur : "+String(e.message).slice(0,200)}]}); } }
    default: return id===undefined? null : er(-32601,"méthode inconnue");
  }
}
module.exports={handle,TOOLS,pick};
if(require.main===module){
  let buf=""; process.stdin.setEncoding("utf8");
  process.stdin.on("data",async c=>{ buf+=c; if(buf.length>1e6){ process.exit(1); } let i; while((i=buf.indexOf("\n"))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!line) continue; let m; try{ m=JSON.parse(line); }catch(e){ continue; } const r=await handle(m,process.env,fetch); if(r) process.stdout.write(JSON.stringify(r)+"\n"); } });
}
