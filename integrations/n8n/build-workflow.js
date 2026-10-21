#!/usr/bin/env node
// Génère workflow-coach.json à partir de nodes/*.js et system-prompt.txt (source unique). Usage : node build-workflow.js
const fs=require("fs"), path=require("path"); const D=__dirname, rd=f=>fs.readFileSync(path.join(D,f),"utf8");
const system=rd("system-prompt.txt").trim();
// filet de sécurité : les règles sont celles du navigateur (public/coach.js, source unique), copiées telles quelles dans le nœud ; les messages fixes viennent de nodes/safe-msgs.js
const coachSrc=fs.readFileSync(path.join(D,"../../public/coach.js"),"utf8");
const m=/const norm=[\s\S]*?const RULES=\[[\s\S]*?\n\];\n/.exec(coachSrc), g=/function guard\(text\)\{[^\n]*\n/.exec(coachSrc);
if(!m||!g) throw new Error("règles de sécurité introuvables dans public/coach.js");
const SAFETY=m[0]+g[0], MSGS=rd("nodes/safe-msgs.js");
const code=f=>rd("nodes/"+f).replace("__SYSTEM_PROMPT__",()=>JSON.stringify(system).slice(1,-1)).replace("/*__SAFETY__*/",()=>SAFETY).replace("/*__MSGS__*/",()=>MSGS);
const N=(name,type,tv,pos,parameters,extra={})=>({parameters,id:require("crypto").createHash("md5").update(name).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/,"$1-$2-$3-$4-$5"),name,type,typeVersion:tv,position:pos,...extra});
const respond=(name,pos)=>N(name,"n8n-nodes-base.respondToWebhook",1.1,pos,{respondWith:"json",responseBody:"={{ { reply: $json.reply } }}",options:{responseCode:"={{ $json.status }}"}});
const nodes=[
  N("Webhook","n8n-nodes-base.webhook",2,[0,300],{httpMethod:"POST",path:"carnet-coach",responseMode:"responseNode",options:{allowedOrigins:"https://REMPLACE-PAR-L-ADRESSE-DE-TON-SITE",rawBody:false}},{webhookId:"6b1c0d5e-0000-4000-8000-000000000001"}),
  N("Préparer","n8n-nodes-base.code",2,[220,300],{mode:"runOnceForAllItems",jsCode:code("prepare.js")}),
  N("Requête valide ?","n8n-nodes-base.if",2,[440,300],{conditions:{options:{caseSensitive:true,leftValue:"",typeValidation:"strict"},conditions:[{id:"c1",leftValue:"={{ $json.status === 200 }}",rightValue:"",operator:{type:"boolean",operation:"true",singleValue:true}}],combinator:"and"},options:{}}),
  N("Vérifier le jeton Supabase","n8n-nodes-base.httpRequest",4.2,[660,200],{method:"GET",url:"https://REMPLACE-PAR-TON-PROJET.supabase.co/auth/v1/user",sendHeaders:true,headerParameters:{parameters:[{name:"apikey",value:"REMPLACE-PAR-TA-CLE-ANON-PUBLIQUE"},{name:"Authorization",value:"=Bearer {{ $json.token }}"}]},options:{timeout:8000,response:{response:{fullResponse:true,neverError:true}}}}),
  N("Contrôle et limite","n8n-nodes-base.code",2,[880,200],{mode:"runOnceForAllItems",jsCode:code("control.js")}),
  N("Autorisé ?","n8n-nodes-base.if",2,[1100,200],{conditions:{options:{caseSensitive:true,leftValue:"",typeValidation:"loose"},conditions:[{id:"c2",leftValue:"={{ $json.status === 200 && !$json.skipAI }}",rightValue:"",operator:{type:"boolean",operation:"true",singleValue:true}}],combinator:"and"},options:{}}),
  N("Gemini","n8n-nodes-base.httpRequest",4.2,[1320,100],{method:"POST",url:"=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.model }}:generateContent",authentication:"genericCredentialType",genericAuthType:"httpHeaderAuth",sendBody:true,specifyBody:"json",jsonBody:"={{ JSON.stringify($json.aiBody) }}",options:{timeout:40000,response:{response:{neverError:true}}}},{credentials:{httpHeaderAuth:{id:"",name:"Gemini API key"}}}),
  N("Réponse","n8n-nodes-base.code",2,[1540,100],{mode:"runOnceForAllItems",jsCode:code("reply.js")}),
  respond("Répondre (coach)",[1760,100]),
  respond("Répondre (refus)",[1320,360]),
  respond("Répondre (requête invalide)",[660,420]),
];
const L=(a,b,i=0,o=0)=>({node:b,type:"main",index:i});
const connections={"Webhook":{main:[[{node:"Préparer",type:"main",index:0}]]},"Préparer":{main:[[{node:"Requête valide ?",type:"main",index:0}]]},
 "Requête valide ?":{main:[[{node:"Vérifier le jeton Supabase",type:"main",index:0}],[{node:"Répondre (requête invalide)",type:"main",index:0}]]},
 "Vérifier le jeton Supabase":{main:[[{node:"Contrôle et limite",type:"main",index:0}]]},"Contrôle et limite":{main:[[{node:"Autorisé ?",type:"main",index:0}]]},
 "Autorisé ?":{main:[[{node:"Gemini",type:"main",index:0}],[{node:"Répondre (refus)",type:"main",index:0}]]},"Gemini":{main:[[{node:"Réponse",type:"main",index:0}]]},"Réponse":{main:[[{node:"Répondre (coach)",type:"main",index:0}]]}};
const wf={name:"Pacebook : Coach",nodes,connections,active:false,settings:{executionOrder:"v1",saveDataSuccessExecution:"none",saveDataErrorExecution:"none",saveManualExecutions:false},pinData:{},tags:[],meta:{templateCredsSetupCompleted:false}};
fs.writeFileSync(path.join(D,"workflow-coach.json"),JSON.stringify(wf,null,2)+"\n"); console.log("workflow-coach.json écrit :",nodes.length,"nœuds");
