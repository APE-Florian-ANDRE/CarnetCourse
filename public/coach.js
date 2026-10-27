/* Coach IA : assistant de coaching (site déployé uniquement). Aucun secret ici, aucune clé d'IA dans le navigateur.
   Actif seulement si APP_CONFIG.CHAT_WEBHOOK_URL est une adresse https valide (fonction api/coach.js du site, ou webhook n8n). Rien n'est envoyé avant l'accord explicite de l'utilisateur.
   L'IA est appelée par le serveur (clé dans ses variables d'environnement) ; ce fichier envoie des messages et reçoit du TEXTE : la réponse n'est jamais interprétée comme du HTML. */
(function(){
"use strict";
const CFG=window.APP_CONFIG||{}, B=window.CarnetBridge, isLocal=["localhost","127.0.0.1"].includes(location.hostname);
const COACH_V="2026-10-24.1", K_CONSENT="carnet.coach.consent", K_HIST="carnet.coach.hist", K_RATE="carnet.coach.rate";
const MAX_IN=1000, MAX_REPLY=4000, MAX_BODY=65536, MAX_HIST=40, MAX_CONV=12, SEND_N=6, TIMEOUT=45000, MIN_GAP=1500, RATE_N=20, RATE_WIN=3600000;
const $=s=>document.querySelector(s);

/* ---- adresse du webhook : https obligatoire (http seulement vers localhost, pour tester), pas d'identifiants, pas de paramètres ---- */
function hookUrl(){
  const u=String(CFG.CHAT_WEBHOOK_URL||"").trim(); if(!u||u.length>300) return "";
  // chemin same-origin « /api/… » (fonction du site) : un seul « / » au début, jamais « // » (protocole-relatif) ni « \ »
  const ok=/^\/(?!\/)[A-Za-z0-9._~%\/-]{0,160}$/.test(u)||/^https:\/\/[a-z0-9]([a-z0-9.-]{0,120})(:\d{2,5})?(\/[A-Za-z0-9._~%\/-]{0,160})?$/i.test(u)||(isLocal&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?(\/[A-Za-z0-9._~%\/-]{0,160})?$/.test(u));
  return ok? u : "";
}
const URL_OK=hookUrl();
const PROVIDER=(typeof CFG.CHAT_PROVIDER_NAME==="string"&&CFG.CHAT_PROVIDER_NAME.replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,60))||"un fournisseur d'IA";
const hookHost=()=>{ try{ return new URL(URL_OK, location.origin).host; }catch(e){ return ""; } };   // chemin relatif => hôte du site
// destinataire nommé dans la feuille d'accord : la fonction du site quand le coach est servi par le site lui-même, sinon le serveur relais configuré
const hookWho=()=>hookHost()===location.host? "au serveur de Pacebook (fonction du site, hébergée par Vercel dans l'Union européenne)" : "à un serveur relais choisi par l'éditeur ("+hookHost()+")";

/* ---- filet de sécurité : ces messages ne sont JAMAIS envoyés au serveur, une réponse fixe de prudence s'affiche ---- */
// texte normalisé : minuscules, sans accents, sans ponctuation ni caractères invisibles (l'apostrophe, le tiret, les points ne contournent rien)
const norm=s=>String(s).normalize("NFKD").replace(/[̀-ͯ​-‏⁠﻿­]/g,"").replace(/[͏؜ᅟᅠ឴឵᠋-᠎‪-‮⁡-⁤⁪-⁯ㅤﾠ￹-￻]/g,"").toLowerCase().replace(/[Ͱ-ϿЀ-ӿ]/g,c=>({"а":"a","е":"e","о":"o","р":"p","с":"c","у":"y","х":"x","к":"k","м":"m","т":"t","в":"b","н":"h","і":"i","ј":"j","ѕ":"s","ԁ":"d","ο":"o","α":"a","ε":"e","ρ":"p","ς":"c","ν":"v","τ":"t","υ":"u","κ":"k","χ":"x","ι":"i"}[c]||" ")).replace(/œ/g,"oe").replace(/[^a-z0-9]+/g," ").trim();
const RULES=[
  {k:"detresse",re:new RegExp([
    "ne (plus )?jamais (me )?reveill","ne jamais me reveiller","(aimerais|voudrais|veux|souhaite|envie de) ne plus me reveiller","(veux|voudrais|aimerais|envie de|vais|vouloir) (juste )?disparaitre(?! (dans|de|du|des|d|en|a|au|sur|pour (le|la|les|un|une|mes|ma|ce|cette)))","disparaitre (pour (de bon|toujours)|definitivement|a jamais)","(sois|serais) plus la\\b","attent\\w* (a|contre) (ma|mes|sa|ses) (vie|jours)","attenter","tout arreter definitivement","(vie|moi) (ne )?(vaut|valent) (plus )?rien","ma vie (ne )?vaut (plus )?rien","(poids|fardeau|boulet) (pour|pour tout|pour les|pour mes) (tout le monde|tous|les autres|mes proches|ma famille|mon entourage)","(poids|fardeau) pour (tout le monde|les autres|tous)","me jeter (sous|du|par|dans)","me pendre","me noyer","plus (de |d )?(raison|but|sens) (de |d )?(vivre|exister|continuer)","plus rien n a de sens","ne veux plus exister","tout laisser tomber (pour toujours|definitivement)","j en peux plus de vivre",
    "(don t|dont|do not|doesn t|didn t|no longer|not) (want|wanna) (to )?(live|be alive|exist|be here)","don t want to be (here|alive)","i m a burden","burden (to|on) (everyone|everybody|others|my family|my friends)","no point (in )?(living|going on|continuing)","not worth living","life (is )?(not|isn t) worth","wish i (was|were)n t (alive|here|born)","wish i (could )?(disappear|never wake up)","never wake up","disappear forever","give up on life","hang myself",
    "sui?cid","(?<!(va|vont|allait|pourrait|pourraient|peut|peuvent|va bien) )me tuer","me suicider","tuer moi meme","en finir(?! avec (ce|cette|mon|ma|mes|le|la|les|l) (plan|seances?|sorties?|entrainements?|semaines?|programme|regime|cycle|saison|blessures?))","finir avec (la|ma|cette) vie","mettre fin a (mes|ma|mon) (jours|vie|existence)","plus envie de vivre","plus (la peine|de raison) de vivre","(envie|veux|voudrais|souhaite|vais|pense a|penser a) (de |d )?mourir(?! de (rire|faim|chaud|froid|soif|fatigue|honte))","pas envie de (me reveiller|vivre)","disparaitre pour toujours","(me|m) (fais|fait|faire|faisant) du mal","(veux|veut|voudrais) (plus|ne plus) vivre","plus (envie )?de vivre","crever","(mieux|better) (si (j etais|je serais)|(d etre|etre)) (mort|morte)","j etais mort","(vie )?(ne )?vaut (plus|pas) la peine","personne ne me manquerait","(me|m) (coupe|couper|tailladerai|taillade) (les )?(bras|veines|poignets|jambes)","(veux|voudrais|vais|pense a|penser a) (me )?disparaitre(?! dans )","disparaiss\\w*(?! dans )","mourir(?! de (rire|faim|chaud|froid|soif|envie|fatigue|honte))","me blesser volontairement","automutil","scarifi","me pendre","me jeter (sous|du|de)","avaler (tous )?(mes|les) (medicaments|cachets|pilules)",
    "kill myself","killing myself","end my life","ending my life","take my own life","want to die","wanna die","wish i (was|were) dead","better off dead","end it all","no reason to live","hurt myself","harm myself","self harm","selfharm","self injur","cut myself","commit suicide","plus (de )?gout a (rien|tout|la vie)","(endormir|dormir) pour toujours","lettre d adieu","mot d adieu","adieu a (tous|tout le monde)","(mieux|bien mieux) sans moi","(monde|famille|proches|autres) (serait|seraient|irait|iraient) (mieux|bien mieux) sans moi","say goodbye to everyone","goodbye letter","suicide note","better off without me","sleep forever"].join("|"))},
  {k:"urgence",re:new RegExp([
    "perdu connaissance","perdre connaissance","perte de conscience","(ai|suis) perdu (la )?conscience","(coeur|pouls|fc|frequence cardiaque|cardio|bpm)( \\w+){0,3} (a|de|au dessus de) 2\\d\\d\\b","2\\d\\d (bpm|pulsations)","bat a 2\\d\\d","(douleur|mal|serre\\w*|ecras\\w*|oppress\\w*|brul\\w*|pression|poids|etau)( \\w+){0,4} (torse|thorax|sternum)","douleur (ecrasante|en etau|constrictive)","trou noir","vue (qui )?(se )?(brouille|noircit|se voile)","vision (troublee|noire)","je vois noir","tombe? (dans le coma)","(pain|pressure|tightness|crushing) (in|on) (my )?(chest|torso|sternum)","crushing (chest|pain)","(heart|pulse|hr) (rate )?(is )?(at |above |over )?2\\d\\d","lost consciousness","passing out","black(ed)? out","dizzy and (vision|faint)","seeing black",
    "douleur (dans |a |au |de )?(la |ma |le |mon )?(poitrine|thorax|thoracique|cage thoracique)","mal (a|dans) (la |ma )?poitrine","serrement (dans |de )?(la |ma )?poitrine","oppression (dans |de )?(la |ma )?poitrine","poitrine (qui )?(serre|brule|ecrase)","douleur (dans |au |a )?(le |mon )?(bras gauche|bras|machoire|epaule gauche)","bras gauche","crise cardiaque","infarctus","avc\\b","arret cardiaque",
    "palpitation","(douleur|mal|oppression|serrement|pression|gene|brulure) (a|au|dans|sur|de) (la |le |ma |mon |l )?(poitrine|thorax|coeur|bras gauche|machoire)","oppression","suffoque","etouff","(je )?(me suis|j ai) (casse|fracture|brise) ","vertiges?","engourdi","ne sens plus","fourmillements?","coeur (qui )?(s emballe|bat (tres )?(vite|fort|irregulierement))","battements? (irreguliers?|anormaux)","arythmie","tachycardie","fibrillation",
    "perte de connaissance","malaise","evanou","syncope","tombe dans les pommes","tourne de l oeil","du mal a respirer","difficultes? a respirer","je ne (peux|arrive) plus (a )?respirer","essouffl\\w* (anormal|brutal|soudain)","manque d air",
    "crach\\w* (du |de )?sang","vomi\\w* (du |de )?sang","sang dans (mes|les|ma|la) (urines?|selles?|crachats?|vomi)","saignement","j ai saigne","urines? (rouges?|sanglantes?)","selles noires",
    "douleur (tres |super |vraiment |extremement )?(forte|intense|insupportable|violente|aigue|atroce|lancinante)","douleur qui (ne passe pas|persiste|empire|s aggrave)","fracture","je n arrive plus a (marcher|bouger|respirer)","paralys","engourdissement (du |de la )?(bras|visage|jambe)",
    "chest pain","pain in my chest","tight chest","chest (tightness|pressure)","heart attack","cardiac arrest","can t breathe","cannot breathe","trouble breathing","short(ness)? of breath","fainted","passed out","blacked out","coughing (up )?blood","blood in (my )?(urine|stool|vomit)","vomiting blood","severe pain","unbearable pain","excruciating","broken (bone|leg|arm|ankle)","parole (pateuse|confuse|difficile|bizarre)","bouche de travers","visage (qui )?(tombe|s affaisse|est paralyse)","vision (trouble|double)","vue (trouble|double)","(vois|voit) (trouble|double|flou)","paralysie","slurred speech","slurring","double vision","blurred vision","face drooping"].join("|"))},
  {k:"tca",re:new RegExp([
    "(me|m) (prive|prives|privais|priver|privant) (de |d )?(manger|nourriture|repas|tout|presque tout|toute nourriture|alimentation)","privation (alimentaire|de nourriture)","ne (mange|mangeais) (presque )?(rien|pas|plus)","mange presque rien","je (jeune|jeunais) (depuis|tous|chaque|des)","jeune depuis","jeune? (\\d+|plusieurs|trois|quatre|cinq|deux) (jours|semaines)","pas (mange|mange) depuis","(depuis|pendant) \\d+ (jours|semaines) (sans manger|que je ne mange)","sans manger (depuis|pendant)","je (ne )?(me )?(nourris|nourrissais) (presque )?(plus|pas|rien)","(me )?(faire|fais|fait) (jeuner|jeune)","vomi\\w* (apres chaque|a chaque|chaque) repas","vomis (apres|chaque|a chaque|tout)","me faire vomir","(je )?(me )?(suis )?(vomi|vomit)(e)? expres","(vis|vit|vivre|survis|tiens|tenir) (avec|sur) (\\d{3}|1 ?[01]\\d{2}) ?(kcal|calories?|cal)\\b","(kcal|calories?) (par jour|\\/ ?jour) (\\d{3})\\b",
    "i (starve|starved|am starving|m starving) myself","i don t eat","not eat(ing)? (for|since) (\\d+|days|a week|weeks)","(skip|skipping) (all )?(my )?meals","(haven t|have not|didn t) eaten? (in|for) (\\d+|days|a week)","(make|made|making) myself (sick|vomit|puke)","(vomit|puke|throw up) (after|every) (meal|time i eat)","lose weight at any cost","(eat|eating) (almost )?nothing","laxatives? (to|for) (lose|weight)",
    "anorex","boulim","hyperphag","trouble (du comportement )?alimentaire","orthorex","me faire vomir","me force a vomir","vomir (apres|pour)","me purger","laxatifs?","diuretiques? pour (maigrir|perdre)","coupe faim",
    "(me|m) (fais|fait|faire|faisant) vomir","vomis (quand|apres|expres|volontairement)","ne mange (plus|qu un|qu une|que)","je saute (tous |mes |les )+repas","sauter (tous |mes |les )+repas","jeun\\w*( de)? \\d+ ?(jours?|h)\\b","regime (a |de |sous )?(\\d{3}|1 ?[01]\\d{2}) ?(kcal|calories?|cal)","arreter de manger","ne plus manger","plus (rien )?manger","pas manger du tout","ne pas manger du tout","sauter (tous mes|tous les) repas","jeune? (extreme|prolonge|total)","jeuner (plusieurs|3|4|5|6|7|\\d+) jours","jeune de? \\d+ ?(jours?|h)","me priver de (tout|manger|nourriture)","me laisser mourir de faim","mourir de faim volontairement","me affamer",
    "perdre (\\d+|une dizaine de|dix|quinze|vingt) ?(kg|kilos?) en (\\d+ jours?|(une|1|2|deux|3|trois|quelques) (semaines?|jours?))","maigrir (tres )?vite","maigrir a tout prix","perdre du poids (tres )?(vite|rapidement)","perdre (\\d+) ?(kg|kilos?) en (un|1) mois","me faire maigrir","detest\\w* mon corps","degout\\w* de mon corps","me trouve (gros|grosse|enorme|dégoutant)",
    "(?<!\\d ?)(\\d{3}|1 ?[01]\\d{2}) ?(kcal|calories?|cal) (par |per |a |de )?(jour|day|journee)","moins de (\\d{3}|1 ?[01]\\d{2}) ?(kcal|calories?)","(?<!\\d ?)(\\d{3}|1 ?[01]\\d{2}) ?(kcal|calories?) max",
    "starv(e|ing) myself","stop eating","not eating (at all|anything)","stop(ped)? eating","eating disorder","purge","purging","make myself (throw up|vomit)","throw up (after|on purpose)","fast(ing)? for (\\d+|several|many) days","extreme fast","crash diet","lose \\d+ ?(kg|lbs?|pounds?|kilos?) in (a|one|1|2|two|3|three|few) (week|days?)","lose weight (really )?fast","jours? sans manger","sans manger (pendant|depuis|plusieurs|pour (fondre|maigrir))","compens\\w* (chaque |un |le |mes |les )?(repas|calories?) (par|avec|en) .{0,20}(sport|course|heures?|entrainement)","(sinon|sans quoi) je me puni","me punir (de|si|apres|quand|en)","me punis","honte de manger","honte quand je mange","me restreins","me restreindre","restriction alimentaire","restreindre (mon|mes) (alimentation|repas|calories)","ashamed (of|to) eat","punish myself (for|after|if|by)","skip(ped)? meals? to (lose|burn|fondre)","days without eating"].join("|"))}
];
const FIXED={
  detresse:"Ce que tu écris me préoccupe, et je ne suis pas la bonne aide pour ça. Tu n'es pas seul(e) : en France, le 3114 (numéro national de prévention du suicide) répond 24 h sur 24, gratuitement. En cas de danger immédiat, appelle le 15 ou le 112. Tu peux aussi en parler à un proche ou à ton médecin. Je n'ai envoyé ce message à aucun serveur.",
  urgence:"Ce que tu décris peut être sérieux. Arrête l'effort. Si la douleur est forte, si elle touche la poitrine, si tu as du mal à respirer ou si tu as eu un malaise, appelle le 15 ou le 112. Sinon, consulte un médecin avant de reprendre le sport. Je n'ai envoyé ce message à aucun serveur et je ne modifie pas ton plan.",
  tca:"Ce que tu décris peut toucher à ton rapport à l'alimentation. Je ne peux pas te conseiller là-dessus : parles-en à ton médecin traitant ou à un professionnel de santé, qui pourra t'aider sans jugement. En attendant, ne réduis pas ton alimentation et ne t'entraîne pas à jeun. Je n'ai envoyé ce message à aucun serveur."
};
function guard(text){ const raw=String(text); for(const t of [norm(raw).slice(0,4000),norm(raw.replace(/[<>*_~`|^\\]/g,"")).slice(0,4000)]) for(const r of RULES) if(r.re.test(t)) return r.k; const t=norm(raw).slice(0,4000); const c=t.replace(/ /g,""); if(/sui?cid|killmyself|selfharm|automutil|scarifi|medepeche/.test(c)) return "detresse"; if(/anorex|boulim/.test(c)) return "tca"; return ""; }

/* ---- affichage sûr : du texte, jamais du HTML. Mini-markdown : paragraphes, listes, **gras**, `code`. Aucun lien, aucune image. ---- */
function inline(el,s){ const re=/(\*\*[^*\n]{1,200}\*\*|`[^`\n]{1,200}`)/g; let i=0,m; while((m=re.exec(s))){ if(m.index>i) el.append(s.slice(i,m.index)); const t=m[0], n=document.createElement(t[0]==="*"?"strong":"code"); n.textContent=t.slice(t[0]==="*"?2:1,t[0]==="*"?-2:-1); el.append(n); i=m.index+t.length; } if(i<s.length) el.append(s.slice(i)); }
function renderMd(box,text){
  box.textContent=""; let list=null, para=[], n=0;
  const flushP=()=>{ if(para.length&&n<80){ const p=document.createElement("p"); inline(p,para.join(" ")); box.append(p); n++; } para=[]; };
  for(const raw of String(text).split("\n").slice(0,200)){
    const l=raw.replace(/\s+$/,""), b=/^\s{0,3}([-*•]|\d{1,2}[.)])\s+(.*)$/.exec(l);
    if(b){ flushP(); const ord=/\d/.test(b[1]); if(!list||list.tagName!==(ord?"OL":"UL")){ list=document.createElement(ord?"ol":"ul"); box.append(list); n++; } const li=document.createElement("li"); inline(li,b[2].slice(0,500)); list.append(li); }
    else if(!l.trim()){ flushP(); list=null; }
    else { list=null; para.push(l.replace(/^#{1,6}\s+/,"").trim()); }
  }
  flushP();
}
// texte reçu : types, taille et caractères de contrôle contrôlés
function cleanReply(s){ if(typeof s!=="string") return ""; return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g,"").replace(/\r\n?/g,"\n").slice(0,MAX_REPLY).trim(); }

/* ---- consentement, séparé de celui du compte ---- */
const ls={get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} }};
function getConsent(){ let c=null; try{ c=JSON.parse(ls.get(K_CONSENT)||"null"); }catch(e){} if(!c||typeof c!=="object"||c.v!==COACH_V||c.send!==true||isNaN(Date.parse(c.at))) return null; return {v:COACH_V,send:true,at:new Date(c.at).toISOString(),profile:c.profile===true,feel:c.feel===true,stats:c.stats===true}; }
function setConsent(o){ ls.set(K_CONSENT,JSON.stringify({v:COACH_V,send:true,at:new Date().toISOString(),profile:!!o.profile,feel:!!o.feel,stats:!!o.stats})); }

/* ---- historique local, borné et assaini (jamais envoyé en entier : les derniers messages de la conversation ouverte seulement) ----
   { v:2, cur: conversation ouverte, convs: [{ id, at: dernière activité, m: [{ r, t, x, e }] }] } ; MAX_CONV conversations de MAX_HIST messages au plus */
function cleanMsgs(a){ const out=[]; if(!Array.isArray(a)) return out;
  for(const m of a.slice(-MAX_HIST)){ if(!m||typeof m!=="object") continue; const r=m.r==="u"?"u":m.r==="a"?"a":""; const t=cleanReply(m.t).slice(0,r==="u"?MAX_IN:MAX_REPLY); if(!r||!t) continue; out.push({r,t,x:m.x===1?1:0,e:m.e===1?1:0}); }
  return out; }
function loadStore(){ let o=null; try{ o=JSON.parse(ls.get(K_HIST)||"null"); }catch(e){}
  if(Array.isArray(o)) o={cur:"c0",convs:[{id:"c0",at:Date.now(),m:o}]};   // ancien format : une seule conversation
  const convs=[];
  if(o&&typeof o==="object"&&Array.isArray(o.convs)) for(const c of o.convs.slice(-60)){ if(!c||typeof c!=="object") continue;
    const id=typeof c.id==="string"&&/^c[0-9a-z]{1,16}$/.test(c.id)? c.id : "", m=cleanMsgs(c.m); if(!id||!m.length||convs.some(x=>x.id===id)) continue;
    convs.push({id,at:Number.isFinite(+c.at)&&+c.at>0? Math.min(+c.at,Date.now()) : 0,m}); }
  convs.sort((a,b)=>a.at-b.at); convs.splice(0,Math.max(0,convs.length-MAX_CONV));   // les moins récemment utilisées partent en premier
  const del=o&&Array.isArray(o.del)? o.del.filter(x=>typeof x==="string"&&/^c[0-9a-z]{1,16}$/.test(x)).slice(-30) : [];   // conversations supprimées (et non évincées)
  return {cur:o&&typeof o.cur==="string"&&convs.some(c=>c.id===o.cur)? o.cur : null,convs,del}; }
let store=loadStore();
const curConv=()=>store.convs.find(c=>c.id===store.cur)||null;
let hist=curConv()? curConv().m : [];
const gone=new Set();   // conversations supprimées dans cet onglet : une fusion ne les fait pas revenir
function saveHist(touch){ hist=hist.slice(-MAX_HIST); let c=curConv();   // touch=false : rouvrir une conversation ne la fait pas remonter dans la liste
  if(!c&&hist.length){ c={id:"c"+Date.now().toString(36),at:0,m:[]}; store.convs.push(c); store.cur=c.id; }
  if(c){ c.m=hist; if(touch!==false||!c.at) c.at=Date.now(); }
  // fusion avec ce qu'un autre onglet a écrit depuis : ses conversations sont gardées ; la conversation ouverte ici reste celle de cet onglet
  const disk=loadStore(); for(const x of disk.del) gone.add(x);
  const byId=new Map(); for(const x of disk.convs) if(!gone.has(x.id)) byId.set(x.id,x);
  for(const x of store.convs){ const o=byId.get(x.id); if(!o||x.id===store.cur||x.at>=o.at) byId.set(x.id,x); }
  const all=[...byId.values()].filter(x=>x.m.length).sort((a,b)=>a.at-b.at);
  while(all.length>MAX_CONV){ const i=all.findIndex(x=>x.id!==store.cur); all.splice(i,1); }   // la moins récemment utilisée part, jamais celle qui est ouverte
  store.convs=all;
  if(store.convs.length) ls.set(K_HIST,JSON.stringify({v:2,cur:store.cur,convs:store.convs,del:[...gone].slice(-30)})); else ls.del(K_HIST);
  renderConvs(); }

/* ---- limite de fréquence côté navigateur (la vraie limite est sur le serveur : 20 messages par heure et par personne) ---- */
// horodatages des envois réels de l'heure écoulée (les messages de prudence, jamais envoyés, ne comptent pas)
function rateList(){ let a=null; try{ a=JSON.parse(ls.get(K_RATE)||"[]"); }catch(e){} const now=Date.now(); return (Array.isArray(a)?a:[]).filter(t=>typeof t==="number"&&t>now-RATE_WIN&&t<=now+60000).slice(-RATE_N); }
const rateWait=()=>{ const r=rateList(); return r.length<RATE_N? 0 : Math.max(1,Math.ceil((r[0]+RATE_WIN-Date.now())/60000)); };
function rateHit(){ const r=rateList(); r.push(Date.now()); ls.set(K_RATE,JSON.stringify(r.slice(-RATE_N))); }

/* ---- envoi ---- */
let ctl=null, busy=false, lastSend=0, userCancel=false, epoch=0;
const E={auth:"Connecte-toi à ton compte pour utiliser le coach : le serveur vérifie qui tu es. Sans connexion, rien n'est envoyé.",rate:"Trop de messages en peu de temps. Attends quelques minutes puis réessaie.",srv:"Le serveur du coach a un problème. Réessaie dans un moment.",net:"Impossible de joindre le coach. Vérifie ta connexion, ou que le serveur est bien en ligne.",slow:"Le coach met trop de temps à répondre. Réessaie dans un moment.",invalid:"La réponse du coach est illisible. Réessaie, ou préviens l'administrateur du site.",big:"La réponse du coach est trop volumineuse : elle a été refusée.",other:"Le coach n'a pas pu répondre."};
async function readCapped(res){
  const rd=res.body&&res.body.getReader? res.body.getReader() : null, dec=new TextDecoder("utf-8"); let s="", n=0;
  if(!rd){ const t=await res.text(); if(t.length>MAX_BODY) throw {c:"big"}; return t; }
  for(;;){ const {done,value}=await rd.read(); if(done) break; n+=value.length; if(n>MAX_BODY){ try{ await rd.cancel(); }catch(e){} throw {c:"big"}; } s+=dec.decode(value,{stream:true}); }
  return s+dec.decode();
}
function buildBody(userText,cons){
  const msgs=hist.filter(m=>!m.x&&!m.e).slice(-SEND_N).map(m=>({role:m.r==="u"?"user":"assistant",content:m.t.slice(0,m.r==="u"?MAX_IN:1500)}));
  if(!msgs.length||msgs[msgs.length-1].role!=="user"||msgs[msgs.length-1].content!==userText) msgs.push({role:"user",content:userText});
  while(msgs.length&&msgs[0].role!=="user") msgs.shift();
  const body={v:1,lang:"fr",messages:msgs}; const ctx=B.summary({profile:cons.profile,feel:cons.feel,stats:cons.stats}); if(Object.keys(ctx).length) body.context=ctx; return body;
}
async function callHook(userText,cons){
  const headers={"Content-Type":"application/json","Accept":"application/json"};
  try{ const tk=window.CarnetAuth&&window.CarnetAuth.accessToken? await window.CarnetAuth.accessToken() : null; if(typeof tk==="string"&&/^[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/.test(tk)&&tk.length<4096) headers.Authorization="Bearer "+tk; }catch(e){}
  ctl=new AbortController(); let timedOut=false; const tm=setTimeout(()=>{ timedOut=true; ctl.abort(); },TIMEOUT);
  try{
    let res; try{ res=await fetch(URL_OK,{method:"POST",headers,body:JSON.stringify(buildBody(userText,cons)),signal:ctl.signal,credentials:"omit",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",mode:"cors"}); }
    catch(e){ if(userCancel) throw {c:"cancel"}; if(timedOut) throw {c:"slow"}; throw {c:"net"}; }
    if(res.status===401||res.status===403) throw {c:"auth"}; if(res.status===429) throw {c:"rate"}; if(res.status>=500) throw {c:"srv"}; if(!res.ok) throw {c:"other"};
    let txt; try{ txt=await readCapped(res); }catch(e){ if(e&&e.c) throw e; if(userCancel) throw {c:"cancel"}; if(timedOut) throw {c:"slow"}; throw {c:"net"}; }
    let o; try{ o=JSON.parse(txt); }catch(e){ throw {c:"invalid"}; }
    const r=o&&typeof o==="object"&&!Array.isArray(o)&&Object.hasOwn(o,"reply")? cleanReply(o.reply) : ""; if(!r) throw {c:"invalid"}; return r;
  } finally { clearTimeout(tm); ctl=null; }
}

/* ---- interface ---- */
function bubble(role,text,err){ const log=$("#coachLog"), d=document.createElement("div"); d.className="cmsg "+(role==="u"?"me":"bot")+(err?" err":""); const w=document.createElement("span"); w.className="cwho"; w.textContent=role==="u"?"Toi":err?"Coach IA (erreur)":"Coach IA"; const b=document.createElement("div"); b.className="cbody";
  if(role==="u"||err) b.textContent=text; else renderMd(b,text); d.append(w,b); log.append(d); log.scrollTop=log.scrollHeight; return d; }
function paint(){ const log=$("#coachLog"); if(!log) return; log.textContent=""; if(!hist.length){ const p=document.createElement("p"); p.className="muted"; p.textContent="Pose une question sur ton entraînement, tes séances ou ta récupération."; log.append(p); } for(const m of hist) bubble(m.r,m.t,m.e===1); log.scrollTop=log.scrollHeight; }
function setBusy(v){ const had=document.activeElement===$("#coachSend"); busy=v; $("#coachSend").disabled=v; $("#coachIn").readOnly=v; $("#coachCancel").hidden=!v; $("#coachWait").hidden=!v; $("#coachForm").setAttribute("aria-busy",String(v)); if(v&&had) $("#coachCancel").focus(); }
function gateState(){
  const g=$("#coachGate"); let msg="";
  let login=false;
  if(!B.ready()) msg="Remplis d'abord ton profil (âge compris) : le coach est réservé aux personnes qui l'ont fait.";
  else if(B.minor()) msg="Le coach est désactivé avant 18 ans.";
  else if(B.guest&&B.guest()){ msg="Le coach IA demande un compte : le serveur vérifie qui tu es avant de répondre. Sans connexion, rien n'est envoyé."; login=true; }
  g.hidden=!msg; g.textContent=msg; const off=!!msg;
  for(const id of ["#coachLogin","#coachTabLogin"]){ const x=$(id); if(x) x.hidden=!login; }
  { const tg=$("#coachTabGate"); if(tg){ tg.hidden=!msg; tg.textContent=msg; } for(const id of ["#coachTabAct","#coachTabLead","#coachConvs"]){ const x=$(id); if(x) x.hidden=off; } const n2=$("#coachNew2"); if(n2) n2.hidden=off; }
  for(const id of ["#coachIn","#coachSend"]) $(id).disabled=off||(id==="#coachSend"&&busy); for(const id of ["#coachForm","#coachTools","#coachLog","#coachNote"]) $(id).hidden=off;   // coach indisponible (profil incomplet, moins de 18 ans) : le seul message affiché est celui du verrou
  return !off;
}
function consentSheet(opener,after){
  const cur=getConsent(), chk=(id,on,t,d)=>`<label class="chk"><input type="checkbox" id="${id}"${on?" checked":""}><span>${t}<small>${d}</small></span></label>`;
  B.openSheet({title:"Envoyer mes messages au coach IA",opener,kind:"coach",
    html:`<p class="note">Le coach est une <b>intelligence artificielle</b> : ses réponses sont générées automatiquement et peuvent être fausses. Pour te répondre, il envoie <b>tes messages</b> ${B.esc(hookWho())}, qui les transmet à <b>${B.esc(PROVIDER)}</b>. Ces échanges sortent de ton appareil et de l'Union européenne.</p>
<div class="alert warn"><b>Offre gratuite de Google Gemini</b> : Google peut conserver tes messages, s'en servir pour améliorer ses produits et les faire relire par des personnes. <b>Tes messages peuvent contenir des informations de santé</b> : n'écris que ce qui est utile, jamais ton nom ni ton adresse.</div>
<details class="more"><summary>En savoir plus</summary><p class="note">Le coach ne remplace pas un avis médical, et son filtre de sécurité (qui repère certains mots graves) n'est pas exhaustif : en cas de doute ou de danger, appelle le 15, le 112 ou le 3114. Rien n'est envoyé tant que tu n'as pas accepté, et tu peux retirer ton accord à tout moment. Ton <b>âge</b> est toujours joint (le coach est réservé aux adultes), ainsi que ton jeton de connexion, pour vérifier qui tu es. Détails : <a href="confidentialite#ia" target="_blank" rel="noopener">politique de confidentialité</a>.</p></details>
<div class="grp" role="group" aria-label="Ce qui est envoyé">${chk("coAccept",!!cur,"J'accepte l'envoi de mes messages","Obligatoire pour utiliser le coach.")}
${chk("coProf",cur&&cur.profile,"Inclure un résumé de mon profil","Sport, niveau, objectif, séances par semaine, âge et poids. Décoché par défaut.")}
${chk("coFeel",cur&&cur.feel,"Inclure mon ressenti après séance","Les 8 derniers, avec leur date : effort perçu, forme, douleur (sans tes notes). Décoché par défaut.")}
${chk("coStat",cur&&cur.stats,"Inclure mes statistiques importées","Durée et distance par semaine sur 4 semaines. Décoché par défaut.")}</div>
<p class="note" id="coErr" role="alert" hidden></p>`,
    foot:`${cur?'<button class="btn ghost" type="button" id="coRevoke">Retirer mon accord</button>':""}<button class="btn" type="button" id="coGo">${cur?"Enregistrer":after?"Accepter et envoyer":"Accepter"}</button>`,
    onReady:sh=>{ const a=sh.querySelector("#coAccept"); a.setAttribute("data-first","");
      sh.querySelector("#coGo").addEventListener("click",()=>{ if(!a.checked){ const e=sh.querySelector("#coErr"); e.hidden=false; e.textContent="Coche « J'accepte l'envoi de mes messages » pour utiliser le coach."; a.focus(); return; }
        setConsent({profile:sh.querySelector("#coProf").checked,feel:sh.querySelector("#coFeel").checked,stats:sh.querySelector("#coStat").checked}); B.closeSheet(true); renderCfg(); if(after) after(); else $("#coachIn").focus(); });
      const rv=sh.querySelector("#coRevoke"); if(rv) rv.addEventListener("click",()=>{ ls.del(K_CONSENT); B.closeSheet(true); renderCfg(); $("#coachIn").focus(); }); }});
}
function renderCfg(){ const c=getConsent(), el=$("#coachCfgTxt"); if(!c){ el.textContent="Rien n'est envoyé tant que tu n'as pas accepté."; return; }
  const inc=[c.profile&&"profil",c.feel&&"ressenti",c.stats&&"statistiques"].filter(Boolean); el.textContent="Envoyé avec tes messages : "+(inc.length?inc.join(", "):"rien d'autre que tes messages")+"."; }
// effacement des données (ou changement de compte) : mémoire, historique, écran vidés ; la requête en vol est annulée et sa réponse jetée
function wipe(){ epoch++; if($("#coachPop")&&popOpen()) closePop(); hist=[]; store={cur:null,convs:[]}; ls.del(K_HIST); renderConvs(); userCancel=true; if(ctl){ try{ ctl.abort(); }catch(e){} } if($("#coachLog")){ paint(); setBusy(false); const i=$("#coachIn"); if(i){ i.value=""; } const c=$("#coachCount"); if(c) c.textContent="0 / "+MAX_IN; } }
async function send(text){
  if(busy) return; text=String(text).replace(/\s+/g," ").trim().slice(0,MAX_IN); if(!text) return;
  const now=Date.now(); if(now-lastSend<MIN_GAP){ $("#coachLive").textContent="Patiente un instant avant d'envoyer un autre message."; return; } lastSend=now;
  if(hist.length&&ls.get(K_HIST)===null){ hist=[]; store={cur:null,convs:[]}; paint(); }   // l'historique a été effacé ailleurs : on ne le ressuscite pas
  const k=guard(text);
  if(k){ hist.push({r:"u",t:text,x:1,e:0},{r:"a",t:FIXED[k],x:1,e:0}); saveHist(); paint(); $("#coachIn").value=""; $("#coachLive").textContent="Message de prudence affiché."; return; }
  { let tk=null; try{ tk=window.CarnetAuth&&window.CarnetAuth.accessToken? await window.CarnetAuth.accessToken() : null; }catch(e){}
    if(typeof tk!=="string"||!/^[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/.test(tk)){ $("#coachIn").value=text; paint(); bubble("a",E.auth,true); $("#coachLive").textContent=E.auth; return; } }   // invité : bloqué ici, avant tout envoi
  const cons=getConsent(); if(!cons){ lastSend=0; consentSheet($("#coachSend"),()=>send(text)); $("#coachIn").value=text; return; }
  { const w=rateWait(); if(w){ const m="Tu as envoyé "+RATE_N+" messages en moins d'une heure : attends environ "+w+" min avant le suivant."; $("#coachIn").value=text; paint(); bubble("a",m,true); $("#coachLive").textContent=m; return; } }
  rateHit();
  const ep=epoch; hist.push({r:"u",t:text,x:0,e:0}); saveHist(); $("#coachIn").value=""; paint(); setBusy(true); userCancel=false; $("#coachLive").textContent="Le coach réfléchit…";
  try{ const r=await callHook(text,cons); if(ep!==epoch) return; hist.push({r:"a",t:r,x:0,e:0}); saveHist(); paint(); $("#coachLive").textContent="Réponse du coach reçue."; }
  catch(e){ if(ep!==epoch) return; const c=e&&e.c||"other"; if(c==="cancel"){ hist.pop(); saveHist(); paint(); $("#coachIn").value=text; $("#coachLive").textContent="Envoi annulé."; } else { paint(); bubble("a",E[c]||E.other,true); $("#coachIn").value=text; $("#coachLive").textContent=E[c]||E.other; } }
  finally{ if(ep===epoch){ setBusy(false); $("#coachIn").focus(); } }
}
/* ---- onglet Coach : liste des conversations ; bulle : la conversation ouverte, au-dessus de tous les onglets ---- */
const when=t=>{ if(!t||!Number.isFinite(t)||t<0||t>Date.now()+864e5) return ""; const d=new Date(t), now=new Date(), same=d.toDateString()===now.toDateString();
  return same? "aujourd'hui à "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}); };
function renderConvs(){ const ul=$("#coachConvs"); if(!ul) return; ul.textContent=""; const ca=$("#coachClearAll"); if(ca) ca.hidden=!store.convs.length;
  if(!store.convs.length){ const li=document.createElement("li"); li.className="cempty"; li.textContent="Aucune conversation pour l'instant. Pose ta première question au coach."; ul.append(li); return; }
  for(const c of [...store.convs].sort((a,b)=>b.at-a.at)){
    const li=document.createElement("li"), btn=document.createElement("button"), main=document.createElement("span"), t=document.createElement("span"), sub=document.createElement("span"), del=document.createElement("button");
    const first=(c.m.find(m=>m.r==="u")||c.m[0]).t, n=c.m.length;
    btn.type="button"; btn.className="cconv"; btn.dataset.conv=c.id; if(c.id===store.cur) li.className="cur";
    main.className="m-main"; t.className="m-t"; t.textContent=first.length>90? first.slice(0,88)+"…" : first;   // texte seulement
    sub.className="m-s"; sub.textContent=(when(c.at)?when(c.at)+" · ":"")+n+" message"+(n>1?"s":"")+(c.id===store.cur?" · en cours":"");
    main.append(t,sub); btn.append(main); btn.setAttribute("aria-label","Rouvrir la conversation : "+t.textContent+", "+sub.textContent);
    del.type="button"; del.className="del"; del.dataset.delconv=c.id; del.textContent="×"; del.setAttribute("aria-label","Supprimer la conversation : "+t.textContent);
    li.append(btn,del); ul.append(li); } }
const popOpen=()=>!$("#coachPop").hidden;
const fullPop=()=>window.matchMedia("(max-width:720px)").matches;
function openPop(focusIn){ const p=$("#coachPop"), f=$("#coachFab"); p.hidden=false; p.setAttribute("aria-modal",String(fullPop())); f.setAttribute("aria-expanded","true"); f.setAttribute("aria-label","Fermer le coach IA"); document.documentElement.classList.add("cpop-on");
  const ok=gateState(); paint(); renderCfg(); if(focusIn!==false) setTimeout(()=>{ const i=$("#coachIn"); if(ok&&i&&!i.disabled) i.focus(); else $("#coachClose").focus(); },0); }
function closePop(){ const p=$("#coachPop"), f=$("#coachFab"); if(p.hidden) return; const back=p.contains(document.activeElement); p.hidden=true; f.setAttribute("aria-expanded","false"); f.setAttribute("aria-label","Ouvrir le coach IA"); document.documentElement.classList.remove("cpop-on"); if(back) f.focus(); }
const busyMsg=()=>{ $("#coachLive").textContent="Attends la réponse du coach (ou annule l'envoi) avant de changer de conversation."; if(!popOpen()) openPop(false); };
function openConv(id){ if(busy){ if(id!==store.cur) busyMsg(); else openPop(); return; } const c=store.convs.find(x=>x.id===id); if(!c) return; store.cur=id; hist=c.m; saveHist(false); openPop(); }
function newConv(){ if(busy){ busyMsg(); return; } store.cur=null; hist=[]; saveHist(false); const i=$("#coachIn"); if(i){ i.value=""; $("#coachCount").textContent="0 / "+MAX_IN; } openPop(); $("#coachLive").textContent="Nouvelle conversation."; }
function delConv(id){ if(busy&&id===store.cur) return; gone.add(id); store.convs=store.convs.filter(x=>x.id!==id); if(store.cur===id){ store.cur=null; hist=[]; } saveHist(false); if(popOpen()) paint(); $("#coachLive").textContent="Conversation supprimée."; }
function init(){
  const tab=$("#tab-coach"), panel=$("#p-coach"); if(!tab||!panel||!B) return;
  if(!URL_OK){ tab.hidden=true; panel.remove(); tab.remove(); for(const id of ["#coachFab","#coachPop"]){ const x=$(id); if(x) x.remove(); } return; }   // non configuré : onglet caché, rien ne tourne
  tab.hidden=false; paint(); renderCfg(); renderConvs();
  const fab=$("#coachFab"); fab.hidden=false; document.documentElement.classList.add("cfab-on");
  fab.addEventListener("click",()=>popOpen()? closePop() : openPop());
  $("#coachClose").addEventListener("click",closePop);
  { const lg=$("#coachLogin"); if(lg) lg.addEventListener("click",closePop); }   // la feuille de connexion s'ouvre (data-act="login", app.js) ; la bulle se ferme
  document.addEventListener("keydown",e=>{ if(!popOpen()||document.querySelector(".sheet-bg")) return;
    if(e.key==="Escape"){ e.preventDefault(); closePop(); return; }
    if(e.key==="Tab"&&fullPop()){ const p=$("#coachPop"), f=[...p.querySelectorAll('button,textarea,input,select,a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&!x.hidden&&x.offsetParent!==null); if(!f.length) return;
      const a=document.activeElement, i=f.indexOf(a);
      if(!p.contains(a)||(e.shiftKey&&i===0)||(!e.shiftKey&&i===f.length-1)){ e.preventDefault(); (e.shiftKey? f[f.length-1] : f[0]).focus(); } } },true);   // phase de capture : une feuille ouverte est vue avant qu'Échap ne la ferme
  $("#coachNew").addEventListener("click",newConv); $("#coachNew2").addEventListener("click",newConv);
  $("#coachClearAll").addEventListener("click",()=>{ if(busy){ busyMsg(); return; } store={cur:null,convs:[]}; hist=[]; ls.del(K_HIST); renderConvs(); paint(); $("#coachLive").textContent="Toutes les conversations sont effacées."; });
  $("#coachConvs").addEventListener("click",e=>{ const d=e.target.closest("[data-delconv]"); if(d){ delConv(d.dataset.delconv); return; } const b=e.target.closest("[data-conv]"); if(b) openConv(b.dataset.conv); });
  { const nav=document.querySelector("nav.tabs"), seg=nav&&nav.querySelector(".segc");   // barre d'onglets défilante : indice visible (chevron) et onglet actif ramené à l'écran
    if(seg){ const more=()=>nav.classList.toggle("tabs-more",seg.scrollWidth>seg.clientWidth+2&&seg.scrollLeft+seg.clientWidth<seg.scrollWidth-2);
      seg.addEventListener("scroll",more,{passive:true}); window.addEventListener("resize",more); more(); setTimeout(more,300);
      seg.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[role=tab]"); if(b) setTimeout(()=>{ try{ b.scrollIntoView({inline:"nearest",block:"nearest"}); }catch(x){} more(); },0); }); } }
  tab.addEventListener("click",()=>gateState());
  $("#coachForm").addEventListener("submit",e=>{ e.preventDefault(); if(gateState()) send($("#coachIn").value); });
  $("#coachIn").addEventListener("keydown",e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); $("#coachForm").requestSubmit(); } });
  $("#coachIn").addEventListener("input",e=>{ $("#coachCount").textContent=e.target.value.length+" / "+MAX_IN; });
  $("#coachCancel").addEventListener("click",()=>{ userCancel=true; if(ctl) ctl.abort(); });
  $("#coachCfg").addEventListener("click",e=>consentSheet(e.currentTarget));
  $("#coachClear").addEventListener("click",()=>{ if(busy) return; delConv(store.cur); $("#coachLive").textContent="Conversation effacée."; });
  new MutationObserver(()=>{ if(!panel.hidden) gateState(); }).observe(panel,{attributes:true,attributeFilter:["hidden"]});
  window.addEventListener("storage",e=>{ if(e.storageArea!==localStorage) return; if(e.key===null||e.key===K_HIST&&e.newValue===null) wipe(); else if(e.key===K_HIST){
    // autre onglet : la liste suit, mais la conversation ouverte ici ne change pas (sauf si elle a été supprimée là-bas, hors envoi en cours)
    const d=loadStore(), mine=curConv(); store={cur:null,convs:d.convs};
    // conversation ouverte ici absente là-bas : supprimée dans l'autre onglet => on la quitte (sauf envoi en cours) ; seulement évincée (plus de 12) => on la garde
    for(const x of d.del) gone.add(x);
    if(mine){ const o=d.convs.find(c=>c.id===mine.id); if(o){ if(busy||mine.m.length>o.m.length) o.m=mine.m; store.cur=o.id; } else if(busy||!gone.has(mine.id)){ gone.delete(mine.id); store.convs.push(mine); store.cur=mine.id; } }
    hist=curConv()? curConv().m : []; renderConvs(); if(popOpen()&&!busy) paint(); } });
  window.addEventListener("pagehide",()=>{ if(ctl) ctl.abort(); });
}
window.CarnetCoach=Object.freeze({guard,renderMd,cleanReply,hookUrl,wipe,enabled:()=>!!URL_OK,COACH_V});
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
