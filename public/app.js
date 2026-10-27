if(top!==self){document.documentElement.hidden=true}
(function(){
"use strict";
const $ = s => document.querySelector(s);
// valeurs dynamiques posées par l'API CSSOM (autorisée par la CSP, contrairement à l'attribut style) : largeurs de barres et couleurs de variables
const DYN_SEL="[data-sw],[data-sbg],[data-scv]", SAFE_VAR=/^--[A-Za-z0-9-]{1,24}$/;
function dynOne(el){ const d=el.dataset;
  if(d.sw!==undefined){ const w=parseFloat(d.sw); if(isFinite(w)) el.style.width=Math.max(0,Math.min(100,w))+"%"; }
  if(d.sbg!==undefined&&SAFE_VAR.test(d.sbg)) el.style.background="var("+d.sbg+")";
  if(d.scv!==undefined&&SAFE_VAR.test(d.scv)) el.style.setProperty("--c","var("+d.scv+")"); }
function dynApply(root){ if(root.matches&&root.matches(DYN_SEL)) dynOne(root); root.querySelectorAll&&root.querySelectorAll(DYN_SEL).forEach(dynOne); }
new MutationObserver(ms=>{ for(const m of ms) for(const n of m.addedNodes) if(n.nodeType===1) dynApply(n); }).observe(document.documentElement,{childList:true,subtree:true});
dynApply(document);
const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const nz = v => v===0?0:v; // évite « -0 »
const fmt0 = n => nz(Math.round(n)).toLocaleString("fr-FR");
const fmt1 = n => nz(Math.round(n*10)/10).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1});

function nextMonday(){const d=new Date();const k=(8-d.getDay())%7||7;d.setDate(d.getDate()+k);return iso(d);}
// lundi de la semaine d'une date « aaaa-mm-jj » (même valeur si c'est déjà un lundi)
function todayIso(){ const t=new Date(); t.setHours(12,0,0,0); return iso(t); }
function raceOn(prof){ return prof&&(prof.objectif!=="forme"||evSport(prof.sport))&&okIso(prof.raceDate)&&prof.raceDate>=todayIso()? prof.raceDate : null; }
function addDays(isoD,n){ const d=new Date(isoD+"T12:00:00"); d.setDate(d.getDate()+n); return iso(d); }
// début effectif (lundi de la semaine du début) : avec une date de course, entre 51 et 3 semaines avant la semaine de course
function effStart(prof){ let st=prof&&prof.start? mondayOf(prof.start) : null; const r=raceOn(prof); if(!r) return st;
  const rm=mondayOf(r), lo=addDays(rm,-(N_MAX-1)*7), hi=addDays(rm,-3*7); if(!st) st=autoStart(r); return st<lo?lo: st>hi?hi: st; }
function autoStart(race){
  // le plan commence aujourd'hui ; course à plus d'un an : il commence 52 semaines avant
  const st=todayIso();
  const rm=new Date(mondayOf(race)+"T12:00:00"), sd=new Date(mondayOf(st)+"T12:00:00");
  const N=Math.round((rm-sd)/6048e5)+1;
  if(N>N_MAX){ const d=new Date(rm); d.setDate(d.getDate()-(N_MAX-1)*7); return iso(d); }
  if(N<4){ const d=new Date(rm); d.setDate(d.getDate()-3*7); return iso(d); }
  return st;
}
function mondayOf(v){ const d=new Date(String(v)+"T12:00:00"); if(isNaN(d))return v; d.setDate(d.getDate()-((d.getDay()+6)%7)); return iso(d); }
// date « aaaa-mm-jj » qui existe vraiment (« 2026-02-30 » est refusé)
const okIso=s=> typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(new Date(s+"T12:00:00"))===s;
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}

/*PURE14:start*/
/* ---------- v14 : import d'activités (Apple Santé, Polar Flow), tout en local ----------
   Aucune requête réseau, aucun XML interprété comme un document : les fichiers sont lus par tranches (le fichier entier n'est jamais en mémoire),
   et un tokeniseur ne retient que quelques balises (Workout, WorkoutStatistics, Record de poids et de FC de repos). DTD et entités sont ignorées.
   Les noms de source, de fichier, les métadonnées et les notes ne sont jamais lus : seules des valeurs numériques bornées et une date sont gardées. */
const IMP14=(function(){
  "use strict";
  const MAX_FILE=500*1024*1024, MAX_XML=8*1024*1024*1024, MAX_OUT=MAX_XML, MAX_TEXT=16*1024*1024, MAX_TEXT_ALL=128*1024*1024, CHUNK=4*1024*1024;   // MAX_FILE : archive, JSON, CSV, TCX ; MAX_XML : export.xml (lu en flux, jamais en mémoire) ; MAX_TEXT : par entrée JSON, CSV ou TCX
  const MAX_WORKOUTS=20000, MAX_KEEP=1500, MAX_WEEKS=260, MAX_ENTRIES=20000, MAX_ZIP_FILES=6000;
  const TYPES={course:"Course à pied",trail:"Trail",marche:"Marche",rando:"Randonnée",velo:"Vélo",vtt:"VTT",force:"Musculation et force",hiit:"HIIT et cross-training",natation:"Natation",rameur:"Rameur",elliptique:"Elliptique",mobilite:"Yoga et mobilité",autre:"Autre activité"};
  const err=(code,msg)=>Object.assign(new Error(msg||code),{code});
  const isoOk=s=>{ if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const y=+s.slice(0,4), m=+s.slice(5,7), d=+s.slice(8); const t=new Date(Date.UTC(y,m-1,d)); return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d; };
  const pad=n=>String(n).padStart(2,"0");
  const isoU=t=>t.getUTCFullYear()+"-"+pad(t.getUTCMonth()+1)+"-"+pad(t.getUTCDate());
  const addDaysIso=(s,n)=>{ const t=new Date(s+"T12:00:00Z"); t.setUTCDate(t.getUTCDate()+n); return isoU(t); };
  const mondayIso=s=>{ const t=new Date(s+"T12:00:00Z"); t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7)); return isoU(t); };
  const localToday=()=>{ const t=new Date(); return t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate()); };
  const num=v=>{ if(v==null||typeof v==="boolean") return NaN; if(typeof v==="string"){ v=v.trim(); if(v===""||v.length>24||!/^[-+]?\d*[.,]?\d+(?:[eE][-+]?\d+)?$/.test(v)) return NaN; v=v.replace(",","."); } const n=+v; return isFinite(n)?n:NaN; };
  // 2024-05-01 07:30:00 +0200 | 2024-05-01T07:30:00Z | 01-05-2024 | 01.05.2024 | 01/05/2024 (jour d'abord)
  function dateOf(s){
    if(typeof s!=="string") return null; s=s.trim().slice(0,40);
    let m=/^(\d{4})-(\d{2})-(\d{2})(?![\d])/.exec(s); if(m){ const d=m[1]+"-"+m[2]+"-"+m[3]; return isoOk(d)?d:null; }
    m=/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?![\d])/.exec(s); if(m){ const d=m[3]+"-"+pad(+m[2])+"-"+pad(+m[1]); return isoOk(d)?d:null; }
    return null;
  }
  // heure de début « HHMM » (0000 si le fichier n'en donne pas) : fait partie de la clé de dédoublonnage avec la distance
  function hmOf(s){ if(typeof s!=="string") return "0000"; const m=/(?:^|[T\s])(\d{1,2}):(\d{2})/.exec(s.slice(0,40)); if(!m||+m[1]>23||+m[2]>59) return "0000"; return pad(+m[1])+m[2]; }
  // durée en minutes : « PT1H3M44.2S », « 01:03:44 », « 63:44 », nombre de secondes
  function minutesOf(v,unit){
    if(typeof v==="number"){ return isFinite(v)? v/60 : NaN; }
    if(typeof v!=="string") return NaN; v=v.trim(); if(v.length>32) return NaN;
    let m=/^P(?:T)?(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:(\d{1,7}(?:\.\d+)?)S)?$/i.exec(v); if(m&&(m[1]||m[2]||m[3])) return (+(m[1]||0))*60+(+(m[2]||0))+(+(m[3]||0))/60;
    m=/^(\d{1,3}):(\d{2}):(\d{2}(?:[.,]\d+)?)$/.exec(v); if(m) return +m[1]*60+ +m[2]+ +m[3].replace(",",".")/60;
    m=/^(\d{1,4}):(\d{2}(?:[.,]\d+)?)$/.exec(v); if(m) return +m[1]+ +m[2].replace(",",".")/60;
    const n=num(v); if(isNaN(n)) return NaN; const u=String(unit||"").toLowerCase();
    return u==="sec"||u==="s"? n/60 : u==="hr"||u==="h"? n*60 : n;
  }
  function mkAct(date,type,min,km,kcal,fc,src,today,hm){
    if(!isoOk(date)||date<"2000-01-01"||date>addDaysIso(today,1)) return null;
    if(!Object.hasOwn(TYPES,type)) type="autre";
    min=+min; if(!(min>=1&&min<=1440)) return null; min=Math.round(min);
    km=+km; km= km>0&&km<=500? Math.round(km*10)/10 : 0;
    kcal=+kcal; kcal= kcal>0&&kcal<=20000? Math.round(kcal) : 0;
    fc=+fc; fc= fc>=30&&fc<=230? Math.round(fc) : null;
    return {date,type,min,hm:/^\d{4}$/.test(hm||"")?hm:"0000",km,kcal,fc,src};
  }
  const keyOf=a=>a.date+"|"+a.type+"|"+a.min+"|"+(a.hm||"0000")+"|"+Math.round((+a.km||0)*10);
  function newCtx(o){ o=o||{}; return {today:isoOk(o.today)?o.today:localToday(), acts:new Map(), wt:new Map(), rhr:new Map(), seen:0, bad:0, trunc:false, kinds:new Set(), out:0, text:0, lt:Date.now(), maxOut:o.maxOut||MAX_OUT, signal:o.signal||null, onProgress:o.onProgress||null, size:1, done:0, files:0}; }
  function aborted(ctx){ return !!(ctx.signal&&ctx.signal.aborted); }
  // rend la main au navigateur au moins toutes les 30 ms : l'interface reste fluide et « Annuler » répond
  async function tick(ctx){ if(Date.now()-ctx.lt>30){ await new Promise(r=>setTimeout(r,0)); ctx.lt=Date.now(); } if(aborted(ctx)) throw err("abort"); }
  async function runG(g,ctx){ for(;;){ const x=g.next(); if(x.done) return x.value; await tick(ctx); } }
  function runS(g){ for(;;){ const x=g.next(); if(x.done) return x.value; } }
  function addAct(ctx,a){ ctx.seen++; if(!a){ ctx.bad++; return; } if(ctx.acts.size>=MAX_WORKOUTS&&!ctx.acts.has(keyOf(a))){ ctx.trunc=true; return; } ctx.acts.set(keyOf(a),a); }
  function addWeight(ctx,date,kg){ if(!(kg>=35&&kg<=250)) { ctx.bad++; return; } const w=mondayIso(date); let o=ctx.wt.get(w); if(!o){ if(ctx.wt.size>=2000){ ctx.trunc=true; return; } o={sum:0,n:0,last:date}; ctx.wt.set(w,o); } o.sum+=kg; o.n++; if(date>o.last) o.last=date; }
  function addRhr(ctx,date,bpm){ if(!(bpm>=25&&bpm<=150)) { ctx.bad++; return; } const w=mondayIso(date); let o=ctx.rhr.get(w); if(!o){ if(ctx.rhr.size>=2000){ ctx.trunc=true; return; } o={sum:0,n:0}; ctx.rhr.set(w,o); } o.sum+=bpm; o.n++; }
  function progress(ctx,frac,label){ if(ctx.onProgress){ try{ ctx.onProgress(Math.max(0,Math.min(1,frac)),label||""); }catch(e){} } }

  /* ----- Apple Santé : export.xml lu en flux ----- */
  const APPLE_TYPE={Running:"course",Walking:"marche",Hiking:"rando",Cycling:"velo",HandCycling:"velo",TraditionalStrengthTraining:"force",FunctionalStrengthTraining:"force",CoreTraining:"force",CrossTraining:"hiit",HighIntensityIntervalTraining:"hiit",MixedCardio:"hiit",Swimming:"natation",Rowing:"rameur",Elliptical:"elliptique",Yoga:"mobilite",Pilates:"mobilite",Flexibility:"mobilite",MindAndBody:"mobilite",Barre:"mobilite",Stairs:"autre"};
  function attrs(seg){ const o=Object.create(null), re=/\s([A-Za-z_][\w:.-]*)="([^"]*)"/g; let m, n=0; while(n++<48&&(m=re.exec(seg))) o[m[1]]=m[2]; return o; }
  function kmOf(v,u){ v=num(v); if(isNaN(v)) return NaN; u=String(u||"km").toLowerCase(); return u==="mi"? v*1.609344 : u==="m"? v/1000 : u==="yd"? v*0.0009144 : u==="km"? v : NaN; }
  function kcalOf(v,u){ v=num(v); if(isNaN(v)) return NaN; u=String(u||"kcal"); return u==="kcal"||u==="Cal"? v : u==="kJ"? v/4.184 : u==="cal"? v/1000 : NaN; }
  function appleScanner(ctx){
    let carry="", wo=null, nWo=0;
    const TAG=/<(\/?Workout|WorkoutStatistics|Record)(?=[\s\/>])/g;
    function finishWo(){
      if(!wo) return; const a=wo.a; wo=null;
      const t=String(a.workoutActivityType||"").replace(/^HKWorkoutActivityType/,"");
      const type=Object.hasOwn(APPLE_TYPE,t)?APPLE_TYPE[t]:"autre";
      let dur=minutesOf(a.duration,a.durationUnit||"min"); if(isNaN(dur)) dur=NaN;
      let km=a.totalDistance!=null? kmOf(a.totalDistance,a.totalDistanceUnit) : NaN; if(isNaN(km)) km=this_dist;
      let kc=a.totalEnergyBurned!=null? kcalOf(a.totalEnergyBurned,a.totalEnergyBurnedUnit) : NaN; if(isNaN(kc)) kc=this_kc;
      addAct(ctx,mkAct(dateOf(a.startDate||a.creationDate||""),type,dur,isNaN(km)?0:km,isNaN(kc)?0:kc,this_hr,"apple",ctx.today,hmOf(a.startDate||a.creationDate||"")));
    }
    let this_dist=NaN, this_kc=NaN, this_hr=NaN;
    const open=a=>{ wo={a}; this_dist=NaN; this_kc=NaN; this_hr=NaN; };
    let gt=-1;   // dernier « > » trouvé : valable tant qu'il est après la position courante (aucun autre « > » entre les deux)
    function feed(chunk,final){
      let s=carry+chunk; carry=""; TAG.lastIndex=0; gt=-1; let m;
      while((m=TAG.exec(s))){
        const p=m.index; let e= gt>=p? gt : (gt=s.indexOf(">",p));
        // pas de « > » après cette balise : il n'y en a pas non plus après les suivantes. On garde au plus les 16 Ko de fin pour la tranche suivante (jamais de relecture : lecture linéaire)
        if(e<0){ if(!final) carry=s.slice(Math.max(p,s.length-16384)); break; }
        TAG.lastIndex=e+1;   // la balise est consommée : un « <Record » à l'intérieur d'une autre balise n'est pas relu
        if(e-p>16384) continue;
        const name=m[1];
        if(name==="Record"){
          if(wo) finishWo();
          const seg=s.substring(p,e), bm=seg.indexOf('type="HKQuantityTypeIdentifierBodyMass"')>0, rh=!bm&&seg.indexOf('type="HKQuantityTypeIdentifierRestingHeartRate"')>0;
          if(!bm&&!rh) continue;
          const a=attrs(seg), d=dateOf(a.startDate||a.creationDate||""); ctx.seen++;
          if(!d||d<"2000-01-01"||d>addDaysIso(ctx.today,1)){ ctx.bad++; continue; }
          let v=num(a.value);
          if(bm){ const u=String(a.unit||"kg").toLowerCase(); v= u==="kg"? v : u==="lb"? v*0.45359237 : u==="g"? v/1000 : NaN; if(isNaN(v)){ ctx.bad++; continue; } addWeight(ctx,d,v); }
          else { if(isNaN(v)){ ctx.bad++; continue; } addRhr(ctx,d,v); }
        } else if(name==="Workout"){
          if(wo) finishWo();
          if(nWo>=MAX_WORKOUTS){ ctx.trunc=true; continue; } nWo++;
          open(attrs(s.substring(p,e))); if(s.charCodeAt(e-1)===47) finishWo();
        } else if(name==="/Workout"){ finishWo(); }
        else if(name==="WorkoutStatistics"){
          if(!wo) continue; const a=attrs(s.substring(p,e)), t=String(a.type||"");
          if(t==="HKQuantityTypeIdentifierHeartRate"){ const v=num(a.average); if(!isNaN(v)) this_hr=v; }
          else if(t==="HKQuantityTypeIdentifierDistanceWalkingRunning"||t==="HKQuantityTypeIdentifierDistanceCycling"||t==="HKQuantityTypeIdentifierDistanceSwimming"){ const v=kmOf(a.sum,a.unit); if(!isNaN(v)) this_dist=(isNaN(this_dist)?0:this_dist)+v; }
          else if(t==="HKQuantityTypeIdentifierActiveEnergyBurned"){ const v=kcalOf(a.sum,a.unit); if(!isNaN(v)) this_kc=v; }
        }
      }
      if(final){ finishWo(); }
    }
    return {feed};
  }

  /* ----- Polar Flow : TCX, CSV, JSON ----- */
  const POLAR_SPORT=[[/TRAIL/,"trail"],[/MOUNTAIN|MTB|OFFROAD/,"vtt"],[/BIK|CYCL/,"velo"],[/RUN|JOG/,"course"],[/HIK|TREK/,"rando"],[/WALK|NORDIC/,"marche"],[/STRENGTH|WEIGHT|GYM|FUNCTIONAL|CROSSFIT|CROSS_TRAIN/,"force"],[/HIIT|INTERVAL|AEROBIC|CIRCUIT/,"hiit"],[/SWIM/,"natation"],[/ROW/,"rameur"],[/ELLIPT/,"elliptique"],[/YOGA|PILATES|STRETCH|MOBIL|FLEX/,"mobilite"]];
  function polarType(s){ s=String(s||"").toUpperCase().replace(/[^A-Z0-9]+/g,"_").slice(0,60); for(const [re,t] of POLAR_SPORT) if(re.test(s)) return t; return "autre"; }
  function* parseTcxG(text,ctx){
    // seules les balises de niveau « tour » sont lues ; les points GPS (<Track>) sont sautés sans être analysés
    const RE=/<(Activity|\/Activity|Lap|\/Lap|Track|TotalTimeSeconds|DistanceMeters|Calories|AverageHeartRateBpm|\/AverageHeartRateBpm|Value|Id)\b([^<>]{0,300})>/g;   // jamais de « < » dans les attributs : un candidat sans « > » est écarté en quelques caractères (lecture linéaire)
    let m, act=null, lap=null, inHr=false, id="", n=0;
    const fin=()=>{ if(!act) return; if(act.min>0) addAct(ctx,mkAct(act.date||dateOf(id),polarType(act.sport),act.min,act.m/1000,act.kc,act.hrN? act.hrS/act.hrN : NaN,"polar",ctx.today,act.hm||hmOf(id))); act=null; };
    const txt=(i)=>{ const j=text.indexOf("<",i); return j<0||j-i>40? "" : text.slice(i,j); };
    while((m=RE.exec(text))){
      if(++n>400000) break; if((n&4095)===0) yield;
      const t=m[1], end=m.index+m[0].length;
      if(t==="Track"){ const j=text.indexOf("</Track>",end); if(j<0) break; RE.lastIndex=j+8; continue; }
      if(t==="Activity"){ fin(); const sp=/Sport="([^"]{0,40})"/.exec(m[2]); act={sport:sp?sp[1]:"",min:0,m:0,kc:0,hrS:0,hrN:0,date:null}; id=""; }
      else if(t==="/Activity") fin();
      else if(t==="Id"&&act&&!id){ id=txt(end); }
      else if(t==="Lap"){ lap=true; const st=/StartTime="([^"]{0,40})"/.exec(m[2]); if(act&&!act.date&&st){ act.date=dateOf(st[1]); act.hm=hmOf(st[1]); } }
      else if(t==="/Lap") lap=null;
      else if(!act||!lap) continue;
      else if(t==="TotalTimeSeconds"){ const v=num(txt(end)); if(v>=0&&v<=86400) act.min+=v/60; }
      else if(t==="DistanceMeters"){ const v=num(txt(end)); if(v>=0&&v<=5e5) act.m+=v; }
      else if(t==="Calories"){ const v=num(txt(end)); if(v>=0&&v<=20000) act.kc+=v; }
      else if(t==="AverageHeartRateBpm") inHr=true;
      else if(t==="/AverageHeartRateBpm") inHr=false;
      else if(t==="Value"&&inHr){ const v=num(txt(end)); if(v>=30&&v<=230){ act.hrS+=v; act.hrN++; } }
    }
    fin();
  }
  const parseTcx=(text,ctx)=>runS(parseTcxG(text,ctx));
  function splitCsv(line,sep){ const out=[]; let cur="", q=false; for(let i=0;i<line.length&&out.length<80;i++){ const c=line[i]; if(q){ if(c==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=c; } else if(c==='"') q=true; else if(c===sep){ out.push(cur); cur=""; } else cur+=c; } out.push(cur); return out; }
  function* parseCsvG(text,ctx){
    if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
    const lines=text.split(/\r?\n/, 200000); let hi=-1;
    for(let i=0;i<Math.min(lines.length,5);i++){ const l=lines[i].toLowerCase(); if(l.includes("sport")&&l.includes("duration")&&l.includes("date")){ hi=i; break; } }
    if(hi<0) return false;
    const sep=lines[hi].split(";").length>lines[hi].split(",").length?";":",";
    const H=splitCsv(lines[hi],sep).map(h=>h.trim().toLowerCase());
    const ix=f=>H.findIndex(f), iS=ix(h=>h==="sport"), iD=ix(h=>h==="date"), iDu=ix(h=>h==="duration"), iDi=ix(h=>h.startsWith("total distance")), iH=ix(h=>h.startsWith("average heart rate")), iK=ix(h=>h==="calories"), iT=ix(h=>h==="start time");
    if(iS<0||iD<0||iDu<0) return false;
    for(let i=hi+1;i<lines.length;i++){ if((i&8191)===0) yield; const l=lines[i]; if(!l.trim()) { if(i>hi+1) break; continue; }
      const c=splitCsv(l,sep); let km=iDi>=0? num(c[iDi]) : 0; if(iDi>=0&&/\(m\)|meters/.test(H[iDi])) km=km/1000;
      addAct(ctx,mkAct(dateOf(c[iD]||""),polarType(c[iS]),minutesOf((c[iDu]||"").trim()),isNaN(km)?0:km,iK>=0?num(c[iK]):0,iH>=0?num(c[iH]):NaN,"polar",ctx.today,iT>=0?hmOf(String(c[iT]||"").trim()):"0000")); }
    return true;
  }
  const parseCsv=(text,ctx)=>runS(parseCsvG(text,ctx));
  function parseJson(text,ctx){
    let o; try{ o=JSON.parse(text); }catch(e){ return false; }   // sans « reviver » (30 fois plus lent) : le code lit avec Object.hasOwn et ne copie jamais d'objet, aucune pollution possible
    let found=false, nodes=0;
    const g=(x,...ks)=>{ for(const k of ks){ if(x&&typeof x==="object"&&Object.hasOwn(x,k)&&x[k]!=null) return x[k]; } return undefined; };
    const one=x=>{
      const start=g(x,"startTime","start_time","startDate","dateTime","date");
      let min=NaN; const d1=g(x,"duration","durationSeconds"), d2=g(x,"durationMillis");
      if(d2!==undefined) min=num(d2)/60000; else if(d1!==undefined) min=minutesOf(d1);
      if(isNaN(min)) return false;
      let dm=num(g(x,"distanceMeters","distance")); if(isNaN(dm)) dm=0;
      const hrO=g(x,"heartRate","heart_rate"), hr=num(hrO&&typeof hrO==="object"? g(hrO,"avg","average") : g(x,"heartRateAvg","averageHeartRate","avgHeartRate"));
      addAct(ctx,mkAct(dateOf(String(start||"")),polarType(g(x,"sport","sportName","detailedSport")),min,dm/1000,num(g(x,"kiloCalories","calories")),hr,"polar",ctx.today,hmOf(String(start||"")))); found=true; return true; };
    const walk=(x,depth)=>{
      if(++nodes>200000||depth>6||!x||typeof x!=="object") return;
      if(Array.isArray(x)){ for(const y of x.slice(0,MAX_ENTRIES)) walk(y,depth+1); return; }
      const ex=g(x,"exercises");
      if(Array.isArray(ex)){ for(const y of ex.slice(0,200)) if(y&&typeof y==="object") one(y); return; }
      if(!one(x)) for(const k of ["trainingSessions","sessions","trainings","items","data"]) if(Object.hasOwn(x,k)) walk(x[k],depth+1);
    };
    walk(o,0); return found;
  }

  /* ----- lecture par tranches, zip minimal ----- */
  const u32=(v,o)=>v.getUint32(o,true), u16=(v,o)=>v.getUint16(o,true);
  const readBytes=async(file,a,b)=> new Uint8Array(await file.slice(a,b).arrayBuffer());
  async function zipEntries(file){
    const size=file.size; if(size<22) throw err("badzip");
    const tailLen=Math.min(size,65536+22+64), tail=await readBytes(file,size-tailLen,size), tv=new DataView(tail.buffer);
    let eo=-1; for(let i=tail.length-22;i>=0;i--) if(u32(tv,i)===0x06054b50){ eo=i; break; }
    if(eo<0) throw err("badzip");
    let count=u16(tv,eo+10), cdSize=u32(tv,eo+12), cdOff=u32(tv,eo+16);
    if(count===0xFFFF||cdSize===0xFFFFFFFF||cdOff===0xFFFFFFFF){
      if(eo<20||u32(tv,eo-20)!==0x07064b50) throw err("badzip");
      const z64=u32(tv,eo-12)+u32(tv,eo-8)*4294967296; const b=await readBytes(file,z64,z64+56), bv=new DataView(b.buffer);
      if(b.length<56||u32(bv,0)!==0x06064b50) throw err("badzip");
      count=u32(bv,32)+u32(bv,36)*4294967296; cdSize=u32(bv,40)+u32(bv,44)*4294967296; cdOff=u32(bv,48)+u32(bv,52)*4294967296;
    }
    if(cdSize>64*1024*1024||cdOff+cdSize>size||count>MAX_ZIP_FILES*8) throw err("badzip");
    const cd=await readBytes(file,cdOff,cdOff+cdSize), v=new DataView(cd.buffer), out=[]; let p=0;
    for(let i=0;i<count&&p+46<=cd.length;i++){
      if(u32(v,p)!==0x02014b50) throw err("badzip");
      const flags=u16(v,p+8), method=u16(v,p+10); let csize=u32(v,p+20), usize=u32(v,p+24); const nl=u16(v,p+28), el=u16(v,p+30), cl=u16(v,p+32); let off=u32(v,p+42);
      if(p+46+nl+el>cd.length) throw err("badzip");
      const name=new TextDecoder("utf-8").decode(cd.subarray(p+46,p+46+nl));
      if(csize===0xFFFFFFFF||usize===0xFFFFFFFF||off===0xFFFFFFFF){
        let q=p+46+nl; const qe=q+el;
        while(q+4<=qe){ const id=u16(v,q), sz=u16(v,q+2); if(id===1){ let r=q+4; if(usize===0xFFFFFFFF&&r+8<=qe){ usize=u32(v,r)+u32(v,r+4)*4294967296; r+=8; } if(csize===0xFFFFFFFF&&r+8<=qe){ csize=u32(v,r)+u32(v,r+4)*4294967296; r+=8; } if(off===0xFFFFFFFF&&r+8<=qe){ off=u32(v,r)+u32(v,r+4)*4294967296; } } q+=4+sz; }
      }
      out.push({name,flags,method,csize,usize,off,nl,el}); p+=46+nl+el+cl;
    }
    // plages [début de l'en-tête local, fin des données] : aucune entrée ne doit en recouvrir une autre (archives « qui se recouvrent » : une même donnée lue des milliers de fois)
    const rg=out.map(x=>[x.off,x.off+30+x.name.length+x.csize]).sort((a,b)=>a[0]-b[0]);
    for(let i=1;i<rg.length;i++) if(rg[i][0]<rg[i-1][1]) throw err("badzip");
    return out;
  }
  async function dataStart(file,ent){ const h=await readBytes(file,ent.off,ent.off+30); const v=new DataView(h.buffer); if(h.length<30||u32(v,0)!==0x04034b50) throw err("badzip"); return ent.off+30+u16(v,26)+u16(v,28); }
  // lit une entrée par tranches ; sink reçoit des Uint8Array ; l'entrée n'est jamais décompressée plus que « limit » octets
  async function readEntry(file,ent,sink,ctx,limit){
    // petite entrée : en-tête local et données lus d'un seul coup (des milliers de petits fichiers dans une archive Polar)
    let start, pre=null;
    if(ent.csize<=65536){ const h=await readBytes(file,ent.off,Math.min(file.size,ent.off+30+ent.nl+ent.el+1024+ent.csize)), hv=new DataView(h.buffer); if(h.length<30||u32(hv,0)!==0x04034b50) throw err("badzip");
      start=ent.off+30+u16(hv,26)+u16(hv,28); const rel=start-ent.off; if(rel+ent.csize<=h.length) pre=h.subarray(rel,rel+ent.csize); }
    else start=await dataStart(file,ent);
    if(start+ent.csize>file.size) throw err("badzip");
    // plafonds : octets décompressés au total, par entrée, et rapport de compression (un export réel reste sous 100 pour 1)
    let got=0; const take=u8=>{ got+=u8.length; ctx.out+=u8.length; if(got>limit) throw err(limit>=MAX_XML?"xmlbig":"skip"); if(ctx.out>ctx.maxOut) throw err("bomb"); if((got>64*1024*1024&&got>ent.csize*200)||(ctx.out>64*1024*1024&&ctx.out>(ctx.done+ent.csize)*200)) throw err("bomb"); /* rapport de compression : par entrée et sur l'ensemble de l'archive (un vrai export reste sous 30 pour 1) */ sink(u8); };
    if(ent.method===0&&pre){ take(pre); ctx.done+=pre.length; progress(ctx,ctx.done/ctx.size); await tick(ctx); return; }
    if(ent.method===0){ for(let pos=0;pos<ent.csize;pos+=CHUNK){ if(aborted(ctx)) throw err("abort"); take(await readBytes(file,start+pos,start+Math.min(ent.csize,pos+CHUNK))); ctx.done+=Math.min(CHUNK,ent.csize-pos); progress(ctx,ctx.done/ctx.size); await tick(ctx); } return; }
    if(ent.method!==8) throw err("skip");
    if(typeof DecompressionStream==="undefined") throw err("nozip");
    let pos=0;
    const src=new ReadableStream({async pull(c){ if(aborted(ctx)){ c.error(err("abort")); return; } if(pos>=ent.csize){ c.close(); return; } const n=Math.min(1<<20,ent.csize-pos); const u8= pre? pre : new Uint8Array(await file.slice(start+pos,start+pos+n).arrayBuffer()); pos+= pre? ent.csize : n; ctx.done+=u8.length; c.enqueue(u8); }});
    const rd=src.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    try{ for(;;){ const r=await rd.read(); if(r.done) break; take(r.value); progress(ctx,ctx.done/ctx.size); await tick(ctx); } }
    catch(e){ try{ await rd.cancel(); }catch(_){} if(e&&e.code) throw e; throw err("badzip"); }
  }
  const baseName=n=>String(n).replace(/\\/g,"/").split("/").pop().toLowerCase();
  const okName=n=>{ n=String(n).replace(/\\/g,"/"); if(n.length>300||n.includes("\0")||n.startsWith("__MACOSX/")||n.includes("/__MACOSX/")||/(^|\/)\.\.(\/|$)/.test(n)||n.endsWith("/")) return null;
    const b=baseName(n); if(/(^|\/)(workout-routes|electrocardiograms|clinical-records)\//i.test(n)) return null;
    if(b==="export.xml") return "apple"; if(/\.(json|csv|tcx)$/.test(b)) return b.slice(b.lastIndexOf(".")+1); return null; };

  async function textOfEntry(file,ent,ctx,limit){ const parts=[]; let tot=0; await readEntry(file,ent,u8=>{ tot+=u8.length; parts.push(u8); },ctx,limit);
    const dec=new TextDecoder("utf-8"); let s=""; for(let i=0;i<parts.length;i++) s+=dec.decode(parts[i],{stream:i<parts.length-1}); return s; }
  async function feedPlainXml(file,scan,ctx){
    const dec=new TextDecoder("utf-8"); ctx.size=file.size||1;
    for(let pos=0;pos<file.size;pos+=CHUNK){ if(aborted(ctx)) throw err("abort"); const u8=await readBytes(file,pos,Math.min(file.size,pos+CHUNK)); scan.feed(dec.decode(u8,{stream:true}),false); ctx.done=pos+u8.length; progress(ctx,ctx.done/ctx.size); await tick(ctx); }
    scan.feed(dec.decode(),true);
  }
  async function sniff(file){ const head=await readBytes(file,0,Math.min(file.size,65536)); if(head.length>=4&&head[0]===0x50&&head[1]===0x4b&&(head[2]===3||head[2]===5)) return {kind:"zip"};
    let s=new TextDecoder("utf-8").decode(head); if(s.charCodeAt(0)===0xFEFF) s=s.slice(1); const t=s.trimStart();
    if(t.startsWith("<")){ if(/<HealthData[\s>]/.test(s)) return {kind:"apple"}; if(/<TrainingCenterDatabase[\s>]/.test(s)) return {kind:"tcx"}; if(/<gpx[\s>]/.test(s)) return {kind:"gpx"}; return {kind:"xml"}; }
    if(t.startsWith("{")||t.startsWith("[")) return {kind:"json"};
    const l=t.split(/\r?\n/,3).join("\n").toLowerCase(); if(l.includes("sport")&&l.includes("duration")&&l.includes("date")) return {kind:"csv"};
    return {kind:"unknown"}; }

  async function parseFile(file,o){
    const ctx=newCtx(o); if(!file||typeof file.size!=="number"||typeof file.slice!=="function") throw err("unknown");
    if(file.size===0) throw err("empty");
    if(file.size>MAX_XML) throw err("xmlbig");
    ctx.size=file.size; const sn=await sniff(file);
    if(sn.kind!=="apple"&&file.size>MAX_FILE) throw err("toobig");   // seul export.xml (lu en flux) peut dépasser 500 Mo
    if(sn.kind==="apple"){ const sc=appleScanner(ctx); await feedPlainXml(file,sc,ctx); ctx.kinds.add("apple"); }
    else if(sn.kind==="tcx"||sn.kind==="json"||sn.kind==="csv"){
      if(file.size>MAX_TEXT) throw err("textbig"); const text=new TextDecoder("utf-8").decode(await readBytes(file,0,file.size)); ctx.done=file.size; progress(ctx,1); await tick(ctx);
      let okp; if(sn.kind==="tcx"){ await runG(parseTcxG(text,ctx),ctx); okp=true; } else if(sn.kind==="json") okp=parseJson(text,ctx); else okp=await runG(parseCsvG(text,ctx),ctx);
      if(!okp) throw err("unknown"); ctx.kinds.add("polar");
    }
    else if(sn.kind==="zip"){
      const ents=await zipEntries(file); let any=false, nf=0;
      for(const ent of ents){ if(aborted(ctx)) throw err("abort"); const kind=okName(ent.name); if(!kind) continue; if(ent.flags&1) { ctx.encrypted=true; continue; } if(++nf>MAX_ZIP_FILES){ ctx.trunc=true; break; }
        if(kind!=="apple"&&ctx.text>MAX_TEXT_ALL){ ctx.trunc=true; break; }   // texte cumulé : 128 Mo au plus
        try{
          if(kind==="apple"){ any=true; const sc=appleScanner(ctx), dec=new TextDecoder("utf-8"); await readEntry(file,ent,u8=>sc.feed(dec.decode(u8,{stream:true}),false),ctx,MAX_XML); sc.feed(dec.decode(),true); ctx.kinds.add("apple"); }
          else { const text=await textOfEntry(file,ent,ctx,MAX_TEXT); ctx.text+=text.length; let okp=false; if(kind==="tcx") { await runG(parseTcxG(text,ctx),ctx); okp=true; } else if(kind==="json") okp=parseJson(text,ctx); else okp=await runG(parseCsvG(text,ctx),ctx); if(okp){ any=true; ctx.kinds.add("polar"); } }
        }catch(e){ if(e&&(e.code==="bomb"||e.code==="abort"||e.code==="nozip"||e.code==="xmlbig")) throw e; ctx.skipped=(ctx.skipped||0)+1; }
        await tick(ctx); }
      if(!any&&!ctx.acts.size&&!ctx.wt.size&&!ctx.rhr.size) throw err("unknown");
    }
    else if(sn.kind==="gpx") throw err("gpx");
    else throw err("unknown");
    return finish(ctx);
  }
  function finish(ctx){
    const all=[...ctx.acts.values()].sort((a,b)=> a.date<b.date?1:a.date>b.date?-1: a.type<b.type?-1:1);
    let acts=all; if(acts.length>MAX_KEEP){ acts=acts.slice(0,MAX_KEEP); ctx.trunc=true; }
    const weeks=[...ctx.wt.entries()].map(([w,o])=>({week:w,date:o.last,kg:Math.round(o.sum/o.n*10)/10,n:o.n})).filter(x=>x.kg>=35&&x.kg<=250).sort((a,b)=>a.week<b.week?1:-1);
    const rhr=[...ctx.rhr.entries()].map(([w,o])=>({week:w,bpm:Math.round(o.sum/o.n)})).filter(x=>x.bpm>=25&&x.bpm<=150).sort((a,b)=>a.week<b.week?1:-1);
    if(weeks.length>MAX_WEEKS){ weeks.length=MAX_WEEKS; ctx.trunc=true; } if(rhr.length>MAX_WEEKS){ rhr.length=MAX_WEEKS; ctx.trunc=true; }
    if(!acts.length&&!weeks.length&&!rhr.length) throw err("none");
    return {kinds:[...ctx.kinds], acts, weeks, rhr, seen:ctx.seen, bad:ctx.bad, trunc:ctx.trunc, skipped:ctx.skipped||0, encrypted:!!ctx.encrypted};
  }
  return {parseFile, TYPES, dateOf, minutesOf, mkAct, keyOf, hmOf, isoOk, mondayIso, addDaysIso, MAX_FILE, MAX_XML, MAX_TEXT, MAX_KEEP, MAX_WEEKS,
    // pour les tests : analyse de texte direct
    _apple:(text,o)=>{ const ctx=newCtx(o), sc=appleScanner(ctx); sc.feed(text,true); return finish(ctx); },
    _tcx:(text,o)=>{ const ctx=newCtx(o); parseTcx(text,ctx); return finish(ctx); },
    _csv:(text,o)=>{ const ctx=newCtx(o); if(!parseCsv(text,ctx)) throw err("unknown"); return finish(ctx); },
    _json:(text,o)=>{ const ctx=newCtx(o); if(!parseJson(text,ctx)) throw err("unknown"); return finish(ctx); }};
})();
/*PURE14:end*/

const EXAMPLE = {sexe:"H",age:32,taille:178,poids:82,cible:76,mg:"",activite:"1.25",niveau:"int",objectif:"10",volume:20,longest:10,ref:"none",refVal:"",fcmax:"",seances:"4",renfo:"2",longDay:"6",start:todayIso(),deficit:300,bonus:100,adj:0,lieu:"dehors",equip:"salle",types:["seuil","vma","cotes","fartlek","ld"],cross:"non",sport:"course",sObj:"",hSem:"",cplx:"standard",pref:"",evalOn:"0",debRun:"",evalFrom:"",renfoMin:"",hQuota:""};

let state = {profile:{...EXAMPLE}, isExample:true, log:[], week:1, feel:{}, acts:{}, rhr:{}};
let save = ()=>{};

/* ---------- calculs ---------- */
function parseTime(s){const p=String(s).trim().split(":").map(Number);if(p.some(isNaN))return null;let t=0;for(const x of p)t=t*60+x;return p.length===3?t/60:t/60;} // minutes
// chrono en minutes : « 25:30 », « 25'30 », « 25.30 », « 25 » (minutes), « 1:05:00 », « 1h05 » ; « 1:05 » en 10 km = h:mm
function chronoMin(s,km){
  const t=String(s||"").trim().replace(/\s+/g,"").replace(/(min|mn|s|"|″)$/i,"");
  if(!t) return null;
  const parts=t.split(/[:'’′.,h]+/i).filter(x=>x!=="").map(Number);
  if(!parts.length||parts.length>3||parts.some(isNaN)) return null;
  if(parts.slice(1).some(x=>x>=60)) return null;   // minutes ou secondes à 60 ou plus : chrono mal écrit
  if(parts.length===1) return parts[0];
  if(parts.length===2) return (km>=10&&parts[0]<3) || /h/i.test(t) ? parts[0]*60+parts[1] : parts[0]+parts[1]/60;
  return parts[0]*60+parts[1]+parts[2]/60;
}
function vmaOf(p){
  const raw=String(p.refVal||"").trim(), v = raw.replace(",",".");
  // bad : "format" (illisible) ou "range" (lisible mais hors de 7 à 25 km/h, valeur dans badVma)
  let bad=false, badVma=null;
  if(p.ref==="vma"){ if(v!==""&&!isNaN(+v)){ if(+v>=7&&+v<=25) return {vma:+v,src:"ta VMA"}; bad="range"; badVma=+v; } else bad=raw!==""?"format":false; }
  if(p.ref==="5"||p.ref==="10"){
    const km=+p.ref, min=chronoMin(raw,km);
    if(min>0){ const speed=km/(min/60), frac= km===5?0.93:0.89, vma=speed/frac; if(vma>=7&&vma<=25) return {vma,src:"ton chrono "+km+" km"}; bad="range"; badVma=vma; }
    else bad=raw!==""?"format":false;
  }
  const def={deb:10.5,int:13,conf:15.5}[p.niveau]||13;
  return {vma:def,src:"une valeur type de ton niveau",estimated:true,bad,badVma};
}
function pace(speed){if(!speed)return "";const m=60/speed;let mm=Math.floor(m),ss=Math.round((m-mm)*60);if(ss===60){mm++;ss=0;}return mm+"'"+String(ss).padStart(2,"0")+"/km";}
function paceRange(vma,lo,hi){return pace(vma*hi)+" – "+pace(vma*lo).replace("/km","")+"";}
function kmh(vma,lo,hi){return fmt1(vma*lo)+" à "+fmt1(vma*hi)+" km/h";}
function paceRangeTxt(vma,lo,hi){const a=pace(vma*hi),b=pace(vma*lo);return a.replace("/km","")+" à "+b;}

const BOUNDS={age:[15,90],taille:[130,220],poids:[35,250],cible:[35,250],volume:[0,200],longest:[0,60],mg:[5,55],fcmax:[140,220],adj:[-300,500],deficit:[0,500],bonus:[0,200],hSem:[0,25],renfoMin:[20,120],hQuota:[1,25]};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const numOf=v=> v===""||v==null? NaN : +String(v).trim().replace(",",".");
const bound=(k,v)=> isNaN(v)? v : Math.max(BOUNDS[k][0],Math.min(BOUNDS[k][1],v));
function profileNums(p){
  const n={...p};
  for(const k of Object.keys(BOUNDS)) n[k]= bound(k,numOf(p[k]));
  if(!Object.hasOwn(OBJ,n.objectif)) n.objectif=EXAMPLE.objectif;
  // sport principal : hors course et trail, le plan est construit par buildSportPlan (l'objectif de course est mis de côté)
  n.sport=SPORTS.includes(p.sport)?p.sport:"course"; n.sObj= n.sport==="vtt"? (["court","moyen","long"].includes(p.sObj)?p.sObj:"moyen") : n.sport==="force"? (["ppl","oly"].includes(p.sObj)?p.sObj:"ppl") : "";
  if(isNaN(n.hSem)||(n.sport!=="vtt"&&n.sport!=="forme")) n.hSem=0;
  if(evSport(n.sport)){ n.runObjectif=n.objectif; n.objectif="forme"; }
  if(!["deb","int","conf"].includes(n.niveau)) n.niveau=EXAMPLE.niveau;
  if(n.sexe!=="F") n.sexe="H";
  n.lieu=["dehors","tapis","mixte"].includes(p.lieu)?p.lieu:"dehors"; n.equip=["salle","maison","aucun"].includes(p.equip)?p.equip:"salle"; n.cross=Object.hasOwn(CROSS,p.cross)?p.cross:"non"; n.types=Array.isArray(p.types)?p.types.filter(t=>EXAMPLE.types.includes(t)):EXAMPLE.types;
  n.minor=n.age<18;
  // séances de test en début de plan (case du profil) ; minutes de course continue notées au test du débutant (0 : pas de résultat appliqué)
  n.evalOn= p.evalOn==="1"||p.evalOn===1||p.evalOn===true? 1 : 0;
  { const r=numOf(p.debRun); n.debRun= r>=0&&r<=60? Math.round(r) : 0; }
  // complexité du plan : simple (une seule séance d'intensité, renforcement de base), standard, avancé (séances plus fournies, jamais pour un débutant)
  n.cplx=["simple","standard","avance"].includes(p.cplx)?p.cplx:"standard";
  // préférences de séances en texte libre : envoyées à l'IA (ajustement du plan) ; sans IA, seuls quelques motifs simples et sûrs s'appliquent (prefParse)
  n.pref=prefClean(p.pref).replace(/\s+/g," ").trim(); n.prefK=prefParse(n.pref);
  n.seances=+p.seances; n.renfo=+p.renfo; n.longDay=+p.longDay; n.activite=+p.activite;
  if(![3,4,5,6].includes(n.seances)) n.seances=4;
  if(![0,1,2].includes(n.renfo)) n.renfo=2;
  if(n.longDay!==5) n.longDay=6;
  // date de course : fixe la fin du plan (semaine de course) et sa longueur
  n.nWeeks=0; n.raceIdx=null;
  // jour du début dans la première semaine (0 = lundi) ; ignoré si le début a été recalé par la date de course
  n.startIdx=0;
  if(okIso(p.start)&&mondayOf(p.start)===effStart(p)) n.startIdx=(new Date(p.start+"T12:00:00").getDay()+6)%7;
  if(raceOn(p)){
    const r=new Date(p.raceDate+"T12:00:00"), s0=new Date(effStart(p)+"T12:00:00");
    if(!isNaN(r)&&!isNaN(s0)){ const N=Math.round((new Date(mondayOf(p.raceDate)+"T12:00:00")-s0)/6048e5)+1;
      n.nWeeks=Math.min(N_MAX,Math.max(N_MIN,N)); n.raceIdx=(r.getDay()+6)%7;
      if(n.raceIdx>=5) n.longDay=n.raceIdx; }
  }
  if(!(n.activite>=1.1&&n.activite<=2)) n.activite=1.25;
  if(isNaN(n.deficit)) n.deficit = 300;
  n.deficit=Math.max(0,Math.min(500,n.deficit));
  if(isNaN(n.bonus)) n.bonus=100; n.bonus=Math.max(0,Math.min(200,n.bonus));
  if(n.niveau==="deb") n.seances=Math.min(n.seances,4);
  // temps choisi : durée de chaque renforcement (par pas de 5 min ; une heure au plus pour un débutant), quota d'heures de sport par semaine
  n.renfoMin= n.renfoMin>0? Math.min(n.niveau==="deb"?60:120,Math.round(n.renfoMin/5)*5) : 0; n.hQuota= n.hQuota>0? n.hQuota : 0;
  if(n.sport==="force") n.seances=Math.max(3,Math.min(5,n.seances));
  if(isNaN(n.adj)) n.adj=0;
  // profil enregistré incomplet : les valeurs d'exemple servent au calcul, le bandeau le signale
  n.incomplete=false;
  for(const k of ["age","taille","poids"]) if(isNaN(n[k])){ n[k]=EXAMPLE[k]; n.incomplete=true; }
  return n;
}

const OBJ = {forme:{cap:15,label:"Forme"},5:{cap:12,label:"5 km",racePct:[.92,.95]},10:{cap:16,label:"10 km",racePct:[.88,.90]},21:{cap:21,label:"Semi",racePct:[.82,.85]},42:{cap:32,label:"Marathon",racePct:[.75,.79]}};
const FACT_RACE = [1,1.07,1.14,.85,1.14,1.21,1.28,.95,1.28,1.32,.8,.55];
const FACT_FORME= [1,1.07,1.14,.85,1.14,1.21,1.28,.95,1.28,1.35,1.42,1.07];
// longueur du plan : 12 semaines par défaut, de 4 à 52 (un an) quand une date de course est fixée
const N_MIN=4, N_MAX=52;
function planLen(p){ return (p.objectif!=="forme"||evSport(p.sport))&&p.nWeeks? p.nWeeks : 12; }
function phaseOf(w,isRace,N){
  N=N||12;
  if(isRace){ if(w===N)return "race"; if(w===N-1)return "taper"; if(w===N-2&&N>=6 || w===N-3&&N>=8)return "spe"; return w<=Math.round((N-4)/2)?"base":"dev"; }
  return w<=4?"base":"dev";
}
// off : décalage des semaines allégées (plan long : le cycle de 4 semaines continue celui de la préparation générale)
function isDeload(w,isRace,N,off){ N=N||12; if(!isRace||(N===12&&!off)) return DELOAD.includes(w); return (w+(off||0))%4===0 && w<=N-3; }
// facteurs de volume pour N semaines : +7 % par semaine normale, un cran en arrière après une semaine allégée ;
// plafond ×1,6 jusqu'à 20 semaines, jusqu'à ×2,56 pour un plan d'un an, et jamais au-delà de VMAX (ensuite le volume se stabilise)
function factors(isRace,N,off){
  if(!isRace||(N===12&&!off)) return isRace?FACT_RACE:FACT_FORME;
  const f=[]; let level=1, lastN=1, peak=1, afterDl=false;
  for(let w=1;w<=N;w++){ const ph=phaseOf(w,true,N);
    if(ph==="race") f.push(peak*.42); else if(ph==="taper") f.push(peak*.6);
    else if(isDeload(w,true,N,off)){ f.push(lastN*.75); afterDl=true; }
    else { if(afterDl){ level=Math.max(1,level-.07); afterDl=false; } const v=Math.min(level,N<=20?1.6:1.6+(Math.min(N,52)-20)*.03); f.push(v); lastN=v; peak=Math.max(peak,v); level+=.07; } }
  return f;
}
// semaine équivalente du modèle de 12 semaines (pour les tableaux débutant)
function tplWeek(w,isRace,N){ N=N||12; if(!isRace||N===12) return w; const ph=phaseOf(w,true,N); if(ph==="race")return 12; if(ph==="taper")return 11; return Math.min(10,Math.max(1,Math.round(1+(w-1)*9/Math.max(1,N-3)))); }
const PHASE_LABEL={prep:"Préparation générale",base:"Phase de base",dev:"Développement",spe:"Phase spécifique",taper:"Affûtage",race:"Semaine de course"};
const DELOAD=[4,8]; // modèle 12 semaines (voir isDeload)

/* séances : blocs {l,min,z,lo,hi} ; z = 'z1','z2','z3','walk' */
function S(type,title,blocks,extra){return Object.assign({type,title,blocks},extra||{});}
const E_LO=.62,E_HI=.70;
function easyRun(km,vma,title,strides){
  const sp=vma*.66, min=km/sp*60;
  const b=[{l:"Footing facile",min:Math.round(min),z:"z1",lo:E_LO,hi:E_HI}];
  if(strides) b.push({l:strides+" lignes droites de 20 s, rapides et relâchées (récup. marche)",min:0,z:"z3",lo:.95,hi:1.05,noPace:true,iv:{n:strides,on:20,off:60,onL:"Ligne droite, rapide et relâchée",offL:"Récup. en marchant"}});
  return S("easy",title||(strides?"Footing + lignes droites":"Footing facile"),b);
}
function longRun(km,vma,obj,phase){
  const sp=vma*.64, min=Math.floor(km/sp*60); // arrondi vers le bas : ne dépasse jamais la distance prévue
  const b=[{l:"Sortie longue, allure facile",min:Math.round(min),z:"z1",lo:.60,hi:.68}];
  let note="Fais un « check posture » toutes les 20 min : buste droit, pieds sous le corps.";
  if(phase==="spe" && obj==="42") note="Fin de prépa : les 20 dernières minutes peuvent passer à allure marathon si tu te sens bien. Teste ta nutrition (un gel ou équivalent toutes les 30 min).";
  else if(phase==="spe" && obj==="21") note="Tu peux finir par 10 min à allure semi si tu te sens bien.";
  else if(min>75) note+=" Au-delà de 1 h 15, prends de l'eau et des glucides (gel, compote) pour tester ta nutrition.";
  return S("long","Sortie longue",b,{note});
}
const RW_LADDER=[1,2,3,4,5,6,8,10,12,15];
// minBout : point de départ fixé par le test course/marche du débutant (evDebStart) ; les paliers du modèle reprennent dès qu'ils le dépassent
function runWalk(w,total,maxBout,minBout){
  let bouts=[1,2,2,3,3,4,5,6,8,10,12,15][w-1]||15;
  if(minBout) bouts=Math.max(bouts,minBout);
  if(maxBout) bouts=Math.min(bouts,maxBout);
  const wOf=b=>b>=10?1.5:1;
  let reps=Math.floor((total-10)/(bouts+wOf(bouts)));
  while(reps<2){ const i=RW_LADDER.indexOf(bouts); if(i<=0)break; bouts=RW_LADDER[i-1]; reps=Math.floor((total-10)/(bouts+wOf(bouts))); }
  reps=Math.max(1,reps); const walk=wOf(bouts);
  return {bouts,walk,reps,blocks:[
    {l:"Échauffement en marche rapide",min:5,z:"walk"},
    {l:reps+" × ("+bouts+" min de course très facile / "+walk.toString().replace(".",",")+" min de marche)",min:reps*(bouts+walk),z:"z1",lo:.58,hi:.65,mix:{run:reps*bouts,walk:reps*walk},iv:{n:reps,on:bouts*60,off:walk*60,onL:"Course très facile",offL:"Marche",offLast:true}},
    {l:"Retour au calme en marche",min:5,z:"walk"}]};
}
// o.short : échauffement 10 min et retour au calme 5 min ; o.fewer : répétitions en moins (volume limité, part de facile)
// séance de qualité : le type et les options de construction sont gardés (l'ajustement par l'IA reconstruit la séance avec les mêmes limites)
// o.w : semaine qui choisit la variante (séance reprise d'une semaine précédente) ; gardée dans qo pour les reconstructions (IA, plan simple)
function quality(kind,w,p,vma,phase,o){ const wv=o&&o.w||w, s=quality0(kind,wv,p,vma,phase,o); if(s){ s.kind=kind; s.qo={short:!!(o&&o.short),fewer:(o&&o.fewer)||0,...(o&&o.w?{w:o.w}:{})}; } return s; }
function quality0(kind,w,p,vma,phase,o){
  o=o||{}; const fw=o.fewer||0;
  const lvl=p.niveau, conf=lvl==="conf"||(lvl==="int"&&p.cplx==="avance"), taper=phase==="taper"||phase==="race";
  const wu={l:"Échauffement : footing + gammes (montées de genoux, talons-fesses)",min:o.short?10:15,z:"z1",lo:E_LO,hi:E_HI};
  const cd={l:"Retour au calme",min:o.short?5:10,z:"z1",lo:E_LO,hi:E_HI};
  if(kind==="cotes"){
    const n=conf?10:8, n2=Math.max(4,(taper?6:n)-2*fw);
    const tap=onTapis(p,"q");
    return S("q",tap?"Sprints en côte sur tapis":"Sprints en côte",[{l:"Footing facile",min:o.short?15:20,z:"z1",lo:E_LO,hi:E_HI},{l:tap? n2+" × 15 s à 8 % de pente, vite mais relâché, 1 min 30 de marche entre (descends du tapis ou baisse la vitesse)" : n2+" × 10 s en côte (pente 3 à 6 %), vite mais relâché, redescente en marchant",min:n2*1.9,z:"z3",noPace:true,lo:1,hi:1,iv:{n:n2,on:tap?15:10,off:Math.round(1.9*60-(tap?15:10)),onL:"Sprint en côte",offL:tap?"Marche":"Redescente en marchant",offLast:true}},cd],{hardMin:n2*(tap?15:10)/60});
  }
  if(kind==="seuil"){
    const opts=conf?[[5,6],[10,3],[4,8],[3,12]]:[[3,8],[4,6],[5,6],[3,10]];
    let [r,d]=opts[(w-1)%4]; if(taper){r=Math.max(2,Math.ceil(r/2));} if(fw){ let r2=r-fw; if(r2<2){ d=Math.max(4,d-3*(2-r2)); r2=2; } r=Math.min(r,r2); }
    return S("q","Seuil retenu",[wu,{l:r+" × "+d+" min au seuil retenu, 1 min de trot entre",min:r*d+(r-1),z:"z2",lo:.82,hi:.86,work:r*d,iv:{n:r,on:d*60,off:60,onL:"Seuil retenu",offL:"Trot"}},cd],{hardMin:r*d,note:"« Confortablement difficile » : phrases courtes possibles. Mieux vaut finir un peu frais que finir à bloc."});
  }
  if(kind==="vma"){
    const opts=conf?[["10 × 400 m",10,.4],["6 × 800 m",6,.8],["5 × 1000 m",5,1],["8 × 600 m",8,.6]]:[["8 × (1 min vite / 1 min trot)",8,null,1],["6 × 600 m",6,.6],["6 × 800 m",6,.8],["10 × (30 s / 30 s)",10,null,.5]];
    let [lab,r,dist,tmin]=opts[(w-1)%4]; let work;
    if(taper){r=Math.ceil(r/2);} if(fw){r=Math.max(2,r-2*fw);} lab=lab.replace(/^\d+/,r);
    const sp=vma*.97; work= dist? r*dist/sp*60 : r*tmin;
    return S("q","Fractionné VMA",[wu,{l:lab+", récup. trot de durée égale à l'effort",min:Math.round(work*2),z:"z3",lo:.95,hi:1.0,work,iv:{n:r,on:Math.round(work*60/r),off:Math.round(work*60/r),onL:dist?Math.round(dist*1000)+" m vite":"Vite",offL:"Trot",offLast:true}},cd],{hardMin:work,note:"Quelques mots seulement à la fin de chaque répétition. Si la vitesse chute nettement, arrête une répétition plus tôt. Arrête immédiatement et appelle le 15 en cas de douleur dans la poitrine, de malaise, de palpitations ou d'essoufflement anormal."});
  }
  if(kind==="allure"){
    const rp=OBJ[p.objectif].racePct;
    const map={5:["5 km",5,1,2],10:["10 km",4,2,2],21:["semi",3,3,2],42:["marathon",2,5,3]};
    let [nm,r,d,rec]=map[p.objectif]; if(taper){r=Math.max(1,Math.ceil(r/2));} if(phase==="race") r=Math.min(r,2);
    let r2=r-fw; if(r2<1){ d=Math.max(1,d-(d>=3?2:.5)*(1-r2)); r2=1; } r=r2;   // en dernier recours : bloc plus court
    const lab=r+" × "+String(d).replace(".",",")+" km à allure "+nm+(r>1?", "+rec+" min de récup.":".");
    const sp=vma*(rp[0]+rp[1])/2, work=r*d/sp*60;
    return S("q","Allure course",[wu,{l:lab,min:Math.round(work+r*2),z:rp[0]>=.88?"z3":"z2",lo:rp[0],hi:rp[1],work,iv:{n:r,on:Math.round(work*60/r),off:rec*60,onL:String(d).replace(".",",")+" km à allure "+nm,offL:"Récup.",offLast:true}},cd],{hardMin:work,note:"Apprends la sensation de l'allure visée. Garde la régularité plutôt que la vitesse."});
  }
  if(kind==="fartlek"){
    const r=Math.max(3,(taper?(lvl==="deb"?3:4):6)-fw);
    return S("q","Fartlek",[{l:"Footing facile",min:o.short?10:15,z:"z1",lo:E_LO,hi:E_HI},{l:r+" × (1 min allure vive / 2 min facile)",min:r*3,z:"z2",lo:.82,hi:.88,work:r,iv:{n:r,on:60,off:120,onL:"Allure vive",offL:"Facile",offLast:true}},cd],{hardMin:r,note:"Allure vive = tu peux encore dire une phrase courte. C'est une introduction à l'intensité."});
  }
}
// variété croissante : les types d'intensité arrivent au fil du plan, dans cet ordre (fartlek et côtes d'abord, puis seuil, puis VMA ;
// l'allure course en phase spécifique), parmi les types cochés. Seuil d'arrivée = avancement dans le plan (0 au début, 1 en fin de développement).
// Simple : jamais de VMA, le seuil plus tard ; confirmé (ou intermédiaire en avancé) : les types arrivent plus tôt. Forme : pas de VMA sauf confirmé.
const Q_ORDER=["fartlek","cotes","seuil","vma"];
function qPool(p,w,N,need,seen){
  const isRace=p.objectif!=="forme", conf=p.niveau==="conf"||(p.niveau==="int"&&p.cplx==="avance");
  const allowed=Q_ORDER.filter(c=>p.types.includes(c)&&!(c==="vma"&&(p.cplx==="simple"||(!isRace&&!conf))));
  const nb=isRace? Math.max(1,N-3) : N;
  // plan principal après une préparation générale : fartlek, côtes et seuil déjà vus
  const r=Math.max(nb>1?(w-1)/(nb-1):1, p.vmax?.45:0), th=p.cplx==="simple"?[0,.2,.45,9]:conf?[0,0,.28,.45]:[0,0,.3,.55];
  let pool=allowed.filter(c=>r>=th[Q_ORDER.indexOf(c)]-1e-9);
  // un type arrivé mais pas encore placé (semaine sans séance d'intensité, séance retirée faute de volume) n'est pas doublé par un type plus tardif
  if(seen){ const k=pool.findIndex(c=>!seen.has(c)); if(k>=0) pool=pool.filter((c,j)=>j<=k||seen.has(c)||(c==="seuil"&&r>=th[2]+.2)); }   // plan court : le seuil, largement dû, arrive avec le fartlek ou les côtes
  // le fartlek sert d'introduction : il laisse sa place une fois la VMA arrivée (côtes, seuil et VMA tournent ensuite)
  if(pool.includes("vma")&&pool.length>Math.max(need,2)) pool=pool.filter(c=>c!=="fartlek");
  // types cochés trop peu nombreux au début : on prend les suivants (le nombre de séances d'intensité ne baisse pas)
  for(const c of allowed) if(pool.length<need&&!pool.includes(c)) pool.push(c);
  return pool;
}
function qualityKinds(p,w,phase,ctx,need){
  const o=p.objectif, isRace=o!=="forme";
  // préparation générale : une séance de qualité qui tourne par blocs de 4 semaines (côtes, fartlek, seuil)
  if(phase==="prep") return [["cotes","fartlek","seuil"][Math.floor((w-1)/4)%3], null];
  if(p.niveau==="deb"){ return w<=8||phase==="race"?[null,null]:["fartlek",null]; }
  if(phase==="race") return ["allure",null]; // semaine de course : un seul rappel court en début de semaine
  if(phase==="taper") return ["allure","seuil"]; // affûtage : intensité et fréquence gardées
  const W=ctx&&ctx.w||w, seen=ctx&&ctx.seen||null, pool=qPool(p,W,ctx&&ctx.N||12,need||2,seen);
  if(!pool.length) return [null,null,pool];
  // phase spécifique : allure course + un rappel qui alterne seuil et VMA quand ils sont arrivés (seuil d'abord en semi et marathon, VMA en 5 et 10 km)
  if(isRace&&phase==="spe"){ const c=(o==="42"||o==="21"?["seuil","vma"]:["vma","seuil"]).filter(k=>pool.includes(k)); return ["allure", c.length? c[(W+1)%c.length] : pool[pool.length-1], pool]; }
  // rotation sur les types arrivés : chaque semaine une paire différente ; une seule séance (simple) : le même type 2 semaines de suite
  // un type qui vient d'arriver passe en premier ; dans la semaine, le type le plus ancien d'abord (c'est le dernier qui saute faute de volume)
  const i= p.cplx==="simple"||p.seances===3? Math.floor((W-1)/2)%pool.length : (W-1)%pool.length;
  const fresh=seen? pool.filter(c=>!seen.has(c)) : [];
  let k1=fresh[0]||pool[i], k2=null;
  if(pool.length>1) k2= fresh.find((c,j)=>j>0&&c==="seuil") || fresh[1] || (pool[i]!==k1? pool[i] : pool[(i+1)%pool.length]);
  // deux séances, seuil ou VMA déjà là : chaque semaine garde une séance « longue » (seuil / VMA) et une plus courte qui tourne,
  // pour que le volume ne fasse pas le yoyo d'une semaine à l'autre (fartlek + côtes seuls font une semaine plus courte)
  const heavy=pool.filter(c=>c==="seuil"||c==="vma"), light=pool.filter(c=>c==="fartlek"||c==="cotes"), W0=W-1;
  if(!fresh.length&&(need||2)>1&&pool.length>2&&heavy.length){ k1=heavy[W0%heavy.length]; k2= light.length? light[Math.floor(W0/heavy.length)%light.length] : heavy[(W0+1)%heavy.length]; if(k2===k1) k2=null; }
  const ord=c=>Q_ORDER.indexOf(c); if((need||2)>1&&k2&&ord(k2)<ord(k1)) [k1,k2]=[k2,k1];
  return [k1,k2,pool];
}
const SUBST={seuil:["seuil","fartlek","vma"],vma:["vma","seuil","fartlek"],cotes:["cotes","seuil","fartlek"],fartlek:["fartlek","seuil","vma"],allure:["allure"]};
// plan simple : jamais de VMA, même en remplacement d'une séance décochée
function pickKind(k,p,avoid){ if(!k)return null; const ok=(SUBST[k]||[k]).filter(c=>c==="allure"||p.types.includes(c)&&!(p.cplx==="simple"&&c==="vma")); return ok.find(c=>c!==avoid) || (avoid?null:ok[0]) || null; }
/* ---- préférences de séances (profil, texte libre de 300 caractères au plus) ----
   L'ajustement par l'IA reçoit le texte tel quel (donnée, jamais instruction). Sans IA, seuls ces motifs sont reconnus (accents et majuscules ignorés),
   phrase par phrase (coupure sur . ; ! ? et retour à la ligne), puis proposition par proposition (coupure sur , : « mais » et « et ») :
   - types : côtes (« côtes », « montées », « la côte », « en côte », « une côte », « des côtes »), fartlek, seuil (« seuil », « tempo »),
     VMA (« VMA », « fractionné », « intervalles »). L'allure course n'est jamais concernée.
   - refus, mot placé AVANT le type : « pas » (sauf « pas que », « pas seulement », « pas uniquement »), « pas trop », « sans », « jamais », « aucun(e) »,
     « évite(r) », « déteste », « horreur », « ne … plus », « n'en … plus »
     (« pas de côtes », « sans VMA », « je n'aime pas le fractionné », « je ne veux plus de côtes ») : le type n'est plus proposé à l'IA comme
     remplaçant et, sans IA, une séance de ce type est remplacée par un autre remplaçant permis (un type aimé d'abord).
   - envie, mot placé AVANT le type : « aime », « adore », « préfère », « plutôt », « privilégie », « favorise », « envie » (« j'aime le fartlek »,
     « plutôt du seuil ») : sans IA, une séance plus dure dont ce type fait partie des remplaçants permis passe à ce type (une fois par semaine
     au plus, jamais deux fois le même type dans la semaine). « Je préfère A à B », « A plutôt que B » : seul A compte.
   - une proposition sans mot de refus ni d'envie reprend celui de la proposition précédente reliée par « , » ou « et » (« j'aime les côtes et le
     fartlek »), jamais à travers « mais ». Refus et envie sur le même type : refus.
   - ignoré (laissé à l'IA) : une proposition qui cite un jour ou un moment (lundi…, semaine, week-end, matin, soir) ou une gêne (peur, douleur,
     mal, souci, problème, blessure) ; une condition (si, quand, lorsque, sauf) neutralise sa proposition et toute la suite de la phrase
     (« si je suis fatigué, pas de VMA »).
   Garde-fous du changement sans IA (prefApply) : jamais pour un débutant, ni en affûtage, ni la semaine de course ; seulement vers un type plus
   doux (fartlek < côtes < seuil < VMA) ; la séance changée n'est ni plus longue (km) ni plus intense (minutes dures, aucune marge), et la part de
   facile de la semaine ne baisse pas. Un type REFUSÉ sans remplaçant valide (les sprints en côte comptent moins de minutes dures que toute autre
   séance ; rien n'est plus doux que le fartlek) devient un footing facile de distance au plus égale, avec lignes droites si elles sont cochées :
   moins de minutes dures, plus de facile. Une envie seule ne change rien si aucun remplaçant n'est valide. Seule « j'aime le fartlek » peut agir
   parmi les envies (PREF_LIVE). Les volumes, les jours et le nombre de séances ne changent jamais. */
const PREF0={no:[],like:[]}, PREF_HARD={fartlek:1,cotes:1.5,seuil:2,vma:3}, PREF_LIVE={like:["fartlek"]};
// caractères de contrôle et invisibles SUPPRIMÉS (comme CLEAN côté serveur : « fi\u200bnir » redevient « finir » pour le filet de sécurité) ; tabulation et retours à la ligne → espace
const prefClean=v=> typeof v==="string"? Array.from(v.replace(/[\t\n\r]/g," ").replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g,"")).slice(0,300).join("") : "";
const PREF_KIND=[["cotes",/\b(cotes|montees?|(la|en|une|des) cotes?)\b/],["fartlek",/\bfartleks?\b/],["seuil",/\b(seuils?|tempo)\b/],["vma",/\b(vma|fractionnes?|intervalles?)\b/]];
function prefParse(t){ const out={no:[],like:[]}; if(!t) return out;
  const s=t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’`]/g,"'");
  for(const sent of s.split(/[.;!?\n]+/)){ const parts=sent.split(/(,|:|\bmais\b|\bet\b)/); let carry=null;
    for(let j=0;j<parts.length;j+=2){ const c=parts[j]; if(j&&parts[j-1]==="mais") carry=null;
      if(/\b(si|s'il|s'ils|quand|lorsque|lorsqu|sauf)\b/.test(c)) break;   // condition : la suite de la phrase en dépend
      if(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaines?|week ?-?ends?|matins?|soirs?|midi|peur|douleurs?|mal|souci|problemes?|blessures?|blesse\w*|gene\w*|derange\w*)\b/.test(c)){ carry=null; continue; }
      const at=re=>{ const m=re.exec(c); return m? m.index : -1; };
      let neg=at(/\bpas\b(?! (que|qu'|seulement|uniquement)\b)|\b(sans|jamais|aucune?|evit\w*|detest\w*|horreur)\b|\bne \w+ plus\b|\bn'(en )?\w+ plus\b/), yes=at(/\b(aime|adore|prefere\w*|plutot|privilegi\w*|favoris\w*|envie)\b/);
      const cmp=at(/\b(au|aux|a la|a l'|que)\b/);
      if(neg<0&&yes<0){ if(carry==="no") neg=-.5; else if(carry==="yes") yes=-.5; }   // « … et le fartlek » : même sens que la proposition précédente
      else carry= neg>=0&&(yes<0||neg<yes)? "no" : "yes";
      for(const [k,re] of PREF_KIND){ const i=at(re); if(i<0) continue;
        if(neg!==-1&&neg<i){ if(!out.no.includes(k)) out.no.push(k); }
        else if(yes!==-1&&yes<i&&!(cmp>yes&&cmp<i)&&!out.like.includes(k)) out.like.push(k); } } }
  out.like=out.like.filter(k=>!out.no.includes(k)); return out; }
const onTapis=(p,kind)=> p.lieu==="tapis" || (p.lieu==="mixte" && kind==="q");
// MET d'un effort léger (Compendium 2011) : la séance remplace un footing facile
const CROSS={velo:["Vélo facile",4.8],elliptique:["Elliptique facile",4.6],rameur:["Rameur facile",4.8],natation:["Natation facile",5.8]};
// emplacements (lundi=0) pour long le dimanche
const SLOTS={3:{q1:1,e:[3],q2:null},4:{q1:1,e:[2],q2:4},5:{q1:1,e:[2,5],q2:3},6:{q1:1,e:[0,2,5],q2:3}};

// renforcement : titre, durée, puis une ligne par bloc (exercices / séries en petit dessous)
const R_GAIN=["Gainage, Copenhague, équilibre sur une jambe","pour finir la séance"], R_PLIO=["Pliométrie (sauts)","2 à 3 × 6 à 10 sauts"], R_NOPLIO=["Pas de pliométrie cette semaine",""];
const RENFO={
  salle:{deb:{t:"Renforcement",m:"35 min",rows:[["Goblet squat, pont fessier, fentes, mollets debout","3 × 10 à charge modérée, pour apprendre la technique"],["Gainage, équilibre sur une jambe","3 × 30 s"]]},
    heavy:{t:"Renforcement",m:"45 min, salle",rows:[["Squat ou goblet squat, soulevé de terre roumain, split squat bulgare, mollets debout et assis","3 à 4 × 4 à 8 reps lourdes"],R_PLIO,R_GAIN]},
    light:{t:"Renforcement d'entretien",m:"30 min",light:true,rows:[["Mêmes exercices","2 séries, charges lourdes mais peu de répétitions"],R_NOPLIO]}},
  maison:{deb:{t:"Renforcement",m:"35 min, haltères",rows:[["Goblet squat, pont fessier, fentes, mollets sur une jambe","3 × 10 à charge modérée, pour apprendre la technique"],["Gainage, équilibre sur une jambe","3 × 30 s"]]},
    heavy:{t:"Renforcement",m:"45 min, haltères",rows:[["Goblet squat, soulevé de terre roumain, split squat bulgare avec haltères, mollets sur une jambe avec haltère","3 à 4 × 6 à 10 reps, les charges les plus lourdes possibles, descente lente sur 3 s"],R_PLIO,R_GAIN]},
    light:{t:"Renforcement d'entretien",m:"30 min, haltères",light:true,rows:[["Mêmes exercices","2 séries"],R_NOPLIO]}},
  aucun:{deb:{t:"Renforcement",m:"30 min, sans matériel",rows:[["Squat, pont fessier, fentes arrière, mollets sur une marche","3 × 12"],["Gainage, équilibre sur une jambe","3 × 30 s"]]},
    heavy:{t:"Renforcement",m:"40 min, sans matériel",rows:[["Split squat bulgare, pistol squat assisté, pont fessier sur une jambe, nordic curl (ischios), mollets sur une jambe sur une marche","3 à 4 × 8 à 12, lents (3 s de descente)"],R_PLIO,R_GAIN],note:"Sans charge lourde, mise sur l'unilatéral et la lenteur pour garder la difficulté."},
    light:{t:"Renforcement d'entretien",m:"25 min, sans matériel",light:true,rows:[["Mêmes exercices","2 séries"],R_NOPLIO]}}
};
function renfoText(t,eq){ return (RENFO[eq]||RENFO.salle)[t]; }

const RACE_KM={5:5,10:10,21:21.1,42:42.195};
const VMAX={forme:45,5:50,10:60,21:75,42:100};
// plus longue sortie minimale en fin de prépa (S10) pour que la course reste raisonnable (Frandsen 2025 : au-delà de +100 % de la plus longue sortie, risque plus que doublé)
// la course ne fait jamais plus de 2 fois la plus longue sortie du plan (10 km : 7 km au moins ; 5 km : 3,5 km)
const LONG_NEED={5:3.5,10:7,21:16,42:28};
const LONG_MAX_MIN={forme:90,5:100,10:120,21:150,42:180};   // durée maximale d'une sortie longue, en minutes
// débutant : semi possible sur 30 semaines et plus, marathon sur un an ; la sortie longue doit toujours atteindre LONG_NEED
const reachable=(o,wk,deb)=> !LONG_NEED[o] || (!(deb&&((o==="21"&&wk.length<30)||(o==="42"&&wk.length<52))) && wk.topLong>=LONG_NEED[o]-.05);
function buildPlan(p){
  if(evSport(p.sport)){ const w=buildSportPlan(p); applyTime(w,p); applyAi(w,p); return w; }
  const weeks=buildPlanRun(p); evalPlan(weeks,p); prefApply(weeks,p); applyTime(weeks,p); applyAi(weeks,p); if(p.sport==="trail") trailize(weeks,p); return weeks;
}
/* ---- ajustement par l'IA (api/plan.js) : appliqué sur le plan déjà construit, jamais au-delà de ses limites ----
   L'IA choisit le type des séances d'intensité parmi les remplaçants permis, peut alléger une semaine (sa dernière séance d'intensité devient un footing
   de même distance), ajouter des lignes droites à un footing ou le passer en cardio sans impact, raccourcir la sortie longue (−15 %, en facile),
   passer le renforcement en version d'entretien (aiRest), et donne un conseil par semaine. Une séance n'est remplacée que si elle reste au plus aussi longue et aussi intense,
   et si la part de facile de la semaine ne baisse pas. Rien ne change en affûtage ni la semaine de course. Le profil modifié depuis : ajustement ignoré. */
// préférences ajoutées seulement si écrites : les ajustements déjà enregistrés sans préférences restent valables
// "e2" : version du moteur (progression linéaire, variété croissante) ; un ajustement IA fait pour un plan d'une autre version est à relancer
function planSig(p){ const a=["e2",p.sport,p.sObj,p.objectif,p.runObjectif,p.niveau,p.seances,p.renfo,p.longDay,p.raceDate||"",p.start||"",p.volume,p.longest,p.ref,p.refVal,(p.types||[]).join(","),p.lieu,p.equip,p.cross,p.cplx,p.hSem,p.startIdx,!!p.minor];
  if(p.pref) a.push(p.pref);
  if(p.renfoMin>0||p.hQuota>0) a.push("t"+(p.renfoMin||0)+"/"+(p.hQuota||0));   // temps choisi (ajouté seulement s'il sert)
  if(p.evalOn) a.push("ev",evFrom(p)); if(p.debRun>0) a.push("dr"+p.debRun);   // séances de test, point de départ course/marche (ajoutés seulement s'ils servent)
  const t=JSON.stringify(a);
  let h=5381; for(let i=0;i<t.length;i++) h=((h*33)^t.charCodeAt(i))>>>0; return h.toString(36); }
function aiOf(p){ if(p.noAi) return null; const a=state&&state.aip&&state.aip.p; return a&&!a.x&&a.sig===planSig(p)? a : null; }
// remplaçants permis : les séances cochées dans le profil, proches de celle du plan (SUBST) ; l'allure course et les séances d'un débutant ne changent pas
// un type refusé dans les préférences n'est pas proposé à l'IA
// pool : types d'intensité déjà arrivés cette semaine (variété croissante) ; ni l'IA ni les préférences ne font arriver un type plus tôt que le plan
function qOpts(k,p,pool){ if(p.niveau==="deb"||k==="allure"||!SUBST[k]) return [k]; const no=(p.prefK||PREF0).no; return [k,...SUBST[k].filter(c=>c!==k&&c!=="allure"&&p.types.includes(c)&&!(p.cplx==="simple"&&c==="vma")&&!no.includes(c)&&(!pool||pool.includes(c)))]; }
// remplace la séance d'intensité d de la semaine par le type k, raccourcie au besoin, dans les marges t (km, minutes dures, part de facile) ; renvoie son jour ou -1
// préférences : aucune marge (jamais plus long, jamais plus de minutes dures, part de facile jamais en baisse)
const AI_TOL={km:1.05,kmA:.3,h:1.1,hA:.5,z:.8}, PREF_TOL={km:1,kmA:.01,h:1,hA:1e-9,z:1};
function swapQ(wk,d,k,p,vma,t,mark,note){ const old=d.run, km0=sessionKm(old,vma), h0=old.hardMin||0, z0=zoneMins(wk.days).easy, i=wk.days.indexOf(d); let o={...old.qo};
  for(let n=0;n<4;n++){ const s=quality(k,wk.w,p,vma,wk.phase,o);
    if(s&&sessionKm(s,vma)<=km0*t.km+t.kmA&&(s.hardMin||0)<=h0*t.h+t.hA){ wk.days[i]={...d,run:{...s,...mark,note:(s.note?s.note+" ":"")+note}};
      if(zoneMins(wk.days).easy>=Math.min(z0,t.z)-1e-9) return i; wk.days[i]=d; }
    o= o.short? {...o,fewer:(o.fewer||0)+1} : {...o,short:true}; }
  return -1; }
// séance cochée (faite / pas faite) dont la marque correspond à la séance telle qu'elle est (daySig) : verrouillée, jamais modifiée ensuite
// (préférences puis IA) ; sinon la marque deviendrait orpheline. Une marque posée sur une autre version de la séance ne verrouille pas.
// Dates calculées sur le profil p seulement (pas sur state.profile) ; la date du jour n'intervient jamais.
function dayLock(p){ const run=!evSport(p.sport), trail=p.sport==="trail", st=run? effStart(p) : null, dn=(state&&state.done)||{};
  const sigOf=d=> daySig(trail&&d.run? {...d,run:{...d.run,title:trailTitle(d.run.title)}} : d);   // trail : titre tel que trailize l'affichera
  return (w,d)=>{ if(!st) return false; const e=dn[addDays(st,(w-1)*7+d.i)]; return !!(e&&e.v!=="none"&&e.sig&&e.sig===sigOf(d)); }; }
// préférences de séances, sans IA (motifs de prefParse) : type refusé remplacé (type plus doux, sinon footing facile), type aimé choisi ; jamais plus long ni plus intense
function prefApply(weeks,p){ const pf=p.prefK; if(!pf||(!pf.no.length&&!pf.like.length)||p.niveau==="deb"||evSport(p.sport)) return; const vma=vmaOf(p).vma, lockedDay=dayLock(p);
  for(const wk of weeks){ if(wk.phase==="taper"||wk.phase==="race") continue;
    const qd=()=>wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind&&d.kind!=="before");
    const lk=new Set(wk.days.filter(d=>lockedDay(wk.w,d)).map(d=>d.i));   // verrous évalués sur les séances du moteur, avant toute modification
    for(const d of qd()){ const k0=d.run.kind; if(!PREF_HARD[k0]||lk.has(d.i)) continue;
      const used=qd().filter(o=>o!==d).map(o=>o.run.kind); if(!pf.no.includes(k0)&&used.some(c=>pf.like.includes(c))) continue;   // un type aimé une fois par semaine suffit
      const opts=qOpts(k0,p,wk.qArr||wk.qPool).filter(c=>c!==k0&&!used.includes(c)&&PREF_HARD[c]<PREF_HARD[k0]), rank=c=>{ const i=pf.like.indexOf(c); return i<0? 9 : i; };
      const want= pf.no.includes(k0)? opts.sort((a,b)=>rank(a)-rank(b)) : pf.like.includes(k0)? [] : opts.filter(c=>pf.like.includes(c)).sort((a,b)=>rank(a)-rank(b));
      let done=false; for(const k of want) if(swapQ(wk,d,k,p,vma,PREF_TOL,{pref:1},"Type choisi d'après tes préférences de séances.")>=0){ done=true; break; }
      // refus explicite sans remplaçant valide : footing facile de même distance au plus (comme l'allègement de l'IA)
      if(!done&&pf.no.includes(k0)){ const i=wk.days.indexOf(d), km=sessionKm(d.run,vma); let k2=Math.max(1.5,Math.floor(km*2)/2); while(k2>1.5&&sessionKm(easyRun(k2,vma),vma)>km+1e-9) k2-=.5;
        if(sessionKm(easyRun(k2,vma),vma)<=km+1e-9){ const L={cotes:"côtes",fartlek:"fartlek",seuil:"seuil",vma:"VMA"}[k0];
          wk.days[i]={...d,run:{...easyRun(k2,vma,"Footing facile",p.types.includes("ld")?4:0),pref:1,note:"Préférence : pas de "+L+". Footing facile à la place, même distance au plus."},kind:"easy"}; } } } } }
/* ---- séances de test en début de plan (case « Commencer par des séances de test » du profil ; inspiré du test d'entrée de Kiprun Pacer) ----
   Une à trois séances pour jauger le niveau déjà acquis : elles remplacent des séances d'intensité de la semaine 1 (et de la 2), jamais plus longues
   que la séance remplacée (le volume du plan n'est jamais dépassé) ; la première séance reste facile (firstWeekFix : seuls des tests faciles peuvent la remplacer).
   Le résultat noté sur la carte donne une estimation (VMA, ou minutes de course continue du débutant) ; le plan n'est recalculé que si tu le demandes
   (bouton « Mettre à jour mon plan avec ce résultat »), jamais en silence.
   Intermédiaire et confirmé : test VMA de 6 min, test d'endurance de 30 min (ou 5 km), footing de référence (selon les séances par semaine et la durée du plan).
   Débutant, moins de 18 ans, 65 ans et plus, IMC de 35 et plus, douleur notée : variante prudente seulement, sans aucun test maximal.
   Aucun test sur un plan de 4 semaines ou moins, ni quand la semaine 1 est déjà l'affûtage ou la semaine de course. */
const EV_T={vma6:"Test VMA : 6 minutes",end:"Test d'endurance",cont:"Test en aisance : course continue",ref:"Footing de référence",deb:"Test course / marche"};
const EV_NO="Ne fais pas ce test si tu as mal quelque part, si tu es malade ou fiévreux, ou après une mauvaise nuit ou une grosse fatigue : fais un footing facile à la place et décale le test de quelques jours. Arrête immédiatement et appelle le 15 en cas de douleur dans la poitrine, de malaise, de palpitations ou d'essoufflement anormal.";
const EV_NO_SOFT="Si tu as mal quelque part, si tu es malade ou très fatigué, remplace-le par de la marche ou du repos et décale-le de quelques jours. Arrête immédiatement et appelle le 15 en cas de douleur dans la poitrine, de malaise, de palpitations ou d'essoufflement anormal.";
const evBmi=p=> p.poids/Math.pow(p.taille/100,2);
// douleur notée ces 14 derniers jours (ressenti après séance, ou suivi) : pas de test maximal
// douleur à une date : notée dans les 14 jours qui la précèdent (ressenti, ou dernière mesure du suivi à cette date) ; ce qui est noté après ne compte pas
function evPainAt(day){ try{ const lim=addDays(day,-14), f=(state&&state.feel)||{};
  if(Object.entries(f).some(([k,v])=>v&&!(v.x===1||v.x===true)&&+v.pain>=1&&k>=lim&&k<=day)) return true;
  const lg=((state&&state.log)||[]).filter(e=>e.date<=day), l=lg[lg.length-1]; return !!(l&&l.douleur==="oui"&&l.date>=lim); }catch(e){ return false; } }
const evPainNow=()=>evPainAt(todayIso());
// variante prudente : aucun test maximal. Profil (stable) : débutant, moins de 18 ans, 65 ans et plus, IMC de 35 et plus.
// Douleur notée (p.evPain la force, pour les tests) : seulement pour les tests à venir, ni passés, ni cochés, ni notés (evalPlan)
function evProfPrud(p){ return p.niveau==="deb"||!!p.minor||p.age>=65||evBmi(p)>=35; }
const evPain=p=> p.evPain!=null? !!p.evPain : evPainNow();
function evPrudent(p){ return evProfPrud(p)||evPain(p); }
// début des tests : la case cochée en cours de plan (evalFrom) les place à partir de ce jour-là, jamais avant ; sinon dès le début du plan
const evFrom=p=>{ const st=effStart(p); return st&&okIso(p.evalFrom)&&p.evalFrom>st? p.evalFrom : ""; };
// semaine des premiers tests : la première qui a encore des séances à partir de evalFrom (la semaine en cours, sinon la suivante)
function evAnchor(p,weeks){ const from=evFrom(p), st=effStart(p); if(!from) return 0;
  for(let j=0;j<weeks.length;j++) if(weeks[j].days.some(d=>d.run&&d.kind!=="before"&&addDays(st,j*7+d.i)>=from)) return j; return weeks.length; }
// pourquoi pas de test : "" si les tests sont possibles ; il faut plus de 4 semaines à partir de la semaine des tests, qui n'est ni l'affûtage ni la course
function evWhyNot(p,weeks){ if(!p.evalOn) return "off"; if(evSport(p.sport)) return "sport"; if(!weeks) return "court";
  const j=evAnchor(p,weeks); if(weeks.length-j<=4) return j? "tard" : "court";
  const w=weeks[j]; if(!w||w.phase==="taper"||w.phase==="race") return j? "tard" : "course"; return ""; }
// débutant : la plus longue période de course continue fixe le premier palier de course/marche (la moitié, 8 min au plus)
function evDebStart(m){ if(!(m>=2)) return 0; let b=0; for(const x of RW_LADDER) if(x<=Math.min(8,m/2)) b=x; return b; }
// première variante (dans l'ordre de préférence) qui tient dans km0 : jamais plus longue que la séance remplacée
function evFit(cands,km0,vma){ for(const r of cands) if(sessionKm(r,vma)<=km0+1e-9) return r; return null; }
function evVma6(km0,vma){ const c=[];
  for(const wu of [20,15,12,10]) for(const cd of [25,20,15,12,10,8,5]) c.push(S("q",EV_T.vma6,[
    {l:"Échauffement : footing facile, puis gammes (montées de genoux, talons-fesses)",min:wu,z:"z1",lo:E_LO,hi:E_HI},
    {l:"3 accélérations progressives de 20 s, retour en trottinant",min:0,z:"z3",lo:.9,hi:1,noPace:true,iv:{n:3,on:20,off:60,onL:"Accélération progressive",offL:"Trot"}},
    {l:"6 min à fond : la plus grande distance possible, à allure régulière",min:6,z:"z3",lo:.97,hi:1.03,eff:"Effort maximal tenu 6 min"},
    {l:"Retour au calme : footing très lent, puis marche",min:cd,z:"z1",lo:.6,hi:.66}],
    {hardMin:6,ev:{t:"vma6"},note:"Sur du plat (piste, chemin plat) ou sur tapis à 1 % de pente. Pars vite sans partir à bloc : l'allure doit tenir les 6 minutes et tu finis vidé. Mesure la distance parcourue en 6 min (montre GPS, tours de piste de 400 m, ou compteur du tapis) : VMA ≈ distance en mètres ÷ 100 (1 500 m → 15 km/h). "+EV_NO}));
  return evFit(c,km0,vma); }
// variantes qui tiennent dans km0, la plus longue durée d'abord (le plafond d'intensité est vérifié par evalPlan)
function evEnd(km0,vma){ const c=[];
  for(const T of [30,25,20]) for(const wu of [15,10]) for(const cd of [20,15,10,8,5]){ const k5= T===30&&vma*.83*.5>=5;   // 5 km à cette allure en 30 min au plus : jamais plus long que le test
    c.push(S("q",EV_T.end+" : "+T+" minutes",[
    {l:"Échauffement : footing facile, puis gammes (montées de genoux, talons-fesses)",min:wu,z:"z1",lo:E_LO,hi:E_HI},
    {l:T+" min en continu à allure soutenue mais contrôlée : note la distance"+(k5?" (ou fais 5 km chrono à cette allure et note ton temps)":""),min:T,z:"z2",lo:.8,hi:.86,eff:"Soutenu, régulier, sans finir à bloc"},
    {l:"Retour au calme : footing très lent",min:cd,z:"z1",lo:.6,hi:.66}],
    {hardMin:T,ev:{t:"end",T,k5:k5?1:0},note:"Sur du plat. Effort soutenu mais contrôlé : tu peux dire quelques mots, pas tenir une conversation. Garde une allure régulière du début à la fin. Note la distance parcourue en "+T+" min"+(k5?" (ou ton temps sur 5 km)":"")+". "+EV_NO})); }
  return c.filter(r=>sessionKm(r,vma)<=km0+1e-9); }
function evCont(km0,vma){ const c=[];
  for(const T of [30,25,20,15]) c.push(S("easy",EV_T.cont,[
    {l:"Échauffement : footing très lent",min:5,z:"z1",lo:.58,hi:.62},
    {l:T+" min en continu à allure confortable (tu peux parler en phrases complètes) : note la distance",min:T,z:"z1",lo:E_LO,hi:E_HI},
    {l:"Retour au calme en marchant",min:5,z:"walk"}],
    {ev:{t:"cont",T},note:"Ce n'est pas un test maximal : reste à une allure où tu peux parler, ralentis ou marche si tu en as besoin. Note la distance parcourue en "+T+" min et ton effort perçu. "+EV_NO_SOFT}));
  return evFit(c,km0,vma); }
// débutant : la séance course/marche remplacée garde sa durée et sa part de course (même volume au plus), sans fractions imposées
function evDeb(r,vma){ const km0=sessionKm(r,vma), M=sessionMin(r), mb=r.blocks.find(b=>b.mix), fr=mb? mb.mix.run/Math.max(1,mb.mix.run+mb.mix.walk) : .5, c=[];
  for(let T=Math.min(30,Math.round(M));T>=Math.min(20,Math.round(M));T--){ if(T<15) break; const m=T-10;
    c.push(S("easy",EV_T.deb,[{l:"Échauffement en marche rapide",min:5,z:"walk"},
      {l:m+" min de course / marche libre à allure confortable : cours tant que tu es à l'aise, marche dès que tu en as besoin, puis repars",min:m,z:"z1",lo:.58,hi:.65,mix:{run:m*fr,walk:m*(1-fr)}},
      {l:"Retour au calme en marche",min:5,z:"walk"}],
      {deb:r.deb,ev:{t:"deb",T},note:"Pas de test maximal : tout se fait à allure confortable, sans jamais être essoufflé. Note combien de minutes tu as couru sans t'arrêter (ta plus longue période de course) et ton ressenti : ton plan pourra partir de là. "+EV_NO_SOFT})); }
  return evFit(c,km0,vma); }
// footing de référence : le footing facile prévu, tel quel (mêmes blocs, même distance), avec la consigne de noter son ressenti
const evRefOk=r=> r&&r.type==="easy"&&!r.deb&&!r.ev&&r.blocks[0]&&r.blocks[0].l==="Footing facile"&&!r.blocks.some(b=>b.cross);
const evRef=r=>({...r,title:EV_T.ref,ev:{t:"ref"},note:"Footing à allure vraiment facile (tu peux parler). À la fin, note ton effort perçu (RPE de 1 à 10) et, si tu les as, la durée et la distance : ce sera ton repère d'allure facile. "+EV_NO_SOFT});
// pas de test possible (douleur notée) et pas de place pour le test en aisance : footing facile de même distance au plus, sans type d'intensité
function evEasyFb(km0,vma){ let k=Math.max(1.5,Math.floor(km0*2)/2); while(k>1.5&&sessionKm(easyRun(k,vma),vma)>km0+1e-9) k-=.5;
  return {...easyRun(k,vma,"Footing facile"),note:"Douleur notée récemment : footing facile à la place du test. Fais le test plus tard, quand tu n'as plus mal (décoche puis recoche la case du profil)."}; }
function evalPlan(weeks,p){
  if(evWhyNot(p,weeks)) return;
  const vma=vmaOf(p).vma, deb=p.niveau==="deb", prud=evProfPrud(p), lk=dayLock(p), N=weeks.length, j0=evAnchor(p,weeks), wA=weeks[j0], wB=weeks[j0+1];
  const st=effStart(p), from=evFrom(p), tdy=todayIso(), dn=(state&&state.done)||{}, er=(state&&state.evr)||{};
  const dateOf=(wk,d)=> st? addDays(st,(wk.w-1)*7+d.i) : "";
  const kmOf=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0), hardOf=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type==="q"?d.run.hardMin||0:0),0);
  // variante (douce ou non) d'un test : une fois la séance réglée, rien ne la change plus, ni la douleur ni la date.
  // Résultat noté : le type de ce résultat ; séance cochée : la variante dont la signature correspond à la coche ;
  // sinon la douleur à la date de la séance (passée) ou d'aujourd'hui (à venir) ; p.evPain la force (tests)
  const isSoft=(wk,d,hardRun,softRun)=>{ const k=dateOf(wk,d); if(!k) return false; const e=er[k];
    if(e&&!(e.x===1||e.x===true)&&e.t){ if(softRun&&softRun.ev&&e.t===softRun.ev.t) return true; if(hardRun&&hardRun.ev&&e.t===hardRun.ev.t) return false; }
    const m=dn[k]; if(m&&m.v&&m.v!=="none"&&m.sig){ const sg=r=>r? daySig({...d,run:r,kind:r.type}) : daySig(d);
      if(m.sig===sg(softRun)) return true; if(m.sig===sg(hardRun)) return false; }
    return p.evPain!=null? !!p.evPain : evPainAt(k<tdy? k : tdy); };
  const okW=wk=> !!wk&&!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race";
  const free=(wk,d)=> !!d.run&&d.kind!=="before"&&d.kind!=="race"&&d.run.type!=="race"&&!d.run.ev&&!lk(wk.w,d)&&(!from||dateOf(wk,d)>=from);   // séance cochée avant : jamais changée
  const qDays=wk=> okW(wk)? wk.days.filter(d=>free(wk,d)&&d.run.type==="q"&&d.run.kind&&d.run.kind!=="allure").map(d=>({wk,d})) : [];
  const base=new Map(); for(const wk of [wA,wB]) if(wk) base.set(wk,{h:hardOf(wk),e:zoneMins(wk.days).easy,km:kmOf(wk)});
  // intensité : séance de test ≤ max(2 × la séance remplacée, 12 min) de dur ; semaine ≤ plan sans tests + 6 min ; part de facile ≥ min(sans tests, 80 %)
  const put=(s,run)=>{ if(!run) return false; const i=s.wk.days.indexOf(s.d); if(i<0) return false; const h0=s.d.run.type==="q"? s.d.run.hardMin||0 : 0;
    if((run.hardMin||0)>Math.max(2*h0,12)+1e-9||sessionKm(run,vma)>sessionKm(s.d.run,vma)+1e-9) return false;
    const old=s.wk.days[i]; s.wk.days[i]={...s.d,run,kind:run.type}; const b=base.get(s.wk);
    if(b&&(hardOf(s.wk)>b.h+6+1e-9||zoneMins(s.wk.days).easy<Math.min(b.e,.8)-1e-9)){ s.wk.days[i]=old; return false; }
    s.wk.evN=(s.wk.evN||0)+1; s.d=s.wk.days[i]; return true; };
  // douleur notée : un test exigeant à venir devient le test en aisance (ou un footing facile) ; mêmes emplacements qu'avec le test, jamais de type d'intensité en plus ou en moins
  const soften=s=>{ const i=s.wk.days.indexOf(s.d), km0=sessionKm(s.d.run,vma), soft=evCont(km0,vma)||evEasyFb(km0,vma); if(isSoft(s.wk,s.d,s.d.run,soft)) s.wk.days[i]={...s.d,run:soft,kind:"easy"}; };
  const slots=[...qDays(wA),...qDays(wB)];
  if(deb){ const d=wA.days.find(x=>free(wA,x)&&x.run.type==="easy"&&x.run.deb)||wA.days.find(x=>free(wA,x)&&x.run.deb); if(d) put({wk:wA,d},evDeb(d.run,vma)); }
  else if(prud){ let done=false; for(const s of slots) if(put(s,evCont(sessionKm(s.d.run,vma),vma))){ done=true; break; }
    if(!done){ const d=wA.days.find(x=>free(wA,x)&&evRefOk(x.run)); if(d) put({wk:wA,d},evCont(sessionKm(d.run,vma),vma)); } }
  else {
    // 1 test (3 séances par semaine, ou 6 semaines ou moins), 2 tests à partir de 4 séances et 7 semaines, 3 à partir de 5 séances et 9 semaines (comptées depuis la semaine des tests)
    const R=N-j0, nT=1+(p.seances>=4&&R>=7?1:0)+(p.seances>=5&&R>=9?1:0), noVma=!p.types.includes("vma")||((p.prefK||PREF0).no||[]).includes("vma");
    const hard= noVma? ["end"] : nT>=2? ["vma6","end"] : ["vma6"], used=new Set(), taken=new Set();
    for(const t of hard){ for(const s of slots){ if(used.has(s.wk.w)||taken.has(s.d)) continue;   // un test exigeant par semaine au plus
        const km0=sessionKm(s.d.run,vma), d0=s.d, cands= t==="vma6"? [evVma6(km0,vma)] : [...evEnd(km0,vma),evCont(km0,vma)];   // endurance : durée raccourcie, sinon test en aisance
        if(cands.some(r=>put(s,r))){ taken.add(d0); used.add(s.wk.w); if(s.d.run.type==="q") soften(s); break; } } }
    const fr=wA.days.find(d=>d.run&&d.kind!=="before"&&(!from||dateOf(wA,d)>=from));
    if(nT>=3&&fr&&free(wA,fr)&&evRefOk(fr.run)&&!isSoft(wA,fr,evRef(fr.run),null)) put({wk:wA,d:fr},evRef(fr.run));   // douleur : footing simple, sans consigne de test
  }
  // volume réellement placé : les km qu'un test a en moins reviennent sur un footing facile de la même semaine (jamais au-delà du plan sans tests),
  // pour que la règle des +8 % tienne aussi entre la semaine des tests et la suivante
  for(const [wk,b] of base){ const lack=b.km-kmOf(wk); if(!(lack>.05)) continue;
    const js=wk.days.map((d,i)=>i).filter(i=>{ const d=wk.days[i]; return free(wk,d)&&evRefOk(d.run); }).sort((x,y)=>sessionKm(wk.days[x].run,vma)-sessionKm(wk.days[y].run,vma)); if(!js.length) continue;
    const i=js[0], d=wk.days[i], r=d.run, k0=sessionKm(r,vma), n=r.blocks[1]&&r.blocks[1].iv? r.blocks[1].iv.n : 0;
    for(let k=Math.floor((k0+lack)*10)/10;k>k0+.05;k=Math.round((k-.1)*10)/10){ const nr={...easyRun(k,vma,r.title,n),...(r.note?{note:r.note}:{})}; wk.days[i]={...d,run:nr};
      if(kmOf(wk)<=b.km+1e-9) break; wk.days[i]=d; } }
  // reste un écart sous la minute : les semaines suivantes gardent la règle des +8 % (1 km au moins) sur le volume placé avec les tests,
  // comme le moteur (marge de 0,1 km) : le plus long footing facile perd une minute à la fois ; on s'arrête à la première semaine qui la respecte sans retouche
  let prev=null;
  for(let j=j0;j<N;j++){ const wk=weeks[j]; if(!okW(wk)){ if(wk&&(wk.phase==="taper"||wk.phase==="race")) break; continue; }
    if(prev&&prev.w>1&&j>j0){ const runs=prev.days.filter(d=>d.run&&d.kind!=="before").length, cap=Math.max(kmOf(prev)*1.08,kmOf(prev)+(runs<Math.min(p.seances,3)?3.2:1))+.1;
      let cut=false;
      for(let g=0;g<40&&kmOf(wk)>cap+1e-9;g++){ const js=wk.days.map((d,i)=>i).filter(i=>{ const d=wk.days[i]; return free(wk,d)&&evRefOk(d.run)&&d.run.blocks[0].min>20; }).sort((x,y)=>wk.days[y].run.blocks[0].min-wk.days[x].run.blocks[0].min);
        if(!js.length) break; const d=wk.days[js[0]], b0=d.run.blocks[0]; wk.days[js[0]]={...d,run:{...d.run,blocks:[{...b0,min:b0.min-1},...d.run.blocks.slice(1)]}}; cut=true; }
      if(!cut&&j>j0+1) break; }   // semaine 1 (retouchée par firstWeekFix) : jamais repère, comme dans le moteur
    prev=wk; }
}
// estimation d'après un résultat noté (rec) pour la séance de test ev ; cur : VMA utilisée aujourd'hui
// vma6 : VMA ≈ distance en 6 min (m) ÷ 100 ; end : VMA ≈ vitesse moyenne ÷ 0,87 (30 min ou 5 km soutenus mais contrôlés, ≈ 87 % de la VMA : estimation prudente)
// cont : VMA ≈ vitesse en aisance ÷ 0,75 (une allure confortable est sous 75 % de la VMA : estimation basse, donc prudente) ; deb : minutes de course continue
const EV_VMA=[8,25], EV_5K=[Math.ceil(5/(25*.87)*3600),Math.floor(5/(8*.87)*3600)];   // 5 km : de 13:48 à 43:06 pour une VMA de 8 à 25 km/h
function evEst(ev,rec){ if(!ev||!rec) return null; const out={t:ev.t};
  let spd=null;
  if(ev.t==="vma6") out.vma=rec.v/100;
  else if(ev.t==="end"){ spd= rec.m==="5k"? 5/(rec.v/3600) : rec.v/((ev.T||30)/60); out.vma=spd/.87; }
  else if(ev.t==="cont"){ spd=rec.v/((ev.T||30)/60); out.vma=spd/.75; if(rec.rpe>=7){ out.err="Effort noté à "+rec.rpe+"/10 : ce n'était pas une allure confortable, l'estimation ne serait pas fiable. Reprends plus doucement : refais ce test à allure plus facile un autre jour."; out.errF="rpe"; } }
  else if(ev.t==="deb"){ out.run=rec.v; out.start=evDebStart(rec.v);
    if(rec.rpe>=7){ out.err="Effort noté à "+rec.rpe+"/10 : c'était trop dur pour une allure confortable. Reprends plus doucement : refais le test à allure plus facile, en marchant plus souvent."; out.errF="rpe"; } }
  else if(ev.t==="ref"){ if(rec.v2>0&&rec.v>0) out.pace=rec.v2/(rec.v/60); }
  if(out.vma!=null){ out.vma=Math.round(out.vma*10)/10; if(!(out.vma>=EV_VMA[0]&&out.vma<=EV_VMA[1])) out.err="Résultat peu plausible : il donnerait une VMA de "+fmt1(out.vma)+" km/h, hors de "+EV_VMA[0]+" à "+EV_VMA[1]+" km/h. Vérifie ta saisie (unité, distance, temps)."; }
  return out; }
// avant / après : résumé de la séance remplacée par l'IA (celle affichée avant l'IA, préférences comprises), gardé sur la séance (run.aiFrom) ; recalculé à chaque construction du plan, jamais enregistré
const runSum=r=>r.blocks.map(b=>b.l+(b.min&&!b.mix&&b.z!=="walk"&&b.work==null?" "+fmt0(b.min)+" min":"")).join(" · ");
const aiSnap=(r,vma,trail)=>({t:trail? trailTitle(r.title) : r.title,s:runSum(r),km:sessionKm(r,vma),min:sessionDur(r)});   // trail : titre tel que trailize l'affichera
// temps choisi par la personne. Renforcement : chaque séance prend la durée demandée (mêmes exercices, séries ou récupérations ajustées).
// Quota d'heures par semaine (course et trail) : c'est un plafond. Au-delà, les footings simples sont raccourcis (20 min au moins), puis la sortie longue
// facile (70 % au moins) ; les séances d'intensité, la semaine de course et les séances déjà cochées ne changent pas. En dessous, rien n'est ajouté :
// la progression prudente du plan reste la limite. wk.time = {t0 : minutes prévues, t : après ajustement, cap : quota} pour l'affichage.
const weekMin=wk=> wk.days.reduce((a,d)=>d.kind==="before"? a : a+(d.run?sessionDur(d.run):0)+(d.renfo?parseInt(d.renfo.m)||0:0),0);
function applyTime(weeks,p){ const rm=p.renfoMin, q=p.hQuota; if(!(rm>0)&&!(q>0)) return;
  const run=!evSport(p.sport), vma=run? vmaOf(p).vma : 0, locked=dayLock(p), tq="Raccourci pour tenir ton temps de sport de "+fmt1(q).replace(/,0$/,"")+" h par semaine.";
  for(const wk of weeks){ const lk=d=>locked(wk.w,d);
    if(rm>0) wk.days.forEach((d,i)=>{ if(!d.renfo||d.kind==="before"||lk(d)) return; const m0=parseInt(d.renfo.m)||0; if(!m0||m0===rm) return;
      wk.days[i]={...d,renfo:{...d.renfo,m:String(d.renfo.m).replace(/^\d+\s*min/,rm+" min"),tFrom:m0,rows:[...d.renfo.rows,[rm>m0? "Durée choisie : "+rm+" min" : "Version courte : "+rm+" min", rm>m0? "Mêmes exercices : une série de plus ou des récupérations plus longues, sans charger plus lourd" : "Mêmes exercices, moins de séries"]]}}; });
    if(!(q>0)||!run||wk.phase==="race") continue;
    const cap=q*60, t0=weekMin(wk); wk.time={t0,t:t0,cap}; if(t0<=cap) continue;
    let over=t0-cap; const sp=vma*.66;
    const shrink=(list,floor,mk)=>{ const room=list.map(d=>Math.max(0,sessionDur(d.run)-floor(d))), R=room.reduce((a,b)=>a+b,0); if(R<=0||over<=0) return; const r=Math.min(over,R);
      list.forEach((d,j)=>{ const cut=room[j]*r/R; if(cut<1) return; const i=wk.days.indexOf(d), m=sessionDur(d.run)-cut; wk.days[i]={...d,run:mk(d,Math.max(1.5,Math.round(m/60*sp*10)/10))}; }); over-=r; };
    const pureEasy=d=> d.run&&d.kind!=="race"&&!d.run.ev&&!lk(d)&&d.run.blocks.length===1&&d.run.blocks[0].l==="Footing facile"&&!d.run.blocks[0].mix;
    shrink(wk.days.filter(d=>pureEasy(d)&&d.run.type==="easy"),()=>20,(d,km)=>({...easyRun(km,vma,d.run.title,0),tq:1,note:tq}));
    shrink(wk.days.filter(d=>d.run&&d.run.type==="long"&&!lk(d)&&d.run.blocks.every(b=>b.z==="z1"&&!b.mix)),d=>sessionDur(d.run)*.7,(d,km)=>({...easyRun(km,vma,"Sortie longue raccourcie",0),type:"long",tq:1,note:tq}));
    wk.time.t=weekMin(wk); }
}
// footings, sortie longue et renforcement : ce que l'IA peut y changer, toujours sans ajouter de volume ni d'intensité notable
// footing simple (pas une séance de test, pas déjà du cardio) : lignes droites (pas pour un débutant, pas s'il y en a déjà) ou cardio sans impact de même effort
const aiEasy=d=> !!(d&&d.run&&d.run.type==="easy"&&!d.run.ev&&d.kind!=="race"&&d.kind!=="before"&&!d.run.blocks.some(b=>b.cross));
const aiEasyOpts=(d,p)=>{ const o=[], pure=d.run.blocks.length===1&&d.run.blocks[0].l==="Footing facile"; if(pure&&p.niveau!=="deb") o.push("lignes"); o.push("cardio"); return o; };
const aiLongOk=(d,p)=> p.niveau!=="deb"&&d.run.type==="long";
const aiRenfoOk=(d,p)=> p.niveau!=="deb"&&!(p.renfoMin>0)&&!!d.renfo&&!d.renfo.light&&!!renfoText("light",p.equip);
function aiRest(wk,x,p,vma,trail,lk,mod){ const ds=wk.days.filter(d=>d.run&&d.kind!=="before"&&Array.isArray(d.run.blocks));
  let nc=0; ds.filter(aiEasy).forEach((d,j)=>{ const k=(x.e||[])[j]; if(!k||lk.has(d.i)||!aiEasyOpts(d,p).includes(k)) return; const old=d.run, i=wk.days.indexOf(d), from=old.aiFrom||aiSnap(old,vma,trail);
    if(k==="lignes"){ const km=sessionKm(old,vma); wk.days[i]={...d,run:{...easyRun(km,vma,"Footing + lignes droites",6),ai:1,aiFrom:from,note:"Lignes droites ajoutées par l'IA : courtes et relâchées, pas un fractionné."}}; mod.add(wk.w+":"+i); }
    // cardio : au plus 2 par semaine ; l'activité du profil si elle est choisie, sinon au choix de la personne
    else if(k==="cardio"&&nc<2){ nc++; const m=p.hQuota>0? Math.round(sessionDur(old)) : Math.max(30,Math.round(sessionMin(old)*1.2/5)*5), c=CROSS[p.cross], t=c? c[0] : "Cardio sans impact";
      wk.days[i]={...d,run:{...S("easy",t,[{l:(c?t:"Vélo, elliptique, rameur ou natation")+", effort où tu peux parler",min:m,z:"z1",cross:true,met:c?c[1]:4.8,noPace:true}]),ai:1,aiFrom:from,note:"Remplacé par l'IA : même effort facile, sans les impacts de la course."},kind:"easy"}; mod.add(wk.w+":"+i); } });
  // sortie longue allégée : environ 15 % plus courte et entièrement facile (jamais pour un débutant, dont la sortie suit l'alternance course et marche)
  const lg=ds.find(d=>d.run.type==="long"&&d.kind!=="race"); if(x.l&&lg&&!lk.has(lg.i)&&aiLongOk(lg,p)){ const i=wk.days.indexOf(lg), km=sessionKm(lg.run,vma), k2=Math.max(3,Math.round(km*.85*10)/10);
    wk.days[i]={...lg,run:{...easyRun(k2,vma,"Sortie longue allégée",0),type:"long",ai:1,aiLight:1,aiFrom:lg.run.aiFrom||aiSnap(lg.run,vma,trail),note:"Raccourcie par l'IA d'après ta demande ou ton ressenti : environ 15 % de moins, tout en facile."}}; wk.aiLight=true; mod.add(wk.w+":"+i); }
  // renforcement : version d'entretien (même exercices, moins de séries)
  wk.days.filter(d=>d.renfo&&d.kind!=="before").slice(0,3).forEach((d,j)=>{ if((x.r||[])[j]!=="leger"||lk.has(d.i)||!aiRenfoOk(d,p)) return; const i=wk.days.indexOf(d), old=d.renfo;
    wk.days[i]={...d,renfo:{...old,...renfoText("light",p.equip),ai:1,aiFrom:{t:old.t,m:old.m}}}; mod.add(wk.w+":r"+i); });
}
function applyAi(weeks,p){
  const a=aiOf(p); if(!a) return; const run=!evSport(p.sport), vma=run? vmaOf(p).vma : 0, mod=new Set();   // séances modifiées (une séance changée puis allégée compte une fois)
  // séance d'origine déjà cochée AVANT l'ajustement : jamais modifiée (dayLock) ; une marque posée sur la séance de l'IA ne verrouille pas
  const trail=p.sport==="trail", lockedDay=dayLock(p);
  for(const wk of weeks){ const x=a.wk[wk.w]; if(!x) continue;
    if(x.f||x.c) wk.aiTip={f:x.f,c:x.c};
    if(!run||wk.phase==="taper"||wk.phase==="race") continue;
    const qa=()=>wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind&&d.kind!=="before");   // toutes : l'IA a reçu les options dans cet ordre
    const lk=new Set(wk.days.filter(d=>lockedDay(wk.w,d)).map(d=>d.i));   // verrous évalués sur les séances d'origine (avant l'IA), avant toute modification
    const qd=()=>qa().filter(d=>!lk.has(d.i));
    qa().forEach((d,j)=>{ const k=x.q[j], old=d.run; if(lk.has(d.i)||!k||k===old.kind||!qOpts(old.kind,p,wk.qPool).includes(k)||qa().some(o=>o!==d&&o.run.kind===k)) return;   // pas deux fois le même type dans la semaine
      const i=swapQ(wk,d,k,p,vma,AI_TOL,{ai:1,aiFrom:old.aiFrom||aiSnap(old,vma,trail)},"Séance choisie par l'IA pour cette semaine."); if(i>=0) mod.add(wk.w+":"+i); });
    // allègement : jamais pour un débutant (ses séances sont déjà en facile continu) ; le footing ne dépasse jamais la distance de la séance remplacée
    aiRest(wk,x,p,vma,trail,lk,mod);
    if(x.a&&p.niveau!=="deb"){ const qs=qd(), d=qs[qs.length-1]; if(d){ const i=wk.days.indexOf(d), km=d.run.aiFrom? d.run.aiFrom.km : sessionKm(d.run,vma); let k2=Math.max(1.5,Math.floor(km*10)/10); while(k2>1.5&&sessionKm(easyRun(k2,vma),vma)>km+1e-9) k2=Math.round((k2-.1)*10)/10;
      wk.days[i]={...d,run:{...easyRun(k2,vma,"Footing facile (semaine allégée)",0),ai:1,aiLight:1,aiFrom:d.run.aiFrom||aiSnap(d.run,vma,trail),note:"Allégée par l'IA d'après ton ressenti ou ta demande : même distance, sans intensité."},kind:"easy"}; wk.aiLight=true; mod.add(wk.w+":"+i); } }
  }
  weeks.ai={n:mod.size,at:a.at};
}
function buildPlanRun(p){
  const o=p.objectif, deb=p.niveau==="deb";
  // la distance doit être atteignable avec la complexité choisie ET en standard : la complexité ne fait jamais viser plus loin que le plan standard
  const ok=(c,w)=> reachable(c,w,deb) && (!p.cplx||p.cplx==="standard"||!LONG_NEED[c]||reachable(c,buildPlanFor({...p,cplx:"standard",objectif:c}),deb));
  // avant 18 ans : ni semi ni marathon (repli sur 10 km, ou moins si besoin)
  if(p.minor&&(o==="21"||o==="42")){ const chain=["10","5","forme"]; let weeks=null;
    for(const c of chain){ const w2= c==="forme"? buildPlanFor({...p,objectif:"forme"}) : buildPlanFor({...p,objectif:c}); if(c==="forme"||ok(c,w2)){ weeks=w2; weeks.unreal={asked:o,used:c,top:w2.topLong,minor:true}; break; } }
    capSimple(weeks,{...p,objectif:weeks.unreal.used}); capLong(weeks,{...p,objectif:weeks.unreal.used}); return weeks; }
  let weeks=buildPlanFor(p);
  if(!ok(o,weeks)){
    // repli sur la distance atteignable la plus proche : marathon → semi → 10 km → 5 km → forme
    const asked=o, top=weeks.topLong, chain=["42","21","10","5","forme"];
    for(const c of chain.slice(chain.indexOf(o)+1)){
      const w2= c==="forme"? null : buildPlanFor({...p,objectif:c});
      if(c==="forme"||ok(c,w2)){ weeks= w2||buildPlanFor({...p,objectif:"forme"}); weeks.unreal={asked,used:c,top}; break; }
    }
  }
  capSimple(weeks,weeks.unreal? {...p,objectif:weeks.unreal.used} : p);
  capLong(weeks,weeks.unreal? {...p,objectif:weeks.unreal.used} : p);
  return weeks;
}
// plan simple : chaque semaine reste au plus aussi intense que la même semaine en standard (quand le volume est faible, le standard raccourcit
// ses deux séances alors que la séance unique du simple resterait longue) ; sinon la séance est raccourcie, ou devient un footing de même distance
function capSimple(weeks,p){
  if(p.cplx!=="simple") return; const std=buildPlanFor({...p,cplx:"standard"}), {vma}=vmaOf(p), hard=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type==="q"?d.run.hardMin||0:0),0);
  let lastN=0, lastR=0;
  const kmS=W=>W.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0), isN=W=>!W.deload&&W.phase!=="taper"&&W.phase!=="race";
  const sk=std.map(kmS), ipk=std.reduce((a,W,i)=>isN(W)&&sk[i]>(a<0?-1:sk[a])?i:a,-1), suf=sk.map(()=>Infinity);
  for(let i=std.length-2;i>=0;i--){ const j=i+1; suf[i]=Math.min(suf[j], isN(std[j])&&j<=ipk? sk[j]+.45 : Infinity); }
  const longKm=W=>{ const d=W&&W.days.find(x=>x.run&&x.run.type==="long"); return d?sessionKm(d.run,vma):0; };
  weeks.forEach((wk,i)=>{ const sw=std[i]; if(!sw) return; let cap=hard(sw); const km0=kmS(wk);
    wk.days.forEach((d,j)=>{ if(!d.run||d.run.type!=="q"||!d.run.kind) return; const h=d.run.hardMin||0; if(h<=cap+1e-9){ cap-=h; return; }
      let o={...d.run.qo}, s=null;
      for(let t=0;t<4&&!s;t++){ o= o.short? {...o,fewer:(o.fewer||0)+1} : {...o,short:true}; const c=quality(d.run.kind,wk.w,p,vma,wk.phase,o); if(c&&(c.hardMin||0)<=cap+1e-9&&sessionKm(c,vma)<=sessionKm(d.run,vma)+1e-9) s=c; }
      if(s){ wk.days[j]={...d,run:s}; cap-=s.hardMin||0; }
      else wk.days[j]={...d,run:easyRun(Math.max(1.5,Math.floor(sessionKm(d.run,vma)*2)/2),vma,null,p.types.includes("ld")?4:0),kind:"easy"}; });
    // séance raccourcie : les km perdus reviennent en footing facile (même volume, moins d'intensité ; 1 km de plus par footing au plus)
    for(let g=0;g<4&&kmS(wk)<km0-.3&&wk.phase!=="taper"&&wk.phase!=="race";g++){ const js=wk.days.map((d,j)=>j).filter(j=>{ const r=wk.days[j].run; return r&&r.type==="easy"&&!r.deb&&r.blocks[0].l==="Footing facile"&&r.blocks.length<=2&&(!r.blocks[1]||r.blocks[1].iv)&&wk.days[j].kind!=="before"; })
        .sort((a,b)=>sessionKm(wk.days[a].run,vma)-sessionKm(wk.days[b].run,vma)); if(!js.length) break;
      const d=wk.days[js[0]], r=d.run, k0=sessionKm(r,vma), k=Math.floor((k0+Math.min(1,km0-kmS(wk)))*2)/2; if(k<=k0) break;
      wk.days[js[0]]={...d,run:{...easyRun(k,vma,r.title,r.blocks[1]?r.blocks[1].iv.n:0),...(r.note?{note:r.note}:{})}}; }
    // volume : jamais au-dessus de la même semaine en standard (la séance unique laisse plus de place aux footings), ni plus de +8 %
    // (1 km au moins, 3,2 tant qu'il manque une sortie pour arriver à 3) sur la dernière semaine normale ainsi plafonnée.
    // Dans l'ordre : le plus long footing raccourcit (3 km au plus bas), la séance d'intensité raccourcit, devient un footing plus court, puis est retirée.
    const km=W=>W.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0), normal=!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race";
    const runsOf=W=>W.days.filter(d=>d.run&&d.kind!=="before").length;
    const taper=wk.phase==="race"? weeks.slice(0,i).reverse().find(x=>x.phase==="taper") : null;
    const cap2=Math.min(km(sw)+.05, isN(wk)? suf[i] : Infinity, normal&&lastN? Math.max(lastN*1.08,lastN+(lastR<Math.min(p.seances,3)?3.2:1))+.2 : wk.deload&&lastN? lastN-.3 : Infinity, taper?km(taper):Infinity);
    // footings : 3 km au plus bas (2,5 en affûtage et semaine de course), ou la plus courte séance (footing ou intensité) du standard si elle descend plus bas
    const eStd=sw.days.filter(d=>d.run&&(d.run.type==="easy"||d.run.type==="q")&&!d.run.deb).map(d=>Math.floor(sessionKm(d.run,vma)*2)/2), minE0=normal||wk.deload? 3 : 2.5;
    // semaine allégée : la sortie longue peut descendre à 3 km et un footing peut sauter (sans passer sous les sorties du standard)
    trimWeek(wk,p,vma,cap2,Math.max(2.5,Math.min(minE0,...eStd)),true,wk.deload? 3 : Math.max(3,longKm(sw)),wk.deload&&wk.w>1? sw.days.filter(d=>d.run&&d.kind!=="before").length : null);
    if(normal&&wk.w>1){ lastN=km(wk); lastR=runsOf(wk); } });
}
// plan simple, plus longue sortie déclarée : règle des +10 % revérifiée après le plafond du simple (qui peut raccourcir la séance qui servait de repère) :
// une sortie longue ne dépasse jamais 1,1 × la plus longue séance faite avant (déclarée, ou placée en semaine normale)
function capLong(weeks,p){
  if(evSport(p.sport)||p.niveau==="deb"||p.cplx!=="simple"||(!(p.longest>0)&&!p.minor)) return; const {vma}=vmaOf(p); let mx=p.longest>0?p.longest:0;
  for(const wk of weeks){ const i=wk.days.findIndex(d=>d.run&&d.run.type==="long"&&d.kind!=="before"), d=wk.days[i];
    if(d&&mx>0&&wk.w>1){ const k0=sessionKm(d.run,vma), lim=mx*1.1; if(k0>lim+.1){ let k=Math.floor(lim*10)/10, r=longRun(k,vma,p.objectif,wk.phase);
      for(let t=0;t<10&&sessionKm(r,vma)>lim+.05;t++){ k-=.1; r=longRun(k,vma,p.objectif,wk.phase); } wk.days[i]={...d,run:r}; } }
    if(!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race"||wk.phase==="prep") mx=Math.max(mx,...wk.days.filter(x=>x.run&&x.run.type!=="race"&&x.run.blocks).map(x=>sessionKm(x.run,vma))); }
}
// ramène le volume placé d'une semaine sous cap : le plus long footing raccourcit (minE km au plus bas), la séance d'intensité raccourcit,
// devient un footing plus court, puis (drop) est retirée
function trimWeek(wk,p,vma,cap,minE,drop,longMin,minRuns){
  const km=()=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"&&d.run.blocks?sessionKm(d.run,vma):0),0);
  const plain=r=>r&&r.type==="easy"&&!r.deb&&r.blocks[0].l==="Footing facile"&&r.blocks.length<=2&&(!r.blocks[1]||r.blocks[1].iv);
  const minKm=sessionKm(easyRun(minE,vma),vma), stuck=new Set(), k00=wk.days.map(d=>d.run&&plain(d.run)? sessionKm(d.run,vma) : null);
  for(let g=0;g<80&&km()>cap;g++){
    const js=wk.days.map((d,j)=>j).filter(j=>!stuck.has(j)&&wk.days[j].kind!=="before"&&plain(wk.days[j].run)&&sessionKm(wk.days[j].run,vma)>minKm+.01).sort((a,b)=>sessionKm(wk.days[b].run,vma)-sessionKm(wk.days[a].run,vma));
    if(!js.length) break; const j=js[0], d=wk.days[j], r=d.run, k0=sessionKm(r,vma);
    const k=Math.max(minE,Math.min(Math.ceil((k0-(km()-cap))*2)/2,Math.floor(k0*2)/2-.5)), nr={...easyRun(k,vma,r.title,r.blocks[1]?r.blocks[1].iv.n:0),...(r.note?{note:r.note}:{})};
    if(sessionKm(nr,vma)<k0-1e-9) wk.days[j]={...d,run:nr}; else stuck.add(j); }
  if(longMin>0&&km()>cap){ const j=wk.days.findIndex(d=>d.run&&d.run.type==="long"), d=wk.days[j];
    if(d){ const k0=sessionKm(d.run,vma); if(k0>longMin+.05){ const nk=Math.max(longMin,Math.floor((k0-(km()-cap))*2)/2), nr=longRun(nk,vma,p.objectif,wk.phase); if(sessionKm(nr,vma)<k0-1e-9) wk.days[j]={...d,run:nr}; } } }
  const qDays=()=>wk.days.map((d,j)=>j).filter(j=>{ const r=wk.days[j].run; return r&&r.type==="q"&&r.kind&&wk.days[j].kind!=="before"; }).reverse();
  for(const j of qDays()){ if(km()<=cap) break; let o={...wk.days[j].run.qo};
    for(let t=0;t<4&&km()>cap;t++){ o= o.short? {...o,fewer:(o.fewer||0)+1} : {...o,short:true}; const c=quality(wk.days[j].run.kind,wk.w,p,vma,wk.phase,o);
      if(c&&sessionKm(c,vma)<sessionKm(wk.days[j].run,vma)-1e-9&&(c.hardMin||0)<=(wk.days[j].run.hardMin||0)+1e-9) wk.days[j]={...wk.days[j],run:c}; } }
  // minRuns donné (semaine allégée du simple, sortie ajoutée qui ferait dépasser les +8 %) : le plus court footing saute, sans descendre sous
  // minRuns sorties ; les autres footings reprennent ensuite leur longueur d'avant tant que la semaine reste sous cap
  const runs=()=>wk.days.filter(d=>d.run&&d.kind!=="before").length;
  let cut=false;
  for(let g=0;minRuns!=null&&g<7&&km()>cap&&runs()>minRuns;g++){ const js=wk.days.map((d,j)=>j).filter(j=>wk.days[j].kind!=="before"&&plain(wk.days[j].run)).sort((a,b)=>sessionKm(wk.days[a].run,vma)-sessionKm(wk.days[b].run,vma));
    if(!js.length) break; wk.days[js[0]]={...wk.days[js[0]],run:null,kind:"rest"}; cut=true; }
  for(let g=0;cut&&g<40;g++){ const js=wk.days.map((d,j)=>j).filter(j=>plain(wk.days[j].run)&&k00[j]!=null&&sessionKm(wk.days[j].run,vma)<k00[j]-.25).sort((a,b)=>sessionKm(wk.days[a].run,vma)-sessionKm(wk.days[b].run,vma));
    if(!js.length) break; const d=wk.days[js[0]], r=d.run, k=Math.min(k00[js[0]],Math.floor(sessionKm(r,vma)*2)/2+.5), nr={...easyRun(k,vma,r.title,r.blocks[1]?r.blocks[1].iv.n:0),...(r.note?{note:r.note}:{})};
    if(km()-sessionKm(r,vma)+sessionKm(nr,vma)>cap) break; wk.days[js[0]]={...d,run:nr}; }
  if(!drop) return;
  for(const j of qDays()){ if(km()<=cap) break; const d=wk.days[j], k0=sessionKm(d.run,vma), er=easyRun(Math.max(minE,Math.floor((k0-(km()-cap))*2)/2),vma,null,0);
    if(sessionKm(er,vma)<k0-1e-9) wk.days[j]={...d,run:er,kind:"easy"}; }
  for(const j of qDays()){ if(km()<=cap) break; wk.days[j]={...wk.days[j],run:null,kind:"rest"}; }
}
// première semaine du plan, avant la mise à jour des repères de progression (sinon la semaine 2 part d'une séance jamais faite) :
// les jours d'avant le début sont au maintien, sans séance ; la première séance n'est jamais dure ni la sortie longue, mais un footing facile
function firstWeekFix(wk,p,vma){
  if(!wk||wk.phase==="race") return;
  if(p.startIdx>0) wk.days=wk.days.map(d=> d.i<p.startIdx? {...d,run:null,kind:"before",renfo:null} : d);
  const i=wk.days.findIndex(d=>d.run&&d.kind!=="before"), d=i>=0?wk.days[i]:null;
  if(d&&(d.run.type==="q"||d.run.type==="long")){
    const run= p.niveau==="deb"? {...d.run,type:"easy",title:"Course / marche",note:"Première séance du plan : tout en facile."}
      : {...easyRun(Math.max(3,Math.min(8,Math.round(sessionKm(d.run,vma)*.6*2)/2)),vma,null,0),note:"Première séance du plan : un footing facile pour démarrer."};
    wk.days[i]={...d,run,kind:"easy"}; wk.firstEasy=true; }
}
// progression linéaire : un premier passage donne le volume de pointe vraiment atteignable (sortie longue, footings et séances plafonnés) ;
// le plan est ensuite reconstruit avec une montée régulière du volume de départ à ce pic, atteint à la dernière semaine normale
// (au lieu de +7 % par semaine dès le début puis un plateau). Garde-fous inchangés (+8 %, semaines allégées, affûtage, course).
// Débutant : modèle en minutes de course/marche, inchangé. Si la montée régulière ne mène plus la sortie longue aussi loin, le premier passage est gardé.
function buildPlanFor(p){
  if(p.objectif!=="forme"&&planLen(p)>20) return buildLongPlan(p,planLen(p));
  const w1=planCore(p,null); if(p.niveau==="deb"||p.noLin) return w1;
  const lin=linFactors(w1,p); if(!lin) return w1;
  const w2=planCore(p,lin);
  return linOk(w2,w1,p)? w2 : w1;
}
// montée régulière du volume prévu (V) : du volume de départ au pic réellement placé au premier passage (+3 %), atteint à la dernière semaine normale
function linFactors(weeks,p){
  const V0=weeks.V0, isNorm=wk=>!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race";
  const J=weeks.map((wk,i)=>i).filter(i=>isNorm(weeks[i])); if(J.length<3||!(V0>0)) return null;
  const Pk=Math.min(Math.max(...J.map(i=>weeks[i].V)),Math.max(...J.map(i=>weeks.kmPl[i]))*1.03); if(!(Pk>V0*1.02)) return null;
  const f=weeks.f.slice(); let last=1;
  weeks.forEach((wk,i)=>{ const j=J.indexOf(i);
    if(j>=0){ f[i]=(V0+(Pk-V0)*j/(J.length-1))/V0; last=f[i]; }
    else if(wk.deload) f[i]=last*.75; });
  return f;
}
// le plan à montée régulière n'est gardé que s'il ne fait jamais moins que le premier passage : pic de volume, plus longue sortie,
// sorties par semaine, séances d'intensité (une montée plus douce peut rester bloquée par la règle des +8 % quand le volume placé reste sous le volume prévu)
function linOk(w2,w1,p){
  const v=vmaOf(p).vma, norm=W=>W.filter(wk=>!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race"&&wk.w>1);
  const km=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,v):0),0);
  const st=W=>{ const n=norm(W); return {pk:Math.max(0,...n.map(km)), L:Math.max(0,...W.filter(wk=>wk.phase!=="race").map(wk=>{ const d=wk.days.find(x=>x.run&&x.run.type==="long"); return d?sessionKm(d.run,v):0; })),
    runs:n.reduce((a,wk)=>a+wk.days.filter(d=>d.run&&d.kind!=="before").length,0)/Math.max(1,n.length), q:W.reduce((a,wk)=>a+wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind!=="allure").length,0)}; };
  // semaines normales qui redescendent, ou qui dépassent la règle des +8 % sur la précédente
  const bad=W=>{ const n=norm(W); let c=0; for(let i=1;i<n.length;i++){ const x=km(n[i]), y=km(n[i-1]), r=n[i-1].days.filter(d=>d.run&&d.kind!=="before").length;
    if(x<y-.5||x>Math.max(y*1.08,y+(r<Math.min(p.seances,3)?3.2:1))+.3) c++; } return c; };
  const a=st(w2), b=st(w1), need=LONG_NEED[p.objectif]||0;
  return a.pk>=b.pk*.97-.05 && a.L>=b.L-.05 && a.runs>=b.runs-.05 && (a.q>0||b.q===0) && w2.topLong>=Math.min(w1.topLong,need||w1.topLong)-.05 && bad(w2)<=bad(w1);
}
function planCore(p,lin){
  const {vma}=vmaOf(p), o=p.objectif, isRace=o!=="forme", deb=p.niveau==="deb", cap=OBJ[o].cap;
  const N=planLen(p), fact=lin||factors(isRace,N,p.dlOff), vol=isNaN(p.volume)?0:p.volume, kmPlan=[], seen=new Set(p.qSeen||[]);
  // volume de départ = volume déclaré (jamais plus) ; sans volume déclaré, un minimum selon les séances et la plus longue sortie
  const V0= deb? Math.max(vol,8) : vol>0? vol : Math.min(10, Math.max(8, p.longest>0? Math.min(p.longest,cap)*1.6 : 0));   // sans volume déclaré : départ prudent (10 km au plus)
  // maxLong : plus longue séance faite (déclarée, puis la plus longue de chaque semaine normale)
  let maxLong=!isNaN(p.longest)&&p.longest>0?p.longest:Math.max(3,Math.min(V0*.3,cap));
  let lastQK=null, lastQW=0, lastPh=null, lastVn=0, lastReal=0, lastRuns=0, lastQ=0, lastKm=0, prevL=null, peak=0, debLong=!isNaN(p.longest)&&p.longest>0?p.longest:0, debBout=0, topLong=0, debS10Min=0, debS10LongMin=0, bigLast=false, bigN=0;
  const need=LONG_NEED[o]||0, longFrac= o==="21"||o==="42"? .5 : .45;
  const weeks=[];
  for(let w=1;w<=N;w++){
    const phase=phaseOf(w,isRace,N), deload=isDeload(w,isRace,N,p.dlOff), normal=!deload&&phase!=="taper"&&phase!=="race";
    let V=V0*fact[w-1];
    // plafond absolu de volume hebdo selon l'objectif (débutant : 60 %), jamais sous le volume de départ
    if(p.vmax) V=Math.min(V,Math.max(V0,(VMAX[o]||60)*(deb?.6:1)));
    if(p.minor) V=Math.min(V,Math.max(V0,40));   // avant 18 ans : 40 km par semaine au plus
    // pas de saut de volume : une semaine normale ne dépasse pas de plus de 8 % (1 km au moins) la dernière semaine normale réellement placée
    // (exception : un footing de plus tant que la semaine a moins de 3 sorties, la fréquence passe avant la longueur)
    // quand le volume placé reste sous le volume prévu (sorties au minimum), le repère est le volume prévu de la semaine d'avant :
    // sinon la semaine ne grandit jamais (bas volume) ; le volume réellement placé reste contrôlé plus bas (+8 % au plus)
    if(normal&&lastKm>0){ const b=Math.max(lastKm,Math.min(lastVn,lastKm*1.1)); V=Math.min(V,Math.max(b*1.08,b+(lastRuns<Math.min(p.seances,3)?3.2:1))); }
    if(deload&&lastKm>0) V=Math.min(V,lastKm*.78);   // semaine allégée : −20 à −30 % par rapport à la semaine normale qui précède
    if(phase==="taper"&&peak) V=Math.min(V,peak*.55,lastKm||Infinity);   // affûtage : −45 % (Bosquet 2007 : −41 à −60 %), jamais plus que la semaine 10
    if(phase==="race"&&peak) V=Math.min(V,peak*.45,lastKm?lastKm*.85:Infinity);
    const ref=Math.min(maxLong,cap), lim=maxLong*1.1;
    // plan long (après la préparation générale) : sortie longue de 3 h au plus, sauf ce qu'il faut pour atteindre LONG_NEED ;
    // au-delà de 29,5 km seulement en phase spécifique (2 sorties de 30 km et plus au maximum)
    // durée maximale de la sortie longue (Daniels, Pfitzinger : 2 h 30 à 3 h ; au-delà, le risque monte sans gain) : en km à l'allure de la sortie longue,
    // jamais sous ce qu'il faut pour atteindre LONG_NEED ; avant 18 ans, 1 h 30 au plus
    const durKm=(p.minor?90:LONG_MAX_MIN[o]||150)/60*vma*.64;
    const capL= p.minor? Math.min(cap,durKm) : Math.min(cap,Math.max(need,p.vmax? Math.min(durKm,phase==="spe"?cap:29.5) : durKm));
    let L=null, shortAlt=false;
    if(phase==="taper") L=Math.min(lim,Math.max(5,ref*.6),prevL||Infinity);
    else if(deload) L=Math.max(4,Math.min(ref*.8,V*.33));
    else if(phase!=="race"){
      // semi et marathon : la sortie longue progresse par petits paliers (+8 %, 1 km au moins), sous la limite des +10 %
      // et sans dépasser la moitié du volume de la semaine (au-delà, la semaine repose sur une seule sortie)
      // 5 et 10 km : la sortie longue progresse aussi tant qu'elle n'atteint pas la moitié de la distance de course × 1,4
      const grows= o==="21"||o==="42"||(need>0&&(prevL==null?ref:prevL)<need);
      const grow= grows&&prevL!=null? Math.min(prevL+Math.max(1,prevL*.08),V*.5) : ref;
      L=Math.min(capL,lim,Math.max(V*(deb?.38:.35),Math.min(ref,capL),grow));
      // la règle des +10 % est un plafond, pas un plancher : la sortie longue reste sous 45 % du volume (50 % en semi et marathon), 5 km au moins
      L=Math.min(L,Math.max(5,V*longFrac)); L=Math.max(L,Math.min(ref,5,lim));
      // plan long, marathon : une fois la sortie longue au niveau visé, une semaine sur deux elle redescend vers 80 % (3 à 5 sorties de 28 km et plus)
      if(p.vmax&&o==="42"&&normal&&(bigLast||bigN>=5)&&prevL){ L=Math.min(L,prevL*.8); shortAlt=true; }
    }
    // arrondi au demi-km, au dixième sous la limite des +10 % (sinon une petite sortie longue ne progresse jamais)
    if(L){ let r=Math.round(L*2)/2; if(r>lim+1e-9) r=Math.floor(lim*10)/10; if(deload&&prevL) r=Math.max(Math.min(r,prevL-.5),Math.min(3,lim)); L=r; }
    const ctxW={wt:tplWeek(w,isRace,N),N,lim,ref,debLong,debBout,debS10Min,debS10LongMin,lastRuns,lastQ,lastKm,vol:Math.max(vol,deb?8:0),seen};
    let wk=buildWeek(p,w,phase,deload,V,L,vma,ctxW);
    // débutant, semaine allégée : la semaine allégée du modèle de 12 semaines (4 ou 8) si elle est plus légère (audit MET-07 : jamais plus chargée que la semaine normale d'avant)
    if(deb&&deload){ const tw=ctxW.wt, dlT= tw>=8?8 : tw>=4?4 : Math.max(1,tw-1); if(dlT!==tw){ const km=x=>x.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0), w2=buildWeek(p,w,phase,deload,V,L,vma,{...ctxW,wt:dlT}); if(km(w2)<km(wk)-1e-9) wk=w2; } }
    // INVARIANT : le volume placé ne dépasse jamais +8 % et ne redescend pas sous la semaine normale d'avant
    // volume réellement placé (arrondis, minimums, séances retirées) : la semaine est reconstruite avec un autre volume prévu si elle
    // dépasse la règle des +8 %, si une semaine allégée n'est pas plus légère, ou si une semaine normale redescend sous la précédente
    if(!deb&&lastKm>0&&phase!=="taper"&&phase!=="race"){ const kmW=x=>x.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0);
      const bK=Math.min(lastKm,lastReal||lastKm), hi= deload? lastKm-.3 : Math.max(bK*1.08,bK+(lastRuns<Math.min(p.seances,3)?3.2:1)), lo= deload? 0 : Math.min(lastKm-.3,hi);
      let Vt=V; for(let t=0;t<5;t++){ const k=kmW(wk); if(k<=hi+.1&&k>=lo) break;
        Vt= k>hi+.1? Vt-(k-hi)-.1 : Math.min(Vt+(lo-k)+.2,hi); if(!(Vt>0)) break;
        const w2=buildWeek(p,w,phase,deload,Vt,L,vma,k>hi+.1? ctxW : {...ctxW,easyFrac:.85}), k2=kmW(w2);   // trop bas : footings jusqu'à 85 % de la sortie longue
        if(k>hi+.1? k2<k-1e-9&&k2>=lo : (k2>k+1e-9&&k2<=hi+.1)) wk=w2; else break; }   // trop haut : jamais sous la semaine d'avant (sinon la semaine est raccourcie plus bas)
      // la sortie longue peut rester au niveau de la semaine normale d'avant
      if(kmW(wk)>hi+.1) trimWeek(wk,p,vma,hi+.1,3,false,deload?3:prevL||0,deload||!lastRuns? null : lastRuns);
      // montée régulière : une semaine bloquée sous son volume prévu (footings au plafond) prend des footings un peu plus longs
      if(lin&&!deload&&kmW(wk)<Math.min(V,hi)-.5){ const w2=buildWeek(p,w,phase,deload,V,L,vma,{...ctxW,easyFrac:.85}), k2=kmW(w2); if(k2>kmW(wk)+1e-9&&k2<=hi+.1) wk=w2; }
      // toujours sous la semaine normale d'avant (volume plafonné) : mêmes séances d'intensité qu'elle, même variante
      if(!deload&&kmW(wk)<lo-1e-9&&lastQK&&(phase===lastPh||phase!=="spe"&&lastPh!=="spe")){ const w3=buildWeek(p,w,phase,deload,Math.min(Math.max(V,lastKm),hi),L,vma,{...ctxW,easyFrac:.85,forceK:lastQK,qW:lastQW}), k3=kmW(w3); if(k3>kmW(wk)+1e-9&&k3<=hi+.1) wk=w3; }
      // en dernier recours : volume prévu ramené autour de celui de la semaine d'avant (la semaine se construit comme elle)
      for(const Vc of [lastKm,lastKm+.5,lastKm+1]){ if(deload||kmW(wk)>=lo-1e-9) break; const w4=buildWeek(p,w,phase,deload,Vc,L,vma,ctxW), k4=kmW(w4); if(k4>kmW(wk)+1e-9&&k4<=hi+.1) wk=w4; } }
    if(phase==="race"&&p.raceIdx!=null){ wk.raceAt=true; const li=wk.days.findIndex(d=>d.kind==="race"), ri=p.raceIdx;
      if(li>=0&&li!==ri){ const D=wk.days, race=D[li].run; D[li]={...D[li],run:null,kind:"rest",renfo:null};
        D[ri]={...D[ri],run:race,kind:"race",renfo:null};
        for(let i=0;i<7;i++){ if(i===ri)continue; if(i>ri||i===ri-1){ D[i]={...D[i],run:null,kind:"rest",renfo:null}; } } } }
    // volume prévu (repère du +8 %) : celui de la semaine complète, même si elle commence en cours de semaine
    const kmPl=wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0), runsPl=wk.days.filter(d=>d.run).length, qPl=wk.days.filter(d=>d.run&&d.run.type==="q").length;
    kmPlan.push(kmPl);
    const fixed= w===1&&!p.noFirst;
    if(fixed){ const ks=wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind&&d.run.kind!=="allure").map(d=>d.run.kind);
      firstWeekFix(wk,p,vma);
      // la séance retirée (avant le début, ou première séance facile) était la plus ancienne : les séances restantes prennent les types les plus anciens
      const ord=c=>Q_ORDER.indexOf(c); ks.sort((a,b)=>ord(a)-ord(b));
      wk.days.forEach((d,i)=>{ if(!d.run||d.run.type!=="q"||!d.run.kind||d.run.kind==="allure"||d.kind==="before") return; const k=ks.shift();
        if(k&&k!==d.run.kind){ const s2=quality(k,w,p,vma,phase,d.run.qo); if(s2) wk.days[i]={...d,run:s2}; } }); }
    wk.days.forEach(d=>{ if(d.run&&d.run.type==="q"&&d.run.kind&&d.run.kind!=="allure"&&d.kind!=="before") seen.add(d.run.kind); });
    const sess=wk.days.filter(d=>d.run&&d.run.type!=="race").map(d=>sessionKm(d.run,vma));
    const km=sess.reduce((a,x)=>a+x,0), mx=Math.max(0,...sess);
    const lr=wk.days.find(d=>d.run&&d.run.type==="long");
    if(w<=N-2){ peak=Math.max(peak,km); if(lr) topLong=Math.max(topLong,deb?sessionKm(lr.run,vma):wk.L||0); }
    // sortie longue de la semaine 1 retirée (avant le début, ou première séance) : la progression repart de la plus longue sortie déclarée
    const hasL= !fixed || wk.days.some(d=>d.run&&d.run.type==="long");
    if(normal){ const qs=wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind&&d.kind!=="before"); lastQK= qs.length? [qs[0].run.kind,qs[1]?qs[1].run.kind:null] : null; lastQW= qs.length&&qs[0].run.qo&&qs[0].run.qo.w || w; lastPh=phase;
      lastVn=V; lastReal=kmPl; maxLong=Math.max(maxLong,mx); if(L&&hasL&&!shortAlt)prevL=L; lastRuns=runsPl; lastQ=qPl; if(!shortAlt) lastKm=kmPl; bigLast= !shortAlt&&!!L&&L>=need-.05; if(bigLast) bigN++; }
    else if(deload) bigLast=false;
    if(deb){ if(lr&&normal) debLong=Math.max(debLong,sessionKm(lr.run,vma)); if(w===N-2&&lr){ debBout=lr.run.deb.bouts; debS10LongMin=sessionMin(lr.run); debS10Min=wk.days.reduce((a,d)=>a+(d.run?sessionMin(d.run):0),0); } }
    weeks.push(wk);
  }
  // autour de la course : repos la veille et le lendemain, pas de qualité dans les 3 jours avant, pas de sortie longue dans les 6 jours avant
  const last=weeks[weeks.length-1];
  if(isRace&&last&&last.phase==="race"){
    const ri=last.days.findIndex(d=>d.kind==="race");
    if(ri>=0){
      const flat=[...(weeks[weeks.length-2]?weeks[weeks.length-2].days.map(d=>({wk:weeks[weeks.length-2],d})):[]),...last.days.map(d=>({wk:last,d}))], rpos=7+ri;
      for(let k=0;k<flat.length;k++){ const {wk:W,d}=flat[k], dist=rpos-k; if(!d.run||d.kind==="race")continue; const idx=W.days.indexOf(d);
        if(dist===1||dist===-1){
          // veille : une sortie longue est avancée de 1 jour en footing court (sinon l'affûtage peut rester sans course)
          if(dist===1&&d.run.type==="long"&&k>0){ const prev=flat[k-1], pi=prev.wk.days.indexOf(prev.d);
            if(!prev.d.run||prev.d.run.type!=="q") prev.wk.days[pi]={...prev.d,run:easyRun(Math.max(4,Math.min(8,Math.round(sessionKm(d.run,vma)))),vma,null,0),kind:"easy"}; }
          W.days[idx]={...d,run:null,kind:"rest",renfo:null}; W.trimmed=true; continue; }
        if(dist<0){ W.days[idx]={...d,run:null,kind:"rest",renfo:null}; continue; }
        if(dist<=3&&d.run.type==="q"){ W.days[idx]={...d,run:S("easy","Footing + lignes droites",[{l:"Footing facile",min:22,z:"z1",lo:E_LO,hi:E_HI},{l:"4 lignes droites de 20 s, relâchées (récup. marche)",min:0,z:"z3",lo:.95,hi:1.05,noPace:true}],{note:"Proche de la course : court et facile, juste pour garder les jambes vives."}),kind:"easy",renfo:null}; continue; }
        if(dist<=6&&d.run.type==="long"){ const km=Math.min(8,sessionKm(d.run,vma)); W.days[idx]={...d,run:easyRun(Math.max(4,Math.round(km)),vma,null,0),kind:"easy",renfo:null}; W.trimmed=true; }
        if(dist<=2&&d.renfo) W.days[idx]={...W.days[idx],renfo:null};
      }
      // la part de facile reste vers 80 % : une séance de qualité de trop redevient un footing avec lignes droites
      for(const W of [weeks[weeks.length-2],last]){ if(!W||!W.trimmed)continue; W.dropped=null; W.limited=false;
        for(let i=6;i>=0&&zoneMins(W.days).easy<.8;i--){ const d=W.days[i]; const nq=W.days.filter(x=>x.run&&x.run.type==="q").length;
          if(d.run&&d.run.type==="q"&&nq>(W===last?1:0)) W.days[i]={...d,run:easyRun(Math.max(4,Math.round(Math.min(8,sessionKm(d.run,vma)))),vma,null,p.types.includes("ld")?4:0),kind:"easy"}; } }
    }
  }
  applyCross(weeks,p);
  weeks.topLong=topLong; weeks.V0=V0; weeks.kmPl=kmPlan; weeks.f=fact; weeks.seen=[...seen];
  return weeks;
}
// cardio sans impact : remplace le footing noté dans son emplacement, rien d'autre ne bouge (hors du contrôle de volume)
function applyCross(weeks,p){
  if(p.cross!=="non"&&CROSS[p.cross]) for(const W of weeks){ const i=W.crossIdx, d=i!=null?W.days[i]:null;
    if(!d||!d.run||d.run.type!=="easy"||d.kind==="race") continue;
    const m=Math.max(30,Math.round(sessionMin(d.run)*1.2/5)*5), [t,met]=CROSS[p.cross];
    W.days[i]={...d,run:S("easy",t,[{l:t+", effort où tu peux parler",min:m,z:"z1",cross:true,met,noPace:true}],{note:"Remplace un footing : même effort facile, sans les impacts."}),kind:"easy"}; W.cross=i; }
}
// plan de plus de 20 semaines : (N − 20) semaines de préparation générale, puis le plan de 20 semaines habituel,
// qui part du volume et de la sortie longue atteints. Débutant : le modèle débutant de 12 semaines d'abord, puis un plan intermédiaire.
function buildLongPlan(p,N){
  const {vma}=vmaOf(p), o=p.objectif, cap=OBJ[o].cap;
  const kmW=wk=>wk.days.reduce((a,d)=>a+(d.run&&d.run.type!=="race"?sessionKm(d.run,vma):0),0);
  const lrKm=wk=>{ const d=wk.days.find(x=>x.run&&x.run.type==="long"); return d?sessionKm(d.run,vma):0; };
  const join=(a,b)=>{ const off=a.length; b.forEach(wk=>{wk.w+=off;}); const w=[...a,...b]; w.topLong=b.topLong; return w; };
  if(p.niveau==="deb"){
    const first=buildPlanFor({...p,objectif:"forme",nWeeks:0});
    first.forEach((wk,i)=>{ wk.phase="prep"; wk.tw=i+1; });
    // la semaine 12 du modèle est déjà plus légère (−25 %) : elle compte comme allégée, le cycle de 4 semaines continue ensuite sans trou
    if(first[11]) first[11].deload=true;
    const normals=first.filter(wk=>!wk.deload), vol=kmW(normals[normals.length-1]), lg=Math.max(0,...first.map(lrKm));
    // même VMA que le débutant (sinon la valeur type « intermédiaire » changerait les allures)
    const seenD=[...new Set(first.flatMap(wk=>wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind).map(d=>d.run.kind)))];
    const rest=buildPlanFor({...p,niveau:"int",cplx:p.cplx==="avance"?"standard":p.cplx,ref:"vma",refVal:String(vma),nWeeks:N-12,volume:Math.max(8,Math.round(vol)),longest:Math.floor(lg*2)/2,vmax:true,noFirst:true,qSeen:seenD});
    rest.forEach(wk=>{ if(wk.tw==null) wk.tw=99; });
    return join(first,rest);
  }
  const M=N-20, longFrac= o==="21"||o==="42"? .5 : .45, vol=isNaN(p.volume)?0:p.volume;
  const V0= vol>0? vol : Math.min(10, Math.max(8, p.longest>0? Math.min(p.longest,cap)*1.6 : 0));
  let maxLong=!isNaN(p.longest)&&p.longest>0?p.longest:Math.max(3,Math.min(V0*.3,cap));
  // cibles de fin de préparation : volume qui permet la sortie longue utile à la course, sortie longue de 2 h au plus
  // (5 et 10 km : au moins le volume qui porte la sortie longue visée, sinon les footings sautent faute de place)
  const Lt=Math.min(.7*cap,2*vma*.64), Vt=Math.max(V0,Math.min(VMAX[o]||60,Math.max(LONG_NEED[o]||0,Lt)/longFrac));
  // ranLong : plus longue sortie déclarée ou vraiment prévue (pas la valeur par défaut) : le plan principal en repart
  let lastKm=0, lastRuns=0, lastQ=0, prevL=null, Vn=V0, ranLong=!isNaN(p.longest)&&p.longest>0?p.longest:0; const weeks=[];
  for(let j=1;j<=M;j++){
    const deload=j%4===0, pos=(j-1)%4;
    // une fois les cibles atteintes, le bloc de 4 semaines garde une vraie progression : 90-95-100 % du volume visé, 85-92-100 % de la sortie longue visée
    const Vc=Math.max(V0,Vt*[.9,.95,1][pos]||Vt), Lc=Lt*([.85,.92,1][pos]||1);
    let V;
    if(deload) V=(lastKm||V0)*.78;
    else{ V= j===1? V0 : Math.min(Vc,Math.max(V0,Vn*1.045));   // +4 à 5 % par semaine normale
      // règle des +8 % (1 km au moins) par rapport à la dernière semaine normale réellement placée
      if(lastKm>0) V=Math.min(V,Math.max(lastKm*1.08,lastKm+(lastRuns<Math.min(p.seances,3)?3.2:1)));
      Vn=V; }
    const ref=Math.min(maxLong,cap), lim=maxLong*1.1;
    let L;
    if(deload) L=Math.max(4,Math.min(ref*.8,V*.33));
    else{ const g= prevL==null? ref : prevL+Math.max(.5,prevL*.08);
      L=Math.min(cap,lim,prevL==null? Math.min(ref,Lc) : Math.min(g,Lc));
      L=Math.min(L,Math.max(5,V*.55)); }   // la sortie longue laisse de la place aux autres sorties (sinon elles sautent)
    { let r=Math.round(L*2)/2; if(r>lim+1e-9) r=Math.floor(lim*10)/10; if(deload&&prevL) r=Math.max(Math.min(r,prevL-.5),Math.min(3,lim)); L=r; }
    const ctxP={wt:j,N,lim,ref,debLong:0,debBout:0,debS10Min:0,debS10LongMin:0,lastRuns,lastQ,lastKm,vol,easyFrac:.8};
    let wk=buildWeek(p,j,"prep",deload,V,L,vma,ctxP);
    // la fréquence passe avant la longueur : tant qu'il manque une sortie pour arriver à 3 par semaine, la sortie longue raccourcit (3 km au plus bas)
    const runsOf=w_=>w_.days.filter(d=>d.run).length, minRuns=Math.min(p.seances,3);
    while(wk.dropped&&runsOf(wk)<minRuns&&L>3){ L=Math.max(3,L-.5); wk=buildWeek(p,j,"prep",deload,V,L,vma,ctxP); }
    const kmPl=wk.days.reduce((a,d)=>a+(d.run?sessionKm(d.run,vma):0),0), runsPl=runsOf(wk), qPl=wk.days.filter(d=>d.run&&d.run.type==="q").length;
    const fixed= j===1&&!p.noFirst; if(fixed) firstWeekFix(wk,p,vma);
    const sess=wk.days.filter(d=>d.run).map(d=>sessionKm(d.run,vma));
    const hasL= !fixed || wk.days.some(d=>d.run&&d.run.type==="long");
    // plus longue sortie : la distance prévue (la séance, arrondie à la minute inférieure, ferait un peu moins et bloquerait la progression)
    ranLong=Math.max(ranLong,...sess,hasL?L:0);
    if(!deload){ maxLong=Math.max(maxLong,...sess,hasL?L:0); if(hasL) prevL=L; lastRuns=runsPl; lastQ=qPl; lastKm=kmPl; }
    weeks.push(wk);
  }
  applyCross(weeks,p);
  const seenP=[...new Set(weeks.flatMap(wk=>wk.days.filter(d=>d.run&&d.run.type==="q"&&d.run.kind).map(d=>d.run.kind)))];
  const main=buildPlanFor({...p,nWeeks:20,volume:Math.max(1,Math.round(lastKm)),longest:Math.floor(ranLong*2)/2,vmax:true,noFirst:true,dlOff:M%4,qSeen:seenP});
  return join(weeks,main);
}
function shiftIdx(i,p){return p.longDay===5? (i+6)%7 : i;} // samedi : tout décale d'un jour
// part du temps en facile (même calcul que la barre « Équilibre de la semaine »)
function zoneMins(days){
  const z={z1:0,z2:0,z3:0};
  for(const d of days){ if(!d.run||d.run.type==="race")continue; const h=d.run.hardMin||0;
    const hb=d.run.blocks.find(b=>b.z==="z2"||b.z==="z3"&&(b.min||b.work)); if(h&&hb) z[hb.z]+=h;
    for(const b of d.run.blocks){ if(b.z==="walk")continue; if(b.mix)z.z1+=b.mix.run; else if(b.z==="z1")z.z1+=b.min||0; else z.z1+=Math.max(0,(b.min||0)-(b.work!=null?b.work:h)); } }
  z.tot=z.z1+z.z2+z.z3; z.easy=z.tot?z.z1/z.tot:1; return z;
}
function buildWeek(p,w,phase,deload,V,L,vma,ctx){
  const days=Array.from({length:7},(_,i)=>({i,run:null,renfo:null,kind:"rest"}));
  const slot=SLOTS[p.seances]||SLOTS[4], deb=p.niveau==="deb";
  const longIdx=shiftIdx(6,p), eve=(longIdx+6)%7, preEve=(longIdx+5)%7;
  const taperish=phase==="taper"||phase==="race", normal=!deload&&!taperish;
  const kmOf=s=>s?sessionKm(s,vma):0;
  const wt=ctx.wt||w;
  // débutant : jamais de qualité dans les 8 premières semaines réelles, même sur un plan court (semaine du modèle étirée)
  const nQ= deload||p.cplx==="simple"||p.seances===3? 1 : 2;
  let [k1,k2,qPool_]=qualityKinds(p,deb?Math.min(w,wt):wt,phase,{w,N:ctx.N,seen:ctx.seen},nQ);
  // reprise des séances de la semaine normale d'avant (même paire, même variante) : volume plafonné qui ne doit pas redescendre
  if(ctx.forceK&&ctx.forceK.every(k=>!k||(qPool_||[]).includes(k))){ [k1,k2]=ctx.forceK; if(nQ<2) k2=null; }
  if(deload && k2) k2=null; // semaine allégée : une seule séance de qualité
  // plan simple : une seule séance d'intensité par semaine, et du fartlek plutôt que de la VMA
  if(p.cplx==="simple"){ k2=null; if(k1==="vma") k1="fartlek"; }
  if(p.seances===3) k2=null;
  // débutant : durées réduites en affûtage, pas de nouveau palier de course après la semaine 10
  const debF= phase==="taper"?.7 : phase==="race"?.6 : 1, maxBout= wt>10&&ctx.debBout? ctx.debBout : 0, minB= deb? evDebStart(p.debRun) : 0;
  // sortie longue / course
  if(phase==="race"&&deb){
    // débutant : course en course/marche, à allure facile, avec la fraction de la dernière sortie longue
    const bout=ctx.debBout||5, wk_=bout>=10?1.5:1, rp=[.70,.75], sp=(bout*vma*.725+wk_*5.5)/(bout+wk_);
    days[longIdx].run=S("race","Course : "+OBJ[p.objectif].label,[{l:"Échauffement en marche rapide, 10 min",min:10,z:"walk"},{l:"Course en course/marche : "+bout+" min de course / "+String(wk_).replace(".",",")+" min de marche, allure facile, départ prudent",min:0,z:"z1",lo:rp[0],hi:rp[1],race:true}],{racePct:rp,raceSpeed:sp,note:"Garde le même rythme course/marche que ta dernière sortie longue : c'est lui qui t'emmène au bout. Rien de nouveau le jour J."});
    days[longIdx].kind="race";
  }else if(phase==="race"){
    const rp=OBJ[p.objectif].racePct;
    days[longIdx].run=S("race","Course : "+OBJ[p.objectif].label,[{l:"Échauffement 10 à 15 min + 3 lignes droites",min:12,z:"z1",lo:E_LO,hi:E_HI},{l:"Course à l'allure travaillée, départ prudent",min:0,z:"z3",lo:rp[0],hi:rp[1],race:true}],{note:"Rien de nouveau le jour J : mêmes chaussures, même petit-déjeuner que tes sorties longues.",racePct:rp,raceSpeed:vma*(rp[0]+rp[1])/2});
    days[longIdx].kind="race";
  }else if(deb){
    let tot=Math.max(25,Math.round([40,40,42,36,45,48,50,40,52,55,58,45][wt-1]*debF));
    if(phase==="taper"&&ctx.debS10LongMin) tot=Math.min(tot,Math.max(20,Math.floor(ctx.debS10LongMin*.8))); // affûtage : −20 % au moins sur la sortie
    let rw=runWalk(wt,tot,maxBout,minB), s;
    const capKm=ctx.debLong>0? ctx.debLong*1.1 : Infinity;
    for(;;){ s=S("long","Sortie un peu plus longue",rw.blocks,{deb:rw,note:"Doit rester facile du début à la fin."}); if(kmOf(s)<=capKm+.02||tot<=(phase==="taper"?20:25))break; tot-=2; rw=runWalk(wt,tot,maxBout,minB); }
    days[longIdx].run=s;
  }else days[longIdx].run=longRun(L,vma,p.objectif,phase);
  // qualité
  const q=[]; if(slot.q1!=null) q.push([shiftIdx(slot.q1,p),k1]); if(slot.q2!=null) q.push([shiftIdx(slot.q2,p),k2]);
  let easyIdx=slot.e.map(i=>shiftIdx(i,p));
  const qPlan=[]; { let prevK=null; for(const [idx,k0] of q){ const k=pickKind(k0,p,prevK); if(k){ qPlan.push({idx,k,fewer:p.cplx==="simple"?1:0}); prevK=k; } else easyIdx.push(idx); } }
  // préparation générale : choix de la semaine = types cochés sans la VMA (sauf si elle remplace la séance prévue)
  if(phase==="prep"){ qPool_=Q_ORDER.filter(c=>c!=="vma"&&p.types.includes(c)); qPlan.forEach(x=>{ if(!qPool_.includes(x.k)) qPool_.push(x.k); }); }
  // aucune séance ne dépasse la sortie longue ni +10 % de la plus longue faite
  const longKm=days[longIdx].run&&days[longIdx].run.type==="long"? kmOf(days[longIdx].run) : 0;
  const sessCap= deb? (ctx.debLong>0? Math.max(longKm,ctx.debLong*1.1) : Infinity) : Math.min(ctx.lim, (normal||deload)&&longKm? longKm : ctx.ref);
  const longMin=days[longIdx].run&&days[longIdx].run.type==="long"? sessionMin(days[longIdx].run) : 0;
  const opts={short:deb&&taperish,fewer:0};
  // débutant : aucune séance plus longue (en minutes) que la « sortie un peu plus longue »
  const tooLong=s=> kmOf(s)>sessCap+.01 || (deb&&longMin>0&&sessionMin(s)>longMin);
  const buildQ=x=>{ let o={short:opts.short&&!x.noShort,fewer:opts.fewer+x.fewer,...(ctx.qW?{w:ctx.qW}:{})}, s=quality(x.k,w,p,vma,phase,o);
    while(tooLong(s) && o.fewer<4){ if(!o.short)o.short=true; else o.fewer++; s=quality(x.k,w,p,vma,phase,o); }
    // séance impossible à faire tenir sous la plus longue sortie faite : footing court avec lignes droites
    if(tooLong(s)) s= deb? S("easy","Course / marche + lignes droites",runWalk(wt,Math.max(20,Math.min(30,longMin||30)),maxBout,minB).blocks.concat([{l:"4 lignes droites de 15 s, relâchées",min:0,z:"z3",noPace:true}]),{deb:runWalk(wt,Math.max(20,Math.min(30,longMin||30)),maxBout,minB)})
      : easyRun(Math.max(3,Math.floor(sessCap*2)/2),vma,null,p.types.includes("ld")?4:0);
    days[x.idx].run=s; };
  qPlan.forEach(buildQ);
  if(phase==="race"){ // veille : repos ; avant-veille : footing court avec lignes droites
    easyIdx=easyIdx.filter(i=>i!==eve);
    if(easyIdx.includes(preEve) && !deb){ easyIdx=easyIdx.filter(i=>i!==preEve);
      days[preEve].run=S("easy","Footing + lignes droites",[{l:"Footing facile",min:22,z:"z1",lo:E_LO,hi:E_HI},{l:"4 lignes droites de 20 s, relâchées (récup. marche)",min:0,z:"z3",lo:.95,hi:1.05,noPace:true}],{note:"Avant-veille de course : court et facile, juste pour garder les jambes vives."}); }
  }
  easyIdx.sort((a,b)=>a-b);
  let limited=false, easyCap=4, dropped=0;
  if(!deb){
    // volume : les séances de qualité et les minimums ne doivent pas faire exploser la semaine
    const used=()=>days.reduce((a,d)=>a+kmOf(d.run),0), budget=V*(taperish?1:1.05);
    let minEasy=taperish?3:4;
    const need=()=>used()+easyIdx.length*minEasy, over=()=>need()>budget+1e-9;
    const runs=()=>days.filter(d=>d.run).length+easyIdx.length;
    const dropQ=toEasy=>{ const x=qPlan.pop(); days[x.idx].run=null; if(toEasy&&x.idx!==eve) easyIdx.push(x.idx); else dropped++; };
    // affûtage et course : pas plus de séances de qualité que la dernière semaine normale (le rappel d'allure reste en semaine de course)
    if(taperish&&ctx.lastRuns){ const maxQ=phase==="race"?1:ctx.lastQ; while(qPlan.length>maxQ) dropQ(true); }
    if(over()){ opts.short=true; qPlan.forEach(buildQ); }
    if(over()) minEasy=taperish?2.5:3;
    // affûtage : on raccourcit d'abord la sortie longue (jusqu'à la moitié de la plus longue), la fréquence est gardée
    // … sans descendre sous la plus longue séance de qualité de la semaine
    const maxQkm=()=>Math.max(0,...qPlan.map(x=>kmOf(days[x.idx].run)));
    if(over() && L && taperish){ const nl=Math.max(3,Math.ceil(ctx.ref*.5*2)/2,Math.ceil(maxQkm()*2)/2,Math.floor((L-(need()-budget))*2)/2); if(nl<L){ L=nl; days[longIdx].run=longRun(L,vma,p.objectif,phase); } }
    while(over() && opts.fewer<3){ opts.fewer++; qPlan.forEach(buildQ); }
    // en dernier recours : un footing devient du repos (en affûtage, 20 % des séances au plus : la fréquence reste presque entière)
    // affûtage et course : pas plus de sorties que la dernière semaine normale
    // semaine allégée, affûtage et course : pas plus de sorties que la dernière semaine normale (qualité comprise)
    if((taperish||deload)&&ctx.lastRuns) while(runs()>ctx.lastRuns){ if(easyIdx.length) easyIdx.shift(); else if(qPlan.length) dropQ(false); else break; }
    let tDrop=phase==="race"? 1 : phase==="taper"? Math.max(1,Math.floor(runs()*.25)) : Infinity;
    // pas de place pour tout : la 2e séance d'intensité redevient un footing avant qu'une sortie saute (la fréquence passe avant la 2e séance)
    if(!taperish && over() && easyIdx.length && qPlan.length>1){ const x=qPlan.pop(); days[x.idx].run=null; easyIdx.push(x.idx); }
    while(over() && easyIdx.length && tDrop>0){ easyIdx.shift(); dropped++; tDrop--; }
    // une séance de qualité retirée redevient un footing si le volume le permet (la fréquence passe avant la qualité)
    while(!taperish && over() && qPlan.length){ const x=qPlan.pop(); days[x.idx].run=null; if(used()+(easyIdx.length+1)*minEasy<=budget+1e-9) easyIdx.push(x.idx); else dropped++; }
    // affûtage, en dernier recours : une séance de qualité en moins (le rappel d'allure de la semaine de course reste)
    while(taperish && over() && qPlan.length>(phase==="race"?1:0)) dropQ(false);
    // affûtage : une « sortie longue » plus courte qu'une séance de qualité n'en est plus une
    const lrun=days[longIdx].run; if(taperish&&lrun&&lrun.type==="long"&&kmOf(lrun)<maxQkm()-.05){ lrun.type="easy"; lrun.title="Footing facile"; }
    easyIdx.sort((a,b)=>a-b);
    const capRef=L||ctx.ref*.6; easyCap=Math.min((ctx.easyFrac||.75)*capRef,vma*.66,L?L*.9:Infinity); // footing : 75 % de la sortie longue et 1 h au plus
    if(easyCap<minEasy){ minEasy=Math.max(3,Math.floor(easyCap*2)/2); } easyCap=Math.max(minEasy,easyCap);
    const n=easyIdx.length, per=n? Math.max(0,V-used())/n : 0;
    if(n && per>easyCap*1.1) limited=true;
    easyIdx.forEach((idx,j)=>{
      let km=Math.max(minEasy,Math.round(per*2)/2); if(km>easyCap) km=Math.max(minEasy,Math.floor(easyCap*2)/2);
      const strides = (j===n-1 && phase!=="race" && p.types.includes("ld")) ? (deload?4:6) : 0;
      days[idx].run=easyRun(km,vma,null,strides);
    });
  }else{
    easyIdx.forEach((idx,j)=>{
      let tot=Math.max(25,Math.round([30,30,32,28,34,36,38,30,40,40,42,32][wt-1]*debF));
      if(longMin) tot=Math.min(tot,Math.max(25,longMin));
      if(phase==="taper"&&ctx.debS10Min) tot=Math.min(tot,Math.max(20,Math.round(ctx.debS10Min*.8/(easyIdx.length+qPlan.length+1))));
      const rw=runWalk(wt,tot,maxBout,minB);
      const strides= wt>8 && j===easyIdx.length-1;
      days[idx].run=S("easy","Course / marche",rw.blocks.concat(strides?[{l:"4 lignes droites de 15 s, relâchées",min:0,z:"z3",noPace:true}]:[]),{deb:rw});
    });
    // semaine 1 : pas plus que le volume déclaré (+5 %) ; ensuite +10 % au plus par semaine normale. On raccourcit les sorties course/marche, 25 min au plus bas
    if(normal){
      const capKm= w===1? (ctx.vol||8)*1.05 : ctx.lastKm>0? Math.max(ctx.lastKm*1.1,ctx.lastKm+1) : Infinity;
      const total=()=>days.reduce((a,d)=>a+kmOf(d.run),0);
      const shrink=(i,title,note)=>{ const r=days[i].run, m=sessionMin(r); if(m<=25)return false; const strides=r.blocks.length>3?r.blocks.slice(3):[]; const rw=runWalk(wt,m-2,maxBout,minB);
        days[i].run=S(r.type,r.title,rw.blocks.concat(strides),{deb:rw,note:r.note}); return true; };
      for(let g=0; g<40 && total()>capKm+1e-9; g++){
        const order=easyIdx.filter(i=>days[i].run).sort((a,b)=>sessionMin(days[b].run)-sessionMin(days[a].run));
        if(!order.some(i=>shrink(i)) && !shrink(longIdx)) break;
      }
    }
  }
  // environ 80 % en facile, 75 % au minimum : on allège puis on remplace la 2e séance de qualité
  for(let t=0;t<5 && qPlan.length && zoneMins(days).easy<.75;t++){
    const x=qPlan[qPlan.length-1];
    if(x.fewer<2){ x.fewer++; buildQ(x); continue; }
    if(opts.short&&!x.noShort&&!deb){ x.noShort=true; buildQ(x); continue; } // échauffement complet : plus de facile
    if(qPlan.length>1&&!deb){ const km=Math.max(3,Math.round(kmOf(days[x.idx].run)*2)/2); days[x.idx].run=easyRun(Math.min(km,Math.max(3,Math.floor(easyCap*2)/2)),vma,null,p.types.includes("ld")?4:0); qPlan.pop(); }
    else break;
  }
  // cardio sans impact : on note seulement l'emplacement du footing remplacé ; la séance est posée une fois le plan entier construit
  // (buildPlanFor), pour que le volume, la sortie longue et les autres séances restent exactement ceux du plan sans cardio
  let crossIdx=null;
  if(p.cross!=="non" && CROSS[p.cross] && phase!=="race"){
    const cand=easyIdx.filter(i=>days[i].run&&days[i].run.type==="easy"&&!(days[i].run.blocks[1])).concat(easyIdx.filter(i=>days[i].run&&days[i].run.type==="easy"));
    if(cand[0]!=null) crossIdx=cand[0];
  }
  if(phase==="race") days[eve].run=null;
  for(const d of days){ if(d.run&&d.kind!=="race") d.kind=d.run.type; }
  // renforcement : jours de qualité d'abord, jamais la veille de la sortie longue
  const eveLong=eve;
  // 2 séances en période de base, 1 en phase spécifique (période de compétition), 0 la semaine de course
  let nR=phase==="race"?0: phase==="spe"? Math.min(p.renfo,1) : p.renfo;
  const cand=[...q.map(x=>x[0]).filter(i=>days[i].kind==="q"), ...[0,1,2,3,4,5,6].filter(i=>days[i].kind==="rest"||days[i].kind==="easy")]
    .filter((v,i,a)=>a.indexOf(v)===i && v!==eveLong && v!==longIdx);
  const placed=[];
  for(const i of cand){ if(placed.length>=nR)break; if(placed.some(j=>Math.abs(j-i)<2))continue; placed.push(i); }
  const rtype = deb||p.cplx==="simple"?"deb": (deload||phase==="taper")?"light":"heavy";
  let rt=renfoText(rtype,p.equip);
  // lourd dès la semaine 1 : rappel de la progression pour qui débute en musculation
  if(rtype==="heavy"&&w<=3) rt={...rt,note:(rt.note?rt.note+" ":"")+"Si tu débutes en musculation : charges modérées et technique pendant 4 à 6 semaines, pliométrie 2 × 6 contacts."};
  placed.forEach(i=>days[i].renfo=rt);
  const placed_=days.filter(d=>d.run&&d.run.type!=="race").length;
  // préférences : types déjà arrivés, y compris ceux sortis de la rotation (le fartlek après l'arrivée de la VMA) ; l'IA garde le choix de la semaine (qPool)
  const arrived= qPool_? Q_ORDER.filter(c=>qPool_.includes(c)||(ctx.seen&&ctx.seen.has(c))).concat(qPool_.filter(c=>!Q_ORDER.includes(c))) : null;
  return {w,phase,deload,V,L,days,limited,crossIdx,qPool:qPool_||null,qArr:arrived,dropped:dropped&&phase!=="race"?{asked:p.seances,placed:placed_}:null};
}
function blockKm(b,vma){
  if(b.mix){const sp=vma*(b.lo+b.hi)/2;return b.mix.run/60*sp + b.mix.walk/60*5.5;}
  if(b.z==="walk") return b.min/60*5.5;
  if(b.cross||b.met!=null) return 0;
  if(b.noPace) return b.min? b.min/60*vma*.6:0;
  if(b.work!=null){ const sp=vma*(b.lo+b.hi)/2; return b.work/60*sp + Math.max(0,b.min-b.work)/60*vma*.55; }
  return b.min/60*vma*(b.lo+b.hi)/2;
}
function sessionKm(s,vma){return s.blocks.reduce((a,b)=>a+blockKm(b,vma),0);}
function sessionMin(s){return s.blocks.reduce((a,b)=>a+(b.min||0),0);}
// lignes droites (bloc sans durée) : n × (effort + récup.), comme le minuteur
function stridesIv(b){ if(b.iv) return b.iv; const m=/^(\d+) lignes droites de (\d+) s/.exec(b.l||""); return m? {n:+m[1],on:+m[2],off:60} : null; }
// durée affichée d'une séance (carte, prochaine séance, copie, Calendrier) ; la planification garde sessionMin
function sessionDur(s){ return sessionMin(s)+s.blocks.reduce((a,b)=>{ if(b.min) return a; const v=stridesIv(b); return v? a+(v.n*v.on+(v.offLast?v.n:Math.max(0,v.n-1))*v.off)/60 : a; },0); }
function walkKm(s){return s.blocks.reduce((a,b)=>a+(b.mix?b.mix.walk/60*5.5:(b.z==="walk"?b.min/60*5.5:0)),0);}

/* énergie */
function energy(p,plan){
  const {vma}=vmaOf(p);
  const s=p.sexe==="F"?-161:5;
  const bmr=10*p.poids+6.25*p.taille-5*p.age+s;
  const base=bmr*p.activite;
  const bmi=p.poids/Math.pow(p.taille/100,2), mgEst=isNaN(p.mg)||!(p.mg>0);
  // masse grasse non renseignée : estimation de Deurenberg (IMC, âge, sexe), bornée entre 8 et 50 %
  const mg= !mgEst ? p.mg : Math.round(Math.max(8,Math.min(50,1.2*bmi+.23*p.age-10.8*(p.sexe==="F"?0:1)-5.4)));
  const ffm=p.poids*(1-mg/100);
  // protéines : 2 g/kg ; en cas d'obésité (IMC > 30), sur un poids de référence (poids visé, ou poids à IMC 25 s'il est plus haut)
  const h2=Math.pow(p.taille/100,2), protRef= bmi>30;
  const protW= protRef? Math.min(p.poids,Math.max(25*h2,!isNaN(p.cible)&&p.cible>0?p.cible:0)) : p.poids;
  return {bmr,base,ffm,mgEst,mg,vma,bmi,protW,protRef};
}
function dayFuel(p,E,wk){
  // dépense d'exercice par jour
  const days=wk.days.map(d=>{
    let ex=0,km=0,min=0,exRf=0;
    if(d.run){ km=sessionKm(d.run,E.vma); const wk_=walkKm(d.run); ex=.9*p.poids*(km-wk_)+.5*p.poids*wk_; min=sessionMin(d.run); if(d.kind==="race"){ex+=.95*p.poids*(RACE_KM[p.objectif]||5);} }
    if(d.run) for(const b of d.run.blocks) if(b.cross||b.met!=null) ex+=(b.met-1)*p.poids*b.min/60;
    if(d.run&&d.run.dplus) ex+=.01*p.poids*d.run.dplus;   // trail : travail contre la pente, environ 0,01 kcal par kg et par mètre de dénivelé positif
    // renfo : (MET − 1) × poids × durée ; lourd 5 MET, entretien et débutant 3,5 MET (Compendium, Ainsworth 2011)
    if(d.renfo){ const rm=parseInt(d.renfo.m)||40, met=d.renfo.rows&&d.renfo.rows.some(r=>/lourd|plus lourdes|lents/.test(r[1]||""))&&!d.renfo.light?5:3.5; exRf=(met-1)*p.poids*rm/60; ex+=exRf; }
    return {...d,ex,km,min,maint:E.base+ex,exRf};
  });
  const maintAvg=days.reduce((a,d)=>a+d.maint,0)/7;
  const exAvg=days.reduce((a,d)=>a+d.ex,0)/7;
  // déficit : socle fixe tous les jours, supplément les jours de repos et de footing ; l'ajustement manuel entre dans le contrôle de sécurité
  const isRaceWk = wk.phase==="race", taper = wk.phase==="taper"||isRaceWk;
  const base=Math.min(p.deficit,500), extra= taper?0:Math.min(p.bonus,200), adj=p.adj||0;
  const lowBmi=E.bmi<18.5||!!p.minor; // maigreur : aucun déficit, seul un ajustement vers le haut reste possible
  // semaine de course : veille (et avant-veille en semi et marathon) ; en semi et marathon, ces 2 jours sont à l'équilibre pour remplir les réserves de glucides
  const raceI=days.findIndex(d=>d.kind==="race"||d.obj), long_= p.objectif==="21"||p.objectif==="42";
  const preOf=i=> raceI<0? null : i===(raceI+6)%7? "eve" : long_&&i===(raceI+5)%7? "pre" : null;
  let defs=days.map(d=> d.kind==="race"||d.obj||d.kind==="before"||((long_||evSport(p.sport))&&preOf(d.i))?0 : lowBmi? Math.min(0,-adj) : base + ((d.kind==="rest"||d.kind==="easy")?extra:0) - adj);
  const hardMin=30*E.ffm+exAvg;           // apport moyen minimum : 30 kcal/kg de masse maigre après le sport (seuil d'énergie basse, consensus CIO RED-S 2023)
  const wanted=defs.reduce((a,x)=>a+x,0)/7, allowed=maintAvg-hardMin;
  let floorHit=false;
  if(wanted>allowed){
    const pos=defs.reduce((a,x)=>a+Math.max(0,x),0), cut=(wanted-allowed)*7;
    const k=pos>0? Math.max(0,(pos-cut)/pos) : 1;
    defs=defs.map(x=>x>0?x*k:x);
    floorHit=wanted-defs.reduce((a,x)=>a+x,0)/7>20;
  }
  // vitesse de perte : 0,75 % du poids par semaine au plus, le même seuil que l'onglet Suivi
  const maxAvg=.0075*p.poids*7700/7-6, avgNow=defs.reduce((a,x)=>a+x,0)/7;
  let rateCap=false;
  if(avgNow>maxAvg){
    const pos=defs.reduce((a,x)=>a+Math.max(0,x),0), cut=(avgNow-maxAvg)*7, k=pos>0? Math.max(0,(pos-cut)/pos) : 1;
    defs=defs.map(x=>x>0?x*k:x); rateCap=!floorHit;
  }
  const out=days.map(d=>{
    const want=defs[d.i];
    let kcal=d.maint-want;
    // planchers : métabolisme de base, et 1 200 kcal (femmes) / 1 500 kcal (hommes) sauf si le maintien est plus bas
    const absMin=p.sexe==="F"?1200:1500, flo=Math.max(E.bmr,Math.min(d.maint,absMin));
    const clamp=kcal<flo; if(clamp) kcal=flo;
    kcal= clamp? Math.ceil(kcal/10)*10 : Math.round(kcal/10)*10;
    const def=d.maint-kcal, bmrHit=clamp&&want>0, absHit=clamp&&want>0&&absMin>E.bmr&&kcal<=Math.ceil(absMin/10)*10&&d.maint>absMin;
    // macros : protéines 2 g/kg, lipides 20 % (0,6 g/kg au moins), glucides = le reste ; la somme fait toujours l'objectif du jour
    const P=Math.round(2*(E.protW||p.poids)), pre=preOf(d.i);
    let F=Math.max(.6*p.poids,.2*kcal/9), C=(kcal-4*P-9*F)/4;
    if(pre&&long_){ F=.6*p.poids; C=(kcal-4*P-9*F)/4; }   // veille de semi ou de marathon : lipides au plancher, le reste en glucides
    if(C<2*p.poids){ F=Math.max(.6*p.poids,(kcal-4*P-8*p.poids)/9); C=(kcal-4*P-9*F)/4; }
    if(C<0){ C=0; F=Math.max(0,(kcal-4*P)/9); }
    const raceKcal= d.kind==="race"? .95*p.poids*(RACE_KM[p.objectif]||5) : 0;
    return {...d,def,want,bmrHit,absHit,kcal,P,C:Math.round(C),F:Math.round(F),pre,eqPre:!!(pre&&long_),raceKcal};
  });
  const kcalAvg=out.reduce((a,d)=>a+d.kcal,0)/7;
  const realDef=maintAvg-kcalAvg, noDef=realDef<15;
  const ea=(kcalAvg-exAvg)/E.ffm, bmrHit=out.some(d=>d.bmrHit), absHit=out.some(d=>d.absHit);
  return {days:out,maintAvg,kcalAvg,realDef,lossKg:Math.max(0,realDef)*7/7700,floorHit,bmrHit,absHit,noDef,wanted,ea,taper,base,extra,adj,lowBmi,rateCap,minor:!!p.minor};
}

/* ---------- v14 : sports (trail, VTT, haltérophilie et force, remise en forme) ---------- */
const SPORTS=["course","trail","vtt","force","forme"];
const SPORT_LAB={course:"Course à pied",trail:"Trail",vtt:"VTT",force:"Haltérophilie et force",forme:"Remise en forme générale"};
const SPORT_CAT={course:"Course à pied",trail:"Trail",vtt:"VTT",force:"Musculation",forme:"Remise en forme"};
// objectif propre au sport : [valeur, libellé, durée de la sortie de l'objectif en minutes]
const SOBJ={vtt:[["court","Sortie courte (environ 2 h)",120],["moyen","Sortie moyenne (environ 3 h 30)",210],["long","Longue distance (environ 5 h)",300]],
  force:[["ppl","Force et muscle (haut, bas du corps, jambes)"],["oly","Haltérophilie olympique (arraché, épaulé-jeté)"]]};
const evSport=s=> s==="vtt"||s==="force"||s==="forme";   // sports sans distance de course : plan construit par buildSportPlan
const PH_SPORT={prep:"Préparation générale",base:"Phase de base",dev:"Développement",spe:"Phase spécifique",taper:"Affûtage",race:"Semaine de l'objectif"};
const phLab=ph=> evSport(P&&P.sport)? PH_SPORT[ph] : PHASE_LABEL[ph];
const sdl=(w,isEv,N)=> w%4===0&&(!isEv||w<=N-3);   // semaine allégée : une sur quatre
const fr1=v=>String(v).replace(".",",");
const MET={vttE:6.8,vttT:8.5,vttV:10.5,warm:5,walk:4.3,bikeE:5,cardio:5.5,circ:6,mob:2.5,lift:5,liftL:3.5};   // Compendium 2011 (valeurs prudentes)
const Z14={z1:{lo:.62,hi:.70},z2:{lo:.82,hi:.88},z3:{lo:.95,hi:1.0}};
const bl=(l,min,z,o)=> Object.assign({l,min:Math.round(min),z},o||{});
const floor5=m=> Math.floor(m/5)*5;
// séance d'un sport hors course : sp = identifiant du sport, spLab = libellé de la dépense, where = lieu
function SS(sp,p,type,title,blocks,extra){ return Object.assign(S(type,title,blocks,extra),{sp,spLab:sp==="force"?"séance de force":sp==="vtt"?"vélo":"cardio",where:sp==="vtt"?"Dehors":sp==="force"?({salle:"Salle",maison:"Haltères",aucun:"Sans matériel"}[p.equip]||"Salle"):"Dehors ou salle"}); }
function ivBlock(label,n,onS,offS,z,extra){ return Object.assign({l:label,min:Math.round((n*onS+(n-1)*offS)/60),z,work:Math.round(n*onS/60*10)/10,iv:{n,on:onS,off:offS,onL:(extra&&extra.onL)||"Effort",offL:(extra&&extra.offL)||"Récupération"}},extra||{}); }

/* --- volumes : +6 % par semaine normale (jamais plus de 10 %), une semaine allégée sur quatre --- */
function sportFactors(N,isEv,V0,cap){
  const f=[]; let level=1,last=1,peak=1,after=false; const lim=Math.max(1,Math.min(cap/V0,N<=20?1.6:1.6+(Math.min(N,52)-20)*.02));
  for(let w=1;w<=N;w++){ const ph=phaseOf(w,isEv,N);
    if(ph==="race") f.push(peak*.45); else if(ph==="taper") f.push(peak*.65);
    else if(sdl(w,isEv,N)){ f.push(last*.75); after=true; }
    else{ if(after){ level=Math.max(1,level-.06); after=false; } const v=Math.min(level,lim); f.push(v); last=v; peak=Math.max(peak,v); level+=.06; } }
  return f;
}

/* --- VTT --- */
const vWu=m=>bl("Échauffement : pédalage souple, cadence vive",m,"z1",{...Z14.z1,eff:"Très facile",met:MET.warm});
const vCd=m=>bl("Retour au calme : pédalage souple",m,"z1",{...Z14.z1,eff:"Très facile",met:MET.warm});
function vttQual(kind,w,p,phase,o){
  const fw=o.fewer||0, deb=p.niveau==="deb", taper=phase==="taper"||phase==="race", dl=!!o.deload, i=(w-1)%4, light=dl||taper;
  if(kind==="sweet"){ let [n,d]=[[2,10],[2,12],[3,10],[2,15]][i]; if(deb) d=Math.min(d,10); if(light) n--; n=Math.max(1,n-fw);
    return SS("vtt",p,"q","Tempo (sweet spot)",[vWu(15),ivBlock(n+" × "+d+" min en tempo, 5 min facile entre",n,d*60,300,"z2",{...Z14.z2,eff:"Tempo : phrases courtes",met:MET.vttT,onL:"Tempo",offL:"Facile"}),vCd(10)],{hardMin:n*d,note:"« Confortablement difficile » : tu peux dire une phrase courte. Garde une cadence régulière de 80 à 90 tours par minute."}); }
  if(kind==="vint"){ let [n,d]=[[5,3],[6,3],[5,4],[4,4]][i]; if(p.minor){ n=Math.min(n,5); d=Math.min(d,3); } if(light) n=Math.ceil(n/2); n=Math.max(2,n-fw);
    return SS("vtt",p,"q","Intervalles VO2",[vWu(15),ivBlock(n+" × "+d+" min soutenus, 3 min facile entre",n,d*60,180,"z3",{...Z14.z3,eff:"Dur : quelques mots seulement",met:MET.vttV,onL:"Effort soutenu",offL:"Facile"}),vCd(10)],{hardMin:n*d,note:"Quelques mots seulement à la fin de chaque répétition. Si la puissance chute nettement, arrête une répétition plus tôt."}); }
  if(kind==="cotes"){ let [n,d]=[[6,2],[8,2],[5,3],[6,3]][i]; if(light) n=Math.ceil(n/2); n=Math.max(2,n-fw); const z=d<=2?"z3":"z2";
    return SS("vtt",p,"q","Répétitions en côte",[vWu(15),ivBlock(n+" × "+d+" min en montée soutenue, redescente tranquille",n,d*60,150,z,{...(z==="z3"?Z14.z3:{lo:.88,hi:.93}),eff:z==="z3"?"Dur : quelques mots seulement":"Soutenu : phrases courtes",met:MET.vttV,onL:"Montée soutenue",offL:"Redescente tranquille"}),vCd(10)],{hardMin:n*d,note:"Choisis une côte régulière (sentier ou route). Reste assis, cadence 60 à 70, et garde de la marge pour la dernière répétition."}); }
  if(kind==="tech"){ const m=light?15:20;
    return SS("vtt",p,"q","Technique et pilotage",[vWu(10),bl("Atelier technique : virages, relances, équilibre, passages en descente",m,"z2",{lo:.82,hi:.88,eff:"Concentre-toi sur la technique, pas sur la vitesse",met:7}),bl("Endurance sur terrain varié",light?20:30,"z1",{...Z14.z1,eff:"Effort facile : tu peux parler",met:MET.vttE}),vCd(5)],{hardMin:m*.5,note:"Refais 4 à 6 fois le même passage technique en cherchant la fluidité. Arrête dès que la fatigue fait perdre la précision."}); }
  if(kind==="open"){ return SS("vtt",p,"q","Rappel d'intensité court",[vWu(15),ivBlock("3 × 1 min vif, 2 min facile",3,60,120,"z3",{...Z14.z3,eff:"Vif mais relâché",met:MET.vttV,onL:"Vif",offL:"Facile"}),vCd(5)],{hardMin:3,note:"Juste pour réveiller les jambes la veille ou l'avant-veille de l'objectif. Rien d'épuisant."}); }
  return null;
}
function vttEndu(p,m,kind){
  const b=bl(kind==="long"?"Sortie longue en endurance":"Sortie en endurance",m,"z1",{...Z14.z1,eff:"Effort facile : tu peux parler",met:MET.vttE});
  const note= kind==="long"? (m>90? "Au-delà d'1 h 30 : bois environ 500 ml par heure et mange 40 à 60 g de glucides par heure (barres, bananes, boisson). Prévois de quoi réparer une crevaison." : "Garde un effort régulier, sur terrain varié si possible.") : "Cadence souple, effort où tu peux parler. Profite-en pour travailler ta technique de pilotage.";
  return SS("vtt",p,kind==="long"?"long":"easy",kind==="long"?"Sortie longue VTT":"Sortie VTT en endurance",[b],{note});
}
function vttEvent(p){
  const o=(SOBJ.vtt.find(x=>x[0]===p.sObj)||SOBJ.vtt[1])[2], dur=Math.round(o*(p.niveau==="deb"?.8:1)/5)*5;
  return SS("vtt",p,"long","Ton objectif : sortie ou épreuve VTT",[vWu(15),bl("Ton objectif, environ "+durTxt(dur)+" à effort régulier, départ prudent",dur,"z2",{lo:.82,hi:.88,eff:"Régulier : phrases courtes, départ prudent",met:MET.vttT}),vCd(10)],{note:"Rien de nouveau le jour J : même matériel, mêmes pneus, même alimentation que tes sorties longues. Mange et bois avant d'avoir faim ou soif."});
}

/* --- remise en forme générale --- */
const fMob=()=>bl("Mobilité et étirements doux",8,"z1",{eff:"Détente",met:MET.mob});
function fitQual(kind,w,p,phase,o){
  const fw=o.fewer||0, deb=p.niveau==="deb", light=!!o.deload||phase==="taper"||phase==="race", i=(w-1)%4;
  if(kind==="alt"){ const tbl=phase==="base"||phase==="prep"?[4,5,5,6]:phase==="dev"?[5,6,6,7]:[6,7,7,8]; let n=tbl[i]-(deb?1:0); if(light) n=Math.ceil(n/2); n=Math.max(2,n-fw);
    return SS("forme",p,"q","Cardio fractionné doux",[bl("Échauffement en marche rapide",5,"z1",{...Z14.z1,eff:"Très facile",met:MET.walk}),ivBlock(n+" × (2 min soutenues / 2 min faciles)",n,120,120,"z2",{...Z14.z2,eff:"Soutenu : phrases courtes",met:MET.cardio,onL:"Soutenu (marche très rapide, vélo ou footing léger)",offL:"Facile"}),bl("Retour au calme",5,"z1",{...Z14.z1,eff:"Très facile",met:MET.walk}),fMob()],{hardMin:n*2,note:"Choisis ce qui te plaît : marche très rapide, vélo ou footing léger. Soutenu = tu peux dire quelques mots, pas chanter."}); }
  if(kind==="circ"){ const r=light?2:3; return SS("forme",p,"q","Circuit au poids du corps",[bl("Échauffement : mobilité et marche",5,"z1",{...Z14.z1,eff:"Très facile",met:MET.walk}),ivBlock(r+" tours de 5 exercices (squats, pompes inclinées, fentes, pont fessier, planche), 40 s d'effort et 20 s de repos",r*5,40,20,"z2",{...Z14.z2,eff:"Soutenu mais propre",met:MET.circ,onL:"Exercice",offL:"Repos"}),bl("Retour au calme",5,"z1",{...Z14.z1,eff:"Très facile",met:MET.walk}),fMob()],{hardMin:r*3,note:"Garde une bonne technique avant de chercher la vitesse. Prends 1 à 2 minutes de pause entre deux tours."}); }
  return null;
}
function fitEndu(p,m,kind,w){
  const walk=w%2===1, long=kind==="long";
  const b= walk? bl(long?"Longue marche active":"Marche rapide",m,"z1",{...Z14.z1,eff:"Marche rapide : tu peux parler",met:MET.walk}) : bl(long?"Sortie vélo tranquille":"Vélo tranquille",m,"z1",{...Z14.z1,eff:"Effort facile : tu peux parler",met:MET.bikeE});
  return SS("forme",p,long?"long":"easy",b.l.replace(/^./,c=>c.toUpperCase()),[b,fMob()],{note:long?"Choisis un parcours agréable : le plaisir compte autant que la durée.":"Rythme régulier, sans te mettre dans le rouge."});
}
function fitEvent(p){
  return SS("forme",p,"long","Ton objectif : séance bilan",[bl("Échauffement en marche rapide",10,"z1",{...Z14.z1,eff:"Très facile",met:MET.walk}),bl("Test : 30 min de marche rapide ou de footing léger à effort régulier",30,"z2",{...Z14.z2,eff:"Régulier : phrases courtes",met:MET.cardio}),bl("Retour au calme",5,"z1",{...Z14.z1,eff:"Très facile",met:MET.walk}),fMob()],{note:"Note la distance parcourue et ta fréquence cardiaque à la fin pour comparer avec ton prochain bilan."});
}

/* --- renforcement des sports d'endurance (sans pliométrie) --- */
const RG_ROWS={salle:["Squat ou presse, soulevé de terre roumain, fentes marchées, rowing, développé","Gainage planche, gainage latéral"],maison:["Squat gobelet, soulevé de terre roumain haltères, fentes, rowing haltères, pompes","Gainage planche, gainage latéral"],aucun:["Squat, pont fessier sur une jambe, fentes arrière, pompes, rowing élastique ou serviette","Gainage planche, gainage latéral"]};
function renfoG(type,eq){
  const r=RG_ROWS[eq]||RG_ROWS.salle, m={salle:"salle",maison:"haltères",aucun:"sans matériel"}[eq]||"salle";
  if(type==="deb") return {t:"Renforcement",m:"30 min, "+m,rows:[[r[0],"2 à 3 × 10 à 12 à charge modérée, pour apprendre la technique"],[r[1],"3 × 30 s"]]};
  if(type==="light") return {t:"Renforcement d'entretien",m:"25 min, "+m,light:true,rows:[["Mêmes exercices","2 séries, charges modérées"]]};
  return {t:"Renforcement",m:"40 min, "+m,rows:[[r[0],"3 × 8 à 10 reps, descente lente sur 3 s"],[r[1],"3 × 30 à 45 s"]]};
}

/* --- séances de qualité par phase --- */
function sportKinds(p,w,phase,dl){
  if(p.sport==="vtt"){ const deb=p.niveau==="deb";
    if(phase==="race") return ["open",null]; if(phase==="taper") return ["sweet",deb?null:"vint"];
    if(phase==="spe") return deb?["sweet","tech"]:["vint","cotes"]; if(phase==="dev") return deb?["sweet","tech"]:["vint","sweet"];
    return deb&&w<=4?["tech",null]:["sweet","tech"]; }
  if(phase==="race") return [null,null];
  return phase==="taper"? ["alt",null] : ["alt","circ"];
}
const sportQual=(k,w,p,phase,o)=> p.sport==="vtt"? vttQual(k,w,p,phase,o) : fitQual(k,w,p,phase,o);
const sportEndu=(p,m,kind,w)=> p.sport==="vtt"? vttEndu(p,m,kind) : fitEndu(p,m,kind,w);
const sportEvent=p=> p.sport==="vtt"? vttEvent(p) : fitEvent(p);

/* --- une semaine d'un sport d'endurance --- */
function endWeek(p,w,N,isEv,V,st){
  const sp=p.sport, deb=p.niveau==="deb", ns=p.seances, phase=phaseOf(w,isEv,N), dl=sdl(w,isEv,N);
  const taper=phase==="taper", race=phase==="race", normal=!dl&&!taper&&!race;
  const days=Array.from({length:7},(_,i)=>({i,run:null,renfo:null,kind:"rest"}));
  const slot=SLOTS[ns]||SLOTS[4], longIdx=shiftIdx(6,p), eve=(longIdx+6)%7;
  const lcap= sp==="vtt"? ({court:150,moyen:240,long:360}[p.sObj]||240)*(deb?.7:1) : 150;
  if(race){
    const ri=p.raceIdx!=null?p.raceIdx:longIdx;
    days[ri].run=sportEvent(p); days[ri].obj=true;
    const pre=(ri+5)%7, k=sportKinds(p,w,phase,dl)[0];
    if(pre<ri-0&&pre>=0&&k){ const q=sportQual(k,w,p,phase,{fewer:0,deload:false}); if(q) days[pre].run=q; }
    else if(pre<ri&&pre>=0) days[pre].run=sportEndu(p,35,"easy",w);
    if(ri>=4&&ns>=4&&ri-4>=0) days[ri-4].run=sportEndu(p,40,"easy",w);
    for(const d of days) if(d.run) d.kind=d.run.type;
    days[ri].kind="long";
    const mins=days.reduce((a,d)=>a+(d.run?sessionMin(d.run):0),0);
    return {w,phase,deload:false,V:mins,Lmin:null,days,limited:false,crossIdx:null,dropped:null};
  }
  let [k1,k2]=sportKinds(p,w,phase,dl); if(ns===3) k2=null; if(dl) k2=null;
  if(V<130&&w<=3&&normal){ k1=null; k2=null; }   // très petit volume de départ : que de l'endurance facile pendant les 3 premières semaines
  const quals=[]; if(slot.q1!=null&&k1) quals.push({idx:shiftIdx(slot.q1,p),k:k1,fewer:0}); if(slot.q2!=null&&k2) quals.push({idx:shiftIdx(slot.q2,p),k:k2,fewer:0});
  let easyIdx=slot.e.map(i=>shiftIdx(i,p)); for(const [i,k] of [[slot.q1,k1],[slot.q2,k2]]) if(i!=null&&!k) easyIdx.push(shiftIdx(i,p));
  const buildQ=x=>{ x.run=sportQual(x.k,w,p,phase,{fewer:x.fewer,deload:dl}); };
  quals.forEach(buildQ);
  const lf={3:.40,4:.34,5:.30,6:.26}[ns]||.34;
  let L=V*lf; if(st.prevL) L=Math.min(L,st.prevL*1.10); L=Math.min(L,lcap,V*.5);
  if(dl&&st.prevL) L=Math.min(L,st.prevL*.8); if(taper&&st.prevL) L=Math.min(L,st.prevL*.6);
  L=Math.max(40,floor5(L));
  easyIdx=easyIdx.sort((a,b)=>a-b).filter(i=>i!==longIdx);
  const sumQ=()=>quals.reduce((a,x)=>a+sessionMin(x.run),0);
  const ne=easyIdx.length, ecap=Math.min(120,Math.max(45,L*.8));
  const Es=[]; for(let j=0;j<ne;j++) Es.push(Math.max(30,Math.min(ecap,floor5(Math.max(0,V-sumQ()-L)/ne))));
  const capTotal= st.prevTotal? Math.min(V*1.10,st.prevTotal*1.10) : V*1.10
  const capT2= dl&&st.prevTotal? Math.min(capTotal,st.prevTotal*.85) : capTotal;   // une semaine allégée est toujours plus légère que la précédente
  // durée réelle de chaque séance d'endurance (échauffement et retour au calme compris), pas la durée demandée : le plafond porte sur ce qui est vraiment placé
  const memo={}, mE=(m,k)=>{ const key=k+m; if(memo[key]==null) memo[key]=sessionMin(sportEndu(p,m,k,w)); return memo[key]; };
  const total=()=>sumQ()+mE(L,sp==="vtt"||sp==="forme"?"long":"easy")+Es.reduce((a,x)=>a+mE(x,"easy"),0);
  let guard=0, dropped=0;
  while(total()>capT2+1e-9&&guard++<600){
    const big=Es.reduce((b,e,j)=>e>30&&(b<0||e>Es[b])?j:b,-1);
    if(big>=0) Es[big]=Math.max(30,Es[big]-5);
    else if(L>40) L-=5;
    else { const q=quals.filter(x=>x.fewer<3).pop(); if(q){ q.fewer++; buildQ(q); } else if(Es.length){ Es.pop(); easyIdx.pop(); dropped++; } else if(quals.length>1||(quals.length&&L<=40&&sumQ()+L>capT2+1e-9)){ const q=quals.pop(); easyIdx=easyIdx.filter(i=>i!==q.idx); dropped++; } else break; }
  }
  days[longIdx].run= sp==="vtt"||sp==="forme"? sportEndu(p,L,"long",w) : null;
  for(const x of quals) days[x.idx].run=x.run;
  easyIdx.forEach((idx,j)=>{ if(days[idx].run) return; days[idx].run=sportEndu(p,Es[j],"easy",w); });
  for(const d of days) if(d.run) d.kind=d.run.type;
  // renforcement : jours de qualité d'abord, jamais la veille de la sortie longue
  const nR= phase==="spe"? Math.min(p.renfo,1) : p.renfo;
  const cand=[...quals.map(x=>x.idx),...[0,1,2,3,4,5,6].filter(i=>days[i].kind==="rest"||days[i].kind==="easy")].filter((v,i,a)=>a.indexOf(v)===i&&v!==eve&&v!==longIdx);
  const placed=[]; for(const i of cand){ if(placed.length>=nR) break; if(placed.some(j=>Math.abs(j-i)<2)) continue; placed.push(i); }
  const rt=renfoG(deb?"deb":(dl||taper)?"light":"std",p.equip); placed.forEach(i=>{ days[i].renfo=rt; });
  const tot=total();
  if(normal){ st.prevTotal=tot; st.prevL=L; }
  const placedN=days.filter(d=>d.run&&d.kind!=="before").length;
  return {w,phase,deload:dl,V:tot,Lmin:L,days,limited:false,crossIdx:null,dropped:dropped&&!race? {asked:ns,placed:placedN}:null};
}

/* --- haltérophilie et force --- */
// [salle, maison, sans matériel]
const EXD={bench:["Développé couché (barre)","Développé couché haltères","Pompes (lestées si c'est facile)"],ohp:["Développé militaire","Développé épaules haltères","Pompes pieds surélevés"],incl:["Développé incliné haltères","Développé incliné haltères","Pompes mains surélevées"],lat:["Élévations latérales","Élévations latérales haltères","Pompes lentes (3 s en descente)"],tri:["Extension triceps à la poulie","Extension triceps haltère","Pompes diamant"],
  pull:["Tractions ou tirage vertical","Tractions ou rowing haltères","Tractions ou rowing élastique"],row:["Rowing barre penché","Rowing haltère à un bras","Rowing inversé sous une table"],hrow:["Tirage horizontal à la poulie","Rowing haltères buste penché","Rowing élastique"],face:["Face pull","Oiseau haltères","Oiseau élastique"],curl:["Curl biceps","Curl haltères","Curl élastique"],
  squat:["Squat arrière","Squat gobelet (haltère)","Squat bulgare"],rdl:["Soulevé de terre roumain","Soulevé de terre roumain haltères","Pont fessier sur une jambe"],lunge:["Presse à cuisses ou fentes marchées","Fentes marchées haltères","Fentes arrière"],hip:["Hip thrust","Hip thrust haltère","Pont fessier lent"],legcurl:["Leg curl","Curl ischios (talons sur une serviette)","Nordic curl assisté"],calf:["Mollets debout","Mollets haltère","Mollets sur une marche"],
  core:["Gainage planche","Gainage planche","Gainage planche"],core2:["Relevé de jambes suspendu ou au sol","Relevé de jambes au sol","Relevé de jambes au sol"],
  snatch:["Arraché (barre)","Arraché haltère à un bras","Tirage haut avec un bâton (technique)"],cj:["Épaulé-jeté (barre)","Épaulé-jeté haltères","Épaulé avec un bâton (technique)"],fsq:["Squat avant","Squat avant haltères","Squat gobelet lent"],bsq:["Squat arrière","Squat gobelet (haltère)","Squat bulgare"],snpull:["Tirage d'arraché","Tirage haltères","Soulevé de terre roumain léger"],clpull:["Tirage d'épaulé","Tirage haltères","Soulevé de terre roumain léger"],pushpress:["Push press","Push press haltères","Pompes pieds surélevés"],ohsq:["Squat overhead (technique)","Squat overhead haltère","Squat bras tendus avec un bâton"]};
const ROLE={bench:"main",ohp:"sec",pull:"main",row:"sec",squat:"main",rdl:"sec",core:"core",core2:"core",snatch:"tech",cj:"tech",fsq:"main",bsq:"main",snpull:"pullh",clpull:"pullh",pushpress:"sec",ohsq:"acc"};
const FORCE_TPL={
  ppl:{3:[["Push : poitrine, épaules, triceps","q",["bench","ohp","incl","lat","tri"]],["Pull : dos et biceps","q",["pull","row","hrow","face","curl"]],["Jambes","q",["squat","rdl","lunge","calf","core"]]],
    4:[["Haut du corps A","q",["bench","row","ohp","pull","tri"]],["Bas du corps A","q",["squat","rdl","lunge","calf","core"]],["Haut du corps B","q",["ohp","pull","incl","hrow","curl"]],["Bas du corps B","q",["rdl","lunge","hip","legcurl","core2"]]],
    5:[["Push : poitrine, épaules, triceps","q",["bench","ohp","incl","lat","tri"]],["Pull : dos et biceps","q",["pull","row","hrow","face","curl"]],["Jambes","q",["squat","rdl","lunge","calf","core"]],["Haut du corps (volume)","q",["incl","hrow","lat","face","curl"]],["Bas du corps (volume)","q",["rdl","lunge","hip","legcurl","core2"]]]},
  deb:{3:[["Corps entier A","q",["squat","bench","row","core"]],["Corps entier B","q",["rdl","ohp","pull","core2"]],["Corps entier A","q",["squat","bench","row","core"]]],
    4:[["Corps entier A","q",["squat","bench","row","core"]],["Corps entier B","q",["rdl","ohp","pull","core2"]],["Corps entier A","q",["squat","bench","row","core"]],["Corps entier B","q",["rdl","ohp","pull","core2"]]]},
  oly:{3:[["Arraché et squat","q",["snatch","bsq","snpull","core"]],["Épaulé-jeté et tirages","q",["cj","fsq","clpull","core2"]],["Force : jambes et développé","q",["bsq","pushpress","rdl","pull","core"]]],
    4:[["Arraché et squat","q",["snatch","bsq","snpull","core"]],["Épaulé-jeté et tirages","q",["cj","fsq","clpull","core2"]],["Technique légère et gainage","easy",["snatch","cj","ohsq","core"],1],["Force : jambes et développé","q",["bsq","pushpress","rdl","pull","core"]]],
    5:[["Arraché et squat","q",["snatch","bsq","snpull","core"]],["Épaulé-jeté et tirages","q",["cj","fsq","clpull","core2"]],["Technique légère et gainage","easy",["snatch","cj","ohsq","core"],1],["Force : jambes et développé","q",["bsq","pushpress","rdl","pull","core"]],["Arraché et épaulé-jeté (technique)","q",["snatch","cj","fsq","core2"]]]}
};
const FORCE_DAYS={3:[0,2,4],4:[0,1,3,4],5:[0,1,2,4,5]};
function forcePhase(w,N,isEv){ if(isEv) return phaseOf(w,true,N); return w<=Math.ceil(N/3)?"base": w<=Math.ceil(2*N/3)?"dev":"spe"; }
// séries, répétitions, RPE visé et repos selon le rôle de l'exercice et la phase
function scheme(role,ph,dl,cyc,p){
  const taper=ph==="taper"||ph==="race", cap=p.minor?8:9, base={base:7,prep:7,dev:7.5,spe:8,taper:6.5,race:6.5}[ph]||7;
  let rpe= dl? 6.5 : taper? 6.5 : Math.min(cap,base+[-.5,0,.5][cyc%3]);
  const reps0={main:{base:"8",prep:"8",dev:"6",spe:"4",taper:"5",race:"5"},sec:{base:"10",prep:"10",dev:"8",spe:"6",taper:"8",race:"8"},acc:{base:"12",prep:"12",dev:"10",spe:"10",taper:"10",race:"10"},pullh:{base:"3",prep:"3",dev:"3",spe:"3",taper:"3",race:"3"}};
  const cut=(n)=>Math.max(2,dl||taper? n-1 : n);
  if(role==="main") return {sets:cut(4),reps:reps0.main[ph],rpe:Math.min(rpe,p.minor?8:8.5)+(ph==="spe"&&cyc===2&&!dl&&!p.minor?.5:0),rest:ph==="spe"?180:150,on:Math.max(25,Math.round(+reps0.main[ph]*3.5)),unit:" reps"};
  if(role==="sec") return {sets:cut(3),reps:reps0.sec[ph],rpe:Math.max(6,rpe-.5),rest:120,on:Math.max(25,Math.round(+reps0.sec[ph]*3.5)),unit:" reps"};
  if(role==="acc") return {sets:cut(3),reps:reps0.acc[ph],rpe:Math.max(6,rpe-.5),rest:75,on:Math.max(25,Math.round(+reps0.acc[ph]*3.5)),unit:" reps"};
  if(role==="pullh") return {sets:cut(4),reps:"3",rpe:Math.min(7,rpe),rest:120,on:15,unit:" reps"};
  if(role==="tech") return {sets:dl||taper?4:6,reps:"2",rpe:Math.min(7,rpe),rest:120,on:15,unit:" reps"};
  if(role==="tech_l") return {sets:4,reps:"2",rpe:6,rest:90,on:15,unit:" reps"};
  return {sets:cut(3),reps:"30 s",rpe:null,rest:45,on:30,unit:""};   // gainage
}
function forceSession(p,w,tpl,ph,dl,cyc,eqi){
  const [title,type,keys,light]=tpl, blocks=[bl("Échauffement : 5 min de cardio léger, mobilité, puis séries de montée en charge",12,"rf",{met:MET.liftL,eff:"Progressif"})];
  let rp=0, nr=0;
  for(const k of keys){ const role=light&&ROLE[k]==="tech"?"tech_l":(ROLE[k]||"acc"), sc=scheme(role,ph,dl,cyc,p), name=EXD[k][eqi];
    const rtxt= sc.rpe? " · RPE "+fr1(sc.rpe) : "";
    blocks.push({l:name+" : "+sc.sets+" × "+sc.reps,min:0,xs:sc.sets*sc.on+(sc.sets-1)*sc.rest,z:"rf",met:dl||role==="core"||role==="tech_l"?MET.liftL:MET.lift,eff:sc.rpe? "RPE "+fr1(sc.rpe)+" (environ "+Math.round(10-sc.rpe)+" répétition"+(Math.round(10-sc.rpe)>1?"s":"")+" en réserve)" : "Tenue propre, ventre serré",rpe:sc.rpe||0,sets:sc.sets,work:Math.max(1,Math.round(sc.sets*sc.on/60)),
      iv:{n:sc.sets,on:sc.on,off:sc.rest,onL:name+" · "+sc.reps+sc.unit,offL:"Repos"}}); if(sc.rpe){ rp+=sc.rpe; nr++; } }
  { let acc=blocks[0].min*60, prev=Math.round(acc/60);   // minutes affichées arrondies en cumulé : leur somme = la durée exacte du minuteur (à 1 min près)
    for(const b of blocks.slice(1)){ acc+=b.xs; const r=Math.round(acc/60); b.min=Math.max(0,r-prev); prev=r; delete b.xs; } }
  const oly=keys.some(k=>ROLE[k]==="tech"); let note= oly? "Mouvements techniques : jamais jusqu'à l'échec, barre proche du corps, arrêt dès que la technique se dégrade. Idéalement avec un coach."+(p.equip!=="salle"?" Sans barre ni disques, c'est une version simplifiée (haltères ou bâton) pour apprendre le geste." : "")
    : "Choisis une charge qui te laisse environ 2 répétitions en réserve (RPE 8) ou 3 (RPE 7). Si toutes tes séries sont à RPE 6 ou moins, ajoute 2,5 kg (haut du corps) ou 5 kg (bas du corps) la séance suivante, jamais plus de 10 % d'un coup.";
  note+=" Le minuteur compte les repos : touche › quand ta série est terminée pour passer au repos.";
  return SS("force",p,type,title,blocks,{note,rpeAvg:nr?Math.round(rp/nr*10)/10:0});
}
function forceTest(p){
  const blocks=[bl("Échauffement : cardio léger, mobilité, séries de montée en charge",15,"rf",{met:MET.liftL,eff:"Progressif"}),
    {l:"Montée vers ton maximum du jour : 5 séries de 1 à 3 répétitions",min:Math.round((5*20+4*180)/60),z:"rf",met:MET.lift,eff:"RPE "+(p.minor?"8":"9")+" au plus",rpe:p.minor?8:9,sets:5,iv:{n:5,on:20,off:180,onL:"Montée en charge · 1 à 3 répétitions",offL:"Repos"}},
    bl("Retour au calme et mobilité",8,"rf",{met:MET.liftL,eff:"Détente"})];
  return SS("force",p,"long","Ton objectif : séance test",blocks,{note:(p.minor?"Avant 18 ans, pas de test de maximum : monte jusqu'à RPE 8 et note la charge. ":"")+"Un pareur ou des sécurités sur les mouvements lourds. Arrête-toi à la dernière série réussie proprement : un maximum du jour n'a pas à être un record.",rpeAvg:p.minor?8:9});
}
function forceWeek(p,w,N,isEv,st){
  const ns=Math.max(3,Math.min(5,p.seances)), ph0=forcePhase(w,N,isEv), dl=sdl(w,isEv,N);
  let ws=w; while(ws>1&&forcePhase(ws-1,N,isEv)===ph0) ws--;   // la vague de charge repart à zéro à chaque changement de phase (pas de saut de RPE de plus de 10 %)
  let rs=ws; for(let k=w-1;k>=ws;k--) if(sdl(k,isEv,N)){ rs=k+1; break; }   // et après chaque semaine allégée
  const cyc=(w-rs)%3;
  const ph= ph0==="prep"?"base":ph0, eqi={salle:0,maison:1,aucun:2}[p.equip]??0;
  const tplSet= p.niveau==="deb"? FORCE_TPL.deb : FORCE_TPL[p.sObj==="oly"?"oly":"ppl"];
  const tpls= tplSet[Math.min(ns,p.niveau==="deb"?4:5)]||tplSet[3], idxs=FORCE_DAYS[tpls.length]||FORCE_DAYS[3];
  const days=Array.from({length:7},(_,i)=>({i,run:null,renfo:null,kind:"rest"}));
  if(ph==="race"){
    const ri=p.raceIdx!=null?p.raceIdx:idxs[idxs.length-1], lt=ri-3;
    days[ri].run=forceTest(p); days[ri].obj=true;   // jour de l'objectif : repère pour la nutrition (équilibre ce jour et la veille)
    if(lt>=0) days[lt].run=forceSession(p,w,tpls[0],"taper",false,0,eqi);
  } else tpls.forEach((t,k)=>{ days[idxs[k]].run=forceSession(p,w,t,ph,dl,cyc,eqi); });
  for(const d of days) if(d.run) d.kind=d.run.type;
  const mins=days.reduce((a,d)=>a+(d.run?sessionMin(d.run):0),0);
  return {w,phase:ph,deload:dl&&ph!=="race",V:mins,Lmin:null,days,limited:false,crossIdx:null,dropped:null};
}

/* --- plan d'un sport hors course --- */
// première semaine : jours d'avant le début au maintien ; la première séance est toujours facile
function post1(w1,st,p,sp){
  if(w1&&w1.phase!=="race"){
    if(p.startIdx>0) w1.days=w1.days.map(d=> d.i<p.startIdx? {...d,run:null,renfo:null,kind:"before"} : d);
    const i=w1.days.findIndex(d=>d.run&&d.kind!=="before"), d=i>=0?w1.days[i]:null;
    if(d&&(d.run.type==="q"||d.run.type==="long")){
      const m=Math.max(30,Math.min(60,sessionMin(d.run)));
      const run= sp==="vtt"? vttEndu(p,m,"easy") : sp==="forme"? fitEndu(p,m,"easy",1) : forceSession(p,1,[ "Séance d'introduction","easy",["squat","bench","row","core"]],"base",false,0,{salle:0,maison:1,aucun:2}[p.equip]??0);
      w1.days[i]={...d,run:{...run,note:"Première séance du plan : on démarre doucement."},kind:"easy"}; w1.firstEasy=true;
    }
    // semaine 1 sans aucune séance (le début tombe après la dernière séance de la semaine) : une séance d'introduction facile le jour du début
    if(!w1.days.some(x=>x.run&&x.kind!=="before")){ const si=Math.max(0,p.startIdx||0), eq={salle:0,maison:1,aucun:2}[p.equip]??0;
      const run= sp==="vtt"? vttEndu(p,40,"easy") : sp==="forme"? fitEndu(p,35,"easy",1) : forceSession(p,1,["Séance d'introduction","easy",["squat","bench","row","core"]],"base",false,0,eq);
      w1.days[si]={...w1.days[si],run:{...run,note:"Première séance du plan : on démarre doucement."},kind:"easy"}; w1.firstEasy=true; }
    // semaine 1 jamais au-dessus de 1,5 fois les heures déclarées : on retire des séances (les dernières de la semaine) plutôt que de rallonger l'effort
    if(p.hSem>0&&(sp==='vtt'||sp==='forme')){ const cap=1.5*p.hSem*60, live=()=>w1.days.filter(x=>x.run&&x.kind!=="before");
      let tot=live().reduce((t,x)=>t+sessionMin(x.run),0);
      const ren=w1.days.filter(x=>x.renfo&&x.kind!=="before").reduce((t,x)=>t+(parseInt(x.renfo.m,10)||0),0);   // le renforcement compte dans les heures de sport de la semaine
      while(tot+ren>cap&&live().length>1){ const last=live().pop(); tot-=sessionMin(last.run); w1.days[last.i]={...last,run:null,kind:"rest"}; }
      const pl=live().length; w1.V=tot; if(pl<p.seances) w1.dropped={asked:p.seances,placed:pl};
    }
    // la semaine 2 part de la charge réellement placée en semaine 1 (+10 % au plus), pas du volume prévu avant les retraits
    if(!(p.startIdx>0)&&(sp==='vtt'||sp==='forme')){ const lv=w1.days.filter(x=>x.run&&x.kind!=="before"), real=lv.reduce((t,x)=>t+sessionMin(x.run),0);
      if(real<st.prevTotal){ st.prevTotal=real; w1.V=real; const lg=lv.filter(x=>x.run.type==="long").map(x=>sessionMin(x.run)); if(lg.length) st.prevL=Math.min(st.prevL||1e9,Math.max(...lg)); } }
  }
}
function buildSportPlan(p){
  const sp=p.sport, N=planLen(p), isEv=!!p.nWeeks, deb=p.niveau==="deb", lvl={deb:0,int:1,conf:2}[p.niveau]??1, weeks=[];
  if(sp==="force"){ const st={}; for(let w=1;w<=N;w++) weeks.push(forceWeek(p,w,N,isEv,st)); post1(weeks[0],st,p,sp); }
  else{
    const ns=p.seances, dflt= sp==="vtt"? [150,240,330][lvl] : [120,180,240][lvl];
    const capW= sp==="vtt"? ({court:480,moyen:660,long:840}[p.sObj]||660)*(deb?.6:1) : 360*(deb?.7:1);
    let V0= p.hSem>0? p.hSem*60 : dflt; V0=Math.min(p.hSem>0? Math.min(Math.max(V0,ns*40),1.5*V0) : Math.max(V0,ns*40),25*60);   // départ jamais au-dessus de 1,5 fois la charge déclarée (des séances sont retirées au début plutôt que rallongées)
    const fact=sportFactors(N,isEv,V0,Math.max(capW,V0)), st={prevTotal:0,prevL:0};
    weeks.push(endWeek(p,1,N,isEv,V0*fact[0],st));
    post1(weeks[0],st,p,sp);   // la semaine 1 est ajustée AVANT de construire la suivante : la semaine 2 part de la charge réellement placée
    for(let w=2;w<=N;w++) weeks.push(endWeek(p,w,N,isEv,V0*fact[w-1],st));
  }
  return weeks;
}

/* --- trail : le plan de course à pied, avec dénivelé --- */
const dpMin14=r=> r&&r.dplus? r.dplus/100*6 : 0;   // trail : environ 6 min de plus par 100 m de D+ (même règle que dans les notes de séance)
const TRAIL_T={"Footing facile":"Footing nature","Sortie longue":"Sortie longue trail","Sprints en côte":"Côtes sur sentier"}, trailTitle=t=>TRAIL_T[t]||t;
function trailize(weeks,p){
  const o=p.objectif, {vma}=vmaOf(p), r0={forme:12,5:12,10:15,21:20,42:25}[o]??12, r1={forme:22,5:20,10:30,21:40,42:50}[o]??22, N=weeks.length;
  const w0=weeks[0]; if(w0&&w0.phase!=="race"&&!w0.days.some(d=>d.run&&d.kind!=="before")){ const si=Math.max(0,p.startIdx||0); w0.days[si]={...w0.days[si],run:{...easyRun(4,vma,"Footing facile"),note:"Première séance du plan : on démarre doucement."},kind:"easy"}; w0.firstEasy=true; }   // semaine 1 jamais vide
  let prev=0;
  weeks.forEach((wk,i)=>{
    const t= N>1? Math.min(1,i/Math.max(1,N-3)) : 0, base=r0+(r1-r0)*t, items=[];
    for(const d of wk.days){ if(!d.run||d.kind==="before"||d.kind==="race"||d.run.type==="race"||d.run.ev||d.run.blocks.some(b=>b.cross)) continue;   // séance de test : sur le plat
      const km=sessionKm(d.run,vma), isCote=/côte/i.test(d.run.title), ratio= d.run.type==="long"? base : isCote? base*1.1 : d.run.type==="q"? base*.7 : base*.5;
      items.push({d,dp:Math.round(km*ratio*(wk.deload?.8:wk.phase==="taper"?.6:1)/10)*10}); }
    let tot=items.reduce((a,x)=>a+x.dp,0);
    // plafond de la semaine par pas de 10 m, réparti au prorata (plus fort reste) : jamais plus de +10 % (au-dessus de 100 m, sinon +30 m), et semaine allégée à 80 % au plus
    const fitDp=cap=>{ if(!(tot>cap)) return; const u=Math.floor(cap/10), raw=items.map(x=>x.dp*cap/tot/10), fl=raw.map(Math.floor); let left=u-fl.reduce((a,b)=>a+b,0);
      raw.map((r,k)=>[r-fl[k],k]).sort((a,b)=>b[0]-a[0]).forEach(([,k])=>{ if(left>0&&fl[k]*10<items[k].dp){ fl[k]++; left--; } }); items.forEach((x,k)=>{ x.dp=fl[k]*10; }); tot=items.reduce((a,x)=>a+x.dp,0); };
    if(!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race"&&i>0) fitDp(prev>=100? prev*1.10 : Math.max(prev+30,0));
    if(wk.deload&&prev>0) fitDp(Math.floor(prev*.8/10)*10);   // semaine allégée : D+ à 80 % au plus de la dernière semaine normale
    if(!wk.deload&&wk.phase!=="taper"&&wk.phase!=="race") prev=tot;
    wk.dplus=tot;
    for(const {d,dp} of items){ const r=d.run; r.dplus=dp; r.trail=true;
      r.title=trailTitle(r.title);
      const extra= dp>0? "Dénivelé positif visé : environ "+fmt0(dp)+" m (le temps réel peut être de "+Math.round(dp/100*6)+" min plus long). " : "";
      r.note=((r.note?r.note+" ":"")+extra+"Guide-toi à l'effort plus qu'à l'allure : marche dans les montées raides, descends relâché, appuis courts.").trim(); }
    for(const d of wk.days) if(d.run&&(d.run.type==="race"||d.kind==="race")){ const r=d.run, dp=Math.round((RACE_KM[o]||5)*r1*.8/50)*50; r.title=r.title.replace(/^Course/,"Trail"); r.dplus=dp; r.trail=true; r.note=((r.note?r.note+" ":"")+"Dénivelé positif de ton épreuve : prévois environ "+fmt0(dp)+" m (vérifie le profil officiel). Marche dans les montées raides, garde des forces pour la descente.").trim(); }
  });
}

/* ---------- rendu ---------- */
let plan=[], E=null, P=null;
// texte d'aide : réécrit seulement s'il change (les zones aria-live ne répètent pas le même message)
const setT=(el,t)=>{ if(el&&el.textContent!==t) el.textContent=t; };
const longDate=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
function renderRaceHint(){
  setT($("#raceDateL"),evSport(P.sport)?"Date de ton objectif · optionnel":"Date de ta course · optionnel"); if(evSport(P.sport)){ raceHint14(); return; }
  const isRace=P.objectif!=="forme"&&state.profile.objectif!=="forme";
  $("#raceDateField").hidden=state.profile.objectif==="forme";
  setT($("#planTitle"),"Plan sur "+plan.length+" semaines");
  const h=$("#raceHint"), sh=$("#startHint"), rd=state.profile.raceDate;
  h.classList.remove("bad");
  if(state.profile.objectif!=="forme"&&rd&&plan.unreal&&plan.unreal.used==="forme"){ h.classList.add("bad"); setT(h,"Ta date de course n'est pas utilisée : l'objectif est trop loin pour le temps disponible, le plan reste en « Forme » sur 12 semaines."); return; }
  if(!isRace||!rd){ if(sh&&sh.dataset.race) sh.hidden=true; setT(h,"Le plan se cale dessus : la dernière semaine est celle de ta course, et le début du plan est calculé pour toi (4 semaines à un an)."); return; }
  const r=new Date(rd+"T12:00:00"), t=new Date(); t.setHours(12,0,0,0);
  const days=Math.round((r-t)/864e5), jour=r.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  // semaines entre la semaine en cours et celle de la course (comprises), comptées depuis aujourd'hui et non depuis le début déjà borné
  const rawT=Math.round((new Date(mondayOf(rd)+"T12:00:00")-new Date(mondayOf(todayIso())+"T12:00:00"))/6048e5)+1;
  const st=effStart(state.profile);
  let txt= days<0? "Cette date est passée : choisis la date de ta prochaine course." : "Course le "+jour+(days===0?", aujourd'hui !":" , dans "+days+" jour"+(days>1?"s":"")+".").replace(" ,",",")+" Plan de "+plan.length+" semaines.";
  if(days>=0&&rawT>N_MAX&&st&&realStart()>=addDays(todayIso(),7)) txt+=" Ta course est dans "+(rawT-1)+" semaines : le plan de "+plan.length+" semaines commence le "+longDate(realStart())+". D'ici là, cours 2 à 3 fois par semaine en facile et fais ton renforcement, sans chercher à progresser vite.";
  if(days>=0&&rawT<N_MIN&&st&&st<todayIso()) txt+=" Moins de 4 semaines avant la course : le plan garde 4 semaines et a donc commencé le "+longDate(realStart())+". Les semaines déjà passées sont marquées « passée » : reprends à la semaine en cours sans rattraper les séances manquées, et garde l'objectif de finir sans te blesser.";
  if(days>=0&&P.raceIdx!=null&&P.raceIdx<5) txt+=" Course en semaine : la veille est en repos et les jours suivants servent à récupérer.";
  if(days>=0&&P.raceIdx!=null&&P.raceIdx>=5&&String(state.profile.longDay)!==String(P.raceIdx)) txt+=" Tes sorties longues passent au "+(P.raceIdx===5?"samedi":"dimanche")+", le même jour que la course.";
  setT(h,txt); if(days<0){ h.classList.add("bad"); if(sh&&sh.dataset.race) sh.hidden=true; return; }

}
// jour de sortie longue : calé sur le jour de la course (samedi ou dimanche) ; le choix enregistré est gardé pour plus tard
function syncLongDay(){
  const seg=$("#segLongDay"), lock=P.raceIdx!=null&&P.raceIdx>=5, was=!!seg.dataset.locked;
  seg.dataset.locked=lock?"1":"";
  document.querySelectorAll('input[name="longDay"]').forEach(r=>{ r.disabled=lock&&+r.value!==P.raceIdx;
    if(lock) r.checked=+r.value===P.raceIdx; else if(was) r.checked=String(state.profile.longDay??EXAMPLE.longDay)===r.value; });
  const h=$("#longDayHint"); h.hidden=!lock;
  if(lock) setT(h,"Calé sur le jour de ta course ("+(P.raceIdx===5?"samedi":"dimanche")+") : les sorties longues se font ce jour-là pendant tout le plan. Retire la date de course pour choisir.");
}
function recompute(){
  P=profileNums(state.profile);
  plan=buildPlan(P); applyMoves();   // séances déplacées : le plan affiché, les calories et l'équilibre suivent le jour réel
  if(plan.unreal) P={...P,objectif:plan.unreal.used}; // objectif trop loin : le plan prépare la distance atteignable
  E=energy(P,plan);
  if(state.week>plan.length) state.week=plan.length;
  syncSportUI14(); renderPsec(); renderRegen(); renderAip(); renderSummary(); psecSum(); renderWeek(); renderNext(); renderPlan(); renderLog(); renderReg(); renderZones(); renderRaceHint(); syncLongDay();
  try{ renderFeel(); renderImp(); }catch(e){ console.warn("v14",e); }
  evHint();
  { const m=document.getElementById("me"); if(m&&!m.hidden) try{ meRefresh(); }catch(e){ console.warn("me",e); } }   // page Mon profil ouverte : stats et infos suivent les données
  $("#exampleBanner").hidden=!state.isExample&&!P.incomplete;
  $("#exampleTxt").textContent= P.incomplete&&!state.isExample? "Ton profil est incomplet (âge, taille ou poids manquant) : des valeurs d'exemple sont utilisées à la place. Complète ton profil pour que le plan et les calories soient justes." : "Ce sont des données d'exemple. Remplis l'onglet « Profil » avec les tiennes pour que le plan et les calories soient justes.";
  const rv=$("#refVal"); rv.disabled=P.ref==="none"||!P.ref; { const PH={vma:"ex. 14,5",5:"ex. 25:30",10:"ex. 52:10"}; rv.placeholder= Object.hasOwn(PH,P.ref)? PH[P.ref] : "choisis d'abord le type"; }
  const ch=$("#cibleHint"), minT=18.5*Math.pow(P.taille/100,2);
  const unread=k=>{ const r=state.profile[k]; return r!=null&&String(r).trim()!==""&&isNaN(numOf(r)); };
  // valeur illisible : champ marqué invalide (aria-invalid), le message est dans son indice (aria-describedby) ; une erreur « hors limites » (OOB) reste
  const inv=(id,on)=>{ const e=$("#"+id); if(!e) return; if(on) e.setAttribute("aria-invalid","true"); else if(!OOB[id]) e.removeAttribute("aria-invalid"); };
  const mh=$("#mgHint"), mgBad=unread("mg"); mh.classList.toggle("bad",mgBad); inv("mg",mgBad); inv("cible",unread("cible"));
  setT(mh, mgBad? "Nombre non reconnu (ex. 22 ou 18,5) : la masse grasse est estimée en attendant." : "Sert à vérifier que tu manges assez pour ta masse maigre.");
  ch.hidden=!(P.cible<minT)&&!unread("cible");
  if(unread("cible")) setT(ch,"Nombre non reconnu (ex. 76,5) : le poids visé est ignoré.");
  else if(!ch.hidden) setT(ch,"Ce poids donne un IMC de "+fmt1(P.cible/Math.pow(P.taille/100,2))+", sous 18,5 (maigreur). L'outil ne compte pas en dessous de "+fmt1(Math.ceil(minT*10)/10)+" kg ; demande un avis médical.");
  const v=vmaOf(P), h=$("#vmaHint");
  h.classList.toggle("bad",!!v.bad); inv("refVal",!!v.bad);
  const ex10=P.ref==="10"? "52:10" : "25:30";
  setT(h,(v.bad==="range"? (P.ref==="vma"?"VMA hors limites : écris un nombre entre 7 et 25 (ex. 14,5). ":"Ce chrono donne une VMA de "+fmt1(v.badVma)+" km/h, hors de 7 à 25 : vérifie la distance choisie et le chrono. ")
    : v.bad? (P.ref==="vma"?"VMA non reconnue : écris un nombre entre 7 et 25 (ex. 14,5). ":"Chrono non reconnu : écris mm:ss (ex. "+ex10+") ou h:mm:ss (ex. 1:05:00), minutes et secondes sous 60. ") : "")+"VMA utilisée : "+fmt1(v.vma)+" km/h, d'après "+v.src+".");
}
// vrai premier jour du plan (le jour choisi, pas le lundi de sa semaine), sauf si la date de course a recalé le début
function realStart(){ const st=effStart(state.profile), s=state.profile.start; return st&&okIso(s)&&mondayOf(s)===st? s : st; }
const firstDay=w=> w===1&&realStart()? new Date(realStart()+"T12:00:00") : weekDate(w,0);
function weekDate(w,i){ const st=effStart(state.profile); if(!st)return null; const d=new Date(st+"T12:00:00"); if(isNaN(d))return null; d.setDate(d.getDate()+(w-1)*7+(i||0)); return d; }
const dfmt=d=>d?d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"}):"";
// semaine et jour d'aujourd'hui dans le plan (null si hors plan)
function todayPos(){
  const d0=weekDate(1,0); if(!d0)return null;
  const t=new Date(); t.setHours(12,0,0,0);
  const diff=Math.round((t-d0)/864e5); if(diff<0||diff>=(plan.length||12)*7)return null;
  return {w:Math.floor(diff/7)+1,i:diff%7};
}
const clampWeek=w=>Math.min(plan.length||12,Math.max(1,Math.round(+w)||1));
const raceKm=()=>RACE_KM[P.objectif]||0;
function weekKm(wk,f){ return f.days.reduce((a,d)=>a+d.km,0); }

function renderSummary(){
  const wk=plan[state.week-1], f=dayFuel(P,E,wk);
  const ref=plan.map(x=>dayFuel(P,E,x)).filter(x=>!x.noDef);
  const avgLoss = ref.length? ref.reduce((a,x)=>a+x.lossKg,0)/ref.length:0;
  const minT=18.5*Math.pow(P.taille/100,2), tooLow=!isNaN(P.cible)&&P.cible<minT;
  const goal=tooLow? Math.max(minT,0) : P.cible;   // poids visé borné à un IMC de 18,5
  const toLose = !isNaN(goal)&&goal<P.poids ? P.poids-goal : 0;
  const wks = avgLoss>0&&toLose>0 ? Math.ceil(toLose/avgLoss) : null;
  const v=vmaOf(P);
  const above=!isNaN(P.cible)&&P.cible>=P.poids;
  const cibleD= isNaN(P.cible)? "optionnel, sert à estimer la durée" : tooLow? "IMC sous 18,5 : vise "+fmt1(Math.ceil(minT*10)/10)+" kg au plus bas" : above? (P.cible===P.poids?"déjà atteint : passe le déficit à 0":"au-dessus de ton poids actuel : corrige-le") : wks? (wks>104? "plus de 2 ans" : wks<4? "≈ "+wks+" semaine"+(wks>1?"s":"") : Math.ceil(wks*1.2)>104? "≈ "+wks+" semaines à plus de 2 ans" : "≈ "+wks+" à "+Math.ceil(wks*1.2)+" semaines")+" à ce rythme" : "règle un déficit pour estimer";
  // la projection (kg/sem) vient en premier : c'est elle qui reste lisible sur téléphone
  const lossD="≈ "+fmt1(f.lossKg)+" kg/sem · ";
  const defD = f.minor? "moins de 18 ans : maintien, sans déficit" : f.lowBmi? "IMC sous 18,5 : maintien, sans déficit" : f.noDef? "pas de déficit cette semaine" : f.floorHit? lossD+"réduit par sécurité (voir l'alerte)" : f.rateCap? lossD+"plafonné à 0,75 % du poids par semaine" : f.absHit? lossD+"relevé au plancher de "+(P.sexe==="F"?"1 200":"1 500")+" kcal certains jours" : f.bmrHit? lossD+"limité par ton métabolisme de base certains jours" :
    lossD+fmt0(f.base)+" fixe"+(f.extra?" + "+fmt0(f.extra)+" jours faciles":"")+(f.adj?" "+(f.adj>0?"− ":"+ ")+fmt0(Math.abs(f.adj))+" ajust.":"");
  $("#summary").innerHTML=oobHtml()+[
    st("Maintien moyen",fmt0(f.maintAvg),"kcal/j","dépense estimée, sport compris"),
    st("Objectif moyen",fmt0(f.kcalAvg),"kcal/j", (f.noDef?"pas de déficit cette semaine":"varie selon le jour")+" · maintien ≈ "+fmt0(f.maintAvg)),
    f.realDef<-15? st("Surplus moyen",fmt0(-f.realDef),"kcal/j","tu manges plus que ta dépense"+(f.adj<0?" (ajustement manuel +"+fmt0(-f.adj)+")":"")) : st("Déficit moyen",f.noDef?"0":fmt0(f.realDef),"kcal/j", defD),
    st("Poids visé",isNaN(P.cible)?"–":fmt1(P.cible),isNaN(P.cible)?"":"kg", cibleD),
    st("Protéines",fmt0(2*E.protW),"g/j",!E.protRef?"2 g par kg":!isNaN(P.cible)&&Math.abs(E.protW-P.cible)<.05?"2 g par kg de poids visé":"2 g par kg d'un poids à IMC 25"),
    sumLast14(v)
  ].join("");
}
function st(k,v,u,d){return `<div class="stat"><div class="k">${k}</div><div class="v">${v} <small>${u}</small></div><div class="d">${d}</div></div>`;}

function zoneChip(z){return {rf:'<span class="chip rf">Force</span>',z1:'<span class="chip z1">Facile · Z1</span>',z2:'<span class="chip z2">Seuil · Z2</span>',z3:'<span class="chip z3">Intense · Z3</span>'}[z]||"";}
// une seule table de FC (% FC max) selon le bloc, lue par les cartes du jour et par l'onglet Repères
function hrOf(z,lo){
  if(z==="z1") return lo<.62?[.65,.75]:[.65,.78];
  if(z==="z3"&&lo>=.95) return [.90,.97];
  if(lo>=.88) return [.88,.93];
  return [.82,.88];
}
function hrTxt(b){
  if(isNaN(P.fcmax)||b.noPace||b.z==="walk"||!b.lo)return "";
  const r=hrOf(b.z,b.lo);
  return " · "+Math.round(P.fcmax*r[0])+"–"+Math.round(P.fcmax*r[1])+" bpm";
}
function durTxt(min){ min=Math.round(min); return min<60? min+" min" : Math.floor(min/60)+" h "+String(min%60).padStart(2,"0"); }
// « J'ai suivi le plan » : l'alerte de début dans le passé ne revient pas pour ce début (réglage de cet appareil)
let followed=null;
function followedOf(){ if(followed==null){ try{ followed=localStorage.getItem("carnet.suivi")||""; }catch(e){ followed=""; } } return followed; }
// avant / après d'une séance modifiée par l'IA : bouton (aria-expanded) qui déplie les deux séances l'une sous l'autre ; l'état ouvert survit au rendu
const aibaOpen=new Set();
const kmTxt=k=>fmt1(k).replace(/,0$/,"");
const aiLine=x=>`<b>${esc(x.t)}</b> · ${x.min?"≈ "+fmt0(x.min)+" min · ":""}${kmTxt(x.km)} km`;
function aibaHtml(w,d){ const r=d.run, f=r&&r.aiFrom; if(!f) return ""; const key=w+":"+(d.movedFrom!=null? d.movedFrom : d.i), op=aibaOpen.has(key), id="aiba-"+d.i, now=aiSnap(r,E.vma);
  return `<div class="aiba"><button class="aibt" type="button" data-aiba="${d.i}" data-aibk="${key}" aria-expanded="${op}" aria-controls="${id}" aria-label="Voir avant / après (${DAYS[d.i].toLowerCase()})">Voir avant / après</button><div class="aiba-c" id="${id}"${op?"":" hidden"}><p class="aiba-r"><span class="aiba-k">Avant</span><span class="aiba-v">${aiLine(f)}<small>${esc(f.s)}</small></span></p><p class="aiba-r now"><span class="aiba-k">Après</span><span class="aiba-v">${aiLine(now)}<small>${esc(now.s)}</small></span></p></div></div>`; }
function renderWeek(){
  const wk=plan[state.week-1], f=dayFuel(P,E,wk), tp=todayPos(), lt14=lighterSet14();
  $("#weekTitle").textContent="Semaine "+wk.w;
  const d0=firstDay(wk.w), d6=weekDate(wk.w,6);
  const totKm=weekKm(wk,f), rk=wk.phase==="race"?raceKm():0;
  const past=d6&&iso(d6)<todayIso();
  $("#weekSub").innerHTML=`${past?'<span class="phase past">Semaine passée</span><span class="sr-only"> · </span>':""}<span class="phase">${phLab(wk.phase)}${wk.deload?" · semaine allégée":""}</span> ${d0?" "+(iso(d0)===iso(d6)?dfmt(d0):dfmt(d0)+" – "+dfmt(d6))+" · ":" "}${weekVol14(wk,totKm,rk)}${(()=>{const cd=wk.days.find(d=>d.run&&d.run.blocks.some(b=>b.cross)); return cd? " + "+fmt0(sessionMin(cd.run))+" min de "+cd.run.title.replace(/ facile$/,"").toLowerCase()+" (sans impact)" : "";})()}${wk.dropped?" · "+wk.dropped.asked+" séances demandées, "+wk.dropped.placed+(wk.dropped.placed>1?" placées":" placée")+" pour rester à ton volume actuel":wk.limited&&wk.phase!=="race"?" · volume limité par le nombre de séances":""}`;
  const sel=$("#weekSel"); sel.innerHTML=plan.map(x=>`<option value="${x.w}" ${x.w===wk.w?"selected":""}>Semaine ${x.w}${x.deload?" (allégée)":""}${x.phase==="taper"?" (affûtage)":""}${x.phase==="race"?(evSport(P.sport)?" (objectif)":" (course)"):""}${tp&&tp.w===x.w?" · en cours":(()=>{const e=weekDate(x.w,6);return e&&iso(e)<todayIso()?" · passée":"";})()}</option>`).join("");
  // aria-disabled plutôt que disabled : le bouton garde le focus quand on arrive au bout du plan
  $("#prevW").setAttribute("aria-disabled",String(wk.w===1)); $("#nextW").setAttribute("aria-disabled",String(wk.w===plan.length));
  const tb=$("#todayW"); tb.hidden=!tp;
  // alertes : la sécurité (santé, déplacements) reste en haut de la semaine ; le reste va dans le panneau Notifications (passif)
  const al=[], keep=[];
  const tdy=todayIso(), st0=effStart(state.profile), endD=st0? addDays(st0,plan.length*7-1) : null;
  if(st0&&endD<tdy) al.push(`<div class="alert bad act"><span><b>Ce plan est terminé</b> depuis le ${longDate(endD)} (il a commencé le ${longDate(realStart())}). Pour en démarrer un nouveau, change le début du plan dans ton profil, ou recommence-le aujourd'hui.</span><button class="btn" type="button" id="restartPlan">Recommencer aujourd'hui</button></div>`);
  else if(st0&&realStart()>=addDays(tdy,7)) al.push(`<div class="alert ok">Ton plan commence le ${longDate(realStart())}. D'ici là, cours 2 à 3 fois par semaine en facile et fais ton renforcement, sans chercher à progresser vite.</div>`);
  // début dans le passé : la semaine en cours suppose les semaines d'avant suivies ; trop loin du profil, on propose de repartir d'aujourd'hui
  if(tp&&tp.w===wk.w&&wk.w>2&&realStart()<tdy&&followedOf()!==realStart()){   // dès la 3e semaine : la 2e dépasse normalement un peu le volume déclaré
    const decl= P.volume>0? P.volume : P.niveau==="deb"? 8 : 0, lrD=f.days.find(d=>d.run&&d.run.type==="long"), lk=lrD?lrD.km:0;
    const overV= decl>0&&totKm>decl*1.1, overL= P.longest>0&&lk>P.longest*1.1;
    if(overV||overL) keep.push(`<div class="alert warn act"><span><b>Ton plan a commencé le ${longDate(realStart())}.</b> La semaine en cours suppose que tu as suivi les semaines d'avant : ${[overV?fmt0(totKm)+" km cette semaine, pour "+fmt0(decl)+" km par semaine dans ton profil":"",overL?"une sortie longue de "+fmt1(lk)+" km, pour "+fmt1(P.longest)+" km au plus dans ton profil":""].filter(Boolean).join(", et ")}. Si ce n'est pas le cas, recommence le plan aujourd'hui pour repartir de ton niveau actuel.</span><button class="btn" type="button" id="restartPlan">Recommencer aujourd'hui</button><button class="btn ghost sm" type="button" id="followedPlan">J'ai suivi le plan</button></div>`);
  }
  // séances déplacées : garde-fous (avertir sans bloquer) et retour au plan prévu
  if(wk.moved||wk.moveBad){
    const mi=wk.days.filter(d=>d.movedFrom!=null).map(d=>d.i), ws=wk.moved? hardWarn(wk.days,mi,wk.w) : [];
    const txt= wk.moveBad&&!wk.moved? "Un déplacement enregistré ne correspond plus au plan (profil modifié) : il est ignoré." : ws.length? "<b>Attention</b> : "+ws.join(", ")+". Garde au moins un jour facile entre deux séances dures si tu peux." : "Tu as déplacé des séances cette semaine : les calories et l'équilibre suivent les jours réels.";
    keep.push(`<div class="alert ${ws.length?"warn":"ok"} act"><span>${txt}</span><button class="btn ghost sm" type="button" id="resetMoves">Rétablir la semaine</button></div>`);
  }
  if(d6&&iso(d6)<tdy&&!(endD&&endD<tdy)) al.push(`<div class="alert warn">Cette semaine est déjà passée. Reprends à la semaine en cours sans rattraper les séances manquées.</div>`);
  if(f.minor) keep.push(`<div class="alert bad">Tu as moins de 18 ans : l'outil ne met <b>aucun déficit</b> (maintien). À ton âge, perdre du poids en s'entraînant se fait seulement avec l'avis d'un médecin.</div>`);
  else if(f.lowBmi) keep.push(`<div class="alert bad">Ton IMC est de ${fmt1(E.bmi)}, sous 18,5 : l'outil ne met <b>aucun déficit</b> (maintien), quel que soit le réglage du profil. Perdre du poids n'est pas conseillé ici ; demande l'avis d'un médecin.</div>`);
  else if(!isNaN(P.cible)&&P.cible>=P.poids&&!f.noDef) al.push(`<div class="alert warn">Ton poids visé (${fmt1(P.cible)} kg) n'est pas sous ton poids actuel (${fmt1(P.poids)} kg) : mets le déficit fixe et le supplément à 0 pour rester au maintien, ou corrige le poids visé.</div>`);
  const longRace= P.objectif==="21"||P.objectif==="42";
  if(f.taper&&runSport()) al.push(`<div class="alert ok">${wk.phase==="race"?"Semaine de course":"Affûtage"} : le déficit fixe est gardé, mais sans supplément les jours faciles${wk.phase==="race"?", et le jour de la course est à l'équilibre":""}. ${wk.phase==="race"&&longRace?"Les 2 jours avant la course sont aussi à l'équilibre, avec des féculents à chaque repas.":"Si tu te sens à plat, repasse à l'équilibre les 2 jours avant la course."}</div>`);
  const absMinK=P.sexe==="F"?1200:1500;
  if(f.floorHit&&Math.max(0,f.realDef)<15) keep.push(`<div class="alert bad">Aucun déficit possible cette semaine : ${f.maintAvg<=absMinK+100?"ton maintien est déjà sous "+(P.sexe==="F"?"1 200":"1 500")+" kcal environ":"une fois le sport payé, il te resterait moins de 30 kcal par kg de masse maigre"}. L'objectif reste au maintien.${E.mgEst?" Ta masse grasse est estimée à "+E.mg+" % ; renseigne-la dans ton profil si tu la connais.":""}</div>`);
  else if(f.floorHit) keep.push(`<div class="alert bad">Déficit limité à ${fmt0(Math.max(0,f.realDef))} kcal/jour au lieu de ${fmt0(f.wanted)} : au-delà, il te resterait moins de 30 kcal par kg de masse maigre une fois le sport payé, ce qui est trop peu pour s'entraîner sans risque.${f.adj<0?" L'ajustement manuel est compris dans ce calcul.":""} ${E.mgEst?"Ta masse grasse est estimée à "+E.mg+" % ; renseigne-la dans ton profil si tu la connais.":""}</div>`);
  // énergie disponible entre 30 (plancher imposé par l'outil) et 35 : repère d'information, pas une alerte (audit UX-17)
  else if(!f.noDef && f.ea<35) al.push(`<div class="alert warn">Tes apports sont un peu justes pour ton entraînement. <details><summary>Pourquoi ?</summary><p>L'énergie disponible (ce qui reste à ton corps une fois le sport payé, rapporté à ta masse maigre) est de <b>${fmt1(f.ea)} kcal/kg</b>. L'outil ne descend jamais sous 30 ; entre 30 et 35, un déficit tenu longtemps peut peser sur la récupération. Surveille fatigue et sommeil dans l'onglet Suivi, et réduis le déficit si les séances deviennent difficiles.</p></details></div>`);
  if(f.absHit) keep.push(`<div class="alert bad">Certains jours, l'objectif est remonté à ${P.sexe==="F"?"1 200":"1 500"} kcal : en dessous, seulement avec un suivi médical. Le déficit réel de ces jours est plus petit que celui demandé.</div>`);
  else if(f.bmrHit && !f.floorHit) al.push(`<div class="alert warn">Certains jours, l'objectif est remonté à ton métabolisme de base (${fmt0(E.bmr)} kcal) : le déficit réel de ces jours est plus petit que celui demandé.</div>`);
  if(E.bmi>=35||P.age>=65) keep.push(`<div class="alert warn">${E.bmi>=35&&P.age>=65?"À "+P.age+" ans et avec un IMC de "+fmt1(E.bmi):E.bmi>=35?"Avec un IMC de "+fmt1(E.bmi):"À "+P.age+" ans"}, demande l'avis d'un médecin avant de commencer ce plan, surtout pour les séances intenses.</div>`);
  if(runSport()&&P.niveau!=="deb"&&!(P.volume>0)&&wk.w===1) al.push(isNaN(P.volume)? `<div class="alert warn">Tu n'as pas indiqué ton volume actuel : le plan démarre prudemment. Renseigne « km par semaine » dans ton profil pour un plan adapté.</div>` : `<div class="alert warn">Tu pars de zéro : le plan démarre prudemment. Si tu cours déjà un peu, indique tes km par semaine dans ton profil.</div>`);
  if(runSport()&&P.niveau==="deb"&&tplWeek(wk.w,P.objectif!=="forme",plan.length)<=8&&wk.phase!=="race") al.push(`<div class="alert warn">Débutant : ${plan.length===12?"pendant les 8 premières semaines":"au début du plan"}, tout est en facile. Tes tendons et tes os ont besoin de ce temps, même si ton souffle suit déjà.</div>`);
  if(wk.L && P.longest>0 && wk.w===1 && wk.L>P.longest*1.1+1e-9) al.push(`<div class="alert warn">La sortie longue dépasse de plus de 10 % ta plus longue sortie du mois. Vérifie le champ « plus longue sortie » de ton profil.</div>`);
  keep.unshift(...feelAlerts14(wk,tp)); al.push(...sportAlerts14(wk,f,tp,keep));
  if(wk.time){ const T=wk.time, h=m=>hmTxt(Math.round(m/5)*5), qh=h(T.cap);
    if(T.t>T.cap+5) al.push(`<div class="alert warn">Cette semaine prévoit environ <b>${h(T.t)}</b> de sport, au-dessus de ton temps de ${qh} : les séances d'intensité${T.t<T.t0?", le minimum des footings":""} et l'essentiel de la sortie longue sont gardés pour ta progression.${P.renfoMin>0?" Ton renforcement ("+P.renfoMin+" min par séance) compte dans ce temps.":""}</div>`);
    else if(T.t<T.t0-1) al.push(`<div class="alert ok">Semaine ajustée à ton temps de sport : environ <b>${h(T.t)}</b> au lieu de ${h(T.t0)} (${qh} au plus).</div>`);
    else if(T.t0<T.cap*.8&&wk.phase!=="taper") al.push(`<div class="alert ok">Ton plan prévoit environ ${h(T.t0)} cette semaine, sous ton temps de ${qh} : l'outil n'ajoute pas de course au-delà d'une progression prudente. Tu peux compléter par de la marche ou du vélo tranquille.</div>`); }
  if(wk.aiTip&&wk.aiTip.c) al.unshift(`<div class="alert ok aitip"><span><b>Conseil de l'IA${wk.aiTip.f?" · "+esc(wk.aiTip.f):""}</b> ${esc(wk.aiTip.c)}</span></div>`);
  $("#weekAlerts").innerHTML=keep.join("");
  notif.week={w:wk.w,items:al}; refreshNotif();
  const rm=$("#resetMoves"); if(rm) rm.addEventListener("click",()=>resetWeekMoves(wk.w));
  const fp=$("#weekAlerts #followedPlan"); if(fp) fp.addEventListener("click",()=>{ followed=realStart(); try{localStorage.setItem("carnet.suivi",followed);}catch(e){} recompute(); $("#weekTitle").focus({preventScroll:true}); });
  const rs=$("#weekAlerts #restartPlan"); if(rs) rs.addEventListener("click",()=>{ regenPlan(false); $("#weekTitle").focus({preventScroll:true}); });
  // jours
  // jours d'avant le début : une seule carte compacte (la carte du jour reste près du haut sur téléphone)
  const bef=f.days.filter(d=>d.kind==="before"), bLast=bef.length?bef[bef.length-1].i:-1;
  $("#days").innerHTML=f.days.map(d=>{
    if(d.kind==="before"&&d.i>0) return "";
    const date=weekDate(wk.w,d.i), isToday=!!tp&&tp.w===wk.w&&(d.kind==="before"? tp.i<=bLast : tp.i===d.i);
    let cls="day"+(isToday?" today":""), chips="", body="", det="", sum="";
    if(d.run){
      const zs=[...new Set(d.run.blocks.filter(b=>b.z!=="walk"&&!b.race).map(b=>b.z))];
      const top=zs.includes("z3")?"z3":zs.includes("z2")?"z2":"z1";
      cls+=" "+(d.kind==="race"?"race":d.run.sp==="force"?"rf":top)+" k-"+(d.run.sp==="force"?"rf":d.kind);
      const cross=d.run.blocks.some(b=>b.cross), tap=!cross&&d.kind!=="race"&&onTapis(P,d.kind);
      if(d.kind==="race"){
        const rp=OBJ[P.objectif].racePct, sp=d.run.raceSpeed||E.vma*(rp[0]+rp[1])/2, rk=raceKm();
        chips=`<span class="chip race">Course</span> <span class="chip rest">${fmt1(rk).replace(",0","")} km · ≈ ${durTxt(rk/sp*60+dpMin14(d.run))}</span>`+(d.run.dplus?` <span class="chip rest">D+ ${fmt0(d.run.dplus)} m</span>`:"");
      }else{
        chips=zs.map(z=>z===top||zs.length<2? zoneChip(z) : zoneChip(z).replace('class="chip ','class="chip zlow ')).join("");
        const dm=sessionDur(d.run); chips+=` <span class="chip rest">${dm?"≈ "+fmt0(dm)+" min":""}${d.km>0.1?(dm?" · ":"")+fmt1(d.km)+" km":""}</span>`;
        chips+= cross?' <span class="chip rest">Sans impact</span>' : ` <span class="chip rest loc">${d.run.where||(tap?"Tapis":"Dehors")}</span>`+(d.run.dplus?` <span class="chip rest">D+ ${fmt0(d.run.dplus)} m</span>`:"");
        if(d.run.ev) chips+=` <span class="chip ev">Test</span>`;
        if(d.run.aiFrom) chips+=` <span class="chip ai">${d.run.aiLight?"Allégée par l'IA":"Modifiée par l'IA"}</span>`;
      }
      sum=d.run.blocks.map(b=>b.l+(b.min&&!b.mix&&b.z!=="walk"&&b.work==null?" "+fmt0(b.min)+" min":"")+(b.race?" · "+fmt1(raceKm()).replace(",0","")+" km":"")).join(" · ");
      body=`<div class="title">${d.run.title}</div>`; det=`<ul class="blocks">${d.run.blocks.map(b=>`<li><span class="dot ${b.z}"></span><span class="txt">${b.l}${b.min&&!b.mix&&b.z!=="walk"&&b.work==null?" · "+fmt0(b.min)+" min":""}${b.race?" · "+fmt1(raceKm()).replace(",0","")+" km":""}</span>${b.eff?`<span class="pace">${b.eff}${hrTxt(b)}</span>`:b.z!=="walk"&&!b.noPace&&b.lo?`<span class="pace">${b.race?"Allure visée "+paceRangeTxt(E.vma,b.lo,b.hi)+" (estimée d'après ta VMA)":onTapis(P,d.kind)&&d.kind!=="race"?kmh(E.vma,b.lo,b.hi)+" · pente 1 %":paceRangeTxt(E.vma,b.lo,b.hi)}${b.race?"":hrTxt(b)}</span>`:""}</li>`).join("")}</ul>${d.run.note?`<p class="note">${d.run.note}</p>`:""}`;
    }else if(d.renfo){
      cls+=" k-rf"; body=`<div class="title">Renforcement</div>`; det=`<p class="note">Pas de course aujourd'hui.</p>`; sum="Pas de course aujourd'hui";
    }else if(d.kind==="before"){
      chips='<span class="chip rest">Avant le début</span>';
      body=`<div class="title">Avant le début</div><p class="note">Ton plan commence le ${longDate(realStart())}. Mange normalement : ce jour est au maintien.</p>`;
    }else{
      chips='<span class="chip rest">Repos</span>';
      body=`<div class="title">Repos</div>`; det=`<p class="note">Marche, mobilité ou vélo très tranquille si tu as envie de bouger.</p>`; sum="Marche, mobilité ou vélo très tranquille";
      cls+=" restc";
    }
    if(d.renfo){ const r=d.renfo; chips+=(chips?' ':'')+'<span class="chip rf">Renfo</span>'+(r.aiFrom?' <span class="chip ai">Allégé par l\'IA</span>':''); if(d.run) sum+=" + "+r.t.toLowerCase();
      det+=`<div class="renfo"><div class="rh"><b>${r.t}</b> <span>· ${r.m}</span></div><ul class="blocks">${r.rows.map(x=>`<li><span class="dot rf"></span><span class="txt">${x[0]}</span>${x[1]?`<span class="pace">${x[1]}</span>`:""}</li>`).join("")}</ul>${r.note?`<p class="note">${r.note}</p>`:""}${d.kind==="q"?`<p class="note">À faire après la séance, idéalement 3 h plus tard.</p>`:""}</div>`; }
    det+=exoBtn(d);   // schémas des exercices de renforcement
    // actions de la carte : faite / pas faite (jusqu'à aujourd'hui), minuteur, déplacer
    const dIso=date?iso(date):"", sess=hasSession(d), mk=sess?markOf(wk.w,d.i):null;
    let acts="";
    if(sess){
      if(mk==="done"){ cls+=" donec"; chips+=' <span class="chip ok">Faite</span>'; } else if(mk==="skip") chips+=' <span class="chip rest">Pas faite</span>';
      if(d.movedFrom!=null) chips+=` <span class="chip mv">Déplacée du ${DAYS[d.movedFrom].toLowerCase()}</span>`;
      const dl=DAYS[d.i].toLowerCase(); { const fe=feelOf(wk.w,d.i); if(fe) chips+=feelChip14(fe); if(lt14.has(dIso)) chips+=' <span class="chip lt">À alléger</span>'; }
      acts=`<div class="dact">${dIso&&dIso<=todayIso()?`<button class="cbtn ok" type="button" data-done="${d.i}" aria-pressed="${mk==="done"}" aria-label="Faite (${dl})">✓ Faite</button><button class="cbtn no" type="button" data-skip="${d.i}" aria-pressed="${mk==="skip"}" aria-label="Pas faite (${dl})">Pas faite</button>`:""}${d.run&&d.kind!=="race"?`<button class="cbtn go" type="button" data-timer="${d.i}" aria-haspopup="dialog" aria-label="Minuteur de la séance de ${dl}" title="Minuteur"><svg viewBox="0 0 12 14" width="11" height="13" aria-hidden="true"><path d="M1.5 1.2v11.6L11 7z" fill="currentColor"/></svg><span class="bl">Minuteur</span></button>`:""}${feelBtn14(wk.w,d,dIso,mk,dl)}${movable(d)?`<button class="cbtn mv" type="button" data-move="${d.i}" aria-haspopup="dialog" aria-label="Déplacer la séance de ${dl}">Déplacer</button>`:""}</div>`;
    }
    let tip={before:"Repas habituels, à hauteur de ta dépense : pas de déficit avant le début du plan.",rest:f.taper?"Jour de repos : repas normaux, des protéines à chaque repas.":"Jour le plus léger : légumes, protéines, peu de féculents.",easy:"Repas normaux, féculents modérés.",q:"Glucides 2 à 3 h avant la séance et dans l'heure qui suit, avec 20 à 40 g de protéines. Pas à jeun.",long:"Gros petit-déjeuner glucidique, eau et glucides pendant si plus de 1 h 15, repas de récupération.",race:"Repas habituel la veille, petit-déjeuner testé à l'entraînement 3 h avant."}[d.kind];
    if(d.pre==="eve") tip="Veille de course : féculents à chaque repas, repas habituel et déjà testé, peu de fibres et de gras."+(d.eqPre?" Aujourd'hui, tu manges à l'équilibre.":"");
    else if(d.pre==="pre") tip="Avant-veille de course : féculents à chaque repas, tu manges à l'équilibre aujourd'hui.";
    const why = d.bmrHit? " (limité par ton métabolisme de base)" : f.floorHit&&d.def>15? " (réduit par sécurité)" : f.rateCap? " (plafonné à 0,75 % du poids par semaine)" :
      ((f.extra&&(d.kind==="rest"||d.kind==="easy"))?" (fixe + supplément":" (fixe")+(f.adj?(f.adj<0?" + ajustement":" − ajustement"):"")+")";
    // l'écart dû au seul arrondi de l'objectif (à 10 kcal) n'est pas montré : on affiche le déficit réglé
    const shown= !d.bmrHit&&!f.floorHit&&Math.abs(d.def-d.want)<10? d.want : d.def;
    // jour de course : la dépense de la course est comprise dans l'objectif (équilibre), elle ne se mange pas en une journée
    let raceNote="";
    if(d.kind==="race"&&d.raceKcal){ const rp=OBJ[P.objectif].racePct||[.7,.75], sp=d.run.raceSpeed||E.vma*(rp[0]+rp[1])/2, dur=raceKm()/sp*60+dpMin14(d.run);
      raceNote=`<div class="why">Dont ≈ ${fmt0(Math.round(d.raceKcal/10)*10)} kcal brûlées pendant la course${dur>60?" (30 à 90 g de glucides par heure de course : gels, boisson)":""} : le reste se rattrape le soir et le lendemain.</div>`; }
    const pill= d.def>15?`<span class="pill def">Déficit ${fmt0(shown)} kcal</span>`:d.def<-15?`<span class="pill sur">Surplus ${fmt0(-d.def)} kcal</span>`:`<span class="pill eq">Équilibre</span>`;
    const whyIn=why.trim().replace(/^\(|\)$/g,""), whyTxt= d.def>15? (whyIn.startsWith("fixe")?"déficit "+whyIn.replace("supplément","supplément jour léger"):whyIn) : d.def<-15? "ajustement" : d.eqPre? "avant la course" : "";
    // macros : part de chaque macro dans les calories du jour (P et G à 4 kcal/g, L à 9)
    const kP=4*d.P,kC=4*d.C,kF=9*d.F,kT=(kP+kC+kF)||1;
    const mg=(v,l,c)=>`<div class="mg" data-scv="${c}"><b>${v} <small>g</small></b><span>${l}</span></div>`;
    const macros=`<div class="mbar" role="img" aria-label="Protéines ${Math.round(kP/kT*100)} %, glucides ${Math.round(kC/kT*100)} %, lipides ${Math.round(kF/kT*100)} % des calories"><i data-sw="${kP/kT*100}" data-sbg="--mP"></i><i data-sw="${kC/kT*100}" data-sbg="--mC"></i><i data-sw="${kF/kT*100}" data-sbg="--mF"></i></div><div class="mgrid">${mg(d.P,"Protéines","--mP")}${mg(d.C,"Glucides","--mC")}${mg(d.F,"Lipides","--mF")}</div>`;
    const fuelBox=(kc)=>`<div class="fuel"><div class="fh">${kc?`<div class="kc">${fmt0(d.kcal)} <small>kcal</small></div>`:""}${pill}</div>${macros}${whyTxt?`<div class="why">${whyTxt.charAt(0).toUpperCase()+whyTxt.slice(1)}</div>`:""}${d.ex>20?`<div class="why">Dépense du jour ≈ ${fmt0(Math.round(d.maint/10)*10)} kcal : base ${fmt0(Math.round(E.base/10)*10)}${d.ex-d.exRf>20?" + "+exLab14(d)+" "+fmt0(Math.round((d.ex-d.exRf)/10)*10):""}${d.exRf?" + renfo "+fmt0(Math.round(d.exRf/10)*10):""}</div>`:""}${raceNote}</div><p class="tip">${tip}</p>`;
    const dragOk=sess&&movable(d), dlb=DAYS[d.i].toLowerCase();
    const grip=dragOk?'<span class="grip" aria-hidden="true" title="Glisser pour déplacer"><svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><circle cx="2" cy="2" r="1.6"/><circle cx="8" cy="2" r="1.6"/><circle cx="2" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="2" cy="14" r="1.6"/><circle cx="8" cy="14" r="1.6"/></svg></span>':"";
    const icb=sess&&dIso?`<button class="icb" type="button" data-ics="${d.i}" aria-haspopup="dialog" aria-label="Ajouter la séance de ${dlb} à Calendrier" title="Ajouter à Calendrier"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg></button>`:"";
    const head=`<div class="dh"><span class="dl">${grip}<span class="dn">${DAYS[d.i]}</span></span><span class="dr">${isToday?'<span class="dt tb">Aujourd\'hui</span>':`<span class="dt">${dfmt(date)}</span>`}${icb}</span></div>`;
    if(d.kind==="before"){
      const span= bLast>0? DAYS[0]+" – "+DAYS[bLast].toLowerCase() : DAYS[0], dt= bLast>0? dfmt(date)+" – "+dfmt(weekDate(wk.w,bLast)) : dfmt(date);
      return `<article class="day restc before"${isToday?' id="todayCard"':''}><div class="dh"><span class="dn">${span}</span>${isToday?'<span class="dt tb">Aujourd\'hui</span>':`<span class="dt">${dt}</span>`}</div><div class="rc"><span class="chip rest">Avant le début</span><div class="kc">${fmt0(d.kcal)} <small>kcal${bLast>0?"/j":""}</small></div></div><details class="more"><summary>Repas et macros</summary>${fuelBox(false)}<p class="note">Ton plan commence le ${longDate(realStart())}. Repas habituels, au maintien : pas de déficit avant le début.</p></details></article>`;
    }
    // jour de repos : carte compacte, le détail des repas se déplie
    if(cls.includes("restc")&&!d.pre){
      return `<article class="${cls}" data-day="${d.i}" data-iso="${dIso}"${isToday?' id="todayCard"':''}>${head}<div class="rc"><div class="title">Repos</div><div class="kc">${fmt0(d.kcal)} <small>kcal</small></div></div><details class="more"${tileOpen(dIso,isToday)?" open":""}><summary>Repas et macros</summary>${fuelBox(false)}<p class="note">Marche, mobilité ou vélo très tranquille si tu as envie de bouger.</p></details></article>`;
    }
    // tuile compacte : l'essentiel visible, le détail (blocs, allures, renfo, nutrition, conseil) se déplie
    const op=tileOpen(dIso,isToday), did="det-"+d.i;
    const pillC= d.def>15?`<span class="pill def">Déficit ${fmt0(shown)}</span>`:d.def<-15?`<span class="pill sur">Surplus ${fmt0(-d.def)}</span>`:`<span class="pill eq">Équilibre</span>`;
    const kl=`<div class="kl"><span class="kc">${fmt0(d.kcal)} <small>kcal</small></span>${pillC}<button class="vm" type="button" data-vm="${d.i}" aria-expanded="${op}" aria-controls="${did}">${op?"Voir moins":"Voir plus"}</button></div>`;
    const fuelDet=`<div class="fuel">${macros}${whyTxt?`<div class="why">${whyTxt.charAt(0).toUpperCase()+whyTxt.slice(1)}</div>`:""}${d.ex>20?`<div class="why">Dépense du jour ≈ ${fmt0(Math.round(d.maint/10)*10)} kcal : base ${fmt0(Math.round(E.base/10)*10)}${d.ex-d.exRf>20?" + "+exLab14(d)+" "+fmt0(Math.round((d.ex-d.exRf)/10)*10):""}${d.exRf?" + renfo "+fmt0(Math.round(d.exRf/10)*10):""}</div>`:""}${raceNote}</div><p class="tip">${tip}</p>`;
    return `<article class="${cls}${op?"":" cmp"}" data-day="${d.i}" data-iso="${dIso}"${isToday?' id="todayCard"':''}>${head}<div class="chips">${chips}</div>${body}${sum?`<p class="sum">${sum}</p>`:""}${d.run?aibaHtml(wk.w,d):""}${d.run&&d.run.ev?evBox(wk.w,d,dIso):""}${acts}${kl}<div class="det" id="${did}"><div class="det-i">${det}${fuelDet}</div></div></article>`;
  }).join("");
  // équilibre : mêmes couleurs que les puces (facile, seuil, intense)
  const z=zoneMins(wk.days), tot=z.tot||1;
  const p1=Math.round(z.z1/tot*100), p2=Math.round(z.z2/tot*100), p3=Math.max(0,100-p1-p2);
  $("#balance").innerHTML=P.sport==="force"? forceBalance14(wk,f) : `<div class="spb"><h3>Équilibre de la semaine</h3><span class="num">${p1} % facile · ${p2} % seuil · ${p3} % intense (cible 80 % de facile)</span></div>
  <div class="bar" role="img" aria-label="${p1} pour cent du temps en facile, ${p2} au seuil, ${p3} en intense"><i data-sw="${p1}" data-sbg="--z1-bar"></i><i data-sw="${p2}" data-sbg="--z2-bar"></i><i data-sw="${p3}" data-sbg="--z3-bar"></i></div>
  <div class="legend"><span><i class="dot z1"></i> facile</span><span><i class="dot z2"></i> seuil</span><span><i class="dot z3"></i> intense</span></div>
  <details class="more why"><summary>Calories de la semaine</summary><p class="note">${f.lowBmi?"Calories : maintien tous les jours, sans déficit (voir l'alerte en haut de la semaine).":f.noDef&&!f.taper?"Calories : pas de déficit cette semaine, tu manges à hauteur de ta dépense.":f.taper?"Calories : affûtage, déficit fixe seul tous les jours, pas de supplément ; jour de course à l'équilibre"+(wk.phase==="race"&&longRace?", comme les 2 jours qui le précèdent":"")+".":"Calories : le déficit fixe s'applique tous les jours. Les jours de repos et de footing, le supplément s'y ajoute. Les jours de séance dure et de sortie longue gardent seulement le déficit fixe, avec plus de glucides pour réussir la séance."}</p></details>
  <div class="weeknav">${wk.w>1?`<button class="btn ghost sm" type="button" id="prevW2">‹ Semaine ${wk.w-1}</button>`:""}${wk.w<plan.length?`<button class="btn ghost sm" type="button" id="nextW2">Semaine ${wk.w+1} ›</button>`:""}</div>`;
  renderRing(wk.w); updFoldAll();
  const pw2=$("#prevW2"), nw2=$("#nextW2");
  if(pw2) pw2.addEventListener("click",()=>{if(state.week>1)goWeek(state.week-1,true);});
  if(nw2) nw2.addEventListener("click",()=>{if(state.week<plan.length)goWeek(state.week+1,true);});
}
function goWeek(w,toTop){
  const a=document.activeElement, fid=a&&a.id;
  state.week=clampWeek(w); persist(); recompute();
  const t=$("#weekTitle");
  if(toTop || t.getBoundingClientRect().top<navTopH()) scrollUnderNav($("#p-semaine"));
  restoreFocus(fid);
}
// le rendu recrée certains boutons : le focus revient sur le même (ou sur son voisin s'il n'existe plus)
function restoreFocus(fid){
  if(!fid) return; const alt={prevW2:"nextW2",nextW2:"prevW2"};
  let el=document.getElementById(fid); if(!el||el.hidden||el.disabled) el=document.getElementById(alt[fid]||"");
  if(el&&document.activeElement!==el) el.focus({preventScroll:true});
}
// objectif trop loin : première date de course (même jour de la semaine, dimanche par défaut) qui le rend atteignable sans risque, début du plan inchangé
let safeCache={k:"",v:null};
function safeRaceDate(){
  const u=plan.unreal; if(!u||u.minor||!runSport()) return null;
  const pr=state.profile, tdy=todayIso(), st=realStart()||tdy, k=JSON.stringify([pr,st,tdy]); if(safeCache.k===k) return safeCache.v;
  const wd= okIso(pr.raceDate)? (new Date(pr.raceDate+"T12:00:00").getDay()+6)%7 : 6;
  let v=null;
  for(let n=Math.max(N_MIN,plan.length+1);n<=N_MAX&&!v;n++){
    const d=addDays(mondayOf(st),(n-1)*7+wd); if(d<tdy) continue;
    if(reachable(String(u.asked),buildPlanFor(profileNums({...pr,objectif:String(u.asked),start:st,raceDate:d})),P.niveau==="deb")) v=d; }
  safeCache={k,v:v&&{d:v,st}}; return safeCache.v;
}
const yearDate=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-safedate]"); if(!b) return; const v=safeRaceDate(); if(!v) return;
  state.profile={...state.profile,start:v.st,raceDate:v.d}; state.isExample=false; fillForm(); persist(); recompute(); toast("Course fixée au "+yearDate(v.d)+"."); });
function unrealAlert(){
  const u=plan.unreal, lab={5:"un 5 km",10:"un 10 km",21:"un semi-marathon (21,1 km)",42:"un marathon (42,2 km)"}[u.asked], used=OBJ[u.used].label;
  const usedTxt= u.used==="forme"? "ta forme, sans course au bout" : used==="Semi"? "un semi-marathon" : "un "+used;
  // débutant : semi à partir de 30 semaines, marathon à partir de 52 ; au-delà de ces seuils, c'est la sortie longue qui manque
  const debMin= P.niveau==="deb"? {21:30,42:52}[u.asked] : 0, tooShort= debMin&&plan.length<debMin;
  const later= tooShort? "Garde ton objectif pour la suite, avec un plan d'au moins "+debMin+" semaines"+(debMin===52?" (un an)":"")+"." : plan.length>=N_MAX? "Garde ton objectif pour plus tard, une fois cette course faite." : "Garde ton objectif pour la suite, avec un plan plus long.";
  if(u.minor) return `<div class="alert warn"><b>Avant 18 ans, pas de semi-marathon ni de marathon.</b> Ces distances sont déconseillées avant 18 ans : le plan prépare donc <b>${usedTxt}</b>, avec des sorties longues de 1 h 30 au plus. Parles-en avec ton médecin ou ton club.</div>`;
  const sd=safeRaceDate();
  if(sd) return `<div class="alert bad act"><span><b>Objectif trop loin pour ${plan.length} semaines.</b> ${tooShort?"En débutant, "+lab+" demande au moins "+debMin+" semaines de course régulière.":"Ta plus longue sortie ne monterait qu'à "+fmt1(u.top)+" km : la course ferait environ "+fmt1(RACE_KM[u.asked]/Math.max(1,u.top))+" fois cette distance, trop risqué."} <b>Pour viser ${lab} sans risque, choisis une course le ${yearDate(sd.d)} ou après.</b> En attendant, le plan prépare ${usedTxt}.</span><button class="btn" type="button" data-safedate>Viser cette date</button></div>`;
  return `<div class="alert bad"><b>Objectif trop loin pour ${plan.length} semaines.</b> ${tooShort?"En débutant, "+lab+" demande au moins "+debMin+" semaines de course régulière.":"Pour "+lab+", ta plus longue sortie ne monterait qu'à "+fmt1(u.top)+" km d'ici la semaine "+Math.max(1,plan.length-2)+" : la course ferait environ "+fmt1(RACE_KM[u.asked]/Math.max(1,u.top))+" fois cette distance, ce qui multiplie le risque de blessure."} Le plan prépare donc <b>${usedTxt}</b>. ${later}</div>`;
}
function renderPlan(){
  { const ld=$("#planLead"); if(ld){ if(!ld.dataset.o) ld.dataset.o=ld.textContent; setT(ld,runSport()?ld.dataset.o:sportLead14()); } }
  notif.plan=[plan.unreal?unrealAlert():"", plan.ai&&state.aip&&state.aip.p&&!state.aip.p.x? `<div class="alert ok aitip"><span><b>Plan ajusté par l'IA</b> (${esc(CPLX_LAB[state.aip.p.cplx]||"Standard").toLowerCase()}) : ${plan.ai.n? plan.ai.n+" séance"+(plan.ai.n>1?"s":"")+" modifiée"+(plan.ai.n>1?"s":"") : "séances gardées"}, un conseil par semaine dans les notifications.${state.aip.p.resume?" "+esc(state.aip.p.resume):""}</span></div>` : "",...evNotif()].filter(Boolean); refreshNotif();
  const nPrep=plan.filter(w=>w.phase==="prep").length, pl=$("#planLong"); pl.hidden=!nPrep;
  if(nPrep) setT(pl,"Plan long : d'abord "+nPrep+" semaines de préparation générale (volume qui monte de 3 à 5 % par semaine, sortie longue qui s'allonge, une séance de qualité qui change toutes les 4 semaines), puis "+(plan.length-nPrep)+" semaines de préparation à ta course.");
  const rows=plan.map(wk=>{const f=dayFuel(P,E,wk);const km=planVol14(wk,f);return {wk,f,km};});
  const max=Math.max(...rows.map(r=>r.km))||1;
  const q=wk=>P.sport==="force"?forceKey14(wk):wk.days.filter(d=>d.run&&d.run.type==="q").map(d=>d.run.title).join(" + ")||"–";
  const lrOf=wk=>{if(!runSport())return lrSport14(wk);const lr=wk.days.find(d=>d.run&&(d.run.type==="long"||d.run.type==="race"));return lr?(lr.run.type==="race"?"Course "+fmt1(raceKm()).replace(",0","")+" km":(P.niveau==="deb"?fmt0(sessionMin(lr.run))+" min":fmt1(sessionKm(lr.run,E.vma))+" km")):"–";};
  $("#planTable").innerHTML=`<thead><tr><th>Sem.</th><th>Dates</th><th>Phase</th><th class="ta-r">Volume</th><th class="w22"></th><th class="ta-r">${P.sport==="force"?"Charge":"Sortie longue"}</th><th>Séances clés</th><th class="ta-r">Kcal/j moy.</th></tr></thead><tbody>`+
  rows.map(({wk,f,km})=>{const d=firstDay(wk.w);
    return `<tr data-w="${wk.w}" class="${wk.w===state.week?"cur":""}" tabindex="0"><td class="n">${wk.w}</td><td class="nw">${dfmt(d)}</td><td>${phLab(wk.phase)}${wk.deload?" · allégée":""}</td><td class="n">${volTxt14(km,wk)}</td><td><div class="vbar" data-sw="${Math.round(km/max*100)}"></div></td><td class="n">${lrOf(wk)}</td><td>${q(wk)}</td><td class="n">${fmt0(f.kcalAvg)}</td></tr>`;}).join("")+`</tbody>`;
  const items=rows.map(({wk,f,km})=>{const d=firstDay(wk.w);
    return `<li data-w="${wk.w}" class="${wk.w===state.week?"cur":""}" tabindex="0" role="button"><div class="m-main"><div class="m-t"><span>Sem. ${wk.w}${d?" · "+dfmt(d):""}${plan.length>20?"":" · "+phLab(wk.phase)}${wk.deload?" · allégée":""}</span><span class="num">${volTxt14(km,wk)}</span></div><div class="m-s">${wk.phase==="race"?lrOf(wk):(()=>{ const l=lrOf(wk), k=q(wk); return l==="–"&&k==="–"? "Footings faciles seulement" : [l!=="–"?lrLab14()+l:"",k!=="–"?k:""].filter(Boolean).join(" · "); })()} · ${fmt0(f.kcalAvg)} kcal/j</div></div><span class="chev" aria-hidden="true">›</span></li>`;});
  // plan long sur téléphone : semaines regroupées par phase, phases terminées repliées, la phase de la semaine choisie ouverte
  if(plan.length<=20) $("#planList").innerHTML=items.join("");
  else{ const tdy=todayIso(), grp=[];
    plan.forEach((wk,k)=>{ const lab=phLab(wk.phase); if(!grp.length||grp[grp.length-1].lab!==lab) grp.push({lab,a:wk.w,b:wk.w,ks:[]}); const g=grp[grp.length-1]; g.b=wk.w; g.ks.push(k); });
    $("#planList").innerHTML=grp.map(g=>{ const end=weekDate(g.b,6), past=end&&iso(end)<tdy, open=state.week>=g.a&&state.week<=g.b;
      return `<li class="mgrp"><details${open?" open":""}><summary><span>${g.lab}${past?" · terminée":""}</span><span class="num">${g.a===g.b?"Sem. "+g.a:"Sem. "+g.a+" à "+g.b}</span></summary><ul>${g.ks.map(k=>items[k]).join("")}</ul></details></li>`; }).join(""); }
  document.querySelectorAll("#planTable tr[data-w], #planList li[data-w]").forEach(tr=>{const go=()=>{selectTab("semaine");goWeek(+tr.dataset.w,true);$("#weekTitle").focus({preventScroll:true});};tr.addEventListener("click",go);tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go();}});});
}
function renderZones(){
  if(!runSport()){ renderZones14(); return; }
  const v=E.vma, hr=r=>isNaN(P.fcmax)?"ajoute ta FC max":Math.round(P.fcmax*r[0])+"–"+Math.round(P.fcmax*r[1])+" bpm";
  const rows=[["Footing (Z1)","conversation complète",[.62,.70],hrOf("z1",.62)],["Sortie longue (Z1)","conversation complète",[.60,.68],hrOf("z1",.60)],["Seuil retenu (Z2)","phrases courtes",[.82,.86],hrOf("z2",.82)],["Fractionné VMA (Z3)","quelques mots",[.95,1.0],hrOf("z3",.95)]];
  if(P.objectif!=="forme"){const rp=OBJ[P.objectif].racePct;rows.splice(3,0,["Allure "+OBJ[P.objectif].label,"selon la distance",rp,hrOf(rp[0]>=.88?"z3":"z2",rp[0])]);}
  $("#zoneTable").innerHTML=`<thead><tr><th>Allure</th><th>Test de la parole</th><th>% VMA</th><th>Allure pour toi</th><th>FC</th></tr></thead><tbody>`+rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td class="mono">${Math.round(r[2][0]*100)}–${Math.round(r[2][1]*100)} %</td><td class="mono">${paceRangeTxt(v,r[2][0],r[2][1])}</td><td class="mono">${hr(r[3])}</td></tr>`).join("")+`</tbody>`;
  $("#zoneList").innerHTML=rows.map(r=>`<li><div class="m-main"><div class="m-t"><span>${r[0]}</span><span class="num">${paceRangeTxt(v,r[2][0],r[2][1])}</span></div><div class="m-s">${r[1]} · ${Math.round(r[2][0]*100)}–${Math.round(r[2][1]*100)} % VMA · ${hr(r[3])}</div></div></li>`).join("");
}

/* suivi */
function plannedLossKg(){const r=plan.map(x=>dayFuel(P,E,x)).filter(x=>!x.noDef);return r.length?r.reduce((a,x)=>a+x.lossKg,0)/r.length:0;}
const sortedLog=()=>[...state.log].sort((a,b)=>a.date<b.date?-1:1);
const dash=(v,f)=> v==null||v===""||isNaN(+v)? "–" : f(+v);
function renderChart(log){
  const ch=$("#chart");
  if(!log.length){ ch.innerHTML=`<p class="muted">Ta courbe de poids apparaîtra ici dès ta première semaine notée. Pour démarrer, entre ton poids moyen de cette semaine ci-dessus.</p>`; ch.dataset.w=""; return; }
  // largeur du dessin = largeur réelle : le texte garde 11 px à l'écran sur téléphone comme sur ordinateur
  const cw=ch.clientWidth-28; if(cw<=0){ ch.dataset.w=""; return; }
  const Wd=Math.max(260,Math.round(cw)),H=190,pl=40,pr=14,pt=14,pb=28;
  ch.dataset.w=Wd;
  const ys=log.map(e=>e.poids); if(!isNaN(P.cible))ys.push(P.cible);
  let lo=Math.floor(Math.min(...ys)-1),hi=Math.ceil(Math.max(...ys)+1);
  const t0=new Date(log[0].date).getTime(), t1=Math.max(new Date(log[log.length-1].date).getTime(),t0+7*864e5);
  const x=t=>pl+(t-t0)/(t1-t0)*(Wd-pl-pr), y=v=>pt+(hi-v)/(hi-lo)*(H-pt-pb);
  const step=Math.max(1,Math.ceil((hi-lo)/5));
  let g="";for(let v=lo;v<=hi;v+=step)g+=`<line x1="${pl}" x2="${Wd-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  const rate=plannedLossKg()/7; // kg/jour
  const tEnd=t1, proj0=log[0].poids-rate*(tEnd-t0)/864e5, pv= !isNaN(P.cible)&&P.cible<log[0].poids? Math.max(P.cible,proj0) : proj0; // la cible ne borne que si elle est sous le poids
  const target=isNaN(P.cible)?"":`<line x1="${pl}" x2="${Wd-pr}" y1="${y(P.cible)}" y2="${y(P.cible)}" stroke="var(--z1)" stroke-dasharray="2 4"/><text x="${Wd-pr}" y="${y(P.cible)-5}" text-anchor="end" fill="var(--z1)">visé ${fmt1(P.cible)}</text>`;
  const proj=`<line x1="${x(t0)}" y1="${y(log[0].poids)}" x2="${x(tEnd)}" y2="${y(pv)}" stroke="var(--muted)" stroke-dasharray="5 4"/>`;
  const pts=log.map(e=>[x(new Date(e.date).getTime()),y(e.poids)]);
  const path=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const ends=log.length>1?[log[0],log[log.length-1]]:[log[0]];
  const lab=ends.map((e,i)=>`<text x="${i?Wd-pr:x(new Date(e.date).getTime())}" y="${H-8}" text-anchor="${i?"end":"start"}">${dfmt(new Date(e.date+"T12:00:00"))}</text>`).join("");
  ch.innerHTML=`<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="Courbe de poids">${g}${target}${proj}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${i===pts.length-1?5:3.5}" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/>`).join("")}${lab}</svg><div class="legend"><span><i class="dot dot-a"></i> ton poids moyen</span><span>pointillés gris : rythme prévu</span></div>`;
}
function renderLog(){
  const log=sortedLog();
  renderChart(log);
  const ecart=(e,i)=>{ if(!i) return "–"; const d=e.poids-log[i-1].poids, r=Math.round(d*10); return (r>0?"+":r<0?"−":"")+fmt1(Math.abs(d)); };
  const seances=e=> e.prevues==null&&e.faites==null? "–" : dash(e.faites,String)+"/"+dash(e.prevues,String);
  $("#logTable").innerHTML= log.length? `<thead><tr><th>Date</th><th class="ta-r">Poids</th><th class="ta-r">Écart</th><th class="ta-r">Sommeil</th><th class="ta-r">Fatigue</th><th class="ta-r">Séances</th><th>Douleur</th><th></th></tr></thead><tbody>`+
    log.map((e,i)=>`<tr><td class="nw">${dfmt(new Date(e.date+"T12:00:00"))}</td><td class="n">${fmt1(e.poids)} kg</td><td class="n">${ecart(e,i)}</td><td class="n">${dash(e.sommeil,v=>fmt1(v)+" h")}</td><td class="n">${dash(e.fatigue,v=>v+"/5")}</td><td class="n">${seances(e)}</td><td>${e.douleur==="oui"?"oui":"non"}</td><td><button class="btn ghost sm" type="button" data-del="${esc(e.date)}">Retirer</button></td></tr>`).reverse().join("")+`</tbody>` : "";
  $("#logList").innerHTML=log.map((e,i)=>`<li><div class="m-main"><div class="m-t"><span>${dfmt(new Date(e.date+"T12:00:00"))}</span><span class="num">${fmt1(e.poids)} kg${i?" ("+ecart(e,i)+")":""}</span></div><div class="m-s">sommeil ${dash(e.sommeil,v=>fmt1(v)+" h")} · fatigue ${dash(e.fatigue,v=>v+"/5")} · séances ${seances(e)} · douleur ${e.douleur==="oui"?"oui":"non"}</div></div><button class="del" type="button" data-del="${esc(e.date)}" aria-label="Retirer la semaine du ${dfmt(new Date(e.date+"T12:00:00"))}">×</button></li>`).reverse().join("");
  document.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>removeEntry(b.dataset.del,b)));
  renderAdvice(log); renderProg(log); renderPerf(log);
}
// un ajustement négatif qui ferait passer sous le plancher de sécurité (30 kcal/kg MM) une semaine du plan
function adjHitsFloor(a){ if(P.minor||E.bmi<18.5) return true; const Q={...P,adj:a}; return plan.some(wk=>dayFuel(Q,E,wk).floorHit); }
// retrait ou remplacement d'une semaine : barre « Annuler » pendant 6 s, sans boîte de confirmation.
// Les changements faits pendant que la barre est affichée s'empilent : « Annuler » les défait tous, aucun n'est perdu.
let undoT=null, undoStack=[];
const dLabel=date=>dfmt(new Date(date+"T12:00:00"));
function hideToast(){
  clearTimeout(undoT); undoStack=[]; const t=$("#toast"); if(!t||t.hidden) return;
  const hadFocus=t.contains(document.activeElement); t.hidden=true;
  if(hadFocus) $("#lgDate").focus({preventScroll:true});
}
function pushUndo(item){
  undoStack.push(item);
  let t=$("#toast"); if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; $("#toasts").appendChild(t); }
  // le texte détaille ce qu'« Annuler » va défaire (retraits et remplacements)
  const n=undoStack.length, dels=undoStack.filter(x=>x.kind==="del"), reps=undoStack.filter(x=>x.kind!=="del");
  const part=(L,w)=> L.length===1? "semaine du "+dLabel(L[0].date)+" "+w : L.length+" semaines "+w+"s";
  const txt= n===1? item.label : [dels.length?part(dels,"retirée"):"",reps.length?part(reps,"remplacée"):""].filter(Boolean).join(", ");
  t.innerHTML=`<span>${esc(txt.charAt(0).toUpperCase()+txt.slice(1))}</span><button type="button" aria-label="Annuler : ${esc(txt)}">Annuler</button>`; t.hidden=false;
  t.querySelector("button").addEventListener("click",()=>{
    const items=undoStack.slice().reverse(); undoStack=[];
    for(const x of items) x.undo();
    state.isExample=false; $("#logMsg").innerHTML=""; persist(); recompute(); hideToast();
    $("#lgDate").focus({preventScroll:true});
  });
  clearTimeout(undoT); undoT=setTimeout(hideToast,6000);
}
function removeEntry(date,btn){
  const e=state.log.find(x=>x.date===date); if(!e)return;
  // focus : le bouton « Retirer » voisin dans la même liste, sinon le champ date
  const box=btn&&btn.closest("#logTable,#logList"), list=box?[...box.querySelectorAll("[data-del]")]:[], k=list.indexOf(btn);
  // l'ajustement déjà appliqué pour cette mesure est gardé : la même semaine ressaisie ne le propose pas une 2e fois
  if(e.applied!=null){ state.appliedByDate={...(state.appliedByDate||{}),[date]:e.applied}; }
  const prevDel=(state.deleted||{})[date];
  state.deleted=cleanDeleted({...(state.deleted||{}),[date]:Date.now()});
  state.log=state.log.filter(x=>x.date!==date); $("#logMsg").innerHTML=""; persist(); recompute();
  pushUndo({kind:"del",date,label:"Semaine du "+dLabel(date)+" retirée",undo:()=>{ if(!state.log.some(x=>x.date===e.date)){ const d2={...(state.deleted||{})}; if(prevDel) d2[date]=prevDel; else delete d2[date]; state.deleted=d2; state.log=state.log.concat({...e,at:Date.now()}); } }});
  if(box){ const nl=[...box.querySelectorAll("[data-del]")]; const nb=nl[Math.min(k,nl.length-1)]; if(nb&&nb.getClientRects().length){ nb.focus(); return; } }
  $("#lgDate").focus({preventScroll:true});
}
function renderAdvice(log){
  const out=[]; const adv=$("#advice");
  if(!log.length){adv.innerHTML="";return;}
  const last=log[log.length-1];
  let propose=0, src=-1; // src : bloc qui porte la proposition (et son bouton)
  const noCut=!!P.minor||E.bmi<18.5;
  if(last.douleur==="oui") out.push({c:"bad",h:`Douleur qui dure : n'augmente pas le volume cette semaine, remplace le fractionné par du footing ou du vélo, et consulte si ça persiste plus d'une semaine. Douleur osseuse précise : arrête la course et consulte.`});
  const sl=last.sommeil==null||last.sommeil===""?null:+last.sommeil, fa=last.faites==null||last.faites===""?null:+last.faites, pr=last.prevues==null||last.prevues===""?null:+last.prevues;
  const lowSleep= sl!=null && sl>0 && sl<7, missed= pr>0 && fa!=null && fa/pr<.75;
  const tired = last.fatigue>=4 || lowSleep || missed;
  if(tired) { out.push({c:"warn",h:`Signaux de fatigue (${[last.fatigue>=4?"fatigue "+last.fatigue+"/5":null,lowSleep?"sommeil "+fmt1(sl)+" h":null,missed?"séances manquées":null].filter(Boolean).join(", ")}). Fais de cette semaine une semaine allégée (−25 % de volume, une seule séance de qualité) et mange un peu plus chaque jour, surtout autour des séances.`}); propose=150; src=out.length-1; }
  if(log.length>=2){
    const a=log[Math.max(0,log.length-3)], b=last;
    const days=(new Date(b.date)-new Date(a.date))/864e5;
    if(days>=6){
      const pctW=(a.poids-b.poids)/a.poids*100/(days/7);
      const want=Math.round(plannedLossKg()/P.poids*1000)/10;
      const kgW=(a.poids-b.poids)/(days/7), sg=v=>(Math.round(v*10)>0?"+":Math.round(v*10)<0?"−":"")+fmt1(Math.abs(v));
      // sous 0,2 % : 2 décimales, pour ne pas lire « −0,1 » pour 0,14
      const sg2=v=>Math.abs(v)>=.2? sg(v) : (Math.round(v*100)>0?"+":Math.round(v*100)<0?"−":"")+nz(Math.round(Math.abs(v)*100)/100).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2});
      const nw=Math.max(1,Math.round(days/7));
      let msg=`Rythme mesuré : <b>${sg2(-pctW)} %</b> par semaine (${sg(-kgW)} kg/sem) sur ${nw} semaine${nw>1?"s":""}. Prévu : ${sg(-want)} %.`;
      const goodMin=Math.max(.2,want*.6);
      // moins de 18 ans ou IMC sous 18,5 : jamais de baisse des calories, message neutre
      if(noCut&&pctW<0.1){ out.push({c:"ok",h: pctW<-0.1? `${msg} Pas de restriction ici : ${P.minor?"à ton âge":"avec ton IMC"}, la prise de poids peut être normale. Parles-en à un médecin si elle t'inquiète.` : `${msg} Poids stable : c'est ce que vise le maintien.`}); }
      // au maintien (mineur, IMC bas ou déficit à 0) : une perte n'est pas un succès, on propose de manger un peu plus
      else if((noCut||want<=0)&&pctW>=0.1&&pctW<=0.75){ out.push({c:"warn",h:`${msg} Ton poids baisse alors que l'objectif est le maintien : mange un peu plus, ${noCut?"100 à 150":"environ 100"} kcal par jour${noCut?", et parles-en à un médecin si ça continue":""}.`}); propose=Math.max(propose,noCut?150:100); src=out.length-1; }
      else if(pctW>0.75){ out.push({c:"bad",h:`${msg} C'est trop rapide : tu risques de perdre du muscle et de mal récupérer. Ajoute 150 à 200 kcal par jour.`}); propose=Math.max(propose,200); src=out.length-1; }
      else if(pctW<-0.1){
        if(tired) out.push({c:"warn",h:`${msg} Ton poids remonte, mais avec la fatigue ce n'est pas le moment de baisser les calories : récupère d'abord, on regardera à la prochaine mesure.`});
        else if(log.length<3) out.push({c:"ok",h:`${msg} Ton poids remonte sur une seule semaine : c'est souvent de l'eau (repas salé, séance dure, cycle). Attends la prochaine mesure avant de baisser les calories.`});
        else { out.push({c:"warn",h:`${msg} Ton poids remonte depuis 2 semaines. ${want>0?"Le déficit prévu n'est pas atteint : vérifie tes portions (pèse-les quelques jours), puis":"Tu es au maintien :"} retire 100 kcal par jour, tous les jours, si ça continue.`}); propose=-100; src=out.length-1; }
      }
      else if(pctW<0.1){
        if(want>0 && log.length>=3 && !tired){ out.push({c:"warn",h:`${msg} Le poids stagne depuis 2 à 3 semaines. Avant de baisser les calories, vérifie que tes portions sont bien mesurées. Sinon, retire 100 kcal par jour, tous les jours.`}); propose=-100; src=out.length-1; }
        else if(tired) out.push({c:"ok",h:`${msg} Avec la fatigue, ne baisse pas les calories pour l'instant : l'ajout proposé plus haut sert à récupérer.`});
        else if(want>0) out.push({c:"ok",h:`${msg} La perte est encore faible : attends une troisième semaine de mesures avant de changer quoi que ce soit, l'eau masque souvent la tendance.`});
        else out.push({c:"ok",h:`${msg} Poids stable : c'est ce que vise le maintien.`});
      }
      else if(want>0 && pctW<goodMin) out.push({c:"warn",h:`${msg} Perte plus lente que prévu (${sg2(-pctW)} % contre ${sg(-want)} %). ${tired?"Avec la fatigue, ne baisse pas les calories pour l'instant : récupère d'abord.":"Attends une 3e mesure, puis vérifie tes portions (pèse-les quelques jours) avant de changer quoi que ce soit."}`});
      else out.push({c:"ok",h:`${msg} ${tired?"Le rythme de perte est bon ; l'ajout proposé plus haut sert seulement à récupérer de la fatigue.":"Tu es dans la bonne fourchette : ne change rien."}`});
    } else out.push({c:"ok",h:`Il faut au moins une semaine d'écart entre deux mesures pour juger du rythme.`});
  } else out.push({c:"ok",h:`Première semaine notée. Il faut au moins deux semaines de mesures pour juger du rythme : les variations d'eau masquent tout sur quelques jours.`});
  const cur=+P.adj||0, sgn=v=>(v>0?"+":v<0?"−":"")+fmt0(Math.abs(v));
  if(noCut&&propose<0){ propose=0; src=-1; }
  if(noCut&&last.applied!=null&&+last.applied<0) out.push({c:"ok",h:`L'ajustement de ${sgn(+last.applied)} kcal/jour noté pour cette mesure n'a pas d'effet : ${P.minor?"avant 18 ans":"avec un IMC sous 18,5"}, l'outil ne réduit jamais les calories.`});
  else if(propose && src>=0){
    const S_=out[src];
    if(last.applied!=null) out.push({c:"ok",h:`Ajustement appliqué pour cette mesure : ${sgn(+last.applied||0)} kcal/jour (total actuel ${sgn(cur)} kcal/jour). Note ta prochaine semaine pour en voir l'effet.`});
    else{
      let nv=Math.max(-300,Math.min(500,cur+propose));
      if(propose<0) while(nv<cur && adjHitsFloor(nv)) nv+=50;   // jamais sous le plancher de sécurité
      if(nv===cur){ if(propose<0) out.push({c:"warn",h:`Tu es déjà à la limite basse de sécurité${cur<=-300?" ou au plus bas de l'ajustement":""} : ne baisse pas davantage les calories. Ajoute plutôt de la marche au quotidien.`}); }
      else { const dlt=nv-cur; S_.act=true; S_.h=`<span>${S_.h} <b>Proposition : manger ${fmt0(Math.abs(dlt))} kcal de ${dlt>0?"plus":"moins"} par jour</b>, tous les jours (ajustement manuel : ${sgn(cur)} → ${sgn(nv)}).</span><button class="btn" type="button" id="applyAdj" data-nv="${nv}">Appliquer</button>`; }
    }
  }
  adv.innerHTML=out.map(x=>`<div class="alert ${x.c}${x.act?" act":""}">${x.h}</div>`).join("");
  const btn=$("#applyAdj"); if(btn) btn.addEventListener("click",()=>{const nv=+btn.dataset.nv; state.profile.adj=nv; const e=state.log.find(x=>x.date===last.date); if(e) e.applied=nv-cur; state.isExample=false; fillForm(); persist(); recompute();});
}

/* progression : volume prévu / fait par semaine, sommeil et fatigue ; forme du moment (surperformance / sous-performance) */
function weekDoneVol(w){ const wk=plan[w-1], f=dayFuel(P,E,wk), tdy=todayIso(), run=runSport(); let pv=0,dn=0,n=0,nd=0;
  for(const d of f.days){ if(!hasSession(d)) continue; const dt=isoOf(w,d.i); if(!dt||dt>tdy) continue;
    const v= run? (d.run?d.km:0) : (d.run?sessionDur(d.run):0)+(d.renfo?parseInt(d.renfo.m)||0:0);
    pv+=v; n++; if(markOf(w,d.i)==="done"){ dn+=v; nd++; } }
  return {pv,dn,n,nd}; }
function barSvg(rows,unit,lab,wd){
  const ch=$("#progCharts"), Wd=wd||Math.max(260,Math.round((ch.clientWidth||600)/(ch.clientWidth>620?2:1))-12), H=150,pl=34,pr=8,pt=12,pb=24;
  const max=Math.max(1,...rows.map(r=>Math.max(r.pv,r.dn))), step=(Wd-pl-pr)/rows.length, bw=Math.max(6,Math.min(26,step*.6)), y=v=>pt+(1-v/max)*(H-pt-pb);
  const tick=[0,max/2,max].map(v=>`<line x1="${pl}" x2="${Wd-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-5}" y="${y(v)+4}" text-anchor="end">${fmt0(v)}</text>`).join("");
  const bars=rows.map((r,k)=>{ const x=pl+step*k+(step-bw)/2; return `<rect x="${x}" y="${y(r.pv)}" width="${bw}" height="${H-pb-y(r.pv)}" rx="4" fill="none" stroke="var(--muted)" stroke-dasharray="3 3"/><rect x="${x}" y="${y(r.dn)}" width="${bw}" height="${Math.max(0,H-pb-y(r.dn))}" rx="4" fill="var(--accent)"/>${rows.length<=12||k%2===0?`<text x="${x+bw/2}" y="${H-8}" text-anchor="middle">S${r.w}</text>`:""}`; }).join("");
  return `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="${esc(lab)}">${tick}${bars}</svg><div class="legend"><span><i class="dot dot-a"></i> fait (${unit})</span><span>pointillés : prévu</span></div>`; }
function lineSvg(series,lab){
  const ch=$("#progCharts"), Wd=Math.max(260,Math.round((ch.clientWidth||600)/(ch.clientWidth>620?2:1))-12), H=150,pl=34,pr=30,pt=12,pb=24;
  const pts=series[0].pts; if(pts.length<2) return "";
  const t0=new Date(pts[0][0]).getTime(), t1=Math.max(new Date(pts[pts.length-1][0]).getTime(),t0+864e5), x=t=>pl+(new Date(t).getTime()-t0)/(t1-t0)*(Wd-pl-pr);
  let g=""; const s0=series[0], s1=series[1];
  const yA=v=>pt+(s0.hi-v)/(s0.hi-s0.lo)*(H-pt-pb), yB=v=>pt+(s1.hi-v)/(s1.hi-s1.lo)*(H-pt-pb);
  for(const v of s0.ticks) g+=`<line x1="${pl}" x2="${Wd-pr}" y1="${yA(v)}" y2="${yA(v)}" stroke="var(--line)"/><text x="${pl-5}" y="${yA(v)+4}" text-anchor="end">${v} h</text>`;
  for(const v of s1.ticks) g+=`<text x="${Wd-pr+5}" y="${yB(v)+4}">${v}/5</text>`;
  const path=(s,y,col,dash)=>{ const p=s.pts.filter(q=>q[1]!=null); return p.length? `<path d="${p.map((q,i)=>(i?"L":"M")+x(q[0]).toFixed(1)+" "+y(q[1]).toFixed(1)).join(" ")}" fill="none" stroke="${col}" stroke-width="2.5"${dash?' stroke-dasharray="5 4"':""}/>${p.map(q=>`<circle cx="${x(q[0]).toFixed(1)}" cy="${y(q[1]).toFixed(1)}" r="3.5" fill="${col}"/>`).join("")}` : ""; };
  const ends=`<text x="${pl}" y="${H-8}">${dfmt(new Date(pts[0][0]+"T12:00:00"))}</text><text x="${Wd-pr}" y="${H-8}" text-anchor="end">${dfmt(new Date(pts[pts.length-1][0]+"T12:00:00"))}</text>`;
  return `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="${esc(lab)}">${g}<line x1="${pl}" x2="${Wd-pr}" y1="${yA(7)}" y2="${yA(7)}" stroke="var(--z1)" stroke-dasharray="2 4"/>${path(s0,yA,"var(--z1)")}${path(s1,yB,"var(--z3)",1)}${ends}</svg><div class="legend"><span><i class="dot z1"></i> sommeil (h)</span><span><i class="dot z3"></i> fatigue (1 à 5)</span><span>pointillés bleus : 7 h</span></div>`; }
function renderProg(log){
  const el=$("#progCharts"); if(!el) return; const tdy=todayIso(), out=[]; el.dataset.w=el.clientWidth||"";   // onglet caché : redessiné à son ouverture, à la bonne largeur
  const ws=plan.filter(wk=>{ const a=isoOf(wk.w,0); return a&&a<=tdy; }).slice(-12).map(wk=>({w:wk.w,...weekDoneVol(wk.w)})).filter(r=>r.n);
  if(ws.some(r=>r.nd)) out.push(`<div><h4>${runSport()?"Kilomètres":"Minutes"} par semaine</h4>${barSvg(ws,runSport()?"km":"min","Volume fait et prévu par semaine")}</div>`);
  const sl=log.filter(e=>e.sommeil!=null&&e.sommeil!==""||e.fatigue!=null);
  if(sl.length>=2) out.push(`<div><h4>Sommeil et fatigue</h4>${lineSvg([{pts:sl.map(e=>[e.date,e.sommeil==null||e.sommeil===""?null:+e.sommeil]),lo:4,hi:10,ticks:[5,7,9]},{pts:sl.map(e=>[e.date,e.fatigue==null?null:+e.fatigue]),lo:1,hi:5,ticks:[1,3,5]}],"Sommeil et fatigue par semaine")}</div>`);
  el.innerHTML= out.length? `<div class="pgrid">${out.join("")}</div>` : `<p class="note">Coche « Faite » sur tes séances et note tes semaines : tes courbes de volume, de sommeil et de fatigue s'afficheront ici.</p>`;
}
// effort perçu attendu selon la séance (échelle 1 à 10)
const RPE_EXP=d=> d.kind==="race"? 8.5 : d.run? (d.run.rpeAvg||({q:7,long:4.5,easy:3.5}[d.run.type]||4)) : d.renfo? 6 : null;
function renderPerf(log){
  const el=$("#perfCard"); if(!el) return; const tdy=todayIso(), from=addDays(tdy,-21), live=liveOf(state.feel), byDate={};
  for(const wk of plan) for(const d of wk.days){ const dt=isoOf(wk.w,d.i); if(dt&&dt>=from&&dt<=tdy) byDate[dt]={w:wk.w,d}; }
  const gaps=[]; let moods=[], pains=0;
  for(const k of Object.keys(live)){ const v=live[k], s=byDate[k]; if(!s) continue; if(v.mood>0) moods.push(v.mood); if(v.pain>0) pains++;
    const ex=RPE_EXP(s.d); if(ex&&v.rpe>0) gaps.push(ex-v.rpe); }
  let tot=0,done=0; for(const k of Object.keys(byDate)){ const s=byDate[k]; if(!hasSession(s.d)||k===tdy) continue; tot++; if(markOf(s.w,s.d.i)==="done") done++; }
  const last=log.length&&log[log.length-1].date>=addDays(tdy,-14)? log[log.length-1] : null, sl=last&&last.sommeil!=null&&last.sommeil!==""? +last.sommeil : null, fa=last? +last.fatigue||null : null;
  const gap=gaps.length>=2? gaps.reduce((a,x)=>a+x,0)/gaps.length : null, reg=tot>=3? done/tot : null, mood=moods.length>=2? moods.reduce((a,x)=>a+x,0)/moods.length : null;
  if(gap==null&&reg==null&&sl==null&&fa==null){ el.hidden=true; return; }
  const low=(gap!=null&&gap<=-1)||(reg!=null&&reg<.6)||(fa!=null&&fa>=4)||(mood!=null&&mood<=2.2)||(sl!=null&&sl<6.5);
  const high=!low&&gap!=null&&gap>=1&&(reg==null||reg>=.75)&&(fa==null||fa<=3);
  const tips=[];
  if(low){
    if(sl!=null&&sl<7) tips.push(`Tu dors ${fmt1(sl)} h par nuit : vise 7 à 9 h. Couche-toi 30 min plus tôt et coupe les écrans avant ; c'est la récupération la plus efficace.`);
    if(fa!=null&&fa>=4) tips.push("Fatigue élevée : fais de cette semaine une semaine plus légère, footings vraiment faciles.");
    if(gap!=null&&gap<=-1) tips.push("Les séances te coûtent plus que prévu : ralentis les footings (tu dois pouvoir parler) et ne force pas le fractionné.");
    if(reg!=null&&reg<.6) tips.push(`${done} séance${done>1?"s":""} faite${done>1?"s":""} sur ${tot} ces 3 semaines : déplace une séance plutôt que la sauter, ou choisis moins de séances dans ton profil.`);
    if(mood!=null&&mood<=2.2) tips.push("Forme du jour basse : repas suffisants autour des séances, et une vraie journée de repos.");
    if(+P.deficit>0&&(fa>=4||(sl!=null&&sl<6.5))) tips.push("Avec un déficit de calories, mange un peu plus les jours de séance tant que la fatigue dure.");
  } else if(high){
    tips.push(`Tes séances te paraissent plus faciles que prévu (environ ${fmt1(gap)} point${gap>=2?"s":""} d'effort en moins).`);
    tips.push(runSport()? "Ta forme a sans doute progressé : refais un test (5 km ou VMA) et mets à jour ta référence de vitesse dans Profil pour des allures justes." : "Ta forme progresse : augmente un peu la charge à la prochaine séance si la technique reste propre.");
    tips.push("Ne rajoute pas de séances pour autant : la régularité fait la progression.");
  } else tips.push("Effort, régularité et récupération sont dans les clous : continue comme ça.");
  if(pains>=2) tips.push("Douleur notée plusieurs fois : si elle dure, demande l'avis d'un médecin ou d'un kiné.");
  const facts=[gap!=null?`effort ressenti ${gap>=0?"−":"+"}${fmt1(Math.abs(gap))} pt vs prévu`:null,reg!=null?`régularité ${Math.round(reg*100)} %`:null,sl!=null?`sommeil ${fmt1(sl)} h`:null,fa!=null?`fatigue ${fa}/5`:null].filter(Boolean).join(" · ");
  const [cls,txt]= low? ["down","Tu sous-performes"] : high? ["up","Tu surperformes"] : ["eq","Dans les clous"];
  el.hidden=false; el.innerHTML=`<h3>Ma forme du moment</h3><div class="pv"><span class="pbadge ${cls}">${txt}</span><span class="note">${esc(facts)} · 3 dernières semaines</span></div><ul>${tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>`;
}

/* ---------- formulaire ---------- */
const FIELDS=["age","taille","poids","cible","mg","activite","objectif","volume","longest","ref","refVal","fcmax","start","adj","deficit","bonus","cross","raceDate","hSem","renfoMin","hQuota"];
const RADIOS=["sexe","niveau","seances","renfo","longDay","lieu","equip","cplx"];
function syncSeances(){ // débutant : 4 séances au plus, aussi au chargement
  const deb=document.querySelector('input[name="niveau"]:checked')?.value==="deb";
  document.querySelectorAll('input[name="seances"]').forEach(r=>{r.disabled=(deb&&+r.value>4)||(isForce14()&&+r.value>5);});
  const c=document.querySelector('input[name="seances"]:checked'), was=c?+c.value:0;
  if(deb&&c&&+c.value>4){ const r4=document.querySelector('input[name="seances"][value="4"]'); if(r4) r4.checked=true; }
  syncSeancesSport14();
  const h=$("#seancesHint"); if(h){ h.hidden=!deb; setT(h,"Débutant : 4 séances au plus, le temps que les tendons s'adaptent."+(deb&&was>4?" Ton choix de "+was+" a été ramené à 4.":"")) }
}
function fillForm(){
  const p=state.profile;
  fillSport14(p);
  if(p.deficit==null||p.deficit==="") p.deficit=300;
  if(p.bonus==null||p.bonus==="") p.bonus=100;
  FIELDS.forEach(k=>{const el=$("#"+k); if(el) el.value=p[k]??"";});
  RADIOS.forEach(k=>{document.querySelectorAll(`input[name="${k}"]`).forEach(r=>r.checked=String(p[k]??EXAMPLE[k])===r.value);});
  const ty=Array.isArray(p.types)?p.types:EXAMPLE.types;
  document.querySelectorAll('input[name="types"]').forEach(c=>c.checked=ty.includes(c.value));
  if(!p.cross) $("#cross").value="non";
  const pf=$("#pref"); if(pf){ pf.value=prefClean(p.pref); prefUi(); }
  const ec=$("#evalOn"); if(ec) ec.checked=String(p.evalOn)==="1";
  syncSeances();
}
// préférences de séances : compteur et rappel de ce qui s'applique sans IA
function prefUi(){ const el=$("#pref"); if(!el) return; setT($("#prefCnt"),Array.from(el.value).length+" / 300");
  const k=prefParse(prefClean(el.value).replace(/\s+/g," ").trim()), L={cotes:"côtes",fartlek:"fartlek",seuil:"seuil",vma:"VMA"}, h=$("#prefFx");
  // seuls les effets possibles sans IA sont annoncés : tout refus (séance plus douce ou footing), parmi les envies le fartlek seulement (PREF_LIVE)
  const no=k.no, like=k.like.filter(x=>PREF_LIVE.like.includes(x));
  const t=[no.length? "pas de "+no.map(x=>L[x]).join(", ")+" (remplacé par une séance plus douce ou un footing facile, sauf en affûtage et en course)" : "", like.length? "privilégié quand c'est permis : "+like.map(x=>L[x]).join(", ") : ""].filter(Boolean).join(" ; ");
  if(h){ h.hidden=!t; setT(h,t? "Peut s'appliquer sans IA : "+t+"." : ""); } }
function readForm(){
  const p={...state.profile};
  FIELDS.forEach(k=>{const el=$("#"+k); if(el) p[k]=String(el.value).slice(0,40);});   // longueur bornée (valeur forcée par script comprise)
  RADIOS.forEach(k=>{ if(k==="longDay"&&$("#segLongDay").dataset.locked) return; const r=document.querySelector(`input[name="${k}"]:checked`); if(r)p[k]=r.value;});
  p.types=[...document.querySelectorAll('input[name="types"]:checked')].map(c=>c.value);
  const pf=$("#pref"); if(pf) p.pref=prefClean(pf.value);
  const ec=$("#evalOn"); if(ec){ if(ec.checked&&String(state.profile.evalOn)!=="1") p.evalFrom=todayIso(); p.evalOn=ec.checked?"1":"0"; }   // case cochée maintenant : tests à partir d'aujourd'hui, jamais dans le passé
  if(p.niveau==="deb"&&+p.seances>4) p.seances="4";
  readSport14(p);
  return p;
}
function valid(p){return !profileNums(p).incomplete;}
$("#profileForm").addEventListener("input",e=>{
  if(e.target&&e.target.id==="pref") prefUi();
  const fx=e.target&&e.target.id&&document.getElementById(e.target.id+"Fix"); if(fx) fx.hidden=true;
  if(e.target&&e.target.id==="start"&&!okIso(e.target.value)) return;   // début vidé ou date impossible : rétabli à la validation (change)
  const p=readForm(); oobGuard15(p); if(!valid(p))return;
  state.profile=p; state.isExample=false; persist();
  // recalcul différé : un gros suivi (520 pesées) ne ralentit plus chaque frappe ; « change » (validation du champ) recalcule tout de suite
  clearTimeout(rcT); rcT=setTimeout(recompute,120);
});
let rcT=null;
const REQ_DEF={deficit:300,bonus:100};
// pas des champs numériques : une valeur entre deux pas est arrondie (l'âge au nombre d'années révolues)
const STEP={age:1,taille:1,volume:1,longest:.5,fcmax:1,deficit:25,bonus:25,adj:50,hSem:.5,renfoMin:5,hQuota:.5};
// petit message sous un champ corrigé automatiquement ; il disparaît dès la saisie suivante
function fieldNote(el,msg){
  const f=el.closest(".field"); if(!f) return; let n=document.getElementById(el.id+"Fix");
  if(!n){ n=document.createElement("span"); n.className="hint fix"; n.id=el.id+"Fix"; n.setAttribute("aria-live","polite"); f.appendChild(n);
    const d=el.getAttribute("aria-describedby"); el.setAttribute("aria-describedby",(d?d+" ":"")+n.id); }
  n.textContent=msg; n.hidden=!msg;
}
const numTxt=v=>String(v).replace(".",",").replace("-","−");
$("#profileForm").addEventListener("change",e=>{
  if(e.target&&e.target.id==="sport") sportChange14();
  syncSeances();
  // valeur hors bornes : on réécrit la valeur bornée dans le champ (ex. « 755 » kg → 250)
  const el=e.target; oobClear15(el);
  if(el&&BOUNDS[el.id]){ const v=numOf(el.value); if(!isNaN(v)){
    // la borne est testée avant l'arrondi : « −10 » en supplément est ramené au minimum, pas « arrondi à 0 »
    const bv=bound(el.id,v), st=STEP[el.id];
    const b= !st? bv : el.id==="age"? Math.floor(bv) : Math.round(Math.round(bv/st)*st*100)/100;
    if(b!==v){ psecClamp(el.id,v,bv); el.value=String(b); fieldNote(el, bv!==v? (bv>v?"Ramené à "+numTxt(b)+", le minimum.":"Ramené à "+numTxt(b)+", le maximum.") : el.id==="age"? "Arrondi à "+b+" ans." : "Arrondi à "+numTxt(b)+(st>1?" (par pas de "+st+")":"")+"."); } } }
  // champ obligatoire vidé ou illisible : on remet la valeur réellement utilisée, avec un petit message
  if(el&&["age","taille","poids","deficit","bonus"].includes(el.id) && isNaN(numOf(el.value))){
    const old=numOf(state.profile[el.id]); el.value= !isNaN(old)? String(state.profile[el.id]) : String(REQ_DEF[el.id]??EXAMPLE[el.id]);
    fieldNote(el,"Ce champ est nécessaire au calcul : valeur précédente remise ("+numTxt(el.value)+").");
  }
  // début du plan vidé : aujourd'hui, ou le début calculé d'après la date de course
  const badStart= el&&el.id==="start"&&el.value&&!okIso(el.value);   // date qui n'existe pas : traitée comme un début vide
  if(badStart) el.value="";
  if(el&&el.id==="start"&&!el.value){ const r=raceOn(readForm()); el.value= r? autoStart(r) : todayIso(); state.recenter=true;
    fieldNote(el,(badStart?"Cette date n'existe pas : début remis au ":"Le début ne peut pas rester vide : remis au ")+longDate(el.value)+(r?", calculé d'après ta date de course.":".")); }
  // début du plan : n'importe quel jour ; les jours d'avant, dans la première semaine, sont en repos
  // le message « Ramené au … » reste tant que le début est encore celui recalé par la date de course
  if(el&&el.id==="start") state.recenter=true;   // nouveau début : on se recale sur la semaine en cours
  if(el&&el.id==="start"){ const h=$("#startHint"), r=raceOn(readForm()), a=r&&autoStart(r); if(!(h.dataset.race==="1"&&el.value&&el.value===h.dataset.at)){ h.hidden=true; h.dataset.race=""; } }
  // date de course : le début du plan est recalculé (lundi de cette semaine, ou le suivant à partir du jeudi), 52 semaines au plus
  if(el&&el.id==="raceDate"&&el.value&&el.value>=todayIso()&&($("#objectif").value!=="forme"||evSport($("#sport").value))){ const a=autoStart(el.value), sh=$("#startHint"); $("#start").value=a; state.recenter=true;
    // début recalé par la date de course (course à plus d'un an, ou à moins de 4 semaines) : on le dit
    if(a!==todayIso()){ sh.hidden=false; sh.dataset.race="1"; sh.dataset.at=a; setT(sh,"Ramené au "+longDate(a)+" pour que le plan (4 semaines à un an) se termine avec ta course."); } else { sh.hidden=true; sh.dataset.race=""; } }
  if(el&&el.id==="start"&&raceOn(readForm())){ const e2=effStart(readForm()); if(e2!==mondayOf(el.value)){ el.value=e2; const h=$("#startHint"); h.hidden=false; h.dataset.race="1"; h.dataset.at=e2; h.textContent="Ramené au "+new Date(e2+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" : avec ta date de course, le plan fait de 4 à 52 semaines."; } state.recenter=true; }
  // type de référence changé : l'ancienne valeur n'a plus de sens
  if(el&&el.id==="ref") $("#refVal").value="";
  // référence de vitesse saisie : les séances de test deviennent facultatives (case décochée, tant qu'aucun résultat n'est noté)
  if(el&&el.id==="refVal"){ const cb=$("#evalOn"), q=readForm(); if(cb&&cb.checked&&!vmaOf(profileNums(q)).estimated&&!Object.keys(liveOf(state.evr||{})).length){ cb.checked=false; fieldNote(cb,"Tu as indiqué une référence de vitesse : les séances de test sont décochées. Recoche la case si tu veux quand même les faire."); } }
  clearTimeout(rcT);
  const p=readForm(); if(!valid(p)){ state.recenter=false; return; }
  state.profile=p; state.isExample=false;
  if(state.recenter){ state.recenter=false; plan=buildPlan(profileNums(p)); const tp=todayPos(); state.week=tp?tp.w:1; }
  persist(); recompute();
  // début dans le passé tel que le plan est déjà fini : on le dit tout de suite, sous le champ
  if(el&&el.id==="start"&&el.value){ const s0=effStart(state.profile), end=s0&&addDays(s0,plan.length*7-1); if(end&&end<todayIso()) fieldNote(el,"Avec ce début, le plan est déjà terminé (fin le "+longDate(end)+"). Choisis une date plus récente."); }
});
$("#resetEx").addEventListener("click",()=>{$("#resetConfirm").hidden=false;});
$("#resetNo").addEventListener("click",()=>{$("#resetConfirm").hidden=true;});
$("#resetYes").addEventListener("click",()=>{hideToast(); $("#logMsg").innerHTML=""; // un « Annuler » de retrait ne survit pas à la remise à zéro
  state={profile:{...EXAMPLE},isExample:true,log:[],week:1,appliedByDate:{},deleted:{},moves:{},done:{},feel:{},acts:{},rhr:{},evr:{},aip:cleanAip({p:{x:1,at:Date.now()}}),seen:state.seen,savedAtLocal:Date.now()};localSaved=false;$("#resetConfirm").hidden=true;fillForm();persist();recompute();setStore(lsOK?EXAMPLE_MSG:LS_BLOCKED);});

// erreur de saisie reliée au champ : aria-invalid + message sous le champ (aria-describedby) ; msg vide = erreur retirée
function fieldErr(el,msg){ if(!el) return; const id=el.id+"Err", f=el.closest(".field")||el.parentElement; let n=document.getElementById(id);
  if(!n&&msg){ n=document.createElement("span"); n.className="hint bad ferr"; n.id=id; f.appendChild(n); }
  if(n){ n.textContent=msg||""; n.hidden=!msg; }
  const d=(el.getAttribute("aria-describedby")||"").split(" ").filter(x=>x&&x!==id); if(msg) d.push(id);
  if(d.length) el.setAttribute("aria-describedby",d.join(" ")); else el.removeAttribute("aria-describedby");
  if(msg) el.setAttribute("aria-invalid","true"); else el.removeAttribute("aria-invalid"); }
// suivi : chaque champ est contrôlé (type, bornes, cohérence) ; les erreurs sont listées dans l'ordre du formulaire
const LG_IDS=["#lgDate","#lgPoids","#lgSommeil","#lgFaites","#lgPrevues"];
const lgDateErr=()=>{ const d=$("#lgDate"), v=d.value; return d.validity&&d.validity.badInput||v&&!okIso(v)? "Cette date n'existe pas : choisis une date valide." : !v? "Choisis la date de ta mesure." : v>todayIso()? "Cette date est dans le futur : choisis aujourd'hui ou une date passée." : ""; };
function lgCheck(){
  const raw=id=>String($(id).value).trim().replace(",","."), num=id=>{ const v=raw(id); return $(id).validity&&$(id).validity.badInput? NaN : v===""? null : /^\d{1,3}(\.\d{1,2})?$/.test(v)? +v : NaN; };
  const E={}, [pMin,pMax]=BOUNDS.poids, po=num("#lgPoids"), sl=num("#lgSommeil"), nf=num("#lgFaites"), np=num("#lgPrevues"), int07=(v,lo)=>Number.isInteger(v)&&v>=lo&&v<=7;
  const de=lgDateErr(); if(de) E["#lgDate"]=de;
  if(po==null) E["#lgPoids"]="Indique ton poids moyen en kilos, par exemple 81,4.";
  else if(!(po>=pMin&&po<=pMax)) E["#lgPoids"]="Indique un poids entre "+pMin+" et "+pMax+" kg, par exemple 81,4.";
  if(sl!=null&&!(sl>=3&&sl<=12)) E["#lgSommeil"]="Indique un sommeil moyen entre 3 et 12 heures (ex. 7,5), ou laisse le champ vide.";
  if(np!=null&&!int07(np,1)) E["#lgPrevues"]="Indique un nombre entier de séances prévues, de 1 à 7.";
  if(nf!=null&&!int07(nf,0)) E["#lgFaites"]="Indique un nombre entier de séances faites, de 0 à 7.";
  else if(nf!=null&&int07(np,1)&&nf>np) E["#lgFaites"]="Pas plus que les séances prévues ("+np+").";
  LG_IDS.forEach(id=>fieldErr($(id),E[id]||""));
  const bad=LG_IDS.filter(id=>E[id]); if(bad.length) $(bad[0]).focus();
  return bad.length? null : {sommeil:sl,faites:nf,prevues:np,poids:po};
}
let lgLast={k:"",t:0};
$("#logForm").noValidate=true;   // contrôle par lgCheck : messages en français, reliés au champ
$("#logForm").addEventListener("submit",e=>{
  e.preventDefault();
  const ok=lgCheck(); if(!ok){ $("#logMsg").innerHTML=`<div class="alert warn">Saisie à corriger : vois le message sous le champ concerné.</div>`; return; }
  const en={at:Date.now(),date:$("#lgDate").value,poids:ok.poids,sommeil:ok.sommeil,fatigue:numIn($("#lgFatigue").value,1,5)??2,faites:ok.faites,prevues:ok.prevues,douleur:$("#lgDouleur").value==="oui"?"oui":"non"};
  // double envoi (double clic, Entrée répétée) : la même saisie dans la seconde et demie est ignorée
  const key=JSON.stringify({...en,at:0}); if(key===lgLast.k&&en.at-lgLast.t<1500) return; lgLast={k:key,t:en.at};
  const old=state.log.find(x=>x.date===en.date), kept=(state.appliedByDate||{})[en.date];
  if(old&&old.applied!=null) en.applied=old.applied; // même semaine corrigée : l'ajustement déjà appliqué reste compté
  else if(kept!=null) en.applied=kept;               // même semaine retirée puis ressaisie : idem
  state.log=state.log.filter(x=>x.date!==en.date).concat(en);
  const wasExample=state.isExample;
  if(state.isExample){ state.profile.poids=en.poids; state.isExample=false; fillForm(); }
  persist(); recompute();
  if(old) pushUndo({kind:"rep",date:en.date,label:"Semaine du "+dLabel(en.date)+" remplacée",undo:()=>{ state.log=state.log.filter(x=>x.date!==old.date).concat({...old,at:Date.now()}); }});
  // messages après la saisie : mesures trop rapprochées, poids du profil à mettre à jour (sur demande seulement)
  const msg=[], dd=d=>new Date(d+"T12:00:00").getTime();
  const near=state.log.filter(x=>x.date!==en.date&&Math.abs(dd(x.date)-dd(en.date))<6*864e5).sort((a,b)=>Math.abs(dd(a.date)-dd(en.date))-Math.abs(dd(b.date)-dd(en.date)))[0];
  if(near){ const gap=Math.round(Math.abs(dd(near.date)-dd(en.date))/864e5);
    msg.push(`<div class="alert warn">Cette mesure est à ${gap} jour${gap>1?"s":""} d'une autre saisie (${dLabel(near.date)}). Une mesure par semaine suffit : avec moins de 6 jours d'écart, les variations d'eau faussent le rythme. Tu peux retirer l'une des deux dans la liste ci-dessous.</div>`); }
  const latest=sortedLog().slice(-1)[0], profW=numOf(state.profile.poids);
  if(!wasExample&&latest&&latest.date===en.date&&!isNaN(profW)&&Math.abs(profW-en.poids)>=.1)
    msg.push(`<div class="alert ok act"><span>Ton profil indique ${fmt1(profW)} kg. Veux-tu le passer à ${fmt1(en.poids)} kg ? Les calories seront recalculées avec ce poids.</span><button class="btn" type="button" id="updPoids" data-p="${en.poids}">Mettre à jour mon profil</button></div>`);
  $("#logMsg").innerHTML=msg.join("");
  const up=$("#updPoids"); if(up) up.addEventListener("click",()=>{ const v=+up.dataset.p; state.profile.poids=String(v).replace(".",","); state.isExample=false; fillForm(); persist(); recompute();
    const m=$("#logMsg"); m.innerHTML=`<div class="alert ok">Poids du profil mis à jour : ${fmt1(v)} kg.</div>`; m.tabIndex=-1; m.focus({preventScroll:true}); });
});
// une erreur disparaît dès que le champ est modifié ; date future signalée dès la saisie
LG_IDS.forEach(id=>$(id).addEventListener("input",()=>{ fieldErr($(id),""); if(id==="#lgPrevues") fieldErr($("#lgFaites"),""); }));
function checkLgDate(){ const d=$("#lgDate"); d.max=todayIso(); const m=lgDateErr(); fieldErr(d,d.value&&m? m : ""); }
["input","change"].forEach(t=>$("#lgDate").addEventListener(t,checkLgDate));
$("#lgDate").value=todayIso(); $("#lgDate").max=todayIso();

/* onglets */
// hauteur occupée en haut par la barre d'onglets (0 en mobile : barre fixe en bas)
function navTopH(){ const n=$("nav.tabs"); return n&&getComputedStyle(n).position!=="fixed"? n.offsetHeight : 0; }
function scrollUnderNav(el){
  const top=el.getBoundingClientRect().top+window.scrollY-navTopH();
  window.scrollTo({top:Math.max(0,top),behavior:"instant"});
}
function selectTab(id){
  document.querySelectorAll('nav.tabs button').forEach(b=>{const on=b.id==="tab-"+id;b.setAttribute("aria-selected",on);b.tabIndex=on?0:-1;});
  document.querySelectorAll("section.panel").forEach(s=>s.hidden=s.id!=="p-"+id);
  $(".wrap").dataset.tab=id;
  if(id==="suivi" && P && !$("#chart").dataset.w) renderChart(sortedLog());
  if(id==="suivi" && P && !$("#progCharts").dataset.w) renderProg(sortedLog());
  if(id==="suivi" && P) fillLogCounts();
  // la barre d'onglets est collée en haut : le panneau repart juste en dessous
  const panel=$("#p-"+id); if(panel.getBoundingClientRect().top<navTopH()) scrollUnderNav(panel);
  try{localStorage.setItem("carnet.tab",id);}catch(e){}
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener("click",()=>selectTab(b.id.slice(4))));
// motif ARIA « onglets » : flèches gauche/droite, Début, Fin ; l'onglet atteint est activé et reçoit le focus
$("nav.tabs [role=tablist]").addEventListener("keydown",e=>{
  const tabs=[...document.querySelectorAll('nav.tabs [role=tab]')].filter(b=>!b.hidden), i=tabs.indexOf(document.activeElement); if(i<0)return;
  const j= e.key==="ArrowRight"? (i+1)%tabs.length : e.key==="ArrowLeft"? (i-1+tabs.length)%tabs.length : e.key==="Home"? 0 : e.key==="End"? tabs.length-1 : -1;
  if(j<0)return; e.preventDefault(); selectTab(tabs[j].id.slice(4)); tabs[j].focus();
});
$("#goProfile").addEventListener("click",e=>openWizard(e.currentTarget));   // l'assistant part de zéro : jamais les valeurs de l'exemple gardées sans les voir
$("#weekSel").addEventListener("change",e=>goWeek(+e.target.value));
$("#prevW").addEventListener("click",()=>{if(state.week>1)goWeek(state.week-1);});
$("#nextW").addEventListener("click",()=>{if(state.week<plan.length)goWeek(state.week+1);});
$("#weekTitle").tabIndex=-1;
function scrollToToday(){ const c=$("#todayCard"); if(c) scrollUnderNav(c); }
$("#todayW").addEventListener("click",()=>{const tp=todayPos(); if(!tp)return; if(tp.w!==state.week) goWeek(tp.w); scrollToToday();});
let rzT=null, rzW=window.innerWidth;
window.addEventListener("resize",()=>{clearTimeout(rzT); rzT=setTimeout(()=>{ if(window.innerWidth===rzW||!P)return; rzW=window.innerWidth; renderChart(sortedLog()); renderProg(sortedLog()); },150);});

// annonces lecteur d'écran : vidées après quelques secondes pour ne pas rester périmées
{ const sl=$("#srLive"); let st=null; if(sl) new MutationObserver(()=>{ if(!sl.textContent) return; clearTimeout(st); st=setTimeout(()=>{ sl.textContent=""; },6000); }).observe(sl,{childList:true,characterData:true,subtree:true}); }
/* ---------- v12 : tuiles repliables (état par appareil) ---------- */
const TILE_KEY="carnet.tuiles";
const tiles=(()=>{ const t={all:null,o:{}}; try{ const o=JSON.parse(localStorage.getItem(TILE_KEY)||"{}");
  if(o&&typeof o==="object"){ if(typeof o.all==="boolean") t.all=o.all; if(o.o&&typeof o.o==="object"&&!Array.isArray(o.o)) for(const [k,v] of Object.entries(o.o).slice(-120)) if(okIso(k)&&typeof v==="boolean") t.o[k]=v; } }catch(e){} return t; })();
function saveTiles(){ const ks=Object.keys(tiles.o).sort(); for(const k of ks.slice(0,Math.max(0,ks.length-120))) delete tiles.o[k]; try{ localStorage.setItem(TILE_KEY,JSON.stringify(tiles)); }catch(e){} }
// par défaut : la tuile du jour est dépliée, les autres repliées ; « Tout déplier / replier » change ce défaut
function tileOpen(dt,isToday){ if(dt&&typeof tiles.o[dt]==="boolean") return tiles.o[dt]; if(tiles.all!=null) return tiles.all; return !!isToday; }
function setTile(art,open){ if(art.querySelector(".det")){ art.classList.toggle("cmp",!open); const b=art.querySelector("[data-vm]"); if(b){ b.setAttribute("aria-expanded",String(open)); b.textContent=open?"Voir moins":"Voir plus"; } }
  else{ const dd=art.querySelector("details.more"); if(dd) dd.open=open; } }
function isTileOpen(art){ return art.querySelector(".det")? !art.classList.contains("cmp") : !!(art.querySelector("details.more")||{}).open; }
function updFoldAll(){ const arts=[...document.querySelectorAll("#days article[data-iso]")], all=arts.length&&arts.every(isTileOpen), b=$("#foldAll"); if(b){ setT(b,all?"Tout replier":"Tout déplier"); b.dataset.open=all?"1":""; } }
$("#foldAll").addEventListener("click",e=>{ const open=!e.currentTarget.dataset.open; tiles.all=open; tiles.o={}; saveTiles();
  document.querySelectorAll("#days article[data-iso]").forEach(a=>setTile(a,open)); updFoldAll(); setT($("#srLive"),open?"Toutes les tuiles sont dépliées.":"Toutes les tuiles sont repliées."); });
$("#days").addEventListener("toggle",e=>{ const dd=e.target; if(!(dd instanceof HTMLDetailsElement)) return; const a=dd.closest("article[data-iso]"); if(!a||!a.dataset.iso) return;
  if(tileOpen(a.dataset.iso,a.id==="todayCard")!==dd.open){ tiles.o[a.dataset.iso]=dd.open; saveTiles(); } updFoldAll(); },true);
$("#copyW").addEventListener("click",e=>copyWeek(e.currentTarget));
$("#icsW").addEventListener("click",e=>openExport(e.currentTarget));

/* ---------- v11 : déplacements, séances faites, prochaine séance, minuteur, copie, export Calendrier, nouveautés ---------- */
const isoOf=(w,i)=>{ const d=weekDate(w,i); return d? iso(d) : null; };
// signature du contenu prévu d'un jour : un déplacement enregistré n'est appliqué que si le jour contient toujours la même chose
const daySig=d=> (d.kind||"")+"|"+(d.run?d.run.title:"")+"|"+(d.renfo?d.renfo.t:"");
const movable=d=> !!d&&d.kind!=="before"&&d.kind!=="race";
const isHard=d=> !!(d&&d.run&&(d.run.type==="q"||d.run.type==="long"||d.kind==="race"));
const hasSession=d=> !!(d&&(d.run||d.renfo)&&d.kind!=="before");
// déplacements : {date prévue: {to: date réelle, sig}} ; même semaine, 400 au plus (les plus récents)
// déplacements : {date prévue: {to: date réelle, sig, at}} ; to "" = déplacement retiré (marque horodatée, pour la fusion entre appareils)
function cleanMoves(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  const out=[]; for(const [k,v] of Object.entries(o).slice(0,4000)){ if(!okIso(k)||!v||typeof v!=="object") continue;
    const at=isFinite(+v.at)&&+v.at>0? Math.min(+v.at,Date.now()) : 0;
    if(v.to===""){ if(at) out.push([k,{to:"",at}]); continue; }
    if(!okIso(v.to)) continue;
    const dd=Math.round((new Date(v.to+"T12:00:00")-new Date(k+"T12:00:00"))/864e5); if(!dd||Math.abs(dd)>6||mondayOf(k)!==mondayOf(v.to)) continue;
    out.push([k,{to:v.to,sig:String(v.sig??"").replace(/[<>"'`&]/g,"").slice(0,160),at}]); }
  return Object.fromEntries(out.sort((a,b)=>a[0]<b[0]?1:-1).slice(0,400)); }
// fusion compte / appareil : pour chaque date, l'entrée la plus récente
function mergeStamped(a,b,clean){ const A=clean(a), B=clean(b), m={...A}; for(const [k,v] of Object.entries(B)) if(!m[k]||(+v.at||0)>(+m[k].at||0)) m[k]=v; return clean(m); }
// séances cochées : {date prévue de la séance: {v: "done" | "skip" | "none", sig, at}} ; « none » = décochée (marque horodatée)
function cleanDone(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  const out=[]; for(const [k,v0] of Object.entries(o).slice(0,5000)){ if(!okIso(k)) continue;
    const v= typeof v0==="string"? {v:v0,at:0,sig:""} : v0;   // format v11 : "done" / "skip"
    if(!v||typeof v!=="object"||!["done","skip","none"].includes(v.v)) continue;
    out.push([k,{v:v.v,sig:String(v.sig??"").slice(0,160),at:isFinite(+v.at)&&+v.at>0?Math.min(+v.at,Date.now()):0}]); }
  return Object.fromEntries(out.sort((a,b)=>a[0]<b[0]?1:-1).slice(0,1000)); }
// marque d'un jour affiché : celle de la séance (date prévue + signature), elle suit donc un déplacement
function markKey(w,i){ const wk=plan[w-1]; if(!wk) return null; const d=wk.days[i], src=d&&d.movedFrom!=null? d.movedFrom : i, base=wk.orig||wk.days;
  return {k:isoOf(w,src), sig:daySig(base[src])}; }
function markOf(w,i){ const mk=markKey(w,i); if(!mk||!mk.k||!hasSession(plan[w-1].days[i])) return null; const e=(state.done||{})[mk.k];
  return e&&e.v!=="none"&&(!e.sig||e.sig===mk.sig)? e.v : null; }
// jours protégés en semaine de course : veille et jours qui suivent la course (et dimanche d'avant une course le lundi)
function protectedIdx(wk){ const s=new Set(), ri=wk.days.findIndex(d=>d.kind==="race");
  if(ri>=0){ if(ri>0) s.add(ri-1); for(let k=ri+1;k<7;k++) s.add(k); }
  const nx=plan[wk.w]; if(nx&&nx.days.findIndex(d=>d.kind==="race")===0) s.add(6);
  return s; }
function applyMoves(){
  const mv=state.moves||{}; if(!Object.keys(mv).length) return;
  for(const wk of plan){
    const dates=wk.days.map(d=>isoOf(wk.w,d.i)); if(!dates[0]) continue;
    const map=new Map(); let ok=true, any=false;
    dates.forEach((dt,i)=>{ const m=mv[dt]; if(!m||!m.to) return; any=true; const j=dates.indexOf(m.to);
      if(j<0||j===i||m.sig!==daySig(wk.days[i])||!movable(wk.days[i])||!movable(wk.days[j])) ok=false; else map.set(i,j); });
    if(!any) continue;
    const tos=[...map.values()];
    if(!ok||new Set(tos).size!==tos.length||tos.some(j=>!map.has(j))){ wk.moveBad=true; continue; }
    const nd=wk.days.slice(); for(const [i,j] of map) nd[j]={...wk.days[i],i:j,movedFrom:i};
    const prot=protectedIdx(wk); if([...prot].some(j=>nd[j].run&&map.has(j))){ wk.moveBad=true; continue; }
    wk.orig=wk.days; wk.days=nd; wk.moved=true;
  }
}
// deux séances dures d'affilée (dont au moins un jour déplacé), y compris avec le dimanche d'avant et le lundi d'après ;
// séance dure dans les 3 jours avant la course (de cette semaine ou du lundi suivant)
function hardWarn(days,idx,w){
  const out=[], prev=w>1&&plan[w-2]? plan[w-2].days[6] : null, next=plan[w]? plan[w].days[0] : null;
  const ext=[prev,...days,next], nm=k=> k===0? "dimanche d'avant" : k===8? "lundi suivant" : DAYS[k-1].toLowerCase();
  for(let k=0;k<8;k++){ const a=k-1, b=k;   // indices de la semaine
    if(isHard(ext[k])&&isHard(ext[k+1])&&(idx.includes(a)||idx.includes(b))) out.push("deux séances dures d'affilée ("+nm(k)+" et "+nm(k+1)+")"); }
  let ri=days.findIndex(d=>d.kind==="race"); if(ri<0&&next&&next.kind==="race") ri=7;
  if(ri>0) for(const k of idx) if(k<ri&&ri-k<=3&&days[k].run&&days[k].run.type==="q"){ out.push("séance dure moins de 3 jours avant la course"); break; }
  return [...new Set(out)];
}
// un déplacement retiré devient une marque horodatée (il ne revient pas depuis un autre appareil)
function setMoves(next){ const cur=state.moves||{}, now=Date.now(), m={};
  for(const k of new Set([...Object.keys(cur),...Object.keys(next)])){ const a=cur[k], b=next[k];
    if(b&&b.to){ m[k]= a&&a.to===b.to&&a.sig===b.sig? a : {...b,at:now}; } else if(a&&a.to) m[k]={to:"",at:now}; else if(a) m[k]=a; }
  state.moves=cleanMoves(m); }
function moveSession(w,a,b){
  const wk=plan[w-1], base=wk.orig||wk.days, src=i=> wk.days[i].movedFrom!=null? wk.days[i].movedFrom : i;
  const sa=src(a), sb=src(b), before={...(state.moves||{})}, mv={...before};
  const da=isoOf(w,sa), db=isoOf(w,sb), ta=isoOf(w,b), tb=isoOf(w,a);
  mv[da]={to:ta,sig:daySig(base[sa])}; mv[db]={to:tb,sig:daySig(base[sb])};
  for(const k of [da,db]) if(mv[k].to===k) delete mv[k];
  setMoves(mv); persist(); recompute();
  const what=wk.days[a].run? wk.days[a].run.title : wk.days[a].renfo? "Renforcement" : "Séance";
  const fb=$(`#days [data-move="${b}"]`); if(fb) fb.focus({preventScroll:true});
  const ws=plan[w-1]&&plan[w-1].moved? hardWarn(plan[w-1].days,[a,b],w) : [];
  toast(what+" déplacé au "+DAYS[b].toLowerCase()+" "+dfmt(weekDate(w,b))+(ws.length?" · attention : "+ws.join(", "):""),{action:"Annuler",fn:()=>{ setMoves(before); persist(); recompute(); const f2=$(`#days [data-move="${a}"]`); if(f2) f2.focus({preventScroll:true}); }});
}
function resetWeekMoves(w){
  const dates=new Set(Array.from({length:7},(_,i)=>isoOf(w,i))), before={...(state.moves||{})};
  setMoves(Object.fromEntries(Object.entries(before).filter(([k])=>!dates.has(k)))); persist(); recompute();
  $("#weekTitle").focus({preventScroll:true});
  toast("Semaine "+w+" rétablie comme prévu",{action:"Annuler",fn:()=>{ setMoves(before); persist(); recompute(); }});
}
function setDone(w,i,val,sel){
  const mk=markKey(w,i); if(!mk||!mk.k) return;
  const cur=markOf(w,i), d={...(state.done||{})}; d[mk.k]={v:cur===val?"none":val,sig:mk.sig,at:Date.now()};
  state.done=cleanDone(d); persist(); recompute();
  if(sel){ const b=document.querySelector(sel); if(b) b.focus({preventScroll:true}); }
}
const ringSvg=(fr,sz)=>{ const r=15, c=2*Math.PI*r; return `<svg viewBox="0 0 36 36" width="${sz||34}" height="${sz||34}" aria-hidden="true"><circle class="tr" cx="18" cy="18" r="${r}" fill="none" stroke-width="5"/><circle class="pr" cx="18" cy="18" r="${r}" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c*(1-Math.max(0,Math.min(1,fr)))).toFixed(2)}"${fr>0?"":' opacity="0"'}/></svg>`; };
function weekCounts(w){ const wk=plan[w-1]; let tot=0,done=0,skip=0;
  if(wk) wk.days.forEach(d=>{ if(!hasSession(d)) return; tot++; const m=markOf(w,d.i); if(m==="done") done++; else if(m==="skip") skip++; });
  return {tot,done,skip}; }
// titre court d'une séance (carte « Prochaine séance », copie, Calendrier)
function sessTitle(d,vma){
  if(!d.run) return "Renfo";
  const t= d.kind==="race"? "Course : "+fmt1(raceKm()).replace(",0","")+" km"+(d.run&&d.run.dplus?" · D+ "+fmt0(d.run.dplus)+" m":"") : d.run.type==="long"&&!d.run.sp? "Sortie longue "+fmt0(sessionKm(d.run,vma))+" km" : d.run.title;
  return t+(d.renfo?" + renfo":"");
}
function blockTxt(b,kind){
  let t=b.l+(b.min&&!b.mix&&b.z!=="walk"&&b.work==null?" · "+fmt0(b.min)+" min":"")+(b.race?" · "+fmt1(raceKm()).replace(",0","")+" km":"");
  if(b.eff) t+=" ("+b.eff+hrTxt(b).replace(" · ",", ")+")"; else if(b.z!=="walk"&&!b.noPace&&b.lo) t+=" ("+(b.race?"allure visée "+paceRangeTxt(E.vma,b.lo,b.hi):onTapis(P,kind)&&kind!=="race"?kmh(E.vma,b.lo,b.hi)+", pente 1 %":paceRangeTxt(E.vma,b.lo,b.hi))+(b.race?"":hrTxt(b).replace(" · ",", "))+")";
  return t;
}
// prochaine séance : aujourd'hui (si pas encore cochée) ou la suivante
function nextSession(){
  const tp=todayPos(), st=effStart(state.profile); let w0,i0;
  if(tp){ w0=tp.w; i0=tp.i; } else if(st&&st>todayIso()){ w0=1; i0=0; } else return null;
  for(let w=w0;w<=plan.length;w++){ const wk=plan[w-1];
    for(let i=(w===w0?i0:0);i<7;i++){ const d=wk.days[i]; if(!hasSession(d)) continue; if(markOf(w,i)) continue; return {w,i,d,dt:isoOf(w,i)}; } }
  return null;
}
function renderNext(){
  const el=$("#nextCard"), n=nextSession();
  if(!n){ el.hidden=true; el.innerHTML=""; return; }
  const tdy=todayIso(), when= n.dt===tdy? "Aujourd'hui" : n.dt===addDays(tdy,1)? "Demain" : DAYS[n.i]+" "+dfmt(weekDate(n.w,n.i));
  const d=n.d, sub= d.run? (d.kind==="race"? "Ta course" : "≈ "+durTxt(sessionDur(d.run))+kmTxt14(d.run))+(d.renfo?" · renfo "+esc(d.renfo.m):"") : esc(d.renfo.t+" · "+d.renfo.m);
  const canRun= n.dt===tdy&&d.run&&d.kind!=="race";
  el.innerHTML=`<div class="nx-l"><span class="nx-k">Prochaine séance · ${when}</span><b>${esc(sessTitle(d,E.vma))}</b><span class="nx-s">${sub}</span></div><div class="nx-a">${canRun?`<button class="btn sm" type="button" id="nxGo">Démarrer le minuteur</button>`:""}<button class="btn ghost sm" type="button" id="nxSee" aria-label="Voir la séance de ${when.toLowerCase()}">Voir</button></div>`;
  el.className="nextc k-"+(!d.run||d.run.sp==="force"?"rf":d.kind); el.hidden=false;
  const go=$("#nxGo"); if(go) go.addEventListener("click",()=>openTimer(n.w,n.i,go));
  $("#nxSee").addEventListener("click",()=>{ if(state.week!==n.w) goWeek(n.w); const c=$(`#days [data-day="${n.i}"]`); if(c){ scrollUnderNav(c); const f=c.querySelector("button"); if(f) f.focus({preventScroll:true}); } });
}
function renderRing(w){
  const el=$("#weekRing"), c=weekCounts(w);
  if(!c.tot){ el.hidden=true; return; }
  el.hidden=false; el.setAttribute("role","img"); el.setAttribute("aria-label",c.done+" séance"+(c.done>1?"s":"")+" faite"+(c.done>1?"s":"")+" sur "+c.tot+" cette semaine");
  el.innerHTML=ringSvg(c.done/c.tot)+`<span aria-hidden="true">${c.done}/${c.tot}</span>`;
}
// Suivi : part des séances passées cochées « Faite »
function renderReg(){
  const el=$("#regCard"), tdy=todayIso(); const marks=[];
  for(const wk of plan) for(const d of wk.days){ const m=markOf(wk.w,d.i); if(m) marks.push(isoOf(wk.w,d.i)); }
  if(!marks.length){ el.innerHTML=`<h3>Régularité</h3><p class="note">Coche « Faite » ou « Pas faite » sur les cartes de l'onglet Semaine : ta régularité s'affiche ici.</p>`; return; }
  const first=marks.sort()[0]; let done=0,skip=0,tot=0; const wks=[];
  for(const wk of plan){ let wd=0,wt=0;
    for(const d of wk.days){ if(!hasSession(d)) continue; const dt=isoOf(wk.w,d.i), m=markOf(wk.w,d.i); if(!dt||dt>tdy||dt<first||(dt===tdy&&!m)) continue; wt++; tot++; if(m==="done"){done++;wd++;} else if(m==="skip") skip++; }
    if(wt) wks.push(`S${wk.w} ${wd}/${wt}`); }
  const pct=tot?Math.round(done/tot*100):0;
  el.innerHTML=`<h3>Régularité</h3><div class="ring" role="img" aria-label="${pct} pour cent des séances faites">${ringSvg(tot?done/tot:0,44)}<span aria-hidden="true">${pct} %</span></div><p><b>${done} séance${done>1?"s":""} faite${done>1?"s":""} sur ${tot}</b> depuis ta première coche, le ${longDate(first)}${skip?" ("+skip+" notée"+(skip>1?"s":"")+" « pas faite »)":""}. Une séance passée non cochée après cette date compte comme pas faite.</p>${wks.length?`<p class="note">Dernières semaines : ${wks.slice(-4).join(" · ")}</p>`:""}`;
}
// Suivi : « séances faites / prévues » pré-remplies avec les séances cochées de la semaine (tant que tu n'y as pas touché)
function fillLogCounts(){
  const fz=$("#lgFaites"), pv=$("#lgPrevues"); if(fz.dataset.touched||pv.dataset.touched) return;
  const dt=okIso($("#lgDate").value)? $("#lgDate").value : todayIso(), st=effStart(state.profile); if(!st) return;
  const w=Math.floor((new Date(dt+"T12:00:00")-new Date(st+"T12:00:00"))/6048e5)+1; if(w<1||w>plan.length) return;
  const c=weekCounts(w); if(!c.done&&!c.skip) return;
  fz.value=String(c.done); pv.value=String(Math.max(1,c.tot));
}
["#lgFaites","#lgPrevues"].forEach(id=>$(id).addEventListener("input",e=>{ e.target.dataset.touched="1"; }));
$("#lgDate").addEventListener("change",fillLogCounts);

/* feuille iOS : une à la fois, piège du focus, Échap et fond pour fermer, focus rendu au bouton d'origine */
let sheetEl=null, sheetOpener=null;
function trapTab(e,box){ const f=[...box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.getClientRects().length); if(!f.length) return;
  const a=f[0], z=f[f.length-1]; if(e.shiftKey&&document.activeElement===a){ e.preventDefault(); z.focus(); } else if(!e.shiftKey&&document.activeElement===z){ e.preventDefault(); a.focus(); } }
// composant unique des fenêtres : même largeur, même hauteur, même en-tête, même zone défilante, même pied (Fermer + action)
function openSheet({title,html,foot,closeLabel,firstClose,kind,opener,onReady,onClose}){
  closeSheet(true); sheetOpener=opener||document.activeElement; sheetOnClose=onClose||null;
  const bg=document.createElement("div"); bg.className="sheet-bg";
  bg.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"${kind?` data-kind="${esc(kind)}"`:""}><div class="sh-h"><h3 id="shT">${esc(title)}</h3><button class="sh-x" type="button" aria-label="Fermer">×</button></div><div class="sh-b">${html}</div><div class="sh-f"><button class="btn ghost" type="button" data-close${firstClose?" data-first":""}>${esc(closeLabel||"Fermer")}</button>${foot||""}</div></div>`;
  document.body.appendChild(bg); sheetEl=bg; document.documentElement.style.overflow="hidden";
  bg.addEventListener("click",e=>{ if(e.target===bg) closeSheet(); });
  bg.querySelector(".sh-x").addEventListener("click",()=>closeSheet());
  bg.querySelector("[data-close]").addEventListener("click",()=>closeSheet());
  bg.addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.preventDefault(); closeSheet(); } else if(e.key==="Tab") trapTab(e,bg.querySelector(".sheet")); });
  const sh=bg.querySelector(".sheet"); if(onReady) onReady(sh);
  (sh.querySelector("[data-first]")||sh.querySelector(".sh-x")).focus();
  return sh;
}
let sheetOnClose=null, ownerPending=null;
function closeSheet(silent){ if(!sheetEl) return; sheetEl.remove(); sheetEl=null; const oc=sheetOnClose; sheetOnClose=null; if(oc) oc(); if(!timerEl) document.documentElement.style.overflow="";
  const o=sheetOpener; sheetOpener=null; if(!silent&&o&&document.contains(o)) o.focus({preventScroll:true});
  else if(silent){ const m=document.getElementById("me"), ae=document.activeElement; if(m&&!m.hidden&&(!ae||ae===document.body||!document.contains(ae))){ const t=document.getElementById("meT"); if(t) t.focus({preventScroll:true}); } } }

/* notifications : toasts empilés en bas (même style que « Annuler »), annonce aux lecteurs d'écran */
function toast(msg,o){ o=o||{}; const box=$("#toasts");
  [...box.querySelectorAll(".toast.gen")].slice(0,-1).forEach(x=>x.remove());   // deux messages au plus
  const t=document.createElement("div"); t.className="toast gen";
  t.innerHTML=`<span>${esc(msg)}</span>${o.action?`<button type="button">${esc(o.action)}</button>`:""}`;
  box.appendChild(t);
  let tm=null; const kill=()=>{ clearTimeout(tm); const hadF=t.contains(document.activeElement); t.remove(); if(hadF) $("#weekTitle").focus({preventScroll:true}); };
  tm=setTimeout(kill,o.timeout||(o.action?7000:4000));
  t.addEventListener("focusin",()=>clearTimeout(tm)); t.addEventListener("focusout",()=>{ clearTimeout(tm); tm=setTimeout(kill,3000); });
  if(o.action) t.querySelector("button").addEventListener("click",()=>{ kill(); if(o.fn) o.fn(); });
  return t;
}

/* déplacer une séance */
// dépôt de la séance du jour i sur le jour j : blocage (raison) ou avertissements
function dropInfo(w,i,j){ const wk=plan[w-1], d=wk.days[i], t=wk.days[j], prot=protectedIdx(wk);
  if(!t||i===j) return {same:true};
  if(!movable(t)) return {block: t.kind==="race"? "jour de course" : "avant le début du plan"};
  if((prot.has(j)&&d.run)||(prot.has(i)&&t.run)) return {block:"autour de la course : repos"};
  const sim=wk.days.slice(); sim[i]=t; sim[j]=d; return {warn:hardWarn(sim,[i,j],w)}; }
const blockMsg=b=> b==="jour de course"? "c'est le jour de la course" : b==="avant le début du plan"? "ce jour est avant le début de ton plan" : "la veille et les jours qui suivent la course restent au repos";
function openMoveSheet(i,opener){
  const w=state.week, wk=plan[w-1], d=wk.days[i]; if(!movable(d)) return;
  const prot=protectedIdx(wk), name=d.run? d.run.title : "Renforcement";
  const rows=wk.days.map((t,j)=>{
    const lab=DAYS[j]+" "+dfmt(weekDate(w,j)), what=t.kind==="before"?"Avant le début du plan":t.kind==="race"?"Course":t.run?t.run.title+(t.renfo?" + renfo":""):t.renfo?"Renforcement":"Repos";
    if(j===i) return `<div class="opt" aria-current="true"><span>${lab}<small>${esc(what)} · actuellement ici</small></span></div>`;
    const inf=dropInfo(w,i,j), block=inf.block||"", warn=inf.warn||[];
    return `<button class="opt" type="button" data-to="${j}"${block?' aria-disabled="true"':""}><span>${lab}<small>${esc(what)}${block?" · impossible : "+block:""}${warn.length?' · <span class="w">attention : '+warn.join(", ")+"</span>":""}</small></span><span aria-hidden="true">${block?"":"⇄"}</span></button>`;
  });
  openSheet({title:"Déplacer : "+name, opener, html:`<p class="note">Choisis le jour : les deux jours échangent leur contenu (repos compris). Les calories et les macros suivent la séance.</p><div class="grp" role="group" aria-label="Jours de la semaine ${w}">${rows.join("")}</div>`,
    onReady:sh=>{ const f=sh.querySelector('[data-to]:not([aria-disabled])'); if(f) f.setAttribute("data-first","");
      sh.querySelectorAll("[data-to]").forEach(b=>b.addEventListener("click",()=>{ if(b.getAttribute("aria-disabled")==="true") return; closeSheet(true); moveSession(w,i,+b.dataset.to); })); }});
}
let evTapAt=0;   // dernière mise à jour du plan avec un résultat de test (double appui)
$("#days").addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return; const w=state.week;
  if(performance.now()-evTapAt<800&&b.dataset.evap==null){ e.preventDefault(); return; }   // second appui d'un double appui : la carte vient d'être redessinée
  if(b.dataset.done!=null||b.dataset.skip!=null){ const i=+(b.dataset.done??b.dataset.skip), k=b.dataset.done!=null?"done":"skip"; setDone(w,i,k,`#days [data-${k}="${i}"]`); }
  else if(b.dataset.move!=null) openMoveSheet(+b.dataset.move,b);
  else if(b.dataset.vm!=null){ const a=b.closest("article"), open=a.classList.contains("cmp"); setTile(a,open); if(a.dataset.iso){ tiles.o[a.dataset.iso]=open; saveTiles(); } updFoldAll(); }
  else if(b.dataset.aiba!=null){ const k=b.dataset.aibk, op=b.getAttribute("aria-expanded")!=="true", c=document.getElementById(b.getAttribute("aria-controls"));
    b.setAttribute("aria-expanded",String(op)); if(c) c.hidden=!op; if(op) aibaOpen.add(k); else aibaOpen.delete(k); }
  else if(b.dataset.ics!=null) openExport(b,{w,i:+b.dataset.ics});
  else if(b.dataset.timer!=null) openTimer(w,+b.dataset.timer,b);
  else if(b.dataset.exo!=null) openExo(w,+b.dataset.exo,b);
  else if(b.dataset.feel!=null) openFeel(w,+b.dataset.feel,b);
  else if(b.dataset.evr!=null) openEval(w,+b.dataset.evr,b);
  else if(b.dataset.evap!=null){ if(performance.now()-evTapAt>=800&&evApplyRes(w,+b.dataset.evap)) evTapAt=performance.now(); }   // posé seulement après une mise à jour réussie
});

/* schémas des mouvements : silhouette de profil (tournée vers la droite) dessinée par angles, départ puis arrivée.
   Angles en degrés : membres 0 = vers le bas, 90 = vers l'avant, 180 = vers le haut ; buste 0 = droit, 90 = penché vers l'avant, -90 = allongé tête en arrière.
   a : point d'appui (cheville de la jambe avant, ou hanche si hip:1) ; l1/l2 : [cuisse, tibia] ; t : buste ; r/r2 : [bras, avant-bras] ; pr : accessoires */
const XL={th:20,sh:19,to:26,ne:10,ua:14,fa:13,ft:7};
const xv=(a,n)=>[Math.sin(a*Math.PI/180)*n,Math.cos(a*Math.PI/180)*n];
const xadd=(p,v,k=1)=>[p[0]+v[0]*k,p[1]+v[1]*k];
function exoPose(q){
  const l1=q.l1||[0,0], l2=q.l2||l1, t=q.t||0, r=q.r||[0,0];
  let hip; if(q.hip) hip=q.a; else { const k1=xadd(q.a,xv(l1[1],XL.sh),-1); hip=xadd(k1,xv(l1[0],XL.th),-1); }
  const leg=l=>{ const k=xadd(hip,xv(l[0],XL.th)), a=xadd(k,xv(l[1],XL.sh)); return [k,a]; };
  const [k1,a1]=leg(l1), [k2,a2]=leg(l2), sh=xadd(hip,[Math.sin(t*Math.PI/180)*XL.to,-Math.cos(t*Math.PI/180)*XL.to]);
  const hd=xadd(sh,[Math.sin(t*Math.PI/180)*XL.ne,-Math.cos(t*Math.PI/180)*XL.ne]);
  const arm=r=>{ const e=xadd(sh,xv(r[0],XL.ua)), h=xadd(e,xv(r[1],XL.fa)); return [e,h]; };
  const [e1,h1]=arm(r), A2=q.r2? arm(q.r2) : null;
  const fa=x=> q.ft!=null? q.ft : x+90;
  return {hip,k1,a1,k2,a2,sh,hd,e1,h1,A2,f1:xadd(a1,xv(fa(l1[1]),XL.ft)),f2:xadd(a2,xv(fa(l2[1]),XL.ft))};
}
function exoSvg(q,lab){
  const P_=exoPose(q), n=v=>Math.round(v*10)/10, pl=pts=>`<polyline points="${pts.map(p=>n(p[0])+","+n(p[1])).join(" ")}"/>`;
  let pr="";
  for(const it of q.pr||[]){
    if(it==="db"){ const h=P_.h1; pr+=`<g class="xw"><line x1="${n(h[0]-5)}" y1="${n(h[1])}" x2="${n(h[0]+5)}" y2="${n(h[1])}"/><circle cx="${n(h[0]-5)}" cy="${n(h[1])}" r="3"/><circle cx="${n(h[0]+5)}" cy="${n(h[1])}" r="3"/></g>`; }
    else if(it==="bar"){ const h=P_.h1; pr+=`<circle class="xw" cx="${n(h[0])}" cy="${n(h[1])}" r="7"/>`; }
    else if(it==="barSh"){ const s=P_.sh; pr+=`<circle class="xw" cx="${n(s[0]+6)}" cy="${n(s[1])}" r="5"/>`; }
    else if(it==="barHip"){ const s=P_.hip; pr+=`<circle class="xw" cx="${n(s[0])}" cy="${n(s[1]-7)}" r="7"/>`; }
    else if(it==="pull"){ const h=P_.h1; pr+=`<line class="xp" x1="${n(h[0]-24)}" y1="${n(h[1])}" x2="${n(h[0]+24)}" y2="${n(h[1])}"/>`; }
    else if(it==="benchBack"){ const a=P_.a2; pr+=`<rect class="xp" x="${n(a[0]-16)}" y="${n(a[1]+3)}" width="24" height="${n(Math.max(4,97-a[1]))}" rx="2"/>`; }
    else if(it==="benchSh"){ const s=P_.sh; pr+=`<rect class="xp" x="${n(s[0]-14)}" y="${n(s[1]+4)}" width="22" height="${n(Math.max(4,97-s[1]))}" rx="2"/>`; }
    else if(it==="benchTorso"){ const s=P_.sh, h=P_.hip; pr+=`<rect class="xp" x="${n(s[0]-6)}" y="${n(s[1]+4)}" width="${n(h[0]-s[0]+12)}" height="${n(Math.max(4,97-s[1]))}" rx="2"/>`; }
    else if(it==="benchFeet"){ const a=P_.a1; pr+=`<rect class="xp" x="${n(a[0]-10)}" y="${n(a[1]+4)}" width="22" height="${n(Math.max(4,97-a[1]))}" rx="2"/>`; }
    else if(it==="step"){ const a=P_.a1; pr+=`<rect class="xp" x="${n(a[0]-8)}" y="${n(a[1]+3)}" width="26" height="${n(Math.max(3,97-a[1]))}" rx="2"/>`; }
    else if(it==="pole"){ const h=P_.h1; pr+=`<line class="xp" x1="${n(h[0]+3)}" y1="14" x2="${n(h[0]+3)}" y2="100"/>`; }
    else if(it==="hold"){ const a=P_.a1; pr+=`<rect class="xp" x="${n(a[0]-9)}" y="${n(a[1]-8)}" width="12" height="6" rx="2"/>`; }
  }
  const back=pl([P_.hip,P_.k2,P_.a2,P_.f2])+(P_.A2? pl([P_.sh,P_.A2[0],P_.A2[1]]) : "");
  // cadre rogné au-dessus de la silhouette (les positions allongées ne laissent pas un grand vide)
  const ys=[P_.hd[1]-7,P_.h1[1]-8,P_.e1[1],P_.k1[1],P_.k2[1],P_.a2[1]-6,P_.A2?P_.A2[1][1]:104,q.fl===0?0:104], top=Math.max(0,Math.floor(Math.min(...ys)-6)), hh=104-top;
  return `<figure class="xf"><svg viewBox="0 ${top} 120 ${hh}" width="120" height="${hh}" aria-hidden="true"><line class="xg" x1="4" y1="${q.fl||100}" x2="116" y2="${q.fl||100}"/>${pr}<g class="xb">${back}</g><g class="xs">${pl([P_.hip,P_.k1,P_.a1,P_.f1])}${pl([P_.hip,P_.sh])}${pl([P_.sh,P_.e1,P_.h1])}<circle cx="${n(P_.hd[0])}" cy="${n(P_.hd[1])}" r="6"/></g></svg><figcaption>${lab}</figcaption></figure>`;
}
const STAND={a:[56,97]}, ARMF=[85,90];
// re : reconnaît le nom dans le texte du plan ; f : 1 ou 2 positions ; c : consignes
const EXO=[
  {id:"goblet",n:"Goblet squat",re:/goblet|gobelet/i,f:[{...STAND,r:[15,165],pr:["db"]},{a:[60,97],l1:[82,-18],t:28,r:[35,175],pr:["db"]}],c:["Un haltère tenu contre la poitrine, coudes vers le bas.","Descends en poussant les fesses en arrière, genoux dans l'axe des pieds.","Talons au sol, dos droit ; remonte en poussant dans le sol."]},
  {id:"bulgare",n:"Split squat bulgare",re:/bulgare|split squat/i,f:[{a:[70,97],l1:[15,-2],l2:[-28,-95],t:5,pr:["benchBack"]},{a:[70,97],l1:[78,-12],l2:[-8,-147],t:12,pr:["benchBack"]}],c:["Pied arrière posé sur un banc, pied avant un grand pas devant.","Descends à la verticale jusqu'à ce que la cuisse avant soit presque horizontale.","Genou avant au-dessus du pied, pas vers l'intérieur."]},
  {id:"pistol",n:"Pistol squat assisté",re:/pistol/i,f:[{a:[50,97],l2:[35,35],r:[70,85],pr:["pole"]},{a:[50,97],l1:[85,-22],l2:[88,88],t:35,r:[80,90],pr:["pole"]}],c:["Sur une jambe, l'autre tendue devant ; tiens un support (porte, barre).","Descends lentement aussi bas que tu contrôles.","Tire un peu sur le support pour remonter au début."]},
  {id:"fsq",n:"Squat avant",re:/squat avant/i,f:[{...STAND,r:[60,175],pr:["barSh"]},{a:[60,97],l1:[82,-18],t:22,r:[80,175],pr:["barSh"]}],c:["Barre posée devant les épaules, coudes hauts.","Buste le plus droit possible pendant la descente.","Remonte en poussant dans tout le pied."]},
  {id:"ohsq",n:"Squat bras tendus au-dessus de la tête",re:/overhead|bras tendus/i,f:[{...STAND,r:[165,170]},{a:[60,97],l1:[82,-18],t:20,r:[150,160]}],c:["Bâton ou haltère tenu bras tendus au-dessus de la tête.","Descends en gardant les bras alignés avec le buste.","Mouvement de technique : léger, sans forcer."]},
  {id:"squat",n:"Squat",re:/squat|presse/i,f:[{...STAND,r:ARMF},{a:[60,97],l1:[84,-20],t:40,r:ARMF}],c:["Pieds largeur d'épaules, pointes un peu ouvertes.","Assieds-toi en arrière, genoux dans l'axe des pieds, talons au sol.","Avec barre : posée sur le haut du dos, regard droit devant."]},
  {id:"rdl",n:"Soulevé de terre roumain",re:/roumain|soulevé de terre|tirage d.arraché|tirage d.épaulé|tirage haltères/i,f:[{...STAND,pr:["db"]},{a:[60,97],l1:[-12,6],t:75,r:[0,0],pr:["db"]}],c:["Genoux à peine fléchis, la charge glisse le long des cuisses.","Recule les fesses, dos bien droit, jusqu'à sentir l'arrière des cuisses.","Remonte en serrant les fesses, sans cambrer."]},
  {id:"hipthrust",n:"Hip thrust",re:/hip thrust/i,f:[{a:[92,97],l1:[140,25],t:-62,r:[100,90],pr:["benchSh","barHip"]},{a:[92,97],l1:[100,15],t:-88,r:[100,90],pr:["benchSh","barHip"]}],c:["Haut du dos appuyé sur un banc, pieds à plat.","Monte les hanches jusqu'à l'alignement épaules, hanches, genoux.","Serre les fesses 1 s en haut, menton rentré."]},
  {id:"pont",n:"Pont fessier",re:/pont fessier/i,f:[{a:[86,97],l1:[118,30],t:-90,r:[90,90]},{a:[86,97],l1:[100,20],t:-106,r:[90,90]}],c:["Allongé sur le dos, genoux pliés, pieds à plat.","Pousse dans les talons pour monter les hanches.","Garde 1 s en haut, fesses serrées, puis redescends lentement. Sur une jambe : l'autre tendue."]},
  {id:"legcurl",n:"Curl ischios (talons sur une serviette)",re:/curl ischios|leg curl/i,f:[{a:[86,97],l1:[100,20],t:-106,r:[90,90]},{a:[104,97],l1:[98,95],t:-98,r:[90,90]}],c:["En position de pont, talons sur une serviette (sol lisse).","Fais glisser les pieds vers l'avant en gardant les hanches hautes.","Ramène les talons vers les fesses avec l'arrière des cuisses."]},
  {id:"nordic",n:"Nordic curl",re:/nordic/i,f:[{a:[30,97],l1:[0,-90],t:0,r:[30,40],ft:-90,pr:["hold"]},{a:[30,97],l1:[-50,-90],t:50,r:[70,70],ft:-90,pr:["hold"]}],c:["À genoux, chevilles bloquées (partenaire ou meuble lourd).","Penche-toi en avant, corps droit, le plus lentement possible.","Rattrape-toi avec les mains et remonte en poussant un peu."]},
  {id:"fente",n:"Fentes",re:/fente/i,f:[{...STAND},{a:[76,97],l1:[80,-12],l2:[-12,-70],t:5,r:[0,0]}],c:["Un grand pas (en avant ou en arrière).","Descends jusqu'à ce que le genou arrière frôle le sol.","Buste droit, genou avant au-dessus du pied."]},
  {id:"mollets",n:"Mollets",re:/mollet/i,f:[{a:[56,94],pr:["step"]},{a:[56,85],ft:40,pr:["step"]}],c:["Avant du pied sur une marche, talons dans le vide.","Monte sur la pointe le plus haut possible, puis descends sous la marche.","Lentement ; sur une jambe quand c'est facile (assis : charge sur les genoux)."]},
  {id:"plio",n:"Pliométrie (sauts)",re:/pliom|saut/i,f:[{a:[60,97],l1:[70,-20],t:35,r:[-40,-30]},{a:[58,82],r:[170,175],ft:40}],c:["Squat jump, sauts sur place ou bonds : toujours en forme, jamais fatigué.","Atterris souple sur l'avant du pied, genoux dans l'axe.","Peu de répétitions de qualité, récupère bien entre les séries."]},
  {id:"copen",n:"Copenhague",re:/copenhague/i,f:[{a:[96,80],l1:[78,78],t:-72,r:[0,-90],r2:[180,180],ft:20,pr:["benchFeet"]}],c:["Sur le côté, avant-bras au sol, jambe du dessus posée sur un banc.","Monte les hanches pour aligner le corps et tiens.","Commence genou sur le banc (plus facile), puis pied."]},
  {id:"lateral",n:"Gainage latéral",re:/gainage latéral/i,f:[{a:[98,95],l1:[72,72],t:-68,r:[0,-90],r2:[180,180],ft:20}],c:["Sur le côté, coude sous l'épaule.","Hanches hautes : le corps forme une ligne droite.","Respire normalement ; change de côté."]},
  {id:"planche",n:"Gainage (planche)",re:/gainage/i,f:[{a:[100,95],l1:[78,78],t:-78,r:[0,-90],ft:10}],c:["Avant-bras au sol, coudes sous les épaules.","Corps droit de la tête aux talons, fesses ni trop hautes ni trop basses.","Rentre le ventre et respire calmement."]},
  {id:"equilibre",n:"Équilibre sur une jambe",re:/équilibre/i,f:[{...STAND,l2:[80,0],r:[60,60]}],c:["Debout sur une jambe, genou un peu fléchi.","Regarde un point fixe ; puis les yeux fermés quand c'est facile.","Sur coussin ou serviette pliée pour corser."]},
  {id:"pompes",n:"Pompes",re:/pompes/i,f:[{a:[100,95],l1:[70,70],t:-70,r:[0,0],ft:10},{a:[100,95],l1:[82,82],t:-82,r:[60,-30],ft:10}],c:["Mains sous les épaules, corps droit.","Descends la poitrine près du sol, coudes à 45°.","Plus facile : genoux au sol ou mains sur un meuble."]},
  {id:"row",n:"Rowing",re:/rowing|tirage horizontal/i,f:[{a:[60,97],l1:[-15,8],t:62,r:[0,0],pr:["db"]},{a:[60,97],l1:[-15,8],t:62,r:[-70,0],pr:["db"]}],c:["Penché en avant, dos plat, genoux un peu fléchis.","Tire la charge vers le bas du ventre, coude le long du corps.","Serre les omoplates en haut, redescends lentement."]},
  {id:"traction",n:"Tractions",re:/traction|tirage vertical/i,f:[{a:[60,78],hip:1,l1:[0,-30],r:[180,180],pr:["pull"],fl:0},{a:[60,52],hip:1,l1:[0,-30],r:[20,172],pr:["pull"],fl:0}],c:["Suspendu à une barre, mains un peu plus larges que les épaules.","Tire les coudes vers les hanches jusqu'au menton au-dessus de la barre.","Plus facile : élastique sous les pieds, ou tirage à la poulie."]},
  {id:"couche",n:"Développé couché",re:/développé couché|développé incliné/i,f:[{a:[64,72],hip:1,l1:[90,0],t:-90,r:[180,180],pr:["benchTorso","bar"]},{a:[64,72],hip:1,l1:[90,0],t:-90,r:[60,180],pr:["benchTorso","bar"]}],c:["Allongé sur le banc, pieds à plat au sol.","Descends la charge jusqu'au bas de la poitrine, coudes à 45°.","Pousse vers le haut sans décoller les fesses."]},
  {id:"militaire",n:"Développé épaules",re:/développé militaire|développé épaules|push press/i,f:[{...STAND,r:[30,170],pr:["bar"]},{...STAND,r:[178,180],pr:["bar"]}],c:["Debout, la charge devant les épaules.","Pousse au-dessus de la tête, bras tendus, ventre serré.","Ne cambre pas : serre les fesses."]},
  {id:"curl",n:"Curl biceps",re:/curl/i,f:[{...STAND,r:[0,0],pr:["db"]},{...STAND,r:[0,160],pr:["db"]}],c:["Coudes collés au corps.","Monte la charge en pliant les bras, sans balancer le buste.","Redescends lentement."]},
  {id:"triceps",n:"Extension triceps",re:/triceps|diamant/i,f:[{...STAND,r:[170,-20],pr:["db"]},{...STAND,r:[170,175],pr:["db"]}],c:["Haltère tenu derrière la tête, coudes vers le haut.","Tends les bras sans bouger les coudes.","Redescends lentement derrière la tête."]},
  {id:"releve",n:"Relevé de jambes",re:/relevé de jambes/i,f:[{a:[60,94],hip:1,l1:[90,90],t:-90,r:[90,90],ft:180},{a:[60,94],hip:1,l1:[175,175],t:-90,r:[90,90],ft:270}],c:["Allongé sur le dos, bas du dos plaqué au sol.","Monte les jambes tendues (ou genoux pliés, plus facile).","Redescends lentement sans cambrer."]}
];
// exercices nommés dans une séance : chaque élément de liste (virgule, « ou », « et ») est rapproché du premier schéma qui correspond
function exoOf(texts){
  const ids=[], miss=[];
  for(const t of texts) for(const part of String(t).replace(/\([^)]*\)/g,m=>/pliom|sauts|ischios/i.test(m)?m:"").split(/,| ou | et /)){
    const s=part.trim(); if(!s||/^mêmes exercices|^pas de pliom/i.test(s)) continue;
    const x=EXO.find(e=>e.re.test(s)); if(x){ if(!ids.includes(x.id)) ids.push(x.id); } else if(!miss.includes(s)) miss.push(s); }
  return {ids,miss};
}
function dayExoTexts(d){ const t=[]; if(d.renfo) for(const r of d.renfo.rows) t.push(r[0]); if(d.run&&P.sport==="force") for(const b of d.run.blocks) if(b.l) t.push(b.l); return t; }
function exoBtn(d){ return exoOf(dayExoTexts(d)).ids.length? `<button class="cbtn xo" type="button" data-exo="${d.i}" aria-haspopup="dialog">Voir les mouvements</button>` : ""; }
function openExo(w,i,opener){
  const d=plan[w-1]&&plan[w-1].days[i]; if(!d) return; const {ids,miss}=exoOf(dayExoTexts(d));
  const card=x=>`<li class="xc"><h4>${esc(x.n)}</h4><div class="xfs">${x.f.length>1? exoSvg(x.f[0],"Départ")+'<span class="xar" aria-hidden="true">→</span>'+exoSvg(x.f[1],"Arrivée") : exoSvg(x.f[0],"Position")}</div><ul class="xcue">${x.c.map(c=>`<li>${esc(c)}</li>`).join("")}</ul></li>`;
  openSheet({title:"Les mouvements",opener,kind:"exo",html:`<p class="note">Schémas simplifiés, vus de profil. Commence léger : la technique d'abord. Douleur vive : arrête l'exercice.</p><ul class="xlist">${ids.map(id=>card(EXO.find(e=>e.id===id))).join("")}</ul>${miss.length?`<p class="note">Sans schéma : ${esc(miss.join(", "))}. Demande au Coach ou à un entraîneur de te les montrer.</p>`:""}`});
}

/* glisser-déposer des séances (souris et doigt, Pointer Events) : appui long ~300 ms ou poignée, fantôme, zones de dépôt, défilement aux bords */
let drag=null, dragEnd=0;
const vib=p=>{ try{ if(navigator.vibrate) navigator.vibrate(p); }catch(e){} };
function dragClean(){ const g=drag; drag=null; if(!g) return; clearTimeout(g.timer); if(g.raf) cancelAnimationFrame(g.raf);
  if(g.ghost) g.ghost.remove(); document.documentElement.classList.remove("dragging");
  document.querySelectorAll("#days .dz-ok,#days .dz-no,#days .dz-over,#days .dsrc,#days .press").forEach(a=>a.classList.remove("dz-ok","dz-no","dz-over","dsrc","press"));
  try{ if(g.art.hasPointerCapture&&g.art.hasPointerCapture(g.id)) g.art.releasePointerCapture(g.id); }catch(e){} return g; }
function dragAbort(say){ const g=dragClean(); if(g&&g.phase==="drag"){ dragEnd=Date.now(); if(say) setT($("#srLive"),"Déplacement annulé."); } }
function dragStart(){ const g=drag, art=g.art; if(!document.contains(art)){ dragClean(); return; }
  clearTimeout(g.timer); g.phase="drag"; const r=art.getBoundingClientRect();
  g.dx=Math.max(0,Math.min(r.width,g.x0-r.left)); g.dy=Math.max(0,Math.min(140,g.y0-r.top));
  let gh;
  // souris : petite étiquette sous le curseur (la carte entière masquait les jours voisins sur ordinateur)
  if(g.type==="mouse"){ gh=document.createElement("div"); gh.className="day dghost mini"; gh.textContent=DAYS[g.i]+" · "+g.what; g.dx=-14; g.dy=-14; }
  else{ gh=art.cloneNode(true); gh.removeAttribute("id"); gh.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id"));
    gh.classList.add("dghost"); gh.classList.remove("today","dsrc","press","dz-ok","dz-no","dz-over"); gh.style.width=r.width+"px"; }
  gh.setAttribute("aria-hidden","true"); gh.inert=true;
  const tag=document.createElement("div"); tag.className="gtag"; gh.appendChild(tag); g.tag=tag; document.body.appendChild(gh); g.ghost=gh;
  art.classList.remove("press"); art.classList.add("dsrc"); document.documentElement.classList.add("dragging");
  g.info=[]; document.querySelectorAll("#days article").forEach(a=>{ if(a===art) return; const j=a.dataset.day!=null? +a.dataset.day : null;
    const inf= j==null? {block:"avant le début du plan"} : dropInfo(g.w,g.i,j); a.classList.add(inf.block?"dz-no":"dz-ok"); g.info.push({a,j,inf}); });
  try{ const s=window.getSelection(); if(s) s.removeAllRanges(); }catch(e){}
  try{ art.setPointerCapture(g.id); }catch(e){}
  vib(15); setT($("#srLive"),g.what+" saisie : glisse-la sur un autre jour, puis relâche. Échap pour annuler.");
  dragPos(); g.raf=requestAnimationFrame(dragScroll); }
function dragPos(){ const g=drag; if(!g||g.phase!=="drag") return;
  g.ghost.style.transform=`translate(${Math.round(g.x-g.dx)}px,${Math.round(g.y-g.dy)}px)`;
  const el=document.elementFromPoint(g.x,g.y); let a=el&&el.closest("#days article"); g.hit=null;
  // entre deux cartes (hauteurs inégales sur ordinateur) : la carte la plus proche à moins de 48 px
  if(!a){ let bd=48; for(const it of g.info){ const r=it.a.getBoundingClientRect(), dd=Math.hypot(Math.max(r.left-g.x,0,g.x-r.right),Math.max(r.top-g.y,0,g.y-r.bottom)); if(dd<bd){ bd=dd; a=it.a; } } }
  for(const it of g.info){ const on=it.a===a; it.a.classList.toggle("dz-over",on); if(on) g.hit=it; }
  const h=g.hit, day=h&&h.j!=null? DAYS[h.j].toLowerCase() : "";
  const t= !h? "Glisse sur un autre jour" : h.inf.block? "Impossible ici : "+h.inf.block : (h.inf.warn&&h.inf.warn.length? "Attention : "+h.inf.warn.join(", ") : "Échanger avec "+day);
  if(g.tag.textContent!==t){ g.tag.textContent=t; g.tag.className="gtag"+(h&&h.inf.block?" no":h&&h.inf.warn&&h.inf.warn.length?" warn":""); } }
// défilement automatique près des bords (sous la barre d'onglets collée en haut)
function dragScroll(){ const g=drag; if(!g||g.phase!=="drag") return;
  const n=$("nav.tabs"), fx=getComputedStyle(n).position==="fixed", top=fx?0:n.getBoundingClientRect().bottom, H=fx?n.getBoundingClientRect().top:window.innerHeight, edge=Math.min(90,H/6); let v=0;
  if(g.y<top+edge) v=-(top+edge-g.y); else if(g.y>H-edge) v=g.y-(H-edge);
  if(v){ window.scrollBy(0,Math.max(-22,Math.min(22,Math.round(v/4)||Math.sign(v)))); dragPos(); }
  g.raf=requestAnimationFrame(dragScroll); }
$("#days").addEventListener("pointerdown",e=>{
  if(drag||!e.isPrimary||(e.pointerType==="mouse"&&e.button!==0)||!plan) return;
  const art=e.target.closest("#days article[data-day]"); if(!art) return;
  const i=+art.dataset.day, w=state.week, wk=plan[w-1], d=wk&&wk.days[i]; if(!d||!hasSession(d)||!movable(d)) return;
  const onGrip=!!e.target.closest(".grip");
  if(!onGrip&&e.target.closest("button,a,input,select,textarea,summary,label,.det")) return;
  drag={phase:"armed",i,w,art,id:e.pointerId,type:e.pointerType,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,what:d.run?d.run.title:"Renforcement",timer:null};
  if(onGrip){ e.preventDefault(); if(e.pointerType!=="mouse") dragStart(); }
  else if(e.pointerType!=="mouse"){ drag.timer=setTimeout(()=>{ if(drag&&drag.phase==="armed") dragStart(); },300); art.classList.add("press"); }
});
window.addEventListener("pointermove",e=>{ const g=drag; if(!g||e.pointerId!==g.id) return; g.x=e.clientX; g.y=e.clientY;
  if(g.phase==="armed"){ const dist=Math.hypot(g.x-g.x0,g.y-g.y0); if(g.type==="mouse"){ if(dist>5) dragStart(); } else if(dist>10) dragClean(); return; }
  e.preventDefault(); dragPos(); },{passive:false});
window.addEventListener("pointerup",e=>{ const g=drag; if(!g||e.pointerId!==g.id) return;
  if(g.phase!=="drag"){ dragClean(); return; }
  g.x=e.clientX; g.y=e.clientY; dragPos(); const h=g.hit; dragClean(); dragEnd=Date.now();
  if(!h){ setT($("#srLive"),"Déplacement annulé."); return; }
  if(h.inf.block){ vib([12,60,12]); toast("Impossible sur "+(h.j!=null?DAYS[h.j].toLowerCase():"ce jour")+" : "+blockMsg(h.inf.block)+"."); return; }
  vib(10); moveSession(g.w,g.i,h.j); });
window.addEventListener("pointercancel",e=>{ if(drag&&e.pointerId===drag.id) dragAbort(true); });
// pendant le glisser au doigt, la page ne défile pas (sinon le navigateur annule le geste)
document.addEventListener("touchmove",e=>{ if(drag&&drag.phase==="drag") e.preventDefault(); },{passive:false});
// à la souris aussi : sans ça, tirer une carte sélectionnait le texte de la page au lieu de la déplacer
document.addEventListener("selectstart",e=>{ if(drag) e.preventDefault(); });
document.addEventListener("contextmenu",e=>{ if(drag&&drag.type!=="mouse") e.preventDefault(); });
document.addEventListener("keydown",e=>{ if(drag&&e.key==="Escape"){ e.preventDefault(); dragAbort(true); } });
// le clic qui suit un dépôt n'active pas le bouton situé dessous
document.addEventListener("pointerdown",()=>{ dragEnd=0; },true);
document.addEventListener("click",e=>{ if(dragEnd&&Date.now()-dragEnd<350&&e.target.closest&&e.target.closest("#days")){ e.preventDefault(); e.stopPropagation(); } },true);
window.addEventListener("blur",()=>{ if(drag) dragAbort(false); });

/* copier la semaine (Notes, Messages) */
function weekText(w){
  const wk=plan[w-1], f=dayFuel(P,E,wk), d0=firstDay(w), d6=weekDate(w,6);
  const L=["Semaine "+w+" · "+phLab(wk.phase)+(wk.deload?" (allégée)":"")+" · "+(iso(d0)===iso(d6)?dfmt(d0):dfmt(d0)+" – "+dfmt(d6))+" · "+volLine14(wk,f)];
  for(const d of f.days){ const head=DAYS[d.i]+" "+dfmt(weekDate(w,d.i))+" : ";
    if(d.kind==="before"){ L.push(head+"avant le début du plan · "+fmt0(d.kcal)+" kcal"); continue; }
    if(!d.run&&!d.renfo){ L.push(head+"Repos · "+fmt0(d.kcal)+" kcal"); continue; }
    L.push(head+sessTitle(d,E.vma)+(d.run&&d.kind!=="race"?" · ≈ "+durTxt(sessionDur(d.run))+kmPart14(d)+(d.run.dplus?" · D+ "+fmt0(d.run.dplus)+" m":""):"")+" · "+fmt0(d.kcal)+" kcal (P "+d.P+" g · G "+d.C+" g · L "+d.F+" g)");
    if(d.run) for(const b of d.run.blocks) L.push("  – "+blockTxt(b,d.kind));
    if(d.renfo) L.push("  – "+d.renfo.t+" ("+d.renfo.m+") : "+d.renfo.rows.map(r=>r[0]).join(" ; "));
  }
  return L.join("\n");
}
async function copyWeek(btn){
  const txt=weekText(state.week);
  try{ if(!navigator.clipboard||!navigator.clipboard.writeText) throw 0; await navigator.clipboard.writeText(txt); toast("Semaine "+state.week+" copiée : colle-la dans Notes ou Messages."); }
  catch(e){ openSheet({title:"Copier la semaine",opener:btn,html:`<p class="msg">La copie automatique est bloquée ici : sélectionne le texte et copie-le.</p><textarea readonly data-first aria-label="Texte de la semaine">${esc(txt)}</textarea>`,onReady:sh=>{ const ta=sh.querySelector("textarea"); setTimeout(()=>ta.select(),0); }}); }
}

/* export vers Calendrier : fichier ICS (RFC 5545, heures locales « flottantes »), dans un zip sans compression */
let dlCap=null;
const icsEsc=s=> String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
function icsFold(line){ const enc=new TextEncoder(); if(enc.encode(line).length<=75) return line;
  const out=[]; let cur="", n=0; for(const ch of line){ const b=enc.encode(ch).length; if(n+b>75){ out.push(cur); cur=" "; n=1; } cur+=ch; n+=b; } out.push(cur); return out.join("\r\n"); }
const pad2=n=>String(n).padStart(2,"0");
function icsLocal(dateIso,mins){ const d=new Date(dateIso+"T12:00:00"); d.setHours(0,0,0,0); d.setMinutes(mins); return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+"T"+pad2(d.getHours())+pad2(d.getMinutes())+"00"; }
const hm=s=>{ const m=/^(\d{1,2}):(\d{2})/.exec(String(s||"")); return m&&+m[1]<24&&+m[2]<60? +m[1]*60+ +m[2] : null; };
// dates déjà exportées avec une séance, sur cet appareil : sert à annuler à l'export suivant celles qui n'en ont plus
const ICSX_KEY="carnet.icsx";
function icsxLoad(){ let o={}; try{ o=JSON.parse(localStorage.getItem(ICSX_KEY)||"{}"); }catch(e){} const lim=addDays(todayIso(),-60), out={};
  if(o&&typeof o==="object"&&!Array.isArray(o)) for(const k of Object.keys(o)) if(okIso(k)&&k>=lim) out[k]=1;
  return out; }
function icsxSave(m){ const ks=Object.keys(m).sort().slice(-800), o={}; for(const k of ks) o[k]=1; try{ localStorage.setItem(ICSX_KEY,JSON.stringify(o)); }catch(e){} }
function buildIcs(o){
  const tdy=todayIso(), stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  let last=0; try{ last=+localStorage.getItem("carnet.icsseq")||0; }catch(e){} if(!Number.isSafeInteger(last)||last<0||last>1e9) last=0;
  // minutes depuis le 1er janvier 2026, toujours au-dessus de l'export précédent (deux exports dans la même minute)
  const seq=Math.min(1e9,Math.max(0,Math.floor((Date.now()-new Date(2026,0,1).getTime())/6e4),last+1)), prev=icsxLoad(), had=new Set(), sess=new Set(), cancel=(dt,st0)=>{
    L.push("BEGIN:VEVENT","UID:carnet-"+dt+"@plan-course","DTSTAMP:"+stamp,"SEQUENCE:"+seq,"DTSTART:"+icsLocal(dt,st0),"DTEND:"+icsLocal(dt,st0+15),"SUMMARY:"+icsEsc("Séance annulée"),"STATUS:CANCELLED","END:VEVENT"); nc++; had.add(dt); };
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Pacebook//Plan de course v"+APP_V+"//FR","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Plan de course"];
  const one=o.one, ws= one? [one.w] : o.period==="week"? [state.week] : plan.map(x=>x.w); let n=0, nc=0;
  for(const w of ws){ const wk=plan[w-1], f=dayFuel(P,E,wk);
    for(const d of f.days){ const dt=isoOf(w,d.i); if(one&&d.i!==one.i) continue; if(!dt||(!one&&o.period!=="week"&&dt<tdy)) continue;
      had.add(dt);
      // jour sans séance déjà exporté avec une séance (déplacement, changement de plan) : l'événement précédent (même UID) est annulé
      if(!hasSession(d)){ if(prev[dt]) cancel(dt,(d.i>=5?o.we:o.wd)??(d.i>=5?540:1080)); continue; }
      sess.add(dt);
      const we=d.i>=5, start=(we?o.we:o.wd)??(we?540:1080);
      let dur=(d.run?sessionDur(d.run):0)+(d.renfo?parseInt(d.renfo.m)||30:0);
      if(d.kind==="race"){ const rp=OBJ[P.objectif].racePct||[.7,.75], sp=d.run.raceSpeed||E.vma*(rp[0]+rp[1])/2; dur=Math.round(raceKm()/sp*60+dpMin14(d.run))+30; }
      dur=Math.max(15,Math.round(dur));
      const desc=[]; if(d.run){ for(const b of d.run.blocks) desc.push("– "+blockTxt(b,d.kind)); if(d.run.note) desc.push(d.run.note); }
      if(d.renfo){ desc.push(d.renfo.t+" ("+d.renfo.m+") :"); for(const r of d.renfo.rows) desc.push("– "+r[0]+(r[1]?" ("+r[1]+")":"")); }
      desc.push("Objectif du jour : "+fmt0(d.kcal)+" kcal · protéines "+d.P+" g · glucides "+d.C+" g · lipides "+d.F+" g"+(d.def>15?" (déficit "+fmt0(d.def)+" kcal)":""));
      desc.push("Semaine "+w+" · "+phLab(wk.phase)+" · Pacebook");
      L.push("BEGIN:VEVENT","UID:carnet-"+dt+"@plan-course","DTSTAMP:"+stamp,"SEQUENCE:"+seq,"DTSTART:"+icsLocal(dt,start),"DTEND:"+icsLocal(dt,start+dur),
        "SUMMARY:"+icsEsc(sessTitle(d,E.vma)),"DESCRIPTION:"+icsEsc(desc.join("\n")),"CATEGORIES:"+icsEsc(SPORT_CAT[P.sport]||"Course à pied"),"TRANSP:OPAQUE");
      if(o.alarm==="1h"||o.alarm==="eve"){ const ah= o.alarm==="1h"? 60 : start+240;   // veille à 20 h : 4 h avant minuit + l'heure de la séance
        L.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEsc(sessTitle(d,E.vma)),"TRIGGER:-PT"+Math.floor(ah/60)+"H"+(ah%60?(ah%60)+"M":""),"END:VALARM"); }
      L.push("END:VEVENT"); n++; } }
  // dates exportées hors du plan actuel (plan raccourci ou déplacé) : annulées aussi, seulement sur la période choisie
  const w0=one? isoOf(one.w,one.i) : o.period==="week"&&plan[state.week-1]? isoOf(state.week,0) : tdy, w1=one? w0 : o.period==="week"? addDays(w0,6) : "9999-12-31";
  for(const dt of Object.keys(prev).sort()) if(!had.has(dt)&&dt>=w0&&dt<=w1){ const i=(new Date(dt+"T12:00:00").getDay()+6)%7; cancel(dt,(i>=5?o.we:o.wd)??(i>=5?540:1080)); }
  L.push("END:VCALENDAR");
  const commit=()=>{ const m={...prev}; for(const dt of had) delete m[dt]; for(const dt of sess) m[dt]=1; icsxSave(m); try{ localStorage.setItem("carnet.icsseq",String(seq)); }catch(e){} };
  return {text:L.map(icsFold).join("\r\n")+"\r\n",n,nc,commit};
}
const CRC_T=(()=>{ const t=new Uint32Array(256); for(let k=0;k<256;k++){ let c=k; for(let j=0;j<8;j++) c= c&1? 0xEDB88320^(c>>>1) : c>>>1; t[k]=c>>>0; } return t; })();
function crc32(u){ let c=0xFFFFFFFF; for(let i=0;i<u.length;i++) c=CRC_T[(c^u[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
// zip « stored » (méthode 0) d'un seul fichier : en-tête local, données, répertoire central, fin de répertoire
function zipStored(name,data){
  const fn=new TextEncoder().encode(name), crc=crc32(data), t=new Date(), sz=data.length;
  const dT=(t.getHours()<<11)|(t.getMinutes()<<5)|(t.getSeconds()>>1), dD=((Math.max(1980,t.getFullYear())-1980)<<9)|((t.getMonth()+1)<<5)|t.getDate();
  const lh=new DataView(new ArrayBuffer(30)); [[0,0x04034b50,4],[4,10,2],[6,0,2],[8,0,2],[10,dT,2],[12,dD,2],[14,crc,4],[18,sz,4],[22,sz,4],[26,fn.length,2],[28,0,2]].forEach(([o,v,b])=>b===4?lh.setUint32(o,v,true):lh.setUint16(o,v,true));
  const ch=new DataView(new ArrayBuffer(46)); [[0,0x02014b50,4],[4,20,2],[6,10,2],[8,0,2],[10,0,2],[12,dT,2],[14,dD,2],[16,crc,4],[20,sz,4],[24,sz,4],[28,fn.length,2],[30,0,2],[32,0,2],[34,0,2],[36,0,2],[38,0,4],[42,0,4]].forEach(([o,v,b])=>b===4?ch.setUint32(o,v,true):ch.setUint16(o,v,true));
  const cdOff=30+fn.length+sz, cdSz=46+fn.length;
  const eo=new DataView(new ArrayBuffer(22)); [[0,0x06054b50,4],[4,0,2],[6,0,2],[8,1,2],[10,1,2],[12,cdSz,4],[16,cdOff,4],[20,0,2]].forEach(([o,v,b])=>b===4?eo.setUint32(o,v,true):eo.setUint16(o,v,true));
  const out=new Uint8Array(cdOff+cdSz+22); let k=0; for(const part of [new Uint8Array(lh.buffer),fn,data,new Uint8Array(ch.buffer),fn,new Uint8Array(eo.buffer)]){ out.set(part,k); k+=part.length; }
  return out;
}
function icsPrefs(){ let o={}; try{ o=JSON.parse(localStorage.getItem("carnet.ics")||"{}")||{}; }catch(e){} return {period:o.period==="week"?"week":"all",wd:typeof o.wd==="string"&&hm(o.wd)!=null?o.wd:"18:00",we:typeof o.we==="string"&&hm(o.we)!=null?o.we:"09:00",alarm:["none","1h","eve"].includes(o.alarm)?o.alarm:"none"}; }
function openExport(btn,one){
  if(one) return openExportOne(btn,one);
  const o=icsPrefs(), seg=(name,opts,val,lab)=>`<div class="field"><span class="lbl" id="lb-${name}">${lab}</span><div class="seg" role="radiogroup" aria-labelledby="lb-${name}">${opts.map(([v,t])=>`<label><input type="radio" name="${name}" value="${v}"${v===val?" checked":""}><span>${t}</span></label>`).join("")}</div></div>`;
  openSheet({title:"Exporter vers Calendrier",opener:btn,html:`<p class="note">Un événement par séance (rien les jours de repos), avec la durée estimée, les blocs, les allures et les calories du jour. Réimporter remplace les mêmes jours.</p>
    ${seg("icsP",[["week","Semaine "+state.week],["all","D'aujourd'hui à la fin"]],o.period,"Période")}
    <div class="row"><div class="field"><label for="icsWd">Heure en semaine</label><input type="time" id="icsWd" value="${esc(o.wd)}" step="300"></div><div class="field"><label for="icsWe">Heure le week-end</label><input type="time" id="icsWe" value="${esc(o.we)}" step="300"></div></div>
    ${seg("icsA",[["none","Aucun"],["1h","1 h avant"],["eve","La veille, 20 h"]],o.alarm,"Rappel")}
    <div class="alerts msg" id="icsMsg" role="status" aria-live="polite"></div>`,
    foot:`<button class="btn" type="button" id="icsGo" data-first>Exporter le fichier</button>`,
    onReady:sh=>{ sh.querySelector("#icsGo").addEventListener("click",async()=>{
      const pick=n=>{ const r=sh.querySelector(`input[name="${n}"]:checked`); return r?r.value:null; };
      const q={period:pick("icsP"),wd:sh.querySelector("#icsWd").value,we:sh.querySelector("#icsWe").value,alarm:pick("icsA")};
      try{ localStorage.setItem("carnet.ics",JSON.stringify(q)); }catch(e){}
      const msg=sh.querySelector("#icsMsg"), r=buildIcs({period:q.period,wd:hm(q.wd),we:hm(q.we),alarm:q.alarm});
      if(!r.n){ msg.innerHTML=`<div class="alert warn">Aucune séance à exporter sur cette période.</div>`; return; }
      if(!dlCap){ msg.innerHTML=`<div class="alert warn">Export indisponible ici.</div>`; return; }
      msg.innerHTML="";
      try{ await dlCap.save({filename:"plan-course.zip",data:zipStored("plan-course.ics",new TextEncoder().encode(r.text))}); r.commit();
        msg.innerHTML=`<div class="alert ok"><b>${r.n} séance${r.n>1?"s":""} exportée${r.n>1?"s":""}${r.nc?", "+r.nc+" jour"+(r.nc>1?"s":"")+" sans séance depuis ton dernier export (annulé"+(r.nc>1?"s":"")+" dans Calendrier)":""}.</b> Sur iPhone : ouvre le fichier dans Fichiers, touche le zip puis plan-course.ics → Ajouter tout. Sur Mac : double-clique.</div>`; }
      catch(e){ const c=e&&e.code; if(c==="declined") return;
        msg.innerHTML=`<div class="alert warn">${c==="rate_limited"?"Une demande d'enregistrement est déjà ouverte : réessaie dans un instant.":"Export indisponible ici."}</div>`; }
    }); }});
}

// une seule séance : même UID par date que l'export complet (pas de doublon), fichier seance-AAAA-MM-JJ.zip
function openExportOne(btn,one){
  const wk=plan[one.w-1], d=wk&&dayFuel(P,E,wk).days[one.i], dt=isoOf(one.w,one.i); if(!d||!hasSession(d)||!dt) return;
  const o=icsPrefs(), we=one.i>=5, tv=we?o.we:o.wd, dl=longDate(dt);
  openSheet({title:"Ajouter à Calendrier",opener:btn,html:`<p class="note"><b>${esc(sessTitle(d,E.vma))}</b><br>${esc(dl.charAt(0).toUpperCase()+dl.slice(1))} · un seul événement. Si cette séance a déjà été exportée, elle est remplacée.</p>
    <div class="field"><label for="icsOne">Heure ${we?"(week-end)":"(semaine)"}</label><input type="time" id="icsOne" value="${esc(tv)}" step="300"></div>
    <div class="field"><span class="lbl" id="lb-icsA1">Rappel</span><div class="seg" role="radiogroup" aria-labelledby="lb-icsA1">${[["none","Aucun"],["1h","1 h avant"],["eve","La veille, 20 h"]].map(([v,t])=>`<label><input type="radio" name="icsA1" value="${v}"${v===o.alarm?" checked":""}><span>${t}</span></label>`).join("")}</div></div>
    <div class="alerts msg" id="icsMsg" role="status" aria-live="polite"></div>`,
    foot:`<button class="btn" type="button" id="icsGo1" data-first>Exporter la séance</button>`,
    onReady:sh=>{ sh.querySelector("#icsGo1").addEventListener("click",async()=>{
      const t=sh.querySelector("#icsOne").value, r0=sh.querySelector('input[name="icsA1"]:checked'), alarm=r0?r0.value:"none", msg=sh.querySelector("#icsMsg");
      if(hm(t)==null){ msg.innerHTML=`<div class="alert warn">Choisis une heure.</div>`; return; }
      const q={...o,alarm,[we?"we":"wd"]:t};
      if(!dlCap){ msg.innerHTML=`<div class="alert warn">Export indisponible ici.</div>`; return; }
      const r=buildIcs({one,wd:hm(q.wd),we:hm(q.we),alarm}); if(!r.n){ msg.innerHTML=`<div class="alert warn">Aucune séance à exporter ce jour-là.</div>`; return; }
      msg.innerHTML="";
      try{ await dlCap.save({filename:"seance-"+dt+".zip",data:zipStored("seance-"+dt+".ics",new TextEncoder().encode(r.text))}); r.commit();
        msg.innerHTML=`<div class="alert ok"><b>Séance du ${esc(dl)} exportée.</b> Sur iPhone : ouvre le fichier dans Fichiers, touche le zip puis le fichier .ics → Ajouter. Sur Mac : double-clique.</div>`; }
      catch(e){ const c=e&&e.code; if(c==="declined") return;
        msg.innerHTML=`<div class="alert warn">${c==="rate_limited"?"Une demande d'enregistrement est déjà ouverte : réessaie dans un instant.":"Export indisponible ici."}</div>`; }
    }); }});
}

/* minuteur de séance guidé */
let timerEl=null, tm=null, wakeL=null, actx=null;
function timerSteps(run,kind){
  const st=[], tap=onTapis(P,kind);
  for(const b of run.blocks){
    const pace= b.eff? b.eff+hrTxt(b) : b.z!=="walk"&&!b.noPace&&b.lo&&!b.race? (tap?kmh(E.vma,b.lo,b.hi):paceRangeTxt(E.vma,b.lo,b.hi)) : "";
    let iv=b.iv; if(!iv&&!b.min){ const v=stridesIv(b); if(v) iv={...v,onL:"Ligne droite, rapide et relâchée",offL:"Récup. en marchant"}; }
    const z= b.z==="walk"? "rest" : b.z;
    if(iv){ for(let k=1;k<=iv.n;k++){ st.push({l:iv.onL,n:k+"/"+iv.n,sec:Math.max(5,Math.round(iv.on)),z,pace}); if(iv.off&&(k<iv.n||iv.offLast)) st.push({l:iv.offL,n:k+"/"+iv.n,sec:Math.round(iv.off),z:"rest",pace:""}); } }
    else if(b.min>0) st.push({l:b.l,n:"",sec:Math.round(b.min*60),z,pace});
  }
  return st;
}
const mmss=s=>{ s=Math.max(0,Math.ceil(s)); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return (h?h+":"+pad2(m):m)+":"+pad2(x); };
async function lockOn(){ try{ if(navigator.wakeLock&&!wakeL){ wakeL=await navigator.wakeLock.request("screen"); wakeL.addEventListener("release",()=>{ wakeL=null; }); } }catch(e){ wakeL=null; } }
function lockOff(){ try{ if(wakeL) wakeL.release(); }catch(e){} wakeL=null; }
function cue(){ try{ if(navigator.vibrate) navigator.vibrate([180,90,180]); }catch(e){}
  if(tm&&tm.beep&&actx){ try{ const o=actx.createOscillator(), g=actx.createGain(); o.frequency.value=880; g.gain.setValueAtTime(.0001,actx.currentTime); g.gain.exponentialRampToValueAtTime(.25,actx.currentTime+.02); g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+.25); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime+.3); }catch(e){} } }
function openTimer(w,i,opener){
  const d=plan[w-1]&&plan[w-1].days[i]; if(!d||!d.run||d.kind==="race") return;
  const steps=timerSteps(d.run,d.kind); if(!steps.length) return;
  let beep=false; try{ beep=localStorage.getItem("carnet.bip")==="1"; }catch(e){}
  tm={steps,idx:0,left:steps[0].sec*1000,run:false,endAt:0,w,i,date:isoOf(w,i),beep,opener:opener||document.activeElement,done:false,iv:null};
  const el=document.createElement("div"); el.className="timer"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); el.setAttribute("aria-labelledby","tmT");
  el.innerHTML=`<div class="tm-top"><b id="tmT">${esc(d.run.title)} · ${DAYS[i].toLowerCase()}</b><button class="btn ghost sm" type="button" id="tmX">Fermer</button></div>
  <div class="tm-c"><div class="tm-n" id="tmN"></div><div class="tm-step" id="tmS"></div><div class="tm-time" id="tmTime" role="timer" aria-live="off"></div><div class="tm-sub" id="tmP"></div>
  <div class="tm-bar" aria-hidden="true"><i id="tmBar"></i></div><div class="tm-next" id="tmNx"></div>
  <div class="tm-ctrl"><button class="btn ghost" type="button" id="tmPrev" aria-label="Bloc précédent">‹</button><button class="btn" type="button" id="tmPlay">Démarrer</button><button class="btn ghost" type="button" id="tmNext" aria-label="Bloc suivant">›</button></div>
  <label class="tm-opt"><input type="checkbox" id="tmBeep"${beep?" checked":""}> Bip aux changements de bloc</label><p class="sr-only" id="tmLive" aria-live="polite"></p></div>`;
  document.body.appendChild(el); timerEl=el; document.documentElement.style.overflow="hidden";
  el.querySelector("#tmX").addEventListener("click",closeTimer);
  el.querySelector("#tmPlay").addEventListener("click",()=>{ if(tm.done){ const {w,i,date}=tm, can=date<=todayIso(); closeTimer(); if(can){ if(state.week!==w) goWeek(w); if(markOf(w,i)!=="done") setDone(w,i,"done"); const f=$(`#days [data-done="${i}"]`); if(f) f.focus({preventScroll:true}); } return; } tmToggle(); });
  el.querySelector("#tmNext").addEventListener("click",()=>tmGo(tm.idx+1,true));
  el.querySelector("#tmPrev").addEventListener("click",()=>tmGo(Math.max(0,tm.idx-1),true));
  el.querySelector("#tmBeep").addEventListener("change",e=>{ tm.beep=e.target.checked; try{ localStorage.setItem("carnet.bip",tm.beep?"1":"0"); }catch(_){} if(tm.beep) audioOn(); });
  el.addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.preventDefault(); closeTimer(); } else if(e.key==="Tab") trapTab(e,el); else if(e.key===" "&&e.target.tagName!=="BUTTON"&&e.target.tagName!=="INPUT"){ e.preventDefault(); tmToggle(); } });
  tmDraw(true); el.querySelector("#tmPlay").focus();
  tm.iv=setInterval(tmTick,250);
}
function audioOn(){ try{ if(!actx){ const A=window.AudioContext||window.webkitAudioContext; if(A) actx=new A(); } if(actx&&actx.state==="suspended") actx.resume(); }catch(e){} }
function tmToggle(){ if(!tm||tm.done) return; tm.run=!tm.run;
  if(tm.run){ tm.endAt=Date.now()+tm.left; lockOn(); if(tm.beep) audioOn(); } else { tm.left=Math.max(0,tm.endAt-Date.now()); lockOff(); }
  tmDraw(); }
function tmGo(k,manual){
  if(!tm) return;
  if(k>=tm.steps.length){ tm.done=true; tm.run=false; tm.left=0; lockOff(); cue(); tmDraw(true); return; }
  tm.idx=k; tm.done=false; tm.left=tm.steps[k].sec*1000; if(tm.run) tm.endAt=Date.now()+tm.left; if(!manual||tm.run) cue(); tmDraw(true);
}
function tmTick(){ if(!tm||!tm.run) return; const left=tm.endAt-Date.now(); if(left<=0){ tmGo(tm.idx+1); return; } tm.left=left; tmDraw(); }
function tmDraw(stepChanged){
  if(!timerEl||!tm) return; const s=tm.steps[tm.idx], q=id=>timerEl.querySelector(id);
  const tot=tm.steps.reduce((a,x)=>a+x.sec,0), doneS=tm.steps.slice(0,tm.idx).reduce((a,x)=>a+x.sec,0)+(s.sec-tm.left/1000);
  timerEl.className="timer "+(tm.done?"z1":s.z);
  setT(q("#tmN"), tm.done? "Bravo" : "Bloc "+(tm.idx+1)+" sur "+tm.steps.length+(s.n?" · répétition "+s.n:""));
  setT(q("#tmS"), tm.done? "Séance terminée" : s.l);
  setT(q("#tmTime"), mmss(tm.done?0:tm.left/1000));
  setT(q("#tmP"), tm.done? "Temps prévu : "+mmss(tot) : s.pace);
  q("#tmBar").style.width=Math.min(100,(tm.done?1:doneS/tot)*100)+"%";
  const nx=tm.steps[tm.idx+1]; setT(q("#tmNx"), tm.done? "" : nx? "Ensuite : "+nx.l+" · "+mmss(nx.sec) : "Dernier bloc");
  const pl=q("#tmPlay"); setT(pl, tm.done? (tm.date<=todayIso()?"Marquer comme faite":"Fermer") : tm.run? "Pause" : (tm.idx||tm.left<s.sec*1000? "Reprendre":"Démarrer"));
  if(stepChanged) setT(q("#tmLive"), tm.done? "Séance terminée." : "Bloc "+(tm.idx+1)+" : "+s.l+", "+mmss(s.sec)+(s.pace?", "+s.pace:"")+".");
}
function closeTimer(){ if(!tm) return; clearInterval(tm.iv); lockOff(); const o=tm.opener; tm=null; if(timerEl) timerEl.remove(); timerEl=null; if(!sheetEl) document.documentElement.style.overflow=""; if(o&&document.contains(o)) o.focus({preventScroll:true}); else $("#weekTitle").focus({preventScroll:true}); }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&tm&&tm.run) lockOn(); });

/* nouveautés : journal des versions, feuille « Quoi de neuf » ; les nouvelles versions sont aussi dans le panneau Notifications */
const APP_V=15;
const CHANGELOG=[
  {v:15,t:"Un profil mieux rangé et des imports plus robustes",items:["Ton profil est mieux rangé : l'objectif, tes données, tes entraînements et ta nutrition sont dans l'onglet Profil, en sections qui se replient et gardent un résumé visible. Le bilan chiffré (calories, déficit, poids visé) y est aussi.", "L'écran Semaine ne garde que le quotidien : le plan de la semaine, le jour, la nutrition du jour et la prochaine séance.", "Import des stats plus robuste : les fichiers piégés ou énormes ne figent plus l'écran, et « Annuler » répond tout de suite.", "Une même séance (date, type, durée, heure de début, distance) n'est jamais importée deux fois, et deux séances le même jour restent deux séances.", "Les sports sans course démarrent plus prudemment : la première semaine suit les heures de sport par semaine que tu déclares.", "Plans mieux dosés : en trail, le dénivelé monte de 10 % au plus par semaine (de 30 m au plus sous 100 m) et baisse en semaine allégée ; en VTT et remise en forme, les heures par semaine sont respectées (la semaine 2 part de la charge réellement placée en semaine 1, +10 % au plus ; une semaine allégée est plus légère que la précédente, ou égale au plancher) ; en force, le RPE ne saute plus de plus de 10 % au changement de phase, et la durée affichée correspond à celle du minuteur. Pour le VTT, la force et la remise en forme, le jour de l'objectif et sa veille sont à l'équilibre calorique (la course à pied reste comme avant). Un rappel discret apparaît si la première semaine de force dépasse 3 h.", "Nouveau, si ton site l'active : l'onglet Coach, un assistant à qui poser des questions. Rien n'est envoyé sans ton accord séparé, tu choisis si ton profil, ton ressenti ou tes stats sont joints (décoché par défaut), et il ne remplace pas un avis médical."]},
  {v:14,t:"Plusieurs sports, ressenti après séance, import de tes stats",items:["Choisis ton sport principal : course à pied, trail, VTT, haltérophilie et force, ou remise en forme générale. Le plan, les séances, le minuteur, le calendrier et les calories s'adaptent.","Trail : chaque sortie a un dénivelé positif visé, qui monte de 10 % au plus d'une semaine à l'autre.","VTT : durées en minutes, sortie longue en heures, endurance, tempo, intervalles, côtes et technique.","Haltérophilie et force : 3 à 5 séances par semaine, charge pilotée à l'effort perçu (RPE), semaine allégée toutes les 4 semaines, minuteur de séries et de repos.","Après une séance, touche « Ressenti » : effort perçu, forme, douleur et note. Tes tendances sur 4 semaines sont dans Suivi.","Douleur forte, ou deux séances d'affilée à RPE 9 ou plus : Pacebook te conseille du repos et un avis médical, sans jamais changer ton plan à ta place.","Importe tes séances, tes pesées et ta FC de repos depuis Apple Santé (export.zip ou export.xml) ou Polar Flow (JSON, CSV, TCX) : tout est lu sur ton appareil, avec un aperçu avant d'importer.","Dans Suivi : tes activités importées et la comparaison prévu et réalisé de la semaine. Elles ne changent jamais tes calories."]},
  {v:13,t:"Accueil, assistant, compte et fenêtres uniformes",items:["Une page d'accueil présente Pacebook : touche « Accueil » pour y revenir à tout moment.","Un assistant en 5 étapes crée ton plan : toi, niveau et objectif, semaine type, déficit prudent, résumé.","Un nouvel écran « Compte » (bouton en haut) montre l'état de ta connexion, et permet d'exporter, d'importer ou d'effacer tes données.","Toutes les fenêtres ont maintenant la même taille et la même présentation.","Sécurité renforcée : les données importées ou venues du compte sont vérifiées avant d'être utilisées."]},
  {v:12,t:"Glisser-déposer, export en un geste, tuiles compactes",items:["Déplace une séance en la faisant glisser sur un autre jour : appui long sur la tuile, ou la poignée ⋮⋮. Le bouton « Déplacer » reste là.","« Exporter vers Calendrier » est maintenant en haut de la semaine.","L'icône Calendrier en haut de chaque séance l'ajoute seule à Calendrier.","Tuiles compactes : l'essentiel d'abord, « Voir plus » pour les blocs, les allures, le renfo et la nutrition. La tuile du jour est dépliée.","« Tout déplier » ou « Tout replier » en haut de la semaine ; ton choix est gardé sur cet appareil."]},
  {v:11,t:"Calendrier, déplacements et minuteur",items:["Exporte ton plan vers Calendrier (iPhone, iPad, Mac) : heure des séances, durée estimée, rappel au choix.","Déplace une séance sur un autre jour de la semaine : l'outil te prévient si deux séances dures se suivent, et les calories suivent.","Coche tes séances « Faite » ou « Pas faite » : anneau de la semaine, et ta régularité dans Suivi.","« Prochaine séance » en haut de la semaine, avec accès direct.","Minuteur guidé plein écran : blocs et répétitions, vibration, bip au choix, écran gardé allumé.","Copie ta semaine pour Notes ou Messages.","Dans Suivi, « Séances faites » se remplit avec les séances cochées."]},
  {v:10,t:"Début aujourd'hui, plans jusqu'à un an",items:["Le plan démarre le jour que tu choisis, même en milieu de semaine, et la première séance est toujours facile.","Avec une course lointaine, plan jusqu'à 52 semaines : préparation générale d'abord, puis préparation à ta course.","Alerte si tu reprends un plan commencé il y a longtemps, avec « Recommencer aujourd'hui »."]},
  {v:9,t:"Sécurité, calculs et accessibilité",items:["Planchers de calories, aucun déficit avant 18 ans ou sous un IMC de 18,5.","Navigation au clavier, contrastes renforcés, lecteurs d'écran.","« Annuler » après un retrait dans Suivi."]},
  {v:8,t:"Nutrition plus lisible",items:["Protéines, glucides et lipides en grammes et en barre pour chaque jour.","Dépense du jour détaillée : base, course et renfo."]},
  {v:7,t:"Date de course",items:["Le plan se cale sur la date de ta course : affûtage et semaine de course au bon moment."]}
];
let newsFrom=APP_V;   // dernière version vue avant cette visite
function seenV(){ let a=0; try{ a=+localStorage.getItem("carnet.vu")||0; }catch(e){} return Math.max(a,+state.seen||0); }
function markSeen(save){ try{ localStorage.setItem("carnet.vu",String(APP_V)); }catch(e){} if((+state.seen||0)<APP_V){ state.seen=APP_V; if(save) persist(); } }
function openNews(opener){
  const sec=c=>`<section><h4>Version ${c.v} · ${esc(c.t)}${c.v>newsFrom?' <span class="chip race">Nouveau</span>':""}</h4><ul>${c.items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`;
  const nw=CHANGELOG.filter(c=>c.v>newsFrom), old=CHANGELOG.filter(c=>c.v<=newsFrom);
  openSheet({title:nw.length?"Nouveautés depuis ta dernière visite":"Quoi de neuf",opener,html:`<div class="cl">${nw.map(sec).join("")}${old.length?(nw.length?`<details class="more"><summary>Versions précédentes</summary><div class="cl">${old.map(sec).join("")}</div></details>`:old.map(sec).join("")):""}</div>`});
  markSeen(true);
}
document.querySelectorAll("[data-news]").forEach(b=>b.addEventListener("click",()=>openNews(b)));
/* notifications passives : un bouton à côté du Compte ouvre un panneau ; aucun point, compteur, badge ni animation pour signaler du nouveau */
const notif={week:null,plan:[],news:false};   // news : nouveautés montrées pendant cette visite (gardées après markSeen)
function notifHtml(){
  const nw=notif.news||seenV()<APP_V? CHANGELOG.filter(c=>c.v>newsFrom) : [], wk=notif.week, sec=(t,body)=>`<section class="nt-s"><h4>${t}</h4>${body}</section>`, out=[];
  if(wk&&wk.items.length) out.push(sec("Semaine "+wk.w,`<div class="alerts">${wk.items.join("")}</div>`));
  if(notif.plan.length) out.push(sec("Ton plan",`<div class="alerts">${notif.plan.join("")}</div>`));
  if(nw.length){ const n=nw.reduce((a,c)=>a+c.items.length,0);
    out.push(sec("Nouveautés",`<div class="cl">${nw.map(c=>`<section><h5>Version ${c.v} · ${esc(c.t)}</h5><ul>${c.items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`).join("")}</div><p class="note">${n} nouveauté${n>1?"s":""} depuis ta dernière visite.</p>`)); }
  return (out.length? out.join("") : `<p class="nt-empty">Rien de nouveau pour l'instant.</p>`)+`<button class="linkbtn" type="button" data-nt-news>Toutes les versions de Pacebook</button>`;
}
const notifSheet=()=>sheetEl&&sheetEl.querySelector('.sheet[data-kind="notif"]');
// panneau ouvert : son contenu suit la semaine, le plan et le profil (synchro, action faite depuis le panneau)
function refreshNotif(){ const sh=notifSheet(); if(!sh) return; const b=sh.querySelector(".sh-b"), hadF=b.contains(document.activeElement);
  b.innerHTML=notifHtml(); if(hadF) sh.querySelector(".sh-x").focus({preventScroll:true}); }
function openNotif(opener){
  if(seenV()<APP_V&&CHANGELOG.some(c=>c.v>newsFrom)) notif.news=true;
  openSheet({title:"Notifications",kind:"notif",opener,html:notifHtml(),onReady:sh=>{
    sh.querySelector(".sh-b").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
      if(b.matches("[data-nt-news]")){ openNews(opener); return; }
      // actions des alertes : elles changent le plan ; le panneau se ferme et la semaine reprend le focus
      if(b.id==="restartPlan"){ closeSheet(true); regenPlan(false); $("#weekTitle").focus({preventScroll:true}); }
      else if(b.id==="followedPlan"){ closeSheet(true); followed=realStart(); try{localStorage.setItem("carnet.suivi",followed);}catch(e){} recompute(); $("#weekTitle").focus({preventScroll:true}); }
      else if(b.matches("[data-safedate]")){ closeSheet(true); setTimeout(()=>$("#weekTitle").focus({preventScroll:true}),0); } }); }});
  if(hasData()) markSeen(true);   // données d'exemple sans action : rien n'est écrit (voir showApp)
}
document.querySelectorAll("[data-notif]").forEach(b=>b.addEventListener("click",()=>openNotif(b)));
/* ---------- v14 : ressenti après séance, activités importées, FC de repos ---------- */
const PAIN_ZONES={dos:"Dos",epaule:"Épaule",coude:"Coude",poignet:"Poignet",hanche:"Hanche",cuisse:"Cuisse",genou:"Genou",mollet:"Mollet",achille:"Tendon d'Achille",cheville:"Cheville",pied:"Pied",autre:"Autre zone"};
const RPE_LAB=["","1 · très facile","2 · facile","3 · modéré","4 · un peu dur","5 · dur","6 · assez dur","7 · très dur","8 · intense","9 · presque maximal","10 · maximal"];
const FEEL_MAX=500, ACT_MAX=1500, RHR_MAX=260;
// texte libre : sans caractères de contrôle ni de direction, espaces réduits, borné ; il n'est jamais lu comme du HTML (textContent)
const cleanText=(s,n)=> typeof s!=="string"? "" : s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const atOf=v=>{ const a=+v.at; return isFinite(a)&&a>0? Math.min(a,Date.now()) : 0; };
// ressentis : {date prévue de la séance: {rpe 1-10, mood 1-5 (0 = non noté), pain 0|1|2, zone, note, sig, at}} ou {x:1, at} (effacé)
function cleanFeel(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  const out=[]; for(const [k,v] of Object.entries(o).slice(0,3000)){ if(!okIso(k)||k<"2020-01-01"||k>"2100-01-01"||!v||typeof v!=="object"||Array.isArray(v)) continue;
    const at=atOf(v);
    if(v.x===1||v.x===true){ if(at) out.push([k,{x:1,at}]); continue; }
    const r=numIn(v.rpe,1,10), m=numIn(v.mood,1,5), rpe=r==null?0:Math.round(r), mood=m==null?0:Math.round(m), pain=+v.pain===2?2:+v.pain===1?1:0;
    const zone=pain&&typeof v.zone==="string"&&Object.hasOwn(PAIN_ZONES,v.zone)? v.zone : "", note=cleanText(v.note,200);
    if(!rpe&&!mood&&!pain&&!note) continue;
    out.push([k,{rpe,mood,pain,zone,note,sig:String(v.sig??"").replace(/[<>"'`&]/g,"").slice(0,160),at}]); }
  return Object.fromEntries(out.sort((a,b)=>a[0]<b[0]?1:-1).slice(0,FEEL_MAX)); }
// activités importées : {« date|type|minutes »: {date,type,min,km,kcal,fc,src,at}} ou {del:1, at} (retirée)
const ACT_KEY=/^\d{4}-\d{2}-\d{2}\|[a-z]{3,10}\|\d{1,4}\|\d{4}\|\d{1,5}$/;   // date|type|minutes|heure de début|distance en dixièmes de km
function cleanActs(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  const out=[]; for(const [k,v] of Object.entries(o).slice(0,8000)){ if(!v||typeof v!=="object"||Array.isArray(v)||!ACT_KEY.test(k)) continue;
    const [date,type,mn,hm]=k.split("|"), min=+mn; if(!okIso(date)||date<"2000-01-01"||date>"2100-01-01"||!Object.hasOwn(IMP14.TYPES,type)||!(min>=1&&min<=1440)) continue;
    const at=atOf(v);
    if(v.del===1||v.del===true){ if(at) out.push([k,{del:1,at}]); continue; }
    const km=numIn(v.km,0,500), kc=numIn(v.kcal,0,20000), fc=numIn(v.fc,30,230);
    out.push([k,{date,type,min,hm,km:km==null?0:Math.round(km*10)/10,kcal:kc==null?0:Math.round(kc),fc:fc==null?null:Math.round(fc),src:v.src==="polar"?"polar":"apple",at}]); }
  return Object.fromEntries(out.sort((a,b)=>a[0]<b[0]?1:-1).slice(0,ACT_MAX)); }
// FC de repos : {lundi de la semaine: {bpm, at}} ou {x:1, at}
function cleanRhr(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  const out=[]; for(const [k,v] of Object.entries(o).slice(0,2000)){ if(!okIso(k)||k<"2000-01-01"||k>"2100-01-01"||mondayOf(k)!==k||!v||typeof v!=="object"||Array.isArray(v)) continue;
    const at=atOf(v);
    if(v.x===1||v.x===true){ if(at) out.push([k,{x:1,at}]); continue; }
    const b=numIn(v.bpm,25,150); if(b==null) continue; out.push([k,{bpm:Math.round(b),at}]); }
  return Object.fromEntries(out.sort((a,b)=>a[0]<b[0]?1:-1).slice(0,RHR_MAX)); }
// ajustement du plan par l'IA : {p: {sig: empreinte du profil, at, cplx, resume, wk: {numéro de semaine: {f: but, c: conseil, q: [type|""], a: 0|1}}}} ou {p: {x:1, at}} (retiré)
function cleanAip(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {}; const v=o.p; if(!v||typeof v!=="object"||Array.isArray(v)) return {};
  const at=atOf(v); if(!at) return {}; if(v.x===1||v.x===true) return {p:{x:1,at}};
  const sig=typeof v.sig==="string"&&/^[0-9a-z]{1,12}$/.test(v.sig)? v.sig : ""; if(!sig) return {};
  const t=(x,m)=>typeof x==="string"? x.replace(/[\u0000-\u001f\u007f<>]/g,"").replace(/\s+/g," ").trim().slice(0,m) : "";
  const wk={}; if(v.wk&&typeof v.wk==="object"&&!Array.isArray(v.wk)) for(const [k,x] of Object.entries(v.wk).slice(0,60)){ if(!/^[1-9]\d?$/.test(k)||!x||typeof x!=="object"||Array.isArray(x)) continue;
    wk[k]={f:t(x.f,60),c:t(x.c,220),q:Array.isArray(x.q)? x.q.slice(0,3).map(q=>Object.hasOwn(SUBST,q)?q:"") : [],a:x.a===1||x.a===true?1:0,
    e:Array.isArray(x.e)? x.e.slice(0,7).map(q=>q==="lignes"||q==="cardio"?q:"") : [],l:x.l===1||x.l===true?1:0,r:Array.isArray(x.r)? x.r.slice(0,3).map(q=>q==="leger"?q:"") : []}; }
  return {p:{sig,at,cplx:["simple","standard","avance"].includes(v.cplx)?v.cplx:"standard",resume:t(v.resume,320),wk}}; }
const X14={feel:cleanFeel,acts:cleanActs,rhr:cleanRhr,aip:cleanAip,evr:cleanEvr};   // evr : résultats des séances de test
const x14Keys=Object.keys(X14);
const x14Clean=d=>{ const o={}; for(const k of x14Keys) o[k]=X14[k](d&&typeof d==="object"&&Object.hasOwn(d,k)? d[k] : undefined); return o; };
const x14Merge=(a,b)=>{ const o={}; for(const k of x14Keys) o[k]=mergeStamped(a&&typeof a==="object"?a[k]:undefined,b&&typeof b==="object"?b[k]:undefined,X14[k]); return o; };
const isGone=v=> !!v&&(v.x===1||v.del===1);
const liveOf=m=> Object.fromEntries(Object.entries(m||{}).filter(([k,v])=>!isGone(v)));
const liveX14=()=>{ const o={}; for(const k of x14Keys) o[k]=liveOf(X14[k](state[k])); return o; };
// import d'un fichier de données : ce qui n'y est plus reçoit une marque d'effacement horodatée (comme les coches et les déplacements)
function tomb14(d,r,now){ const o={}; for(const k of x14Keys){ const cur=mergeStamped(r&&r[k],state[k],X14[k]), m={...(d[k]||{})};
    for(const [kk,v] of Object.entries(cur)) if(!m[kk]&&!isGone(v)) m[kk]= k==="acts"? {del:1,at:now} : {x:1,at:now};
    o[k]=X14[k](m); }
  return o; }
const x14Sum=d=>{ const a=Object.keys(liveOf(d.acts)).length, f=Object.keys(liveOf(d.feel)).length, h=Object.keys(liveOf(d.rhr)).length;
  return a||f||h? " Il contient aussi "+[a?"<b>"+a+"</b> activité"+(a>1?"s":"")+" importée"+(a>1?"s":""):"",f?"<b>"+f+"</b> ressenti"+(f>1?"s":""):"",h?"<b>"+h+"</b> semaine"+(h>1?"s":"")+" de FC de repos":""].filter(Boolean).join(", ").replace(/, ([^,]*)$/," et $1")+"." : ""; };

/* ---------- ressenti ---------- */
function feelOf(w,i){ const mk=markKey(w,i); if(!mk||!mk.k) return null; const e=(state.feel||{})[mk.k]; return e&&!isGone(e)&&(!e.sig||e.sig===mk.sig)? e : null; }
function feelChip14(e){ return ` <span class="chip fl">Ressenti${e.rpe?" · RPE "+e.rpe:""}${e.pain===2?" · douleur forte":e.pain===1?" · douleur légère":""}</span>`; }
function feelBtn14(w,d,dIso,mk,dl){ if(!dIso||dIso>todayIso()||mk==="skip"||!hasSession(d)) return ""; const has=!!feelOf(w,d.i);
  return `<button class="cbtn fl" type="button" data-feel="${d.i}" aria-haspopup="dialog" aria-label="${has?"Modifier le ressenti":"Ressenti"} de la séance de ${dl}">${has?"Ressenti ✓":"Ressenti"}</button>`; }
// prochaine séance dure non cochée, à partir d'aujourd'hui (jamais la course elle-même)
function nextHard14(){ const tp=todayPos(), st=effStart(state.profile), tdy=todayIso(); let w0,i0;
  if(tp){ w0=tp.w; i0=tp.i; } else if(st&&st>tdy){ w0=1; i0=0; } else return null;
  for(let w=w0;w<=plan.length;w++){ const wk=plan[w-1]; for(let i=(w===w0?i0:0);i<7;i++){ const d=wk.days[i], dt=isoOf(w,i); if(!dt||dt<tdy||!d.run||!isHard(d)||d.kind==="race"||markOf(w,i)) continue; return {w,i,d,dt}; } }
  return null; }
const ZONE_LAB=z=> PAIN_ZONES[z]? PAIN_ZONES[z].toLowerCase() : "";
// garde-fous : douleur forte, ou RPE 9 et plus deux fois de suite, ou même douleur légère deux fois de suite. Des conseils seulement : le plan n'est jamais modifié sans toi.
function feelSafety14(){
  const tdy=todayIso(), f=state.feel||{}, items=[];
  for(const k of Object.keys(f)){ const v=f[k]; if(v&&!isGone(v)&&k<=tdy&&k>=addDays(tdy,-14)) items.push([k,v]); }
  items.sort((a,b)=>a[0]<b[0]?1:-1);
  const dd=k=>dfmt(new Date(k+"T12:00:00")), out={msgs:[],next:null,kinds:[]};
  const pain=items.find(([k,v])=>v.pain===2&&k>=addDays(tdy,-7));
  const rp=items.filter(([k,v])=>v.rpe>0), hi= rp.length>=2&&rp[0][1].rpe>=9&&rp[1][1].rpe>=9&&rp[0][0]>=addDays(tdy,-7)? rp : null;
  const light= !pain&&items.length>=2&&items[0][1].pain>=1&&items[1][1].pain>=1&&items[0][1].zone&&items[0][1].zone===items[1][1].zone&&items[0][0]>=addDays(tdy,-7)? items : null;
  if(!pain&&!hi&&!light) return out;
  out.next=nextHard14();
  const nx=out.next? " La prochaine séance dure est <b>"+esc(out.next.d.run.title)+"</b> ("+DAYS[out.next.i].toLowerCase()+" "+dfmt(weekDate(out.next.w,out.next.i))+") : ne la fais que si tu te sens bien, et plus légère (une répétition ou une série de moins, ou à allure facile). Le plan n'est pas modifié ; tu décides." : "";
  if(pain){ const z=ZONE_LAB(pain[1].zone); out.kinds.push("pain");
    out.msgs.push({c:"bad",h:`<b>Douleur forte notée le ${dd(pain[0])}${z?" ("+esc(z)+")":""}.</b> Mets cette zone au repos : pas de séance dure ni de charge qui la sollicite tant que la douleur n'a pas disparu. Si elle dure plus de 2 ou 3 jours, si elle réveille la nuit, si tu as un gonflement ou une douleur précise sur un os ou une articulation, demande l'avis d'un médecin ou d'un kinésithérapeute. Cet outil ne pose aucun diagnostic.${nx}`}); }
  if(hi){ out.kinds.push("rpe"); out.msgs.push({c:"warn",h:`<b>Deux séances d'affilée à RPE 9 ou plus</b> (le ${dd(hi[1][0])} et le ${dd(hi[0][0])}). Prends un jour de repos complet, dors bien et mange à ta faim. Si cette fatigue dure plus d'une semaine, parles-en à un médecin ou à ton entraîneur.${nx}`}); }
  if(light){ const z=ZONE_LAB(light[0][1].zone); out.kinds.push("light"); out.msgs.push({c:"warn",h:`<b>Une douleur légère${z?" ("+esc(z)+")":""} est revenue deux séances de suite.</b> Allège ou saute la prochaine séance qui la sollicite, et fais-la surveiller si elle persiste : une douleur qui revient est un signal à ne pas ignorer. Cet outil ne pose aucun diagnostic.${nx}`}); }
  return out; }
const lighterSet14=()=>{ const s=feelSafety14(); return s.msgs.length&&s.next? new Set([s.next.dt]) : new Set(); };
function feelAlerts14(wk,tp){ const s=feelSafety14(); if(!s.msgs.length) return []; if(!((tp&&tp.w===wk.w)||(s.next&&s.next.w===wk.w))) return []; return s.msgs.map(m=>`<div class="alert ${m.c}" role="note">${m.h}</div>`); }

/* ---------- séances de test : résultat noté sur la carte, estimation, mise à jour du plan seulement sur demande ---------- */
// résultats : {date de la séance: {t, v, m, v2, T, rpe, ap, sig, at}} ou {x:1, at} (effacé) ; enregistrement horodaté (X14, fusion par mergeStamped)
// v : mètres (vma6), km (end, cont), secondes (end en 5 km, m="5k"), minutes (ref : durée ; deb : minutes de course continue) ; v2 : km du footing de référence ;
// T : durée du test au moment de la saisie ; ap : date de la mise à jour du plan avec ce résultat (0 : pas appliqué)
const EV_KEYS=["vma6","end","cont","ref","deb"], EV_V={vma6:[300,4000],end:[1,15],end5k:[600,3600],cont:[.5,12],ref:[5,180],deb:[0,60]};
function cleanEvr(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  const out=[]; for(const [k,v] of Object.entries(o)){ if(!okIso(k)||k<"2020-01-01"||k>"2100-01-01"||!v||typeof v!=="object"||Array.isArray(v)) continue;
    const at=atOf(v);
    if(v.x===1||v.x===true){ if(at) out.push([k,{x:1,at}]); continue; }
    const t=EV_KEYS.includes(v.t)? v.t : null; if(!t) continue; const m= t==="end"&&v.m==="5k"? "5k" : "";
    const b=EV_V[m? "end5k" : t], val=numIn(v.v,b[0],b[1]); if(val==null) continue;
    const r=numIn(v.rpe,1,10), v2= t==="ref"? numIn(v.v2,.5,40) : null, T=numIn(v.T,10,40), ap=numIn(v.ap,1,8.64e15);
    out.push([k,{t,v: t==="end"&&!m||t==="cont"? Math.round(val*100)/100 : Math.round(val),...(m?{m}:{}),...(v2!=null?{v2:Math.round(v2*100)/100}:{}),...(T!=null?{T:Math.round(T)}:{}),
      rpe:r==null?0:Math.round(r),ap:ap==null?0:Math.round(ap),sig:String(v.sig??"").replace(/[<>"'`&]/g,"").slice(0,160),at}]); }
  return Object.fromEntries(out.sort((a,b)=>a[0]<b[0]?1:-1).slice(0,60)); }
// résultat de la séance de test affichée (w, i) : même date (elle suit un déplacement) et même type de test
function evRec(w,i){ const wk=plan[w-1], d=wk&&wk.days[i], mk=markKey(w,i); if(!mk||!mk.k||!d||!d.run||!d.run.ev) return null;
  const e=(state.evr||{})[mk.k]; return e&&!isGone(e)&&e.t===d.run.ev.t? e : null; }
const evOf=(ev,e)=>({...ev,T:(e&&e.T)||ev.T||30});
// mise à jour possible : estimation valide et différente de ce que le plan utilise déjà
function evCanApply(r){ if(!r||r.err) return false; if(r.vma!=null) return Math.abs(r.vma-vmaOf(P).vma)>=.05; if(r.start!=null) return r.start>2&&r.start!==evDebStart(P.debRun); return false; }
const evDate=d=>new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
function evResTxt(ev,e){ const rp=e.rpe? ", effort "+e.rpe+"/10" : "";
  if(ev.t==="vma6") return fmt0(e.v)+" m en 6 min"+rp;
  if(ev.t==="end") return (e.m==="5k"? "5 km en "+mmss(e.v) : kmTxt(e.v)+" km en "+ev.T+" min")+rp;
  if(ev.t==="cont") return kmTxt(e.v)+" km en "+ev.T+" min"+rp;
  if(ev.t==="ref") return "Footing de "+fmt0(e.v)+" min"+(e.v2? " ("+kmTxt(e.v2)+" km)" : "")+rp;
  return fmt0(e.v)+" min de course sans t'arrêter"+rp; }
// écart de plus de 20 % avec la VMA utilisée : mise en garde (fatigue ou mauvaise mesure, ou référence actuelle trop basse)
function evGap(r){ if(!r||r.vma==null) return ""; const c=vmaOf(P).vma, g=(r.vma-c)/c; if(Math.abs(g)<=.2) return "";
  return "Écart de "+fmt0(Math.abs(g)*100)+" % avec ta VMA actuelle : "+(g<0? "une valeur bien plus basse peut venir de la fatigue, d'un parcours ou d'une mesure faussés." : "ta référence actuelle était peut-être trop basse, ou la mesure trop optimiste (GPS, parcours).")+" Vérifie ta mesure avant de mettre à jour ton plan."; }
// référence chrono 5 ou 10 km du profil : elle sera remplacée par la VMA du test
function evRepl(){ const v=vmaOf(P); return (P.ref==="5"||P.ref==="10")&&!v.estimated? "Ta référence actuelle ("+v.src.replace(/^ton /,"")+" : "+String(state.profile.refVal||"").trim()+") sera remplacée par cette VMA ; « Annuler » reste possible." : ""; }
const EV_SURE="Si tu n'es pas sûr de ta mesure, refais le test un autre jour.";
function evEstTxt(ev,e,r){ if(r.err) return "";
  if(r.vma!=null){ const c=vmaOf(P); return "VMA estimée : "+fmt1(r.vma)+" km/h (ton plan utilise "+fmt1(c.vma)+" km/h, d'après "+c.src+")."+(ev.t==="vma6"&&e.rpe&&e.rpe<8? " Effort noté sous 8/10 : si tu n'étais pas à fond, ta VMA est sans doute un peu plus haute." : ev.t==="end"&&e.rpe>=9? " Effort presque maximal : l'estimation peut être un peu haute, garde des allures prudentes." : ""); }
  if(r.start!=null) return r.start>2? "Point de départ possible : des fractions de "+r.start+" min de course (la moitié de ta plus longue période, 8 min au plus)." : "Ton plan part déjà de fractions de 1 à 2 min de course : il garde sa progression, rien à changer.";
  if(ev.t==="ref") return (e.rpe<=4? "Bonne allure facile : garde ce ressenti sur tes footings." : e.rpe<=6? "Un peu soutenu pour un footing facile : ralentis un peu la prochaine fois." : "Trop dur pour un footing facile : ralentis nettement, marche si besoin. Si ça se répète, note-le dans ton ressenti.")+(r.pace? " Allure moyenne : "+pace(r.pace)+"." : "");
  return ""; }
const EV_WHY={vma6:"ton résultat estime ta VMA et peut recalibrer tes allures.",end:"ton résultat estime ta VMA et peut recalibrer tes allures.",cont:"un test prudent, sans effort maximal : il estime une VMA basse, donc des allures prudentes.",ref:"il te donne ton repère d'allure facile.",deb:"tes minutes de course continue peuvent fixer le point de départ de ta progression course / marche."};
function evBox(w,d,dIso){ const ev=d.run.ev, e=evRec(w,d.i), dl=DAYS[d.i].toLowerCase(), can=!!dIso&&dIso<=todayIso();
  let h=`<div class="evb" role="group" aria-label="Séance de test, ${esc(dl)}"><p class="evh"><b>Séance de test</b> : ${esc(EV_WHY[ev.t])}</p>`;
  if(e){ const ev2=evOf(ev,e), r=evEst(ev2,e)||{}, t=evEstTxt(ev2,e,r);
    h+=`<p class="evr">Résultat : ${esc(evResTxt(ev2,e))}.${t?" "+esc(t):""}</p>`;
    if(r.err) h+=`<p class="evw" role="note">${esc(r.err)}</p>`;
    else if(e.ap&&!evCanApply(r)) h+=`<p class="evok">Plan mis à jour avec ce résultat le ${esc(evDate(e.ap))}.</p><button class="btn sm evap" type="button" disabled aria-disabled="true">Plan mis à jour</button>`;
    else if(evCanApply(r)){ const g=evGap(r), rp=r.vma!=null? evRepl() : "";
      if(g) h+=`<p class="evw" role="note">${esc(g)}</p>`;
      h+=`<p class="evx">${r.vma!=null? "Toutes tes allures seraient recalculées avec cette VMA, et la distance de certaines séances (footings et séances prévus en minutes) peut changer un peu ; la progression du plan reste la même." : "Tes séances course / marche partiraient de fractions plus longues ; la progression reste prudente et ton volume reste proche."}${rp?" "+esc(rp):""} ${esc(EV_SURE)} Rien ne change sans ton accord.</p><button class="btn sm evap" type="button" data-evap="${d.i}">Mettre à jour mon plan avec ce résultat</button>`; }
    else if(r.vma!=null||r.start!=null) h+=`<p class="evok">Ton plan utilise déjà cette valeur : rien à changer.</p>`;
    h+=`<button class="linkbtn" type="button" data-evr="${d.i}" aria-haspopup="dialog" aria-label="Modifier le résultat du test de ${esc(dl)}">Modifier le résultat</button>`; }
  else if(markOf(w,d.i)==="skip") h+=`<p class="evn">Séance notée « pas faite » : pas de résultat à noter. Décoche « Pas faite » si tu as fait le test.</p>`;
  else if(can) h+=`<button class="cbtn ev" type="button" data-evr="${d.i}" aria-haspopup="dialog" aria-label="Noter le résultat du test de ${esc(dl)}">Noter mon résultat</button>`;
  else h+=`<p class="evn">Après la séance, note ton résultat ici.</p>`;
  return h+`</div>`; }
// saisie du résultat : champs selon le test, valeurs bornées, résultat aberrant refusé (rien n'est enregistré)
function openEval(w,i,opener){
  const wk=plan[w-1], d=wk&&wk.days[i], mk=markKey(w,i); if(!d||!d.run||!d.run.ev||!mk||!mk.k) return;
  const has=evRec(w,i), ev=evOf(d.run.ev,has), t=ev.t, k5=t==="end"&&!!d.run.ev.k5, mode0= has&&has.m==="5k"? "5k" : "km";
  const needR= t!=="vma6"&&t!=="end", maxDeb=Math.max(1,Math.min(60,Math.round(sessionMin(d.run))));
  const rpeOpt=RPE_LAB.map((x,k)=> k? `<option value="${k}"${has&&has.rpe===k?" selected":""}>${esc(x)}</option>` : `<option value=""${has&&has.rpe?"":" selected"}>${needR?"Choisis…":"Non noté"}</option>`).join("");
  const val= has? (t==="end"&&has.m==="5k"? mmss(has.v) : String(has.v).replace(".",",")) : "";
  const kmB=f=>[EV_VMA[0]*f*ev.T/60,EV_VMA[1]*f*ev.T/60].map(x=>fmt1(x).replace(/,0$/,""));   // distance qui donne une VMA de 8 à 25 km/h
  const F={vma6:["Distance parcourue en 6 min (mètres)","numeric","ex. 1450","En mètres (une piste fait 400 m au tour) : de 800 à 2 500 m, soit une VMA de 8 à 25 km/h."],
    end:["Distance parcourue en "+ev.T+" min (km)","decimal","ex. 6,2","En km : de "+kmB(.87).join(" à ")+" km en "+ev.T+" min, soit une VMA de 8 à 25 km/h."],
    cont:["Distance parcourue en "+ev.T+" min (km)","decimal","ex. 4,5","En km, entre 0,5 et 12."],
    ref:["Durée du footing (minutes)","numeric","ex. 35","En minutes, entre 5 et 180."],
    deb:["Minutes de course sans t'arrêter","numeric","ex. 6","Ta plus longue période de course sans marcher, de 0 à "+maxDeb+" min."]}[t];
  const rad=(v,tx,on)=>`<label><input type="radio" name="evMode" value="${v}"${on?" checked":""}><span>${esc(tx)}</span></label>`;
  openSheet({title:"Résultat : "+d.run.title,kind:"eval",opener,
    html:`<p class="note">${esc(DAYS[i])} ${esc(dfmt(weekDate(w,i)))} · ${esc(d.run.note||"")}</p>
    ${k5?`<div class="field"><span class="lbl" id="evModeL">Ce que tu as fait</span><div class="seg" role="radiogroup" aria-labelledby="evModeL">${rad("km",ev.T+" min",mode0==="km")}${rad("5k","5 km chrono",mode0==="5k")}</div></div>`:""}
    <div class="field"><label for="evV" id="evVL">${esc(F[0])}</label><input id="evV" type="text" inputmode="${F[1]}" maxlength="8" autocomplete="off" placeholder="${esc(F[2])}" aria-describedby="evVH" data-first><span class="hint" id="evVH">${esc(F[3])}</span></div>
    ${t==="ref"?`<div class="field"><label for="evV2">Distance (km) · facultatif</label><input id="evV2" type="text" inputmode="decimal" maxlength="6" autocomplete="off" placeholder="ex. 5,2" aria-describedby="evV2H"><span class="hint" id="evV2H">En km, entre 0,5 et 40.</span></div>`:""}
    <div class="field"><label for="evR">Effort perçu (RPE)${needR?"":" · facultatif"}</label><select id="evR" aria-describedby="evRH">${rpeOpt}</select><span class="hint" id="evRH">De 1 (très facile) à 10 (effort maximal).</span></div>
    <div class="alerts msg" id="evMsg" role="alert"></div>${has?`<button class="linkbtn" type="button" id="evDel">Effacer ce résultat</button>`:""}
    <p class="note legal">Une estimation, pas une mesure de laboratoire ni un avis médical. Ton plan ne change que si tu le demandes.</p>`,
    foot:`<button class="btn" type="button" id="evSave">Enregistrer</button>`,
    onReady:sh=>{
      const iv=sh.querySelector("#evV"), msg=m=>{ sh.querySelector("#evMsg").innerHTML=m? `<div class="alert warn">${esc(m)}</div>` : ""; };
      iv.value=val; const v2=sh.querySelector("#evV2"); if(v2&&has&&has.v2) v2.value=String(has.v2).replace(".",",");
      const modeOf=()=> k5? (sh.querySelector('input[name="evMode"]:checked')||{value:"km"}).value : "km";
      const syncMode=()=>{ if(!k5) return; const m=modeOf(); setT(sh.querySelector("#evVL"),m==="5k"? "Temps sur 5 km (mm:ss)" : F[0]); iv.placeholder= m==="5k"? "ex. 26:30" : F[2]; iv.inputMode= m==="5k"? "text" : "decimal"; setT(sh.querySelector("#evVH"),m==="5k"? "Minutes et secondes : de "+mmss(EV_5K[0])+" à "+mmss(EV_5K[1])+", soit une VMA de 8 à 25 km/h." : F[3]); };
      syncMode(); sh.querySelectorAll('input[name="evMode"]').forEach(r=>r.addEventListener("change",()=>{ syncMode(); iv.value=""; }));
      const back=sel=>{ const b=document.querySelector(`#days [data-${sel}="${i}"]`)||document.querySelector(`#days [data-evr="${i}"]`); if(b) b.focus({preventScroll:true}); };
      const del=sh.querySelector("#evDel");
      if(del) del.addEventListener("click",()=>{ state.evr=cleanEvr({...state.evr,[mk.k]:{x:1,at:Date.now()}}); persist(); recompute(); closeSheet(true); back("evr"); toast("Résultat effacé. Ton plan n'a pas changé."); });
      const bad=(el,m)=>{ ["#evV","#evV2","#evR"].forEach(x=>{ const e=sh.querySelector(x); if(!e) return; e.removeAttribute("aria-invalid"); e.setAttribute("aria-describedby",(e.getAttribute("aria-describedby")||"").replace(/\s*evMsg/g,"").trim()); });
        if(!el){ msg(""); return false; } el.setAttribute("aria-invalid","true"); el.setAttribute("aria-describedby",((el.getAttribute("aria-describedby")||"")+" evMsg").trim()); msg(m); el.focus(); return false; };
      const num=s=>{ const x=String(s||"").replace(/\s| | /g,"").replace(",","."); return /^\d+(\.\d+)?$/.test(x)? +x : NaN; };
      sh.querySelector("#evSave").addEventListener("click",()=>{
        const m=modeOf(), raw=iv.value.trim(), rpe=+sh.querySelector("#evR").value||0; let v, x2=null;
        if(!raw) return bad(iv,"Écris ton résultat.");
        if(t==="end"&&m==="5k"){ const mn=chronoMin(raw,5); if(!(mn*60>=EV_5K[0]&&mn*60<=EV_5K[1])) return bad(iv,"Écris ton temps sur 5 km en mm:ss (ex. 26:30), de "+mmss(EV_5K[0])+" à "+mmss(EV_5K[1])+"."); v=Math.round(mn*60); }
        else { v=num(raw); const b=EV_V[t];
          if(isNaN(v)||((t==="vma6"||t==="ref"||t==="deb")&&v!==Math.round(v))) return bad(iv,t==="vma6"? "Écris la distance en mètres, sans virgule (ex. 1450)." : t==="end"||t==="cont"? "Écris la distance en km (ex. 6,2)." : "Écris un nombre entier de minutes (ex. "+(t==="ref"?"35":"6")+").");
          const hi= t==="deb"? maxDeb : b[1]; if(v<b[0]||v>hi) return bad(iv,F[3].replace(/\.$/,"")+" : "+fmt1(v).replace(/,0$/,"")+" n'est pas plausible."); }
        if(t==="ref"&&v2&&v2.value.trim()){ x2=num(v2.value); if(isNaN(x2)||x2<.5||x2>40) return bad(v2,"Écris la distance en km, entre 0,5 et 40 (ex. 5,2)."); const sp=x2/(v/60); if(sp<3||sp>20) return bad(v2,"Distance et durée peu plausibles ensemble ("+fmt1(sp)+" km/h) : vérifie les deux."); }
        if(needR&&!(rpe>=1&&rpe<=10)) return bad(sh.querySelector("#evR"),"Choisis l'effort perçu (RPE) de 1 à 10.");
        const rec={t,v,...(t==="end"&&m==="5k"?{m:"5k"}:{}),...(x2!=null?{v2:x2}:{}),...(ev.T&&(t==="end"||t==="cont")?{T:ev.T}:{}),rpe,ap:0,sig:mk.sig,at:Date.now()};
        const r=evEst(ev,rec); if(r&&r.err) return bad(r.errF==="rpe"? sh.querySelector("#evR") : iv,r.err);   // résultat aberrant ou effort trop dur : refusé, rien n'est enregistré
        bad(null);
        state.evr=cleanEvr({...state.evr,[mk.k]:rec}); state.isExample=false; persist(); recompute(); closeSheet(true);
        const ap=document.querySelector(`#days [data-evap="${i}"]`); if(ap) ap.focus({preventScroll:true}); else back("evr");
        toast("Résultat enregistré."+(ap? " Ton plan n'a pas changé : touche « Mettre à jour mon plan avec ce résultat » pour le recalibrer." : "")); });
    }});
}
// mise à jour du plan avec un résultat : référence du profil (VMA) ou point de départ du débutant ; jamais sans ce bouton, toujours annulable
function evApplyRes(w,i){
  const wk=plan[w-1], d=wk&&wk.days[i], e=evRec(w,i), mk=markKey(w,i); if(!d||!e||!mk||!mk.k) return false;
  const ev=evOf(d.run.ev,e), r=evEst(ev,e); if(!r||r.err){ toast(r&&r.err||"Résultat illisible : modifie-le."); return false; } if(!evCanApply(r)) return false;
  const before={profile:{...state.profile},rec:{...e}}, hadAi=!!aiOf(profileNums(state.profile)), cur=vmaOf(P).vma; let msg;
  const rp=r.vma!=null? evRepl() : "", g=evGap(r);
  if(r.vma!=null){ state.profile={...state.profile,ref:"vma",refVal:fmt1(r.vma)}; msg="Plan mis à jour : VMA de "+fmt1(r.vma)+" km/h (avant "+fmt1(cur)+"). Toutes tes allures sont recalculées et la distance de certaines séances peut changer un peu ; la progression reste la même."+(rp?" Ta référence chrono est remplacée.":"")+(g?" Écart de plus de 20 % : vérifie ta mesure.":"")+" "+EV_SURE; }
  else { state.profile={...state.profile,debRun:String(r.run)}; msg="Plan mis à jour : tes séances course / marche partent de fractions de "+r.start+" min de course, puis la progression reprend, toujours prudente. "+EV_SURE; }
  if(hadAi) msg+=" L'ajustement de l'IA ne s'applique plus à ce plan : relance-le dans le Profil si tu veux.";
  state.evr=cleanEvr({...state.evr,[mk.k]:{...e,ap:Date.now(),at:Date.now()}}); state.isExample=false; fillForm(); persist(); recompute();
  const f=document.querySelector(`#days [data-evr="${i}"]`); if(f) f.focus({preventScroll:true});
  toast(msg,{action:"Annuler",fn:()=>{ state.profile=before.profile; state.evr=cleanEvr({...state.evr,[mk.k]:{...before.rec,at:Date.now()}}); fillForm(); persist(); recompute(); toast("Mise à jour annulée : ton plan est revenu comme avant."); }});
  return true;
}
// panneau Notifications (section « Ton plan ») : tests à faire, résultat en attente ; information passive, sans bouton ni badge
function evNotif(){ if(!runSport()||!plan.length) return []; const tdy=todayIso(), todo=[], wait=[];
  plan.slice(0,2).forEach(wk=>wk.days.forEach(d=>{ if(!d.run||!d.run.ev) return; const dt=isoOf(wk.w,d.i); if(!dt||dt<addDays(tdy,-14)) return; const e=evRec(wk.w,d.i);
    if(!e){ if(markOf(wk.w,d.i)!=="skip") todo.push(DAYS[d.i].toLowerCase()+" "+dfmt(weekDate(wk.w,d.i))+" ("+d.run.title+")"); }
    else { const ev=evOf(d.run.ev,e), r=evEst(ev,e); if(!e.ap&&evCanApply(r)) wait.push(r.vma!=null? "VMA estimée à "+fmt1(r.vma)+" km/h" : "fractions de "+r.start+" min de course"); } }));
  const out=[];
  if(todo.length) out.push(`<div class="alert ok evnt"><span><b>Séance${todo.length>1?"s":""} de test</b> : ${esc(todo.join(", "))}. Après le test, note ton résultat sur la carte de la séance : ton plan pourra se recalibrer, si tu le décides.</span></div>`);
  if(wait.length) out.push(`<div class="alert ok evnt"><span><b>Résultat de test en attente</b> : ${esc(wait.join(", "))}. Ton plan n'a pas changé : sur la carte de la séance, touche « Mettre à jour mon plan avec ce résultat » si tu veux le recalibrer.</span></div>`);
  return out; }
// profil : ce que la case « Commencer par des séances de test » donne pour ce plan
function evHint(){ const h=$("#evalHint"), cb=$("#evalOn"); if(!h||!cb) return; const why=evWhyNot({...P,evalOn:1},plan), n=plan.slice(0,2).reduce((a,wk)=>a+wk.days.filter(d=>d.run&&d.run.ev).length,0);
  const base="Une à trois séances en semaine 1 (et 2) pour jauger ton niveau, à la place de séances d'intensité. Tu notes ton résultat sur la carte, puis tu choisis de mettre à jour ton plan.";
  const ref=!vmaOf(P).estimated? " Tu as déjà une référence de vitesse : les tests sont facultatifs." : "";
  const x= why==="tard"? " Il reste trop peu de semaines avant l'affûtage : pas de test, la préparation passe avant." : why==="court"? " Plan de 4 semaines ou moins : pas de test, la préparation passe avant." : why==="course"? " Ta première semaine est déjà l'affûtage ou la course : pas de test." : why==="sport"? "" :
    P.niveau==="deb"? " Débutant : un test prudent en course / marche, sans effort maximal." : evPrudent(P)? " Variante prudente, sans test maximal ("+(P.minor?"moins de 18 ans":P.age>=65?"65 ans et plus":evBmi(P)>=35?"IMC de 35 et plus":"douleur notée récemment")+")." : "";
  setT(h,base+ref+x+(cb.checked&&!why? " Ce plan en prévoit "+n+"." : "")); }
function openFeel(w,i,opener){
  const wk=plan[w-1], d=wk&&wk.days[i]; if(!d||!hasSession(d)) return; const mk=markKey(w,i); if(!mk||!mk.k) return;
  const cur=(state.feel||{})[mk.k], has=cur&&!isGone(cur)? cur : null, name=d.run? d.run.title : "Renforcement";
  const rpeOpt=RPE_LAB.map((t,k)=> k? `<option value="${k}"${has&&has.rpe===k?" selected":""}>${esc(t)}</option>` : `<option value=""${has&&has.rpe?"":" selected"}>Choisis…</option>`).join("");
  const rad=(n,v,t,on)=>`<label><input type="radio" name="${n}" value="${v}"${on?" checked":""}><span>${esc(t)}</span></label>`;
  const zoneOpt=`<option value="">Choisis…</option>`+Object.entries(PAIN_ZONES).map(([k,t])=>`<option value="${k}"${has&&has.zone===k?" selected":""}>${esc(t)}</option>`).join("");
  const pain=has?has.pain:0;
  openSheet({title:"Ressenti : "+name,kind:"feel",opener,
    html:`<p class="note">${esc(DAYS[i])} ${esc(dfmt(weekDate(w,i)).replace(/\.$/,""))}. Quelques secondes pour garder la trace de comment tu te sens : ça sert à repérer la fatigue avant qu'elle ne s'installe.</p>
    <div class="field"><label for="fRpe">Effort perçu (RPE)</label><select id="fRpe" data-first aria-describedby="fRpeH">${rpeOpt}</select><span class="hint" id="fRpeH">De 1 (très facile) à 10 (effort maximal). 7 : phrases courtes, ou 3 répétitions en réserve. 9 : une seule répétition en réserve.</span></div>
    <div class="field"><span class="lbl" id="fMoodL">Forme du jour</span><div class="seg" role="radiogroup" aria-labelledby="fMoodL" aria-describedby="fMoodH">${[1,2,3,4,5].map(k=>rad("fMood",k,String(k),has&&has.mood===k)).join("")}</div><span class="hint" id="fMoodH">1 : au plus bas, 5 : au top. Facultatif.</span></div>
    <div class="field"><span class="lbl" id="fPainL">Douleur</span><div class="seg" role="radiogroup" aria-labelledby="fPainL">${rad("fPain",0,"Aucune",pain===0)}${rad("fPain",1,"Légère",pain===1)}${rad("fPain",2,"Forte",pain===2)}</div></div>
    <div class="field" id="fZoneF"${pain?"":" hidden"}><label for="fZone">Où ?</label><select id="fZone">${zoneOpt}</select></div>
    <div class="field"><label for="fNote">Note libre · facultatif</label><textarea class="fnote" id="fNote" maxlength="200" rows="3" aria-describedby="fCnt" autocomplete="off"></textarea><span class="cnt" id="fCnt" aria-hidden="true">0 / 200</span></div>
    <div class="alerts msg" id="fMsg" role="alert"></div>${has?`<button class="linkbtn" type="button" id="fDel">Effacer ce ressenti</button>`:""}
    <p class="note legal">Ce ressenti n'est pas un avis médical. Une douleur forte ou qui dure mérite l'avis d'un professionnel de santé.</p>`,
    foot:`<button class="btn" type="button" id="fSave">Enregistrer</button>`,
    onReady:sh=>{
      const ta=sh.querySelector("#fNote"), cnt=sh.querySelector("#fCnt"), msg=t=>{ sh.querySelector("#fMsg").innerHTML=t? `<div class="alert warn">${t}</div>` : ""; };
      ta.value=has?has.note:""; const upd=()=>{ cnt.textContent=ta.value.length+" / 200"; }; upd(); ta.addEventListener("input",upd);
      const pr=()=>+(sh.querySelector('input[name="fPain"]:checked')||{value:0}).value;
      sh.querySelectorAll('input[name="fPain"]').forEach(r=>r.addEventListener("change",()=>{ sh.querySelector("#fZoneF").hidden=!pr(); }));
      const back=()=>{ const b=document.querySelector(`#days [data-feel="${i}"]`); if(b) b.focus({preventScroll:true}); };
      const del=sh.querySelector("#fDel");
      if(del) del.addEventListener("click",()=>{ state.feel=cleanFeel({...state.feel,[mk.k]:{x:1,at:Date.now()}}); persist(); recompute(); closeSheet(true); back(); toast("Ressenti effacé."); });
      sh.querySelector("#fSave").addEventListener("click",()=>{
        const rpe=+sh.querySelector("#fRpe").value, pain=pr(), zone=sh.querySelector("#fZone").value;
        // champ en erreur : aria-invalid, relié au message #fMsg
        const bad=(id,m)=>{ ["#fRpe","#fZone"].forEach(x=>{ const e=sh.querySelector(x); e.removeAttribute("aria-invalid"); e.setAttribute("aria-describedby",(e.getAttribute("aria-describedby")||"").replace(/\s*fMsg/g,"").trim()); });
          if(!id){ msg(""); return; } const e=sh.querySelector(id); e.setAttribute("aria-invalid","true"); e.setAttribute("aria-describedby",((e.getAttribute("aria-describedby")||"")+" fMsg").trim()); msg(m); e.focus(); };
        if(!(rpe>=1&&rpe<=10)){ bad("#fRpe","Choisis l'effort perçu (RPE) de 1 à 10."); return; }
        if(pain&&!Object.hasOwn(PAIN_ZONES,zone)){ bad("#fZone","Indique où tu as mal."); return; }
        bad("");
        const mood=+(sh.querySelector('input[name="fMood"]:checked')||{value:0}).value;
        state.feel=cleanFeel({...state.feel,[mk.k]:{rpe,mood,pain,zone:pain?zone:"",note:ta.value,sig:mk.sig,at:Date.now()}}); state.isExample=false; persist(); recompute();
        const sf=feelSafety14();
        if(sf.msgs.length){   // message explicite, dans la fenêtre : la personne le lit avant de continuer
          sh.querySelector(".sh-b").innerHTML=`<div class="alert ok">Ressenti enregistré.</div>${sf.msgs.map(m=>`<div class="alert ${m.c}" role="alert">${m.h}</div>`).join("")}`;
          const sv=sh.querySelector("#fSave"); if(sv) sv.remove(); const cb=sh.querySelector("[data-close]"); cb.textContent="Fermer"; cb.focus(); sheetOpener=document.querySelector(`#days [data-feel="${i}"]`)||sheetOpener; return; }
        closeSheet(true); back(); toast("Ressenti enregistré."); });
    }});
}

/* Suivi : tendances du ressenti sur 4 semaines */
function renderFeel(){
  const el=$("#feelCard"); if(!el) return; const tdy=todayIso(), live=liveOf(state.feel), ks=Object.keys(live);
  const head=`<h3>Ressenti des séances</h3>`;
  if(!ks.length){ el.innerHTML=head+`<p class="note">Après une séance, touche « Ressenti » sur sa carte (onglet Semaine) : effort perçu, forme du jour, douleur. Tes 4 dernières semaines s'affichent ici.</p>`; return; }
  const m0=mondayOf(tdy), wks=[0,1,2,3].map(n=>addDays(m0,-7*n)), rows=wks.map(m=>{ const e=ks.filter(k=>k>=m&&k<=addDays(m,6)).map(k=>live[k]);
    const rp=e.filter(x=>x.rpe>0), md=e.filter(x=>x.mood>0);
    return {m,n:e.length,rpe:rp.length? rp.reduce((a,x)=>a+x.rpe,0)/rp.length : null,mood:md.length? md.reduce((a,x)=>a+x.mood,0)/md.length : null,pain:e.filter(x=>x.pain>0).length,strong:e.filter(x=>x.pain===2).length}; });
  const sf=feelSafety14();
  const line=r=> `<li class="fw"><span class="fwl">${r.m===m0?"Cette semaine":"Sem. du "+esc(dfmt(new Date(r.m+"T12:00:00")))}</span>${r.rpe==null?`<span class="fwb"></span><span class="fwv">${r.n? r.n+" séance"+(r.n>1?"s":"")+", RPE non noté" : "Rien noté"}</span>`:`<span class="fwb" role="img" aria-label="Effort perçu moyen ${fmt1(r.rpe)} sur 10"><i data-sw="${Math.round(r.rpe*10)}"></i></span><span class="fwv">RPE ${fmt1(r.rpe)} · ${r.n} séance${r.n>1?"s":""}${r.mood!=null?" · forme "+fmt1(r.mood)+"/5":""}${r.pain?" · douleur "+r.pain+" fois":""}</span>`}</li>`;
  const a=rows.slice(0,2).filter(r=>r.rpe!=null), b=rows.slice(2).filter(r=>r.rpe!=null);
  let trend="";
  if(a.length&&b.length){ const ra=a.reduce((s,r)=>s+r.rpe,0)/a.length, rb=b.reduce((s,r)=>s+r.rpe,0)/b.length, dlt=ra-rb;
    trend= dlt>=1? `Ton effort perçu monte (RPE moyen ${fmt1(ra)} contre ${fmt1(rb)} avant) : si ta forme baisse aussi, allège une séance.` : dlt<=-1? `Ton effort perçu baisse (RPE moyen ${fmt1(ra)} contre ${fmt1(rb)} avant) : les séances passent mieux.` : `Effort perçu stable (RPE moyen ${fmt1(ra)}).`; }
  const moods=rows.filter(r=>r.mood!=null); if(moods.length>=2&&moods[0].mood<=2.2) trend+=" Ta forme du jour est basse ces derniers temps : sommeil, repas et repos d'abord.";
  const notes=ks.filter(k=>live[k].note).slice(0,3);
  el.innerHTML=head+sf.msgs.map(x=>`<div class="alert ${x.c}" role="note">${x.h}</div>`).join("")+`<ul class="fwl-ul" aria-label="Ressenti des 4 dernières semaines">${rows.map(line).join("")}</ul>${trend?`<p class="note">${esc(trend)}</p>`:""}${notes.length?`<ul class="notes" aria-label="Dernières notes">${notes.map((k,j)=>`<li><b>${esc(dfmt(new Date(k+"T12:00:00")))}</b> <span data-note="${j}"></span></li>`).join("")}</ul>`:""}`;
  notes.forEach((k,j)=>{ const s=el.querySelector(`[data-note="${j}"]`); if(s) s.textContent=live[k].note; });   // texte libre : textContent seulement
}

/* ---------- import de stats (Apple Santé, Polar Flow) ---------- */
const actLive=()=> Object.values(liveOf(state.acts)).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(a.type<b.type?-1:a.min-b.min));
const hmTxt=min=>{ min=Math.round(min); return min<60? min+" min" : Math.floor(min/60)+" h "+String(min%60).padStart(2,"0"); };
const typeLab=t=> Object.hasOwn(IMP14.TYPES,t)? IMP14.TYPES[t] : "Autre activité";
function weekRange14(w){ const a=isoOf(w,0), b=isoOf(w,6); return a&&b? [a,b] : null; }
function planWeekTotals14(w){ const wk=plan[w-1]; if(!wk) return null; const f=dayFuel(P,E,wk); let min=0,km=0,n=0;
  for(const d of f.days){ if(!hasSession(d)) continue; n++; min+=(d.run?sessionDur(d.run):0)+(d.renfo?parseInt(d.renfo.m)||0:0); km+=d.run?d.km:0; }
  return {min,km,n}; }
function renderImp(){
  const el=$("#impCard"); if(!el) return; const acts=actLive(), rh=liveOf(state.rhr);
  let h=`<h3>Activités importées</h3><p class="note">Compare ce que tu as fait (Apple Santé, Polar Flow) à ce qui était prévu. <b>Ces données ne changent jamais tes calories.</b></p><details class="more why"><summary>Comment ça marche</summary><p class="note">Importe tes séances et tes pesées depuis Apple Santé ou Polar Flow. Le fichier est lu sur cet appareil, rien n'est envoyé.</p></details><div class="impb"><button class="btn" type="button" id="impOpen" aria-haspopup="dialog">Importer un fichier</button>${acts.length||Object.keys(rh).length?`<button class="btn ghost" type="button" id="impClear" aria-haspopup="dialog">Tout retirer</button>`:""}</div>`;
  // comparaison prévu / réalisé de la semaine affichée
  const wk=plan[state.week-1], rg=weekRange14(state.week);
  if(wk&&rg){ const pt=planWeekTotals14(state.week), inW=acts.filter(a=>a.date>=rg[0]&&a.date<=rg[1]);
    const am=inW.reduce((s,a)=>s+a.min,0), ak=inW.filter(a=>a.type==="course"||a.type==="trail").reduce((s,a)=>s+a.km,0), kc=inW.reduce((s,a)=>s+a.kcal,0), pct=pt&&pt.min? Math.round(am/pt.min*100) : 0;
    h+=`<div class="cmpw"><h4>Semaine ${state.week} : prévu et réalisé</h4>`;
    if(!inW.length) h+=`<p class="note">Aucune activité importée sur cette semaine (${esc(dfmt(new Date(rg[0]+"T12:00:00")))} – ${esc(dfmt(new Date(rg[1]+"T12:00:00")))}).</p>`;
    h+=`<dl class="cmpl"><div><dt>Durée</dt><dd>prévu ${hmTxt(pt.min)} · réalisé ${hmTxt(am)}${pt.min?" ("+pct+" %)":""}</dd></div>${pt.min?`<div class="mb" role="img" aria-label="Durée réalisée : ${pct} pour cent du prévu"><i data-sw="${Math.min(100,pct)}"></i></div>`:""}<div><dt>Séances</dt><dd>prévues ${pt.n} · importées ${inW.length}</dd></div>${runSport()&&(pt.km>0.1||ak>0)?`<div><dt>Distance de course</dt><dd>prévue ${fmt1(pt.km)} km · réalisée ${fmt1(ak)} km</dd></div>`:""}${kc?`<div><dt>Énergie des activités</dt><dd>${fmt0(kc)} kcal (indicatif, non utilisé pour tes calories)</dd></div>`:""}</dl></div>`; }
  // FC de repos
  const rk=Object.keys(rh).sort().reverse();
  if(rk.length){ const avg=a=>a.reduce((s,k)=>s+rh[k].bpm,0)/a.length, rec=rk.slice(0,4), old=rk.slice(8,12);
    h+=`<p class="note">FC de repos : <b>${fmt0(avg(rec))} bpm</b> en moyenne sur ${rec.length} semaine${rec.length>1?"s":""} récente${rec.length>1?"s":""}${old.length?", contre "+fmt0(avg(old))+" bpm il y a 2 à 3 mois":""}. Une FC de repos qui monte de plus de 5 bpm avec de la fatigue invite à lever le pied.</p>`; }
  if(acts.length){ const show=acts.slice(0,20);
    h+=`<ul class="actl" aria-label="Activités importées">${show.map((a,j)=>`<li><span class="al-m"><b>${esc(dfmt(new Date(a.date+"T12:00:00")))}</b> · ${esc(typeLab(a.type))}<small>${hmTxt(a.min)}${a.km>0?" · "+fmt1(a.km)+" km":""}${a.kcal?" · "+fmt0(a.kcal)+" kcal":""}${a.fc?" · FC moy. "+a.fc+" bpm":""} · ${a.src==="polar"?"Polar":"Apple Santé"}</small></span><button class="del" type="button" data-actdel="${j}" aria-label="Retirer l'activité du ${esc(dfmt(new Date(a.date+"T12:00:00")))} (${esc(typeLab(a.type))})">×</button></li>`).join("")}</ul>${acts.length>show.length?`<p class="note">Et ${acts.length-show.length} autre${acts.length-show.length>1?"s":""} activité${acts.length-show.length>1?"s":""} plus ancienne${acts.length-show.length>1?"s":""}.</p>`:""}`; }
  el.innerHTML=h;
  const open=$("#impOpen"); if(open) open.addEventListener("click",()=>openStats(open));
  const clr=$("#impClear"); if(clr) clr.addEventListener("click",()=>openStatsClear(clr));
  el.querySelectorAll("[data-actdel]").forEach(b=>b.addEventListener("click",()=>{ const a=acts[+b.dataset.actdel]; if(!a) return; const k=IMP14.keyOf(a);
    state.acts=cleanActs({...state.acts,[k]:{del:1,at:Date.now()}}); persist(); recompute();
    toast("Activité retirée.",{action:"Annuler",fn:()=>{ state.acts=cleanActs({...state.acts,[k]:{...a,at:Date.now()}}); persist(); recompute(); }});
    const nb=el.querySelector("[data-actdel]"); if(nb) nb.focus({preventScroll:true}); else { const o=$("#impOpen"); if(o) o.focus({preventScroll:true}); } }));
}
function openStatsClear(opener){
  const na=actLive().length, nr=Object.keys(liveOf(state.rhr)).length;
  openSheet({title:"Retirer les données importées",kind:"statsclear",opener,closeLabel:"Annuler",firstClose:true,
    html:`<p class="note">Cette action retire <b>${na}</b> activité${na>1?"s":""} importée${na>1?"s":""} et <b>${nr}</b> semaine${nr>1?"s":""} de FC de repos${acct.st==="connected"?", sur cet appareil et dans ton compte":""}. Les pesées déjà ajoutées à ton suivi restent : retire-les une par une dans la liste du suivi.</p>`,
    foot:`<button class="btn danger" type="button" id="scGo">Tout retirer</button>`,
    onReady:sh=>{ sh.querySelector("#scGo").addEventListener("click",()=>{ const now=Date.now(), a={}, r={};
      for(const k of Object.keys(liveOf(state.acts))) a[k]={del:1,at:now}; for(const k of Object.keys(liveOf(state.rhr))) r[k]={x:1,at:now};
      state.acts=cleanActs({...state.acts,...a}); state.rhr=cleanRhr({...state.rhr,...r}); persist(); recompute(); closeSheet(true); toast("Données importées retirées."); const o=$("#impOpen"); if(o) o.focus({preventScroll:true}); }); }});
}
const IMP_ERR={
  unknown:"Ce fichier n'est pas reconnu. Formats acceptés : export.zip ou export.xml d'Apple Santé ; JSON, CSV ou TCX de Polar Flow (ou une archive .zip qui les contient).",
  empty:"Ce fichier est vide.",
  toobig:"Ce fichier est trop gros : 500 Mo au plus pour une archive .zip, un JSON, un CSV ou un TCX. Pour Apple Santé, choisis export.zip tel qu'il est, ou export.xml.",
  xmlbig:"Ton export Apple Santé dépasse 8 Go une fois décompressé : c'est plus que ce que Pacebook peut lire sans ralentir ton appareil. Ton historique est exceptionnellement long ; tu peux importer tes séances Polar Flow à la place (JSON, CSV ou TCX), ou saisir ton suivi à la main.",
  textbig:"Ce fichier JSON, CSV ou TCX dépasse 16 Mo : il est trop gros pour être lu ici. Exporte tes séances par petits lots depuis Polar Flow.",
  badzip:"Cette archive .zip est illisible ou abîmée. Télécharge-la de nouveau, ou décompresse-la et choisis le fichier à l'intérieur.",
  bomb:"Cette archive se décompresse en une quantité de données anormale : elle n'a pas été lue, par sécurité.",
  nozip:"Ton navigateur ne sait pas lire les archives .zip ici. Décompresse le fichier, puis choisis export.xml (Santé) ou le fichier JSON, CSV ou TCX.",
  gpx:"Les fichiers GPX contiennent des parcours, pas de statistiques de séance. Exporte plutôt la séance au format TCX ou CSV depuis Polar Flow.",
  none:"Le fichier est lisible, mais ne contient aucune séance, pesée ou FC de repos exploitable (dates valides, durées de 1 min à 24 h)."
};
function openStats(opener){
  if(state.isExample&&!localSaved){   // pas de profil enregistré : rien à comparer, et on n'écrit pas dans des données d'exemple
    openSheet({title:"Importer mes stats",kind:"stats",opener,html:`<div class="alert warn">Crée d'abord ton profil : l'import compare tes activités à ton plan, et rien n'est enregistré tant que tu n'es pas sorti des données d'exemple.</div>`,foot:`<button class="btn" type="button" id="stWz">Créer mon profil</button>`,onReady:sh=>{ sh.querySelector("#stWz").addEventListener("click",()=>{ closeSheet(true); openWizard(opener); }); }}); return; }
  let ctl=null, file=null, res=null;
  const intro=`<p class="note">Choisis le fichier exporté depuis Apple Santé ou Polar Flow. <b>Il est lu sur cet appareil, il n'est envoyé nulle part.</b> Seules la date, le type de séance, la durée, la distance, l'énergie, la FC moyenne, tes pesées et ta FC de repos sont gardés : ni nom, ni parcours GPS, ni note.</p>
    <details class="more how"><summary>Exporter depuis Apple Santé (iPhone)</summary><ol><li>Ouvre l'app Santé et touche ta photo (ou tes initiales) en haut à droite.</li><li>Touche « Exporter toutes les données de santé », puis « Exporter ».</li><li>Enregistre le fichier export.zip dans Fichiers. L'export peut prendre quelques minutes et peser plusieurs centaines de Mo (500 Mo au plus ici).</li><li>Reviens ici et choisis export.zip (ou export.xml si tu l'as décompressé).</li></ol></details>
    <details class="more how"><summary>Exporter depuis Polar Flow</summary><ol><li>Sur flow.polar.com, ouvre une séance de ton journal puis « Exporter la séance » : choisis TCX ou CSV.</li><li>Pour tout l'historique, demande tes données depuis ton compte Polar (« Télécharger mes données ») : tu reçois une archive .zip de fichiers JSON.</li><li>Choisis ici le fichier .tcx, .csv, .json ou l'archive .zip. Les intitulés peuvent changer d'une version de Polar Flow à l'autre.</li></ol></details>
    <p class="note legal">Après l'import, ces données sont enregistrées comme le reste de tes données : sur cet appareil, et dans ton compte si tu es connecté et que tu as donné ton consentement pour les données de santé. Tu peux les retirer à tout moment. Elles ne changent jamais tes calories.</p><div class="alerts msg" id="stMsg" role="alert"></div>`;
  openSheet({title:"Importer mes stats",kind:"stats",opener,closeLabel:"Annuler",html:intro,foot:`<button class="btn" type="button" id="stPick" data-first>Choisir un fichier</button>`,
    onClose:()=>{ if(ctl){ ctl.abort(); ctl=null; } },
    onReady:sh=>{
      const inp=document.createElement("input"); inp.type="file"; inp.hidden=true; inp.accept=".zip,.xml,.json,.csv,.tcx,application/zip,application/xml,text/xml,application/json,text/csv,text/plain"; inp.setAttribute("aria-label","Fichier de stats à importer"); sh.appendChild(inp);
      const body=sh.querySelector(".sh-b"), pb=sh.querySelector("#stPick"), cb=sh.querySelector("[data-close]"), say=t=>{ const m=body.querySelector("#stMsg"); if(m) m.innerHTML=t; };
      let act=()=>inp.click();
      pb.addEventListener("click",()=>act());
      const home=m=>{ body.innerHTML=intro; if(m) say(`<div class="alert warn">${esc(m)}</div>`); pb.textContent="Choisir un fichier"; pb.disabled=false; act=()=>inp.click(); cb.textContent="Annuler"; pb.focus(); };
      inp.addEventListener("change",async()=>{ file=inp.files&&inp.files[0]; inp.value=""; if(!file) return;
        const mine=new AbortController(); ctl=mine;
        body.innerHTML=`<p class="note">Lecture de ce fichier sur ton appareil… Ne ferme pas la page.</p><div class="mb big" role="progressbar" aria-label="Progression de la lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-sw="0"></i></div><p class="note" id="stP" role="status">0 %</p>`;
        const pg=body.querySelector(".mb"), bar=pg.querySelector("i"), pt=body.querySelector("#stP");
        pb.textContent="Annuler la lecture"; pb.disabled=false; act=()=>mine.abort(); pb.focus();
        let last=-1, lastT=0;
        try{
          res=await IMP14.parseFile(file,{today:todayIso(),signal:mine.signal,onProgress:f=>{ const p=Math.max(0,Math.min(100,Math.round(f*100))), t=Date.now(); if(p===last||(t-lastT<120&&p<100)) return; last=p; lastT=t; pg.setAttribute("aria-valuenow",String(p)); bar.style.width=p+"%"; pt.textContent=p+" %"; }});
        }catch(e){ if(ctl!==mine) return; ctl=null; const code=e&&e.code; home(code==="abort"? "Lecture annulée. Rien n'a été importé." : (IMP_ERR[code]||"Impossible de lire ce fichier. Rien n'a été importé.")); return; }
        if(ctl!==mine) return; ctl=null; preview();
      });
      function preview(){
        const r=res;
        const newActs=r.acts.filter(a=>{ const e=(state.acts||{})[IMP14.keyOf(a)]; return !e||isGone(e); }), dup=r.acts.length-newActs.length;
        const near=d=> state.log.some(x=>Math.abs((new Date(x.date+"T12:00:00")-new Date(d+"T12:00:00"))/864e5)<6);
        const recentW=x=>(new Date(todayIso()+"T12:00:00")-new Date(x.date+"T12:00:00"))/864e5<=84, oldW=r.weeks.filter(x=>!recentW(x)).length, newW=r.weeks.filter(x=>recentW(x)&&!near(x.date)), newR=r.rhr.filter(x=>{ const e=(state.rhr||{})[x.week]; return !e||isGone(e)||e.bpm!==x.bpm; });
        const by={}; for(const a of newActs){ const o=by[a.type]||(by[a.type]={n:0,min:0,km:0}); o.n++; o.min+=a.min; o.km+=a.km; }
        const dts=newActs.map(a=>a.date).sort(), dY=d=>dfmt(new Date(d+"T12:00:00"))+" "+d.slice(0,4), rng=dts.length? dY(dts[0])+" au "+dY(dts[dts.length-1]) : "";
        const chk=(id,t)=>`<label class="ack"><input type="checkbox" id="${id}" checked><span>${t}</span></label>`;
        const nothing=!newActs.length&&!newW.length&&!newR.length;
        const srcT=r.kinds.includes("apple")&&r.kinds.includes("polar")? "Apple Santé et Polar" : r.kinds.includes("polar")? "Polar Flow" : "Apple Santé";
        body.innerHTML=`<div class="alert ok"><b>Fichier lu</b> (${esc(srcT)}). Rien n'est encore importé : vérifie, puis choisis.</div>
          ${newActs.length?`<div class="grp stg">${Object.entries(by).sort((a,b)=>b[1].n-a[1].n).map(([t,o])=>`<div class="stl"><span>${esc(typeLab(t))}</span><span class="num">${o.n} · ${hmTxt(o.min)}${o.km>0?" · "+fmt0(o.km)+" km":""}</span></div>`).join("")}</div><p class="note">${newActs.length} nouvelle${newActs.length>1?"s":""} activité${newActs.length>1?"s":""}, du ${esc(rng)}.${dup?` ${dup} déjà importée${dup>1?"s":""} (même jour, même type, même durée) : ignorée${dup>1?"s":""}.`:""}</p>`:`<p class="note">Aucune nouvelle activité${dup?" ("+dup+" déjà importée"+(dup>1?"s":"")+")":""}.</p>`}
          ${newActs.length?chk("stA",`Importer les <b>${newActs.length}</b> activité${newActs.length>1?"s":""}`):""}
          ${newW.length?chk("stW",`Ajouter <b>${newW.length}</b> pesée${newW.length>1?"s":""} hebdomadaire${newW.length>1?"s":""} (moyenne de la semaine) à ton suivi`)+`<p class="note legal">Les pesées entrent dans ta courbe de poids et dans les conseils du suivi. Les semaines où tu as déjà une mesure (à moins de 6 jours) sont ignorées. Elles ne changent jamais tes calories.</p>`:""}
          ${oldW?`<p class="note">${oldW} pesée${oldW>1?"s":""} de plus de 12 semaines ne sont pas ajoutées : elles ne reflètent plus ton poids actuel.</p>`:""}
          ${newR.length?chk("stR",`Garder la FC de repos de <b>${newR.length}</b> semaine${newR.length>1?"s":""}`):""}
          ${r.trunc?`<div class="alert warn">Fichier très volumineux : seules les données les plus récentes sont gardées (jusqu'à ${IMP14.MAX_KEEP} activités et ${IMP14.MAX_WEEKS} semaines).</div>`:""}
          ${r.bad?`<p class="note">${r.bad} entrée${r.bad>1?"s":""} ignorée${r.bad>1?"s":""} (date, durée ou valeurs invalides).</p>`:""}${r.encrypted?`<p class="note">Des fichiers chiffrés de l'archive n'ont pas pu être lus.</p>`:""}
          ${nothing?`<div class="alert warn">Il n'y a rien de nouveau à importer dans ce fichier : ses données sont déjà dans Pacebook, ou trop anciennes pour les pesées.</div>`:""}`;
        const upd=()=>{ const any=["#stA","#stW","#stR"].some(q=>{ const x=body.querySelector(q); return x&&x.checked; }); pb.disabled=nothing||!any; };
        body.querySelectorAll('input[type="checkbox"]').forEach(x=>x.addEventListener("change",upd));
        pb.textContent="Importer"; act=doImport; upd(); cb.textContent="Annuler"; pb.disabled? cb.focus() : pb.focus();
        setT($("#srLive"),"Fichier lu. Vérifie l'aperçu, puis importe ou annule.");
        function doImport(){ const on=q=>{ const x=body.querySelector(q); return !!(x&&x.checked); }, now=Date.now(); let nA=0,nW=0,nR=0;
          if(on("#stA")){ const m={...state.acts}; for(const a of newActs){ m[IMP14.keyOf(a)]={...a,at:now}; nA++; } state.acts=cleanActs(m); }
          if(on("#stR")){ const m={...state.rhr}; for(const x of newR){ m[x.week]={bpm:x.bpm,at:now}; nR++; } state.rhr=cleanRhr(m); }
          if(on("#stW")){ state.log=cleanLog([...state.log,...newW.map(x=>({date:x.date,at:now,poids:x.kg,sommeil:null,fatigue:null,faites:null,prevues:null,douleur:"non"}))]); nW=newW.length; }
          res=null; persist(); recompute(); closeSheet(true);
          toast("Importé : "+[nA?nA+" activité"+(nA>1?"s":""):"",nW?nW+" pesée"+(nW>1?"s":""):"",nR?nR+" semaine"+(nR>1?"s":"")+" de FC de repos":""].filter(Boolean).join(", ")+".");
          const o=$("#impOpen"); if(o) o.focus({preventScroll:true}); }
      }
    }});
}

/* ---------- v14 : affichage selon le sport, formulaire et assistant ---------- */
const runSport=()=> !P||!P.sport||P.sport==="course"||P.sport==="trail";
const isRunSp=s=> !s||s==="course"||s==="trail";
const SPORT_SHORT={course:"Course",trail:"Trail",vtt:"VTT",force:"Force",forme:"Forme"};
const wkMin=wk=>Math.round(wk.days.reduce((a,d)=>a+(d.run?sessionDur(d.run):0)+(d.renfo?parseInt(d.renfo.m)||0:0),0));
const planVol14=(wk,f)=> runSport()? weekKm(wk,f)+(wk.phase==="race"?raceKm():0) : wkMin(wk);
const volTxt14=(v,wk)=> runSport()? fmt0(v)+" km"+(P.sport==="trail"&&wk&&wk.dplus?" · D+ "+fmt0(wk.dplus)+" m":"") : hmTxt(v);
function weekVol14(wk,totKm,rk){
  if(runSport()) return `<span class="num">${fmt0(totKm+rk)} km</span> au total${rk?" dont "+fmt1(rk).replace(",0","")+" km de course":""}${P.sport==="trail"&&wk.dplus?` · <span class="num">D+ ${fmt0(wk.dplus)} m</span>`:""}`;
  const ns=wk.days.filter(d=>d.run).length;
  return `<span class="num">${hmTxt(wkMin(wk))}</span> d'entraînement · ${ns} séance${ns>1?"s":""}${P.sport==="force"&&wk.phase!=="race"?" de force":""}`;
}
const volLine14=(wk,f)=> runSport()? fmt0(weekKm(wk,f)+(wk.phase==="race"?raceKm():0))+" km" : hmTxt(wkMin(wk));
const kmPart14=d=> (runSport()||d.km>.1)? " · "+fmt1(d.km)+" km" : "";
const kmTxt14=run=> run.sp? "" : " · "+fmt1(sessionKm(run,E.vma))+" km";
const exLab14=d=> d.kind==="race"? "course" : d.run&&d.run.blocks.some(b=>b.cross)? "cardio" : d.run&&d.run.spLab? d.run.spLab : "course";
const lrLab14=()=> runSport()? (P.niveau==="deb"?"Sortie ":"Sortie longue ") : P.sport==="force"? "" : "Sortie longue ";
function lrSport14(wk){
  if(P.sport==="force"){ const r=wk.days.filter(d=>d.run&&d.run.rpeAvg>0); if(wk.phase==="race") return "Test"; return r.length? "RPE "+fr1(Math.round(r.reduce((a,d)=>a+d.run.rpeAvg,0)/r.length*10)/10) : "–"; }
  const lr=wk.days.find(d=>d.run&&d.run.type==="long"); return lr? (wk.phase==="race"? "Objectif " : "")+hmTxt(sessionDur(lr.run)) : "–"; }
const forceKey14=wk=>{ const n=wk.days.filter(d=>d.run).length; return n? n+" séance"+(n>1?"s":"")+" de force" : "–"; };
function sportLead14(){
  const base="Trois semaines de montée, une semaine allégée : le volume monte doucement (6 % par semaine au plus) et la plus longue séance ne grandit jamais de plus de 10 %. ";
  if(P.sport==="force") return "Chaque semaine suit le même schéma de séances ; ce qui progresse, c'est la charge, à l'effort perçu (RPE). Une semaine sur quatre est allégée (moins de séries, RPE plus bas). Avec une date d'objectif, la dernière semaine est un test et l'avant-dernière allège la charge.";
  return base+(P.sport==="vtt"?"Les durées sont en minutes puis en heures pour la sortie longue. ":"")+"Avec une date d'objectif, les deux dernières semaines allègent le volume en gardant un peu d'intensité."; }
// semaine de la dernière séance dure : avant la fin d'une semaine allégée, avertir sans bloquer
// keep : alertes de santé ou de risque de blessure, gardées en haut de la semaine (le reste va dans le panneau Notifications)
function sportAlerts14(wk,f,tp,keep){
  const al=[];
  if(runSport()){ if(P.sport==="trail"&&wk.w<=2) al.push(`<div class="alert ok"><b>Trail.</b> Chaque sortie indique un dénivelé positif visé (D+). Il monte de 10 % au plus d'une semaine à l'autre (de 30 m au plus par semaine tant que tu es sous 100 m). Marche dans les montées raides : c'est plus économique et ça garde des forces pour la descente.</div>`); return al; }
  const sp=P.sport;
  if(sp!=="force"&&wk.w===1&&!(P.hSem>0)) al.push(`<div class="alert warn">Tu n'as pas indiqué tes heures de sport par semaine : le plan démarre prudemment. Renseigne-les dans ton profil pour un plan mieux adapté.</div>`);
  // force : les heures par semaine ne sont pas demandées ; si la semaine 1 dépasse 1,5 fois une durée habituelle de 2 h (soit 3 h), un rappel discret propose de retirer une séance
  if(sp==="force"&&wk.w===1){ const tot=wk.days.filter(d=>d.run&&d.kind!=="before").reduce((t,d)=>t+sessionMin(d.run),0); if(tot>180) al.push(`<div class="alert ok">Cette première semaine fait environ <b>${Math.floor(tot/60)} h ${String(Math.round(tot%60)).padStart(2,"0")}</b>. Si tu t'entraînes d'habitude moins de 2 h par semaine, retire une séance dans ton profil (« Mes entraînements ») : mieux vaut commencer léger.</div>`); }
  if(sp==="force"&&P.minor) keep.push(`<div class="alert warn"><b>Avant 18 ans</b>, garde des charges modérées, une technique propre et la présence d'un adulte compétent. Le plan plafonne l'effort à RPE 8 et ne propose aucun test de maximum.</div>`);
  if(sp==="force"&&P.sObj==="oly"&&wk.w<=4) al.push(`<div class="alert ok"><b>Haltérophilie olympique.</b> L'arraché et l'épaulé-jeté s'apprennent avec un coach : charges légères, barre proche du corps, jamais jusqu'à l'échec. Les séries sont notées à un effort modéré (RPE 7 au plus) pour garder la technique.</div>`);
  if(sp==="force"&&P.niveau==="deb"&&wk.w<=4) keep.push(`<div class="alert warn">Débutant en musculation : charges modérées et technique d'abord pendant 4 à 6 semaines. Ajoute 2,5 kg à la fois, et seulement quand toutes les séries se passent à RPE 6 ou moins.</div>`);
  if(wk.phase==="taper"||wk.phase==="race") al.push(`<div class="alert ok">${wk.phase==="race"?"Semaine de ton objectif":"Allègement"} : le volume baisse mais l'intensité reste. Le déficit fixe est gardé, sans supplément les jours faciles${wk.phase==="race"?", et le jour de l'objectif et sa veille sont à l'équilibre":""}.</div>`);
  else if(wk.deload) al.push(`<div class="alert ok"><b>Semaine allégée.</b> Mêmes séances, moins de volume${sp==="force"?" et RPE plus bas":""} : c'est elle qui permet de progresser ensuite.</div>`);
  return al; }
// séance de force : barre d'effort perçu par séance
function forceBalance14(wk,f){
  const rows=wk.days.filter(d=>d.run).map(d=>({d,r:d.run.rpeAvg||0}));
  const avg=rows.filter(x=>x.r>0).length? rows.reduce((a,x)=>a+x.r,0)/rows.filter(x=>x.r>0).length : 0;
  return `<div class="spb"><h3>Charge de la semaine</h3><span class="num">${rows.length} séance${rows.length>1?"s":""}${avg?" · RPE moyen visé "+fr1(Math.round(avg*10)/10):""}</span></div>
  <ul class="fwl-ul" aria-label="Effort perçu visé par séance">${rows.map(x=>`<li class="fw"><span class="fwl">${esc(DAYS[x.d.i])}</span>${x.r?`<span class="fwb" role="img" aria-label="RPE visé ${fr1(x.r)} sur 10"><i data-sw="${Math.round(x.r*10)}"></i></span><span class="fwv">${esc(x.d.run.title)} · RPE ${fr1(x.r)}</span>`:`<span class="fwb"></span><span class="fwv">${esc(x.d.run.title)}</span>`}</li>`).join("")}</ul>
  <p class="note">Calories : ${f.lowBmi?"maintien tous les jours, sans déficit (voir l'alerte en haut de la semaine).":f.noDef&&!f.taper?"pas de déficit cette semaine, tu manges à hauteur de ta dépense.":"le déficit fixe s'applique tous les jours, avec un supplément les jours de repos. Les jours de séance gardent seulement le déficit fixe, avec des glucides et des protéines autour de la séance."} La dépense d'une séance de force est estimée avec un MET prudent (3,5 à 5).</p>
  ${weekNav14(wk)}`; }
const weekNav14=wk=>`<div class="weeknav">${wk.w>1?`<button class="btn ghost sm" type="button" id="prevW2">‹ Semaine ${wk.w-1}</button>`:""}${wk.w<plan.length?`<button class="btn ghost sm" type="button" id="nextW2">Semaine ${wk.w+1} ›</button>`:""}</div>`;
function sumLast14(v){
  if(runSport()) return st("VMA",fmt1(v.vma),"km/h",v.estimated?"estimée, ajoute un chrono":"d'après "+v.src);
  return st("Sport",SPORT_SHORT[P.sport]||"","",plan.length+" semaines · "+P.seances+" séances par semaine");
}
function renderZones14(){
  const hr=r=>isNaN(P.fcmax)?"ajoute ta FC max":Math.round(P.fcmax*r[0])+"–"+Math.round(P.fcmax*r[1])+" bpm";
  let head,rows;
  if(P.sport==="force"){ head=["RPE","Répétitions en réserve","Sensation","Dans le plan"];
    rows=[["6","4 ou plus","Facile, la barre part vite","Échauffement, semaines allégées"],["7","3","Soutenu, tu pourrais continuer","Technique, haltérophilie, séries secondaires"],["8","2","Dur, la vitesse ralentit","Séries de travail principales"],["9","1","Très dur, à la limite","Rare : pic de fin de cycle, test (jamais avant 18 ans)"],["10","0","Maximal, échec","Jamais dans ce plan, hors test encadré"]]; }
  else{ head=["Effort","Test de la parole","% FC max","FC pour toi"];
    rows=[["Endurance (Z1)","conversation complète","65–78 %",hr(hrOf("z1",.62))],["Tempo (Z2)","phrases courtes","82–88 %",hr(hrOf("z2",.82))],["Intense (Z3)","quelques mots","90–97 %",hr(hrOf("z3",.95))]];
    if(P.sport==="vtt") rows.push(["Cadence","pédalage souple","80–90 tr/min","Intervalles : 60 à 100 tr/min selon le terrain"]); }
  $("#zoneTable").innerHTML=`<thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>`+rows.map(r=>`<tr>${r.map((c,k)=>`<td${k===0?"":' class="mono"'}>${c}</td>`).join("")}</tr>`).join("")+`</tbody>`;
  $("#zoneList").innerHTML=rows.map(r=>`<li><div class="m-main"><div class="m-t"><span>${r[0]}</span><span class="num">${r[1]}</span></div><div class="m-s">${r.slice(2).join(" · ")}</div></div></li>`).join("");
}
const EV14={s:'<span class="ev s">Solide</span>',m:'<span class="ev m">Modéré</span>',p:'<span class="ev p">Pratique</span>'};
const SPORT_CARDS={
  trail:["Trail",[["Le dénivelé positif progresse de 10 % au plus par semaine (de 30 m au plus par semaine sous 100 m).","p"],["Marcher dans les montées raides coûte moins cher que courir et garde des forces pour la suite.","m"],["Les descentes sollicitent surtout les cuisses (travail excentrique) : le renforcement des quadriceps et des fessiers protège.","m"],["Eau, nourriture et vêtement chaud : emporte-les dès que tu t'éloignes ou que la sortie dépasse 1 h 30.","p"]]],
  vtt:["VTT",[["Beaucoup d'endurance facile et un peu d'intensité : environ 80 % du temps en zone facile, le reste en tempo et en intervalles.","m"],["Tempo (« sweet spot ») : des blocs de 10 à 20 minutes à effort soutenu mais tenable, très rentables pour la durée investie.","m"],["Sorties de plus d'1 h 30 : 30 à 60 g de glucides par heure et de l'eau régulièrement ; jusqu'à 90 g par heure au-delà de 2 h 30 si ton ventre l'accepte.","s"],["La technique de pilotage (virages, relances, descentes) se travaille à part, en restant frais.","p"],["Casque, matériel vérifié, personne qui sait où tu roules.","p"]]],
  force:["Force et haltérophilie",[["L'effort perçu (RPE, répétitions en réserve) pilote la charge : plus fiable qu'un pourcentage de maximum quand on débute.","m"],["Au moins 2 séances par semaine et par groupe musculaire, et 10 séries dures par semaine ou plus, donnent de meilleurs gains que moins.","s"],["Repos de 2 à 3 minutes entre les séries lourdes : les gains de force et de masse sont meilleurs qu'avec moins d'une minute.","m"],["Une semaine allégée toutes les 4 semaines : moins de séries et RPE plus bas.","p"],["Protéines : 1,6 à 2,2 g par kilo et par jour (le plan en compte 2 g par kilo), réparties sur la journée.","s"],["Haltérophilie olympique : la technique s'apprend avec un coach, jamais jusqu'à l'échec, et les tirages complètent l'arraché et l'épaulé-jeté.","p"],["Pendant un déficit calorique, garde des protéines élevées et des charges lourdes pour préserver la masse maigre ; la perte doit rester lente.","m"]]],
  forme:["Remise en forme",[["150 minutes d'activité modérée par semaine, plus 2 séances de renforcement : la base des recommandations de santé de l'OMS.","s"],["Reprendre doucement : le cœur s'adapte avant les tendons et les articulations, donc de la marche et du vélo d'abord.","p"],["Des intervalles doux (2 minutes soutenues, 2 minutes faciles) améliorent le souffle sans excès de fatigue.","m"],["Sans motivation du jour, 10 minutes de marche rapide comptent déjà : l'important est la régularité.","p"]]]
};
function renderSportCard14(){ const el=$("#sportCard"); if(!el) return; const c=SPORT_CARDS[P.sport]; el.hidden=!c; if(!c) return;
  el.innerHTML=`<h3>${esc(c[0])}</h3><ul>${c[1].map(x=>`<li>${esc(x[0])} ${EV14[x[2]||x[1]]}</li>`).join("")}</ul>`; }
function raceHint14(){
  const h=$("#raceHint"), rd=state.profile.raceDate; h.classList.remove("bad"); $("#raceDateField").hidden=false;
  const sh=$("#startHint"); if(sh&&sh.dataset.race) sh.hidden=true;
  if(!rd||!okIso(rd)){ setT(h,"Optionnel : le plan se cale sur la date de ton objectif (la dernière semaine). Sans date, le plan dure 12 semaines."); return; }
  const days=Math.round((new Date(rd+"T12:00:00")-new Date(todayIso()+"T12:00:00"))/864e5);
  if(days<0){ h.classList.add("bad"); setT(h,"Cette date est passée : choisis la date de ton prochain objectif."); return; }
  setT(h,"Objectif le "+longDate(rd)+(days===0?", aujourd'hui !":", dans "+days+" jour"+(days>1?"s":"")+".")+" Plan de "+plan.length+" semaines.");
}
const SPORT_HINT={course:"Plan de course à pied, du 5 km au marathon, ou forme et perte de poids.",trail:"Même base que la course, avec un dénivelé positif prévu pour chaque sortie.",vtt:"Sorties de 1 à 5 heures : endurance, tempo, intervalles, côtes et technique. Durées en minutes.",force:"3 à 5 séances par semaine, progression à l'effort perçu (RPE), semaine allégée toutes les 4 semaines.",forme:"Marche, vélo, intervalles doux et circuits pour reprendre ou entretenir ta forme."};
const isForce14=()=> (($("#sport")||{}).value)==="force";
function spShow(root,sport){ root.querySelectorAll("[data-sp]").forEach(el=>{ el.hidden=!el.dataset.sp.split(" ").includes(sport); }); }
function fillSObj(sel,sport,cur){ if(!sel) return; const L=SOBJ[sport]||[]; sel.innerHTML=L.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join(""); sel.dataset.sp=sport; sel.value= L.some(x=>x[0]===cur)? cur : (sport==="vtt"?"moyen":"ppl"); }
function fillSport14(p){ const sp=SPORTS.includes(p.sport)?p.sport:"course"; $("#sport").value=sp; fillSObj($("#sObj"),sp,p.sObj); spShow($("#profileForm"),sp); }
function readSport14(p){ const sp=$("#sport").value; p.sport=SPORTS.includes(sp)?sp:"course"; p.sObj=$("#sObj").dataset.sp===p.sport? $("#sObj").value : ""; if(p.sport==="force"&&+p.seances>5) p.seances="5"; }
function sportChange14(){ const sp=$("#sport").value; fillSObj($("#sObj"),sp,""); spShow($("#profileForm"),sp); }
function syncSportUI14(){
  const sp=P.sport||"course", form=$("#profileForm"); spShow(form,sp);
  const sel=$("#sObj"); if(sel.dataset.sp!==sp) fillSObj(sel,sp,state.profile.sObj);
  setT($("#sObjL"),sp==="vtt"?"Ton objectif VTT":"Orientation de l'entraînement");
  setT($("#lbl-seances"),isRunSp(sp)?"Séances de course par semaine":sp==="force"?"Séances de force par semaine":"Séances par semaine");
  setT($("#lbl-equip"),isRunSp(sp)?"Matériel pour le renforcement":sp==="force"?"Ton matériel":"Matériel pour le renforcement");
  setT($("#sportHint"),SPORT_HINT[sp]); setT($("#lgObj"),"Ton objectif");
  document.querySelectorAll("[data-run-only]").forEach(e=>{ e.hidden=!isRunSp(sp); });
  const pl=$("#planLead"); if(pl){ if(!pl.dataset.o) pl.dataset.o=pl.textContent; }
  renderSportCard14();
}
function syncSeancesSport14(){ if(isForce14()){ const c=document.querySelector('input[name="seances"]:checked'); if(c&&+c.value>5){ const r5=document.querySelector('input[name="seances"][value="5"]'); if(r5) r5.checked=true; } } }

/* assistant */
const wzSport=()=>{ const v=$("#wzSport").value; return SPORTS.includes(v)?v:"course"; };
const wzRun=()=>isRunSp(wzSport());
const wzRaceAllowed=()=> evSport(wzSport()) || $("#wzObjectif").value!=="forme";
const wzSObjVal=()=>{ const s=$("#wzSObj"); return s.dataset.sp===wzSport()? s.value : ""; };
function wzSObjFill(reset){ const s=$("#wzSObj"), sp=wzSport(); if(!reset&&s.dataset.sp===sp) return; fillSObj(s,sp,reset?"":s.value); }
function wzSyncSport(){
  const sp=wzSport(); wzSObjFill(false); spShow(wizEl,sp);
  setT($("#wzSObjL"),sp==="vtt"?"Ton objectif VTT":"Orientation de l'entraînement");
  setT($("#wzRaceL"),evSport(sp)?"Date de ton objectif · optionnel":"Date de ta course · optionnel");
  setT($("#wz-l-seances"),isRunSp(sp)?"Séances de course par semaine":sp==="force"?"Séances de force par semaine":"Séances par semaine");
  setT($("#wz-l-equip"),isRunSp(sp)?"Matériel pour le renforcement":sp==="force"?"Ton matériel":"Matériel pour le renforcement");
  $("#wzRaceF").hidden=!wzRaceAllowed();
  wizEl.querySelectorAll('input[name="wz_seances"]').forEach(r=>{ if(sp==="force"&&+r.value>5){ r.disabled=true; } else if(!(wzr("wz_niveau")==="deb"&&+r.value>4)) r.disabled=false; });
  if(sp==="force"&&wzr("wz_seances")==="6") wzset("wz_seances",5);
  setT($("#wzSpH"),SPORT_HINT[sp]);
}
function wzSportPrefill14(ex,p){ const sp=ex&&SPORTS.includes(p.sport)?p.sport:"course"; $("#wzSport").value=sp; fillSObj($("#wzSObj"),sp,ex?p.sObj:""); $("#wzHSem").value= ex&&p.hSem!=null? String(p.hSem) : ""; }
function wzDraftSport14(f){ if(typeof f.wzSport==="string"&&SPORTS.includes(f.wzSport)){ $("#wzSport").value=f.wzSport; fillSObj($("#wzSObj"),f.wzSport,typeof f.wzSObj==="string"&&(SOBJ[f.wzSport]||[]).some(x=>x[0]===f.wzSObj)? f.wzSObj : ""); } }
function wzObjLabel(p,n){ const sp=SPORTS.includes(p.sport)?p.sport:"course";
  if(sp==="vtt") return "VTT, "+((SOBJ.vtt.find(x=>x[0]===n.sObj)||SOBJ.vtt[1])[1].toLowerCase());
  if(sp==="force") return "Force : "+((SOBJ.force.find(x=>x[0]===n.sObj)||SOBJ.force[0])[1].toLowerCase());
  if(sp==="forme") return "Remise en forme générale";
  return (sp==="trail"?"Trail, ":"")+OBJ[n.objectif].label; }
function wzToday14(p){ return isRunSp(p.sport)? (p.volume||0)+" km par semaine, plus longue sortie "+(p.longest||0)+" km" : p.sport==="force"? "Niveau "+({deb:"débutant",int:"intermédiaire",conf:"confirmé"}[p.niveau]||"") : (p.hSem? p.hSem+" h de sport par semaine" : "Heures de sport non indiquées : le plan démarre prudemment"); }
function wzWeek14(p,n,lieu,eq){ if(isRunSp(p.sport)) return p.seances+" séances de course "+lieu+", "+p.renfo+" de renforcement "+eq+", sortie longue le "+(+n.longDay===5?"samedi":"dimanche");
  if(p.sport==="force") return n.seances+" séances de force, "+eq;
  return n.seances+" séances, "+p.renfo+" de renforcement "+eq+", sortie longue le "+(+n.longDay===5?"samedi":"dimanche"); }

/* ---------- v15 : profil en sections repliables (objectif, données, entraînements, nutrition) ---------- */
const PSEC_KEY="carnet.psec", PSEC_IDS=["ps-sum","ps-obj","ps-me","ps-trn","ps-nut"];
function psecLoad(){ let o=null; try{ o=JSON.parse(localStorage.getItem(PSEC_KEY)||"null"); }catch(e){} const r={}; if(o&&typeof o==="object"&&!Array.isArray(o)) for(const k of PSEC_IDS) if(Object.hasOwn(o,k)&&(o[k]===0||o[k]===1)) r[k]=o[k]; return r; }
function psecInit(){
  const saved=psecLoad();
  document.querySelectorAll("details.psec").forEach(d=>{
    if(Object.hasOwn(saved,d.id)) d.open=saved[d.id]===1;
    d.addEventListener("toggle",()=>{ if(!PSEC_IDS.includes(d.id)) return; const o=psecLoad(); o[d.id]=d.open?1:0; try{ localStorage.setItem(PSEC_KEY,JSON.stringify(o)); }catch(e){} });
  });
}
// ouvre la section qui contient un champ (avant de lui donner le focus)
function psecReveal(el){ const d=el&&el.closest&&el.closest("details.psec"); if(d&&!d.open) d.open=true; return el; }
// valeur saisie ramenée aux bornes : le résumé le dit au lieu d'afficher la valeur corrigée comme si c'était la tienne
const psClamp={};
function psecClamp(id,typed,to){ if(["age","taille","poids"].includes(id)) psClamp[id]={typed:String(typed).slice(0,12),to}; }
function psecLine(id,txt){  const el=document.getElementById(id); if(el) setT(el,txt); }
/* regénérer l'entraînement : le plan repart d'aujourd'hui (ou du début calculé pour la course) avec le profil actuel.
   Suivi, coches et ressenti sont gardés ; les déplacements à venir peuvent être remis à leur place (marques d'effacement horodatées, pour la synchro). */
function regenPreview(){ const r=raceOn(state.profile), st=r? autoStart(r) : todayIso(); let n=0; try{ n=buildPlan(profileNums({...state.profile,start:st})).length; }catch(e){}
  const end= n? addDays(mondayOf(st),n*7-1) : ""; return {st,n,end,race:r}; }
function regenPlan(resetMoves){
  const v=regenPreview(), now=Date.now(), tdy=todayIso(); let nm=0;
  if(resetMoves){ const mv={...cleanMoves(state.moves)}; for(const [k,m] of Object.entries(mv)) if(m&&m.to&&(k>=tdy||m.to>=tdy)){ mv[k]={to:"",at:now}; nm++; } state.moves=cleanMoves(mv); }
  state.profile={...state.profile,start:v.st}; state.isExample=false; plan=buildPlan(profileNums(state.profile)); const tp=todayPos(); state.week=tp?tp.w:1;
  fillForm(); persist(); recompute(); return {...v,nm}; }
function renderRegen(){ const box=$("#regen"); if(!box) return; box.hidden=!!state.isExample; if(box.hidden) return;
  const v=regenPreview(), row=(k,t)=>`<div><dt>${esc(k)}</dt><dd>${esc(t)}</dd></div>`, df=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"});
  $("#rgPrev").innerHTML= v.n? row("Durée",v.n+" semaine"+(v.n>1?"s":""))+row("Début",df(v.st))+row(v.race?"Course":"Fin",df(v.race||v.end)) : "";
  const tdy=todayIso(), nm=Object.entries(cleanMoves(state.moves)).filter(([k,m])=>m&&m.to&&(k>=tdy||m.to>=tdy)).length; $(".rg-opt").hidden=!nm; }
$("#rgGo").addEventListener("click",e=>{ const v=regenPreview(), keep=$("#rgMoves").checked&&!$(".rg-opt").hidden, df=d=>longDate(d);
  if(!v.n){ toast("Complète d'abord ton profil : âge, taille et poids."); return; }
  openSheet({title:"Régénérer mon plan",opener:e.currentTarget,kind:"regen",closeLabel:"Annuler",firstClose:true,
    html:`<p class="note">Ton plan sera recréé avec ton profil actuel : <b>${v.n} semaine${v.n>1?"s":""}</b>, du ${esc(df(v.st))} au ${esc(df(v.end))}${v.race?", jusqu'à ta course":""}.</p>
      <ul class="rg-list"><li><b>Repart</b> de la semaine 1${keep?", séances déplacées remises à leur place":""}.</li><li><b>Conservés</b> : suivi, pesées, séances cochées, ressenti et activités importées.</li>${state.aip&&state.aip.p&&!state.aip.p.x?"<li><b>Ajustement de l'IA</b> : il ne s'appliquera plus au nouveau plan ; relance-le ensuite dans le Profil.</li>":""}</ul>`,
    foot:`<button class="btn" type="button" id="rgOk">Régénérer</button>`,
    onReady:sh=>{ sh.querySelector("#rgOk").addEventListener("click",()=>{ const r=regenPlan(keep); closeSheet(true); selectTab("semaine"); window.scrollTo(0,0);
      toast("Plan regénéré : "+r.n+" semaine"+(r.n>1?"s":"")+", à partir du "+longDate(r.st)+(r.nm?" · "+r.nm+" séance"+(r.nm>1?"s":"")+" remise"+(r.nm>1?"s":"")+" en place":"")+"."); }); }}); });
/* ---- ajustement du plan par l'IA (api/plan.js) : rien n'est envoyé sans un accord donné à chaque envoi, réservé aux adultes connectés ----
   Envoyé : âge, sport, niveau, objectif, séances par semaine, la structure des semaines à venir du plan de base (phase, km, minutes, séances d'intensité
   et leurs remplaçants permis), la complexité choisie ; si coché, les 8 derniers ressentis (sans notes) ; si écrit, une demande de 300 caractères au plus. */
const PLAN_AI_URL=(()=>{ const u=String((window.APP_CONFIG||{}).PLAN_AI_URL||"").trim(), loc=["localhost","127.0.0.1"].includes(location.hostname);
  // chemin same-origin « /api/… » (fonction du site), ou https absolue, ou http vers localhost pour tester
  return u.length<=300&&(/^\/(?!\/)[A-Za-z0-9._~%\/-]{0,160}$/.test(u)||/^https:\/\/[a-z0-9]([a-z0-9.-]{0,120})(:\d{2,5})?(\/[A-Za-z0-9._~\/-]{0,120})?$/i.test(u)||(loc&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?(\/[A-Za-z0-9._~\/-]{0,120})?$/.test(u)))? u : ""; })();
const CPLX_LAB={simple:"Simple",standard:"Standard",avance:"Avancé"};
let aipBusy=false;
function aipBody(feel,wish){
  const n=profileNums(state.profile), base=buildPlan({...n,noAi:true}), tp=todayPos(), w0=tp?tp.w:1, run=!evSport(n.sport), vma=run? vmaOf(n).vma : 0, r1=v=>Math.round(v*10)/10;
  const semaines=base.filter(wk=>wk.w>=w0).slice(0,52).map(wk=>{ const ds=wk.days.filter(d=>d.run&&d.kind!=="before"&&Array.isArray(d.run.blocks));
    const o={s:wk.w,phase:wk.phase,allegee:!!wk.deload,minutes:Math.round(ds.reduce((a,d)=>a+sessionMin(d.run),0))};
    if(run){ o.km=r1(ds.reduce((a,d)=>a+(d.run.type!=="race"?sessionKm(d.run,vma):0),0)); o.qualite=ds.filter(d=>d.run.type==="q"&&d.run.kind).map(d=>({type:d.run.kind,options:qOpts(d.run.kind,n,wk.qPool),j:d.i}));
      // tout l'entraînement de la semaine : footings, sortie longue, renforcement, avec ce que l'IA a le droit d'y changer (aiEasyOpts, aiLongOk, aiRenfoOk)
      const fx=ds.filter(aiEasy); if(fx.length) o.faciles=fx.map(d=>({j:d.i,min:Math.round(sessionMin(d.run)),options:aiEasyOpts(d,n)}));
      const lg=ds.find(d=>d.run.type==="long"&&d.kind!=="race"); if(lg) o.longue={j:lg.i,km:r1(sessionKm(lg.run,vma)),min:Math.round(sessionMin(lg.run)),options:aiLongOk(lg,n)?["allege"]:[]};
      const rf=wk.days.filter(d=>d.renfo&&d.kind!=="before"); if(rf.length) o.renfo=rf.slice(0,3).map(d=>({j:d.i,min:parseInt(d.renfo.m)||0,options:aiRenfoOk(d,n)?["leger"]:[]})); }
    return o; });
  const b={v:1,complexite:n.cplx,profil:{age:n.age,sport:n.sport,niveau:n.niveau,objectif:n.runObjectif||n.objectif,seances:n.seances,renfo:n.renfo,semaines_plan:base.length},semaines};
  if(n.renfoMin>0||n.hQuota>0) b.temps={...(n.renfoMin>0?{renfo_min:n.renfoMin}:{}),...(n.hQuota>0?{quota_h:n.hQuota}:{})};   // temps choisi : déjà appliqué par le site, l'IA en tient compte
  if(feel){ const f=(window.CarnetBridge.summary({feel:true}).ressenti||[]).map(x=>({effort:x.effort,forme:x.forme,douleur:x.douleur})); if(f.length) b.ressenti=f; }
  if(wish) b.souhait=wish;
  if(n.pref) b.preferences=n.pref;   // préférences de séances du profil (filet de sécurité appliqué avant l'envoi et côté serveur)
  return b; }
async function aipCall(body){
  let tk=null;
  try{ tk=window.CarnetAuth&&window.CarnetAuth.accessToken? await window.CarnetAuth.accessToken() : null; }catch(e){}
  if(typeof tk!=="string"||!/^[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/.test(tk)||tk.length>=4096) throw {m:"Connecte-toi à ton compte pour utiliser l'IA : le serveur vérifie qui tu es. Sans connexion, rien n'est envoyé."};
  // l'appel réseau est dans planai.js (app.js n'ouvre aucune connexion)
  const net=window.CarnetPlanAI; if(!net) throw {m:"L'IA n'est pas disponible pour le moment. Recharge la page puis réessaie."};
  const r=await net.send(PLAN_AI_URL,body,tk);
  if(!r.status) throw {m:r.slow? "L'IA met trop de temps à répondre. Réessaie dans un moment." : "Impossible de joindre le serveur. Vérifie ta connexion."};
  let o=null; try{ o=JSON.parse(r.text); }catch(e){}
  if(r.status>=200&&r.status<300&&o&&o.plan&&typeof o.plan==="object"&&Array.isArray(o.plan.semaines)) return o.plan;
  throw {m: o&&typeof o.reply==="string"? o.reply.replace(/[\u0000-\u001f\u007f]/g," ").slice(0,600) : r.status===429? "Trop de demandes pour le moment : réessaie dans quelques minutes." : r.status===401||r.status===403? "Connexion requise : reconnecte-toi puis réessaie." : "L'IA n'a pas pu ajuster ton plan. Réessaie dans un moment.",safe:!!(o&&o.safe)}; }
// sig : empreinte du profil au moment de l'envoi ; un profil changé pendant l'attente rend la réponse caduque (elle n'est pas enregistrée)
function aipSave(r,cplx,sig){ if(sig!==planSig(profileNums(state.profile))) return false; const wk={};
  for(const x of r.semaines.slice(0,60)) if(x&&Number.isInteger(x.s)&&x.s>=1&&x.s<=60) wk[x.s]={f:x.focus,c:x.conseil,q:Array.isArray(x.q)? x.q.map(k=>k==="garder"?"":k) : [],a:x.allege===true?1:0,
    e:Array.isArray(x.faciles)? x.faciles.map(k=>k==="garder"?"":k) : [],l:x.longue==="allege"?1:0,r:Array.isArray(x.renfo)? x.renfo.map(k=>k==="leger"?"leger":"") : []};
  state.aip=cleanAip({p:{sig,at:Date.now(),cplx,resume:r.resume,wk}}); persist(); recompute(); return true; }
// temps écrit dans la demande (« renfo de 1h30 », « 5 h de sport par semaine ») : repris dans les champs restés vides, contrôlés comme une saisie
const durMin=t=>{ const m=/(\d{1,3})\s*(?:h|heures?)\s*(\d{1,2})?(?!\d)/i.exec(t); if(m) return +m[1]*60+(+m[2]||0); const n=/(\d{1,3})\s*(?:min|minutes?|mn)\b/i.exec(t); return n? +n[1] : NaN; };
function wishTime(w){ const t=String(w||"").toLowerCase(), o={};
  const r=/(?:renfo\w*|renforcement|muscu\w*)[^.;,]{0,40}?(\d{1,3}\s*(?:h|heures?|min|minutes?|mn)\s*\d{0,2})/.exec(t); if(r){ const m=durMin(r[1]); if(m>0) o.renfoMin=m; }
  const q=/(\d{1,2}(?:[.,]\d)?)\s*(?:h|heures?)(?:\s*(\d{2}))?\s*(?:de sport|d.entra[iî]nement|de course)?\s*(?:par|\/|chaque|toutes? les?)\s*(?:la\s*)?sem/.exec(t); if(q) o.hQuota=numOf(q[1])+(+q[2]||0)/60;
  return o; }
function aipSheet(opener){
  const host=(()=>{ try{ return new URL(PLAN_AI_URL, location.origin).host; }catch(e){ return ""; } })(), prov=esc(String((window.APP_CONFIG||{}).CHAT_PROVIDER_NAME||"un fournisseur d'IA").replace(/[\u0000-\u001f<>]/g,"").slice(0,60));
  const chk=(id,t,d)=>`<label class="chk"><input type="checkbox" id="${id}"><span>${t}<small>${d}</small></span></label>`;
  openSheet({title:"Ajuster mon plan avec l'IA",opener,kind:"aip",
    html:`<p class="note">Pour ajuster ton plan, Pacebook envoie à la fonction du site (<b>${esc(host)}</b>, hébergée par Vercel dans l'Union européenne) puis à <b>${prov}</b> (une intelligence artificielle) : ton âge, ton sport, ton niveau, ton objectif, tes séances de sport et de renforcement par semaine, la durée de ton plan, la complexité choisie (<b>${esc(CPLX_LAB[P.cplx]||"Standard")}</b>)${P.pref?", tes préférences de séances écrites dans le Profil":""} et la structure des semaines à venir (phase, semaine allégée ou non, kilomètres, minutes, et chaque séance : jour, durée, type). Ni ton nom, ni ton poids, ni tes notes ne sont envoyés. Ces données sortent de ton appareil et de l'Union européenne. Rien n'est envoyé sans ton accord.</p>
<div class="alert warn"><b>Offre gratuite de Google Gemini</b> : Google peut conserver ces données, s'en servir pour améliorer ses produits et les faire relire par des personnes.</div>
<div class="field"><label for="aipWish">Ta demande (facultatif)</label><textarea id="aipWish" maxlength="300" rows="3" placeholder="ex. je préfère les côtes au fractionné ; mes semaines sont chargées en ce moment" aria-describedby="aipWishH"></textarea><span class="hint" id="aipWishH">${P.pref?"Tes préférences du Profil sont déjà incluses. ":""}N'écris ni ton nom ni de détail médical. 300 caractères au plus.</span></div>
<fieldset class="aip-time"><legend>Ton temps (facultatif)</legend><div class="row2"><div class="field"><label for="aipRenfo">Durée d'un renfo (min)</label><input id="aipRenfo" type="number" min="20" max="120" step="5" inputmode="numeric" placeholder="selon le plan" value="${P.renfoMin>0?P.renfoMin:""}" aria-describedby="aipTimeH"></div>${runSport()?`<div class="field"><label for="aipQuota">Sport par semaine (h)</label><input id="aipQuota" type="text" inputmode="decimal" maxlength="8" placeholder="ex. 5" value="${P.hQuota>0?esc(numTxt(P.hQuota)):""}" aria-describedby="aipTimeH"></div>`:""}</div><span class="hint" id="aipTimeH">Appliqués par le site à tout ton plan et enregistrés dans ton profil : le temps de sport est un plafond (renfo compris), jamais un objectif à remplir. Vide : selon le plan.</span></fieldset>
<div class="grp" role="group" aria-label="Ce qui est envoyé">${chk("aipFeel","Inclure mon ressenti après séance","Les 8 derniers : effort perçu, forme, douleur (sans tes notes). Décoché par défaut.")}
${chk("aipOk","J'accepte cet envoi","Obligatoire, pour cet ajustement seulement.")}</div>
<div class="alert warn">L'IA ne touche ni au volume de chaque semaine ni à tes jours : elle choisit parmi les séances que le plan permet, si bien qu'une séance peut devenir plus courte ou plus longue. C'est une aide générale, <b>pas un avis médical</b>.</div>
<p class="note" id="aipErr" role="alert" hidden></p>`,
    foot:`<button class="btn" type="button" id="aipSend">Envoyer</button>`,
    onReady:sh=>{ const go=sh.querySelector("#aipSend"), err=sh.querySelector("#aipErr"), ok=sh.querySelector("#aipOk"); ok.setAttribute("data-first","");
      // message d'erreur rendu visible (il est en bas de la feuille) ; le focus reste dans la feuille
      const show=m=>{ err.hidden=false; err.textContent=m; try{ err.scrollIntoView({block:"nearest"}); }catch(e){} };
      go.addEventListener("click",async()=>{ if(aipBusy){ show("Un ajustement est déjà en cours : attends sa réponse."); return; }
        if(!ok.checked){ show("Coche « J'accepte cet envoi » pour lancer l'ajustement."); ok.focus(); return; }
        const wish=sh.querySelector("#aipWish").value.replace(/\s+/g," ").trim().slice(0,300);
        // temps choisi : contrôlé, puis enregistré dans le profil avant l'envoi (le plan envoyé à l'IA en tient déjà compte)
        { const wt=wishTime(wish), fill=(id,v)=>{ const el=sh.querySelector("#"+id); if(el&&!String(el.value).trim()&&v>0) el.value=String(Math.round(v*10)/10).replace(".",","); }; fill("aipRenfo",wt.renfoMin); fill("aipQuota",wt.hQuota); }
        const tf=[["aipRenfo","renfoMin",20,120,5,"La durée d'un renfo va de 20 à 120 min."],["aipQuota","hQuota",1,25,.5,"Le temps de sport par semaine va de 1 à 25 h."]], tv={};
        for(const [id,k,lo,hi,st,m] of tf){ const el=sh.querySelector("#"+id); if(!el) continue; const raw=String(el.value||"").trim(), v=numOf(raw); fieldErr(el,"");
          if(!raw){ tv[k]=""; continue; } if(!/^\d{1,3}([.,]\d{1,2})?$/.test(raw)||isNaN(v)||v<lo||v>hi){ fieldErr(el,m); show(m); el.focus(); return; } tv[k]=String(Math.round(v/st)*st); }
        if(Object.keys(tv).some(k=>String(state.profile[k]??"")!==tv[k])){ state.profile={...state.profile,...tv}; state.isExample=false; fillForm(); persist(); recompute(); }
        // filet de sécurité du Coach, avant tout envoi : un sujet grave n'est jamais envoyé
        const pref=P.pref||"", prefRaw=String(($("#pref")||{}).value||state.profile.pref||""), G=t=>!!t&&window.CarnetCoach.guard(t);
        let k=""; try{ k=window.CarnetCoach? G(wish)||G(prefRaw)||G(pref)||"" : ""; }catch(e){}
        if(k){ show("Ce que tu écris peut être sérieux et je ne l'ai envoyé à aucun serveur. En cas de détresse, appelle le 3114 (24 h sur 24) ; en cas d'urgence, le 15 ou le 112. Pour une douleur ou un malaise, arrête l'effort et consulte un médecin."); return; }
        // bouton « occupé » sans disabled : il garde le focus (Échap et Tab restent dans la feuille pendant l'attente)
        const cplx=P.cplx, sig=planSig(profileNums(state.profile)); aipBusy=true; go.setAttribute("aria-disabled","true"); go.textContent="L'IA prépare ton plan…"; err.hidden=true;
        try{ const r=await aipCall(aipBody(sh.querySelector("#aipFeel").checked,wish)), mine=sh.isConnected;
          if(!aipSave(r,cplx,sig)){ const m="Ton profil a changé pendant l'ajustement : la réponse de l'IA n'est pas appliquée. Relance-le."; if(mine) show(m); else toast(m); return; }
          if(mine) closeSheet(true);   // une réponse tardive ne ferme jamais une autre feuille ouverte entre-temps
          const n=plan.ai? plan.ai.n : 0; toast("Plan ajusté par l'IA : "+(n? n+" séance"+(n>1?"s":"")+" modifiée"+(n>1?"s":"")+", " : "séances gardées, ")+"un conseil par semaine.");
          const g=$("#aipGo"); if(mine&&g) g.focus({preventScroll:true}); }
        catch(e){ const m=e&&e.m||"L'IA n'a pas pu ajuster ton plan. Réessaie dans un moment."; if(sh.isConnected) show(m); else toast(m); }
        finally{ aipBusy=false; if(go.isConnected){ go.removeAttribute("aria-disabled"); go.textContent="Envoyer"; } } }); }}); }
function renderAip(){ const box=$("#aiPlan"); if(!box) return;
  const n=P, show=!!PLAN_AI_URL&&!state.isExample&&!n.incomplete&&!n.minor; box.hidden=!show; if(!show) return;
  setT($("#aipCplx"),CPLX_LAB[n.cplx]||"Standard");
  const a=state.aip&&state.aip.p, on=!!(a&&!a.x), cur=on&&!!aiOf(profileNums(state.profile)), dt=on? new Date(a.at).toLocaleDateString("fr-FR",{day:"numeric",month:"long"}) : "", k=plan.ai? plan.ai.n : 0;
  const guest=acct.st==="guest";
  setT($("#aipSt"), guest&&!on? "Connecte-toi à ton compte pour utiliser l'IA : le serveur vérifie qui tu es avant tout envoi." : !on? "Pas encore d'ajustement : ton plan suit les règles du site." : cur? "Ajusté le "+dt+" en "+(CPLX_LAB[a.cplx]||"Standard").toLowerCase()+" : "+(k? k+" séance"+(k>1?"s":"")+" modifiée"+(k>1?"s":"") : "séances gardées")+", un conseil par semaine."+(a.resume?" "+a.resume:"") : "Ton profil a changé depuis l'ajustement du "+dt+" : il n'est plus appliqué. Relance-le pour l'adapter.");
  setT($("#aipGo"),guest?"Se connecter":on?"Relancer l'ajustement":"Ajuster avec l'IA"); $("#aipOff").hidden=!on;
  // avant / après : liste repliée des séances modifiées, seulement quand l'ajustement est appliqué au plan affiché
  const md=$("#aipMods"), ml=$("#aipModsL"); if(md&&ml){ const rows=cur? plan.flatMap(wk=>wk.days.flatMap(d=>[...(d.run&&d.run.aiFrom?[{w:wk.w,d}]:[]),...(d.renfo&&d.renfo.aiFrom?[{w:wk.w,d,rf:1}]:[])])) : [];
    md.hidden=!rows.length; setT($("#aipModsT"),"Voir avant / après ("+rows.length+" séance"+(rows.length>1?"s":"")+")");
    ml.innerHTML=rows.map(({w,d,rf})=>rf? `<li><span class="aml-h">Semaine ${w} · ${DAYS[d.i].toLowerCase()} · renforcement</span><span class="aml-b"><span class="aiba-k">Avant</span> <b>${esc(d.renfo.aiFrom.t)}</b> · ${esc(d.renfo.aiFrom.m)}</span><span class="aml-b now"><span class="aiba-k">Après</span> <b>${esc(d.renfo.t)}</b> · ${esc(d.renfo.m)}</span></li>` : `<li><span class="aml-h">Semaine ${w} · ${DAYS[d.i].toLowerCase()}${d.run.aiLight?" · allégée":""}</span><span class="aml-b"><span class="aiba-k">Avant</span> ${aiLine(d.run.aiFrom)}</span><span class="aml-b now"><span class="aiba-k">Après</span> ${aiLine(aiSnap(d.run,E.vma))}</span></li>`).join(""); } }
{ const g=$("#aipGo"); if(g) g.addEventListener("click",e=>{ if(!PLAN_AI_URL) return; if(acct.st==="guest"){ openAuth("login",e.currentTarget); return; } aipSheet(e.currentTarget); });
  const o=$("#aipOff"); if(o) o.addEventListener("click",()=>{ state.aip=cleanAip({p:{x:1,at:Date.now()}}); persist(); recompute(); toast("Ajustement de l'IA retiré : ton plan suit de nouveau les règles du site."); $("#aipGo").focus({preventScroll:true}); }); }
function renderPsec(){
  const p=P, sp=p.sport||"course", SX={H:"Homme",F:"Femme"};
  const dt=p.raceDate&&okIso(p.raceDate)? " · le "+dfmt(new Date(p.raceDate+"T12:00:00")) : "";
  const goal= (sp==="course"||sp==="trail")? (p.objectif==="forme"? "forme et perte de poids" : OBJ[p.objectif].label+dt) : (evSport(sp)&&dt? "objectif"+dt.slice(2) : "");
  psecLine("psl-obj",[SPORT_LAB[sp]||"Course à pied",goal,isNaN(p.cible)?"":"poids visé "+fmt1(p.cible)+" kg"].filter(Boolean).join(" · "));
  // valeurs SAISIES : une valeur hors limites n'est jamais écrêtée en silence, elle est montrée telle quelle avec un avertissement
  const raw=(k,u,fm)=>{ const r=state.profile[k]; if(r==null||String(r).trim()==="") return ""; const v=numOf(r), B=BOUNDS[k], c=psClamp[k]; if(isNaN(v)||v<B[0]||v>B[1]) return String(r).trim().slice(0,12)+" "+u+" (hors limites "+B[0]+" à "+B[1]+")"; if(c&&c.to===v) return (fm?fm(v):v)+" "+u+" (saisi : "+c.typed+", ramené au "+(c.typed>v?"maximum":"minimum")+")"; if(c) delete psClamp[k]; return (fm?fm(v):v)+" "+u; };
  psecLine("psl-me",[SX[state.profile.sexe]||"",raw("age","ans"),raw("taille","cm"),raw("poids","kg",fmt1)].filter(Boolean).join(" · "));
  const tr=[p.seances?p.seances+(sp==="force"?" séances de force":" séances")+" par semaine":"", sp==="course"||sp==="trail"? ({dehors:"dehors",tapis:"tapis",mixte:"dehors et tapis"}[p.lieu]||""):"", p.renfo>0&&sp!=="force"?p.renfo+" de renforcement":"", p.cplx&&p.cplx!=="standard"? "plan "+CPLX_LAB[p.cplx].toLowerCase() : ""];
  psecLine("psl-trn",tr.filter(Boolean).join(" · "));
  psecLine("psl-nut",[p.deficit>0?"déficit "+fmt0(p.deficit)+" kcal":"maintien", p.bonus>0?"+ "+fmt0(p.bonus)+" kcal les jours faciles":"", p.adj?(p.adj>0?"déficit réduit de ":"déficit augmenté de ")+fmt0(Math.abs(p.adj))+" kcal (ajustement)":""].filter(Boolean).join(" · "));
}
function psecSum(){ if(Object.keys(OOB).length){ psecLine("psl-sum","corrige ta saisie : valeur hors limites"); return; } const f=dayFuel(P,E,plan[state.week-1]); psecLine("psl-sum","≈ "+fmt0(f.kcalAvg)+" kcal/j en moyenne · "+(f.realDef<-15? "surplus "+fmt0(-f.realDef) : "déficit "+fmt0(f.noDef?0:f.realDef))+" kcal/j · semaine "+state.week); }
/* ---- saisie hors limites : jamais enregistrée telle quelle, signalée sur le champ (aria-invalid) et dans le bilan ---- */
const OOB={}, OOB_U={age:"ans",taille:"cm",poids:"kg",cible:"kg",volume:"km",longest:"km",mg:"%",fcmax:"bpm",adj:"kcal",deficit:"kcal",bonus:"kcal",hSem:"h",renfoMin:"min",hQuota:"h"};
function oobGuard15(p){
  for(const k of Object.keys(BOUNDS)){ const el=document.getElementById(k); if(!el||!(k in p)) continue;
    const v=numOf(p[k]), B=BOUNDS[k];
    if(!isNaN(v)&&(v<B[0]||v>B[1])){
      OOB[k]=1; p[k]= state.profile[k]!=null? state.profile[k] : "";   // la valeur précédente reste la valeur du profil
      el.setAttribute("aria-invalid","true");
      fieldNote(el,"Hors limites : de "+numTxt(B[0])+" à "+numTxt(B[1])+" "+OOB_U[k]+". Corrige ta saisie : ta valeur précédente est gardée en attendant.");
    }else if(OOB[k]){ delete OOB[k]; el.removeAttribute("aria-invalid"); const n=document.getElementById(k+"Fix"); if(n) n.hidden=true; } }
}
function oobClear15(el){ if(el&&OOB[el.id]){ delete OOB[el.id]; el.removeAttribute("aria-invalid"); } }
function oobHtml(){ const ks=Object.keys(OOB);
  // valeur ramenée aux bornes à la validation du champ (ex. 9999 kg -> 250) : le bilan le dit, il ne présente pas ses chiffres comme ceux de la saisie
  const cl=["age","taille","poids"].filter(k=>{ const c=psClamp[k], v=numOf(state.profile[k]); return c&&c.to===v; }).map(k=>({age:"l'âge",taille:"la taille",poids:"le poids"}[k]+" saisi ("+psClamp[k].typed+") a été ramené à "+numTxt(psClamp[k].to)));
  const warnClamp= cl.length? '<div class="alert warn oob15" role="alert"><b>Valeur corrigée</b> : '+cl.join(" ; ")+'. Ces chiffres sont calculés avec la valeur ramenée aux limites : corrige ta saisie pour un bilan juste.</div>' : "";
  if(!ks.length) return warnClamp; const L={age:"l'âge",taille:"la taille",poids:"le poids",cible:"le poids visé",volume:"le volume",longest:"la plus longue sortie",mg:"la masse grasse",fcmax:"la FC max",adj:"l'ajustement",deficit:"le déficit",bonus:"le supplément",hSem:"les heures par semaine"};
  return '<div class="alert warn oob15" role="alert"><b>Corrige ta saisie</b> : '+ks.map(k=>L[k]||k).join(", ")+' hors limites. Les chiffres ci-dessous sont calculés avec ta valeur précédente.</div>' + warnClamp; }

psecInit();

/* v15 site : pont en lecture seule vers le Coach (coach.js). Aucun accès réseau ici ; le résumé n'est construit que pour les rubriques acceptées. */
window.CarnetBridge=Object.freeze({
  openSheet, closeSheet, esc,
  ready:()=>!!P&&!state.isExample&&!P.incomplete, minor:()=>!!(P&&P.minor),
  guest:()=>acct.st==="guest",   // invité (sans compte) : le coach demande une connexion avant tout envoi
  summary(inc){ const o={}, fin=v=>Number.isFinite(+v)? Math.round(+v*10)/10 : null; inc=inc||{};
    if(P) o.profil={age:fin(P.age)};   // l'âge est toujours joint (avec le consentement) : le serveur réserve le coach aux adultes
    if(inc.profile&&P) o.profil={sport:SPORTS.includes(P.sport)?P.sport:"course",niveau:["deb","int","conf"].includes(P.niveau)?P.niveau:null,objectif:Object.hasOwn(OBJ,P.objectif)?P.objectif:null,seances:fin(P.seances),renfo:fin(P.renfo),age:fin(P.age),poids_kg:fin(P.poids),semaine:state.week,semaines_plan:plan.length};
    if(inc.feel) o.ressenti=Object.entries(state.feel||{}).filter(([k,v])=>v&&!v.x&&okIso(k)).sort((a,b)=>a[0]<b[0]?1:-1).slice(0,8).map(([k,v])=>({date:k,effort:fin(v.rpe)||null,forme:fin(v.mood)||null,douleur:+v.pain===2?2:+v.pain===1?1:0}));
    if(inc.stats){ const w={}; for(const v of Object.values(state.acts||{})){ if(!v||v.del||!okIso(v.date)) continue; const m=IMP14.mondayIso(v.date); (w[m]=w[m]||{semaine:m,seances:0,minutes:0,km:0}); w[m].seances++; w[m].minutes+=fin(v.min)||0; w[m].km=Math.round((w[m].km+(fin(v.km)||0))*10)/10; }
      o.stats=Object.values(w).sort((a,b)=>a.semaine<b.semaine?1:-1).slice(0,4); }
    return o; }
});

/* ---------- sauvegarde ---------- */
const LS="carnet-course.v1";
// stockage local : on vérifie qu'il fonctionne vraiment (navigation privée, stockage bloqué) avant de dire que c'est enregistré
let lsOK=(()=>{ try{ localStorage.setItem("carnet.t","1"); localStorage.removeItem("carnet.t"); return true; }catch(e){ return false; } })();
let lastRaw=null;
function persistLocal(){ try{
  // le profil a changé ici : horodaté, il l'emportera sur celui d'un autre appareil ou onglet moins récent
  // chaque champ modifié reçoit aussi sa propre date : deux appareils qui changent des champs différents gardent les deux changements
  const pj=JSON.stringify(state.profile); if(pj!==lastPJ){ const now=Date.now(); let old=null; try{ old=lastPJ? JSON.parse(lastPJ) : null; }catch(e){}
    const at=cleanPAt(state.pAt); for(const k of Object.keys(state.profile)) if(!old||JSON.stringify(old[k])!==JSON.stringify(state.profile[k])) at[k]=now;
    state.pAt=cleanPAt(at); lastPJ=pj; state.profileAt=now; }
  // un autre onglet a écrit depuis : on fusionne avant d'écrire, pour ne pas écraser ses changements
  const raw=localStorage.getItem(LS);
  if(raw&&raw!==lastRaw){ let cur=null; try{ cur=JSON.parse(raw); }catch(e){} if(cur&&cur.profile&&typeof cur.profile==="object"&&(+cur.savedAtLocal||0)>(+state.savedAtLocal||0)){ const r=mergeInto(cur,+cur.savedAtLocal||0); if(r.changed) queueMicrotask(()=>rerender(r)); } }
  state.savedAtLocal=Date.now(); const out=JSON.stringify(state); localStorage.setItem(LS,out); lastRaw=out; lsOK=true; return true; }catch(e){ lsOK=false; return false; } }
// fusion de données d'un autre appareil ou onglet : suivi en union, coches et déplacements par date de modification, profil le plus récent ; tout est nettoyé
function mergeInto(d,srcT){
  const snap=()=>JSON.stringify([state.profile,state.isExample,state.log,state.done,state.moves,state.deleted,state.seen,state.feel,state.acts,state.rhr,state.aip,state.evr]), before=snap();
  const del=mergeDeleted(state.deleted,d.deleted), week=state.week;
  const hasP=!!(d.profile&&typeof d.profile==="object"&&!Array.isArray(d.profile)), pl=+state.profileAt||0, pr=+d.profileAt||0;
  const prof= hasP&&((state.isExample&&!d.isExample&&!pl)||((pl||pr)? pr>pl : (+srcT||0)>(+state.savedAtLocal||0)));
  // profil le plus récent, puis les champs modifiés plus récemment de l'autre côté
  const mp= hasP&&!state.isExample&&!d.isExample? (prof? mergeProfile(d.profile,d.pAt,state.profile,state.pAt) : mergeProfile(state.profile,state.pAt,d.profile,d.pAt)) : prof? {profile:d.profile,pAt:cleanPAt(d.pAt)} : {profile:state.profile,pAt:cleanPAt(state.pAt)};
  const pch= JSON.stringify(mp.profile)!==JSON.stringify(state.profile);
  const m={...x14Merge(d,state),profile:mp.profile,pAt:mp.pAt,isExample:prof?d.isExample:state.isExample,log:dropDeleted(cleanLog([...cleanLog(d.log),...cleanLog(state.log)]),del),week,
    appliedByDate:{...cleanApplied(d.appliedByDate),...cleanApplied(state.appliedByDate)},deleted:del,moves:mergeStamped(d.moves,state.moves,cleanMoves),done:mergeStamped(d.done,state.done,cleanDone),
    seen:Math.max(+state.seen||0,+d.seen||0),savedAtLocal:state.savedAtLocal,profileAt:Math.max(pl,hasP?pr:0)};
  // semaine affichée : jamais celle de l'autre onglet. Elle reste celle-ci, sauf si le début du plan a changé (plan recommencé) : loadState se recale
  // alors sur la semaine en cours, et le profil changé fait réafficher (rerender)
  const st0=effStart(state.profile); loadState(m); if(effStart(state.profile)===st0) state.week=clampWeek(week);
  return {changed:snap()!==before,prof:prof||pch};
}
function rerender(r){ try{ recompute(); if(r&&r.prof) fillForm(); }catch(e){} }
const LS_BLOCKED="impossible ici, le stockage de ton navigateur est bloqué. Tes changements seront perdus en fermant la page.";
// message de sauvegarde quand il n'y a pas de compte
function localStatus(){ return !lsOK? LS_BLOCKED : state.isExample&&!localSaved? "données d'exemple, rien d'enregistré encore." : "sur cet appareil seulement."; }
let localSaved=false, noAccount=false;
function loadLocal(){try{const s=JSON.parse(localStorage.getItem(LS)||"null");if(s&&s.profile&&typeof s.profile==="object")return s;}catch(e){}return null;}
let lastRemote=null;   // dernière copie du compte lue (pour les marques d'effacement d'un import)
let dbRef=null, writing=false, pending=false, timer=null, erasing=false;
// époque du compte (« eid ») : une marque aléatoire posée à chaque effacement et recopiée dans tout document écrit ensuite.
// Un appareil déjà synchronisé dans une autre époque détient des données d'avant l'effacement : il les abandonne au lieu de les réécrire.
const EID_RE=/^[0-9a-f]{1,32}$/, epochOf=o=> o&&typeof o.eid==="string"&&EID_RE.test(o.eid)? o.eid : "";
const hasEpoch=o=> !!o&&(o.erased===true||(!!o.profile&&typeof o.profile==="object"));   // un document vide (ligne créée par l'accord) n'a pas d'époque
const newEid=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,"0")).join("");
const OWNER_KEY="carnet.owner";
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, lsSet=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
// retour à l'exemple : clés « carnet.* » effacées, état vidé (effacement ici, ou constaté venant d'un autre appareil ou onglet)
function resetLocal(){
  try{ if(window.CarnetCoach) window.CarnetCoach.wipe(); }catch(e){}   // le Coach (site) efface sa conversation, en mémoire et à l'écran
  clearTimeout(timer); dirty=false; pending=false;
  try{ Object.keys(localStorage).filter(k=>k===LS||k.startsWith("carnet.")).forEach(k=>localStorage.removeItem(k)); }catch(e){}
  state={profile:{...EXAMPLE},isExample:true,log:[],week:1,appliedByDate:{},deleted:{},moves:{},done:{},feel:{},acts:{},rhr:{},evr:{},seen:APP_V}; localSaved=false; followed=null; tiles.all=null; tiles.o={}; lastRaw=null; lastPJ=JSON.stringify(state.profile);
  hideToast(); $("#logMsg").innerHTML=""; fillForm(); recompute(); homeEl.dataset.has="";
}
// données effacées depuis un autre appareil ou onglet : on vide cet appareil sans rien écrire
function erasedElsewhere(reload){ if(!wizEl.hidden) closeWiz(); resetLocal(); setStore(dbRef? "rien d'enregistré encore. Dès que tu remplis ton profil, c'est sauvegardé dans ton compte." : localStatus()); showHome(); toast("Tes données ont été effacées depuis un autre appareil ou onglet.");
  if(reload&&dbRef) setTimeout(()=>{ initAccount(); },0); }   // le compte a un nouveau contenu : on le charge
// le consentement a été retiré (ou le compte vidé) depuis un autre appareil : la sauvegarde dans le compte est suspendue
function consentLost(){ dbRef=null; noAccount=true; acct.st="consent"; setStore(localStatus()); renderAcct(); toast("Ton accord n'est plus enregistré dans ton compte (retiré depuis un autre appareil ?) : la sauvegarde dans le compte est suspendue."); if(!sheetEl&&authEl.hidden&&wizEl.hidden) openAuth("consent",avBtn()); }
function persist(){
  if(persistLocal()&&!state.isExample) localSaved=true;
  if(!dbRef){ if(noAccount) setStore(localStatus()); return; }
  dirty=true; clearTimeout(timer); timer=setTimeout(flush,800);
}
// page masquée ou fermée : écriture immédiate dans le compte (au mieux), le stockage local est déjà à jour
function flushNow(){ if(dbRef&&dirty){ clearTimeout(timer); flush(); } }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") flushNow(); });
window.addEventListener("pagehide",flushNow);
// autre onglet : ses changements sont fusionnés ici, sans écraser les nôtres
window.addEventListener("storage",e=>{ if(e.storageArea!==localStorage) return;
  if(e.key===null||(e.key===LS&&!e.newValue)){ if(!state.isExample||localSaved) erasedElsewhere(); return; }
  if(e.key!==LS) return; const o=loadLocal(); if(!o) return;
  const r=mergeInto(o,+o.savedAtLocal||0); lastRaw=e.newValue; if(r.changed){ persistLocal(); rerender(r); } });
let dirty=false, flushFailed=false;
async function flush(){
  if(erasing) return;
  if(writing){pending=true;return;}
  writing=true; dirty=false;
  try{
    // jamais d'écriture à l'aveugle : on relit le compte et on fusionne (un autre appareil ou onglet a pu écrire depuis)
    const snap=await dbRef.get(), rd=snap&&snap.exists? (snap.data()||null) : null; lastRemote=rd;
    const ep=epochOf(rd);
    if(hasEpoch(rd)&&state.eid!==undefined&&ep!==state.eid){ writing=false; pending=false; erasedElsewhere(!rd.erased); return; }   // le compte a changé d'époque (effacement) depuis notre dernière synchro : on n'écrit rien
    if(hasEpoch(rd)&&state.eid!==ep){ state.eid=ep; persistLocal(); } else if(state.eid===undefined) state.eid="";
    if(rd&&!rd.erased&&rd.profile&&typeof rd.profile==="object"&&!Array.isArray(rd.profile)){ const r=mergeInto(rd,+rd.savedAt||0); if(r.changed){ persistLocal(); rerender(r); } }
    await dbRef.set(JSON.parse(JSON.stringify({profile:state.profile,isExample:state.isExample,log:state.log,week:state.week,appliedByDate:state.appliedByDate||{},deleted:state.deleted||{},moves:state.moves||{},done:state.done||{},feel:state.feel||{},acts:state.acts||{},rhr:state.rhr||{},aip:state.aip||{},evr:state.evr||{},seen:+state.seen||0,profileAt:+state.profileAt||0,pAt:cleanPAt(state.pAt),eid:state.eid||"",savedAt:state.savedAtLocal||Date.now()}))); flushFailed=false; acct.lastAt=Date.now(); setStore(state.isExample&&!localSaved? EXAMPLE_MSG : ACCOUNT_OK); }
  catch(e){ if(e&&e.code==="NOROW"){ writing=false; pending=false; consentLost(); return; }
    flushFailed=true;
    setStore(lsOK? "impossible dans le compte, gardé sur cet appareil seulement." : "impossible dans le compte, et le stockage de ce navigateur est bloqué. Tes changements seront perdus en fermant la page."); }
  writing=false; if(pending){pending=false;flush();}
}
const ACCOUNT_OK="dans ton compte, sur tous tes appareils.", EXAMPLE_MSG="données d'exemple, rien d'enregistré encore.";
function setStore(t){ setT($("#store"),"Sauvegarde : "+t); }
// suivi : dates AAAA-MM-JJ seulement, une entrée par date, 520 entrées au plus (10 ans)
// chaque champ est recréé et converti (nombre ou null) : une entrée venue du compte ou d'un fichier ne peut jamais porter de texte
const numIn=(v,lo,hi)=> v==null||v===""||typeof v==="boolean"||typeof v==="object"||!isFinite(+v)||+v<lo||+v>hi? null : +v;
const cleanLog=l=>{ if(!Array.isArray(l)) return []; const m=new Map();
  for(const e of l.slice(-5000)) if(e&&typeof e==="object"&&okIso(e.date)&&numIn(e.poids,0.001,499.999)!=null){ const o=m.get(e.date), at=isFinite(+e.at)&&+e.at>0? +e.at : 0;
    if(o&&at<o.at) continue;
    const f=numIn(e.fatigue,1,5), c={date:e.date,at,poids:+e.poids,sommeil:numIn(e.sommeil,0,24),fatigue:f==null?null:Math.round(f),faites:numIn(e.faites,0,14),prevues:numIn(e.prevues,0,14),douleur:e.douleur==="oui"?"oui":"non"};
    const ap=numIn(e.applied,-600,600); if(ap!=null) c.applied=ap; m.set(e.date,c); }
  return [...m.values()].sort((a,b)=>a.date<b.date?-1:1).slice(-520); };
const cleanApplied=o=>{ if(!o||typeof o!=="object"||Array.isArray(o)) return {}; const out={}; for(const [k,v] of Object.entries(o).slice(0,600)){ const n=numIn(v,-600,600); if(okIso(k)&&n!=null) out[k]=n; } return out; };
// profil : seulement les champs connus, avec leur type et leurs valeurs permises (le reste vient de l'exemple)
const PENUM={sexe:["H","F"],niveau:["deb","int","conf"],ref:["none","vma","5","10"],seances:["3","4","5","6"],renfo:["0","1","2"],longDay:["5","6"],lieu:["dehors","tapis","mixte"],equip:["salle","maison","aucun"],sport:SPORTS,sObj:["court","moyen","long","ppl","oly"],cplx:["simple","standard","avance"],evalOn:["0","1"]};
const PNUM=["age","taille","poids","cible","mg","volume","longest","fcmax","adj","deficit","bonus","hSem","debRun","renfoMin","hQuota"];
function cleanProfile(p){ const out={start:"",raceDate:""}; if(!p||typeof p!=="object"||Array.isArray(p)) return out;
  const own=k=> Object.prototype.hasOwnProperty.call(p,k)? p[k] : undefined, sc=v=> typeof v==="string"||typeof v==="number";
  for(const [k,vals] of Object.entries(PENUM)){ const v=own(k); if(sc(v)&&vals.includes(String(v))) out[k]=v; }
  const ob=own("objectif"); if(sc(ob)&&Object.hasOwn(OBJ,ob)) out.objectif=ob;
  const cr=own("cross"); if(typeof cr==="string"&&(cr==="non"||Object.hasOwn(CROSS,cr))) out.cross=cr;
  const ac=own("activite"); if(sc(ac)&&String(ac).trim()!==""&&isFinite(+ac)&&+ac>=1.1&&+ac<=2) out.activite=ac;
  for(const k of PNUM){ const v=own(k); if(typeof v==="number"){ if(isFinite(v)&&Math.abs(v)<1e6) out[k]=v; } else if(typeof v==="string"&&v.length<=14&&/^\s*(?:-?\d+(?:[.,]\d+)?)?\s*$/.test(v)) out[k]=v;
    else if(v!==undefined&&["cible","mg","volume","longest","fcmax","adj","hSem","debRun","renfoMin","hQuota"].includes(k)) out[k]=""; }   // illisible : vide, pas la valeur de l'exemple
  const rv=own("refVal"); if(typeof rv==="string"&&rv.length<=24&&/^[0-9 .,:'’′″"hmins-]*$/i.test(rv)) out.refVal=rv; else if(typeof rv==="number"&&isFinite(rv)) out.refVal=rv;
  for(const k of ["start","raceDate"]){ const v=own(k); if(okIso(v)) out[k]=v; }
  { const v=own("evalFrom"); if(okIso(v)) out.evalFrom=v; else if(v!==undefined) out.evalFrom=""; }
  const pr=own("pref"); if(typeof pr==="string") out.pref=prefClean(pr);
  const ty=own("types"); if(Array.isArray(ty)) out.types=[...new Set(ty.slice(0,20).filter(t=>typeof t==="string"&&EXAMPLE.types.includes(t)))].slice(0,EXAMPLE.types.length);
  return out; }
// date de modification de chaque champ du profil : {champ: horodatage}, champs connus seulement
const PAT_KEYS=new Set([...Object.keys(EXAMPLE),"raceDate"]);
function cleanPAt(o){ const out={}; if(!o||typeof o!=="object"||Array.isArray(o)) return out; const lim=Date.now()+6e4;
  for(const [k,v] of Object.entries(o)) if(PAT_KEYS.has(k)&&isFinite(+v)&&+v>0) out[k]=Math.min(+v,lim); return out; }
// fusion de deux profils : « win » (le plus récent) sert de base, chaque champ de « lose » modifié plus tard le remplace
function mergeProfile(win,winAt,lose,loseAt){ const W=cleanPAt(winAt), Lo=cleanPAt(loseAt), out={...win}, at={...W};
  if(lose&&typeof lose==="object"&&!Array.isArray(lose)) for(const [k,t] of Object.entries(Lo)) if(t>(W[k]||0)&&Object.prototype.hasOwnProperty.call(lose,k)){ out[k]=lose[k]; at[k]=t; }
  return {profile:out,pAt:at}; }
// semaines retirées : {date: horodatage}, 200 au plus ; une saisie plus récente que le retrait reste
function cleanDeleted(o){ if(!o||typeof o!=="object"||Array.isArray(o)) return {};
  return Object.fromEntries(Object.entries(o).filter(([k,v])=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&isFinite(+v)&&+v>0).map(([k,v])=>[k,Math.min(+v,Date.now())]).sort((a,b)=>b[1]-a[1]).slice(0,200)); }
const mergeDeleted=(a,b)=>{ const m={...cleanDeleted(a)}; for(const [k,v] of Object.entries(cleanDeleted(b))) m[k]=Math.max(m[k]||0,v); return cleanDeleted(m); };
const dropDeleted=(log,del)=> log.filter(e=>!(del[e.date]&&del[e.date]>=(+e.at||0)));
// données chargées : profil complété par l'exemple, semaine bornée, puis semaine en cours si aujourd'hui est dans le plan
function loadState(d){
  const abd=cleanApplied(d.appliedByDate);
  const del=cleanDeleted(d.deleted);
  state={...state,...(Object.hasOwn(d,"eid")? {eid:typeof d.eid==="string"&&/^[0-9a-f]{0,32}$/.test(d.eid)? d.eid : undefined} : {}),profile:{...EXAMPLE,...cleanProfile(d.profile)},isExample:!!d.isExample,log:dropDeleted(cleanLog(d.log),del),week:Math.max(1,Math.round(+d.week)||1),appliedByDate:abd,deleted:del,moves:cleanMoves(d.moves),done:cleanDone(d.done),seen:Math.max(0,Math.min(APP_V,Math.round(+d.seen)||0))};
  for(const k of x14Keys){ if(Object.hasOwn(d,k)) state[k]=X14[k](d[k]); else if(!state[k]) state[k]={}; }
  if(isFinite(+d.savedAtLocal)&&+d.savedAtLocal>0) state.savedAtLocal=+d.savedAtLocal;
  state.profileAt= isFinite(+d.profileAt)&&+d.profileAt>0? Math.min(+d.profileAt,Date.now()) : 0;
  state.pAt=cleanPAt(d.pAt);
  // début du plan illisible ou absent : recalculé (date de course, sinon aujourd'hui)
  const st=state.profile.start;
  if(!okIso(st)){ const r=raceOn(state.profile); state.profile.start= r? autoStart(r) : todayIso(); }
  try{ plan=buildPlan(profileNums(state.profile)); }catch(e){ plan=[]; } // la longueur du plan borne la semaine
  state.week=clampWeek(state.week);
  const tp=todayPos(); if(tp) state.week=tp.w;
  lastPJ=JSON.stringify(state.profile);
}
let lastPJ=JSON.stringify(state.profile);

/* ---------- v13 : accueil, assistant de création, compte, données ---------- */
const hvSeen=()=>{ try{ return localStorage.getItem("carnet.hv")==="1"; }catch(e){ return false; } };
const hvMark=()=>{ try{ localStorage.setItem("carnet.hv","1"); }catch(e){} };
// état de connexion : en mémoire seulement. Le nom affiché vient de « user.me() » et n'est jamais enregistré (ni localStorage, ni compte).
const acct={st:"pending",name:"",lastAt:0,failed:false,uid:""};
const nameOf=me=>{ try{ if(!me) return ""; if(typeof me==="string") return me.trim().slice(0,60);
  const n=me.display_name||me.displayName||me.name||[me.first_name||me.given_name||me.firstName,me.last_name||me.family_name||me.lastName].filter(Boolean).join(" ");
  return typeof n==="string"&&n.trim()? n.trim().slice(0,60) : (typeof me.email==="string"? me.email.trim().slice(0,80) : ""); }catch(e){ return ""; } };
const homeEl=$("#home"), wrapEl=$(".wrap"), wizEl=$("#wiz"), authEl=$("#auth");
const hasData=()=> !state.isExample||localSaved;
// mode discret lu directement (fonction hoistée : utilisable dès le démarrage, avant le bloc de la page)
function discreet(){ try{ return localStorage.getItem("carnet.discret")==="1"; }catch(e){ return false; } }
function meInert(on){ const m=document.getElementById("me"); if(m) m.inert=on; }
// la page Mon profil est masquée par toute autre vue (accueil, application)
function meAway(){ const m=document.getElementById("me"); if(m&&!m.hidden) meHide(); }
function showHome(){ closeSheet(true); meAway(); wrapEl.hidden=true; homeEl.hidden=false; renderHome(); window.scrollTo(0,0); try{ $("#homeT").focus({preventScroll:true}); }catch(e){} }
function showApp(){ if(!seenV()) markSeen(false); meAway(); homeEl.hidden=true; wrapEl.hidden=false; hvMark(); try{ renderChart(sortedLog()); }catch(e){} }
const acctText=()=> acct.st==="connected"? "Connecté à ton compte" : acct.st==="consent"? "Connecté, sauvegarde en attente de ton accord" : acct.st==="owner"? "Connecté, mais cet appareil contient les données d'un autre compte" : acct.st==="guest"? "Mode invité : tes données restent sur cet appareil" : "Connexion en cours…";
function renderHome(){
  const st=$("#homeSt"); setT(st, acct.st==="connected"? "Connecté à ton compte"+(acct.name&&!discreet()?" · "+acct.name:"") : acct.st==="consent"? "Connecté, sauvegarde en attente de ton accord." : acct.st==="owner"? "Connecté, en attente de ton choix pour les données de cet appareil." : acct.st==="guest"? "Mode invité : tes données restent sur cet appareil." : "Connexion à ton compte en cours…"); st.dataset.st=acct.st;
  const has=hasData()? "1":"0"; if(homeEl.dataset.has===has) return; homeEl.dataset.has=has;
  // un seul bouton principal ; l'action secondaire n'est qu'un lien discret ; le bas de page rappelle le même bouton
  const b= has==="1"? `<button class="btn" type="button" data-act="open">Ouvrir Pacebook</button>` : `<button class="btn" type="button" data-act="wizard">Créer mon plan gratuit</button>`;
  $("#homeCta").innerHTML=b+(has==="1"? `<button class="linkbtn" type="button" data-act="wizard">Refaire mon profil</button>` : `<button class="linkbtn" type="button" data-act="example">Voir un exemple</button>`); $("#homeCta2").innerHTML=b;
}
function renderAcct(){ try{ if(P) renderAip(); }catch(e){}
  document.querySelectorAll(".js-av").forEach(b=>{ b.dataset.st=acct.st; b.setAttribute("aria-label","Mon profil : "+acctText().toLowerCase()); const i=b.querySelector(".av-i"); if(i) i.textContent=acct.name&&!discreet()? acct.name.charAt(0).toUpperCase():""; });
  renderHome(); { const m=document.getElementById("me"); if(m&&!m.hidden){ renderMeId(); renderMeAcct(); } }
  const can=!!(window.CarnetAuth&&window.CarnetAuth.canLogin); document.querySelectorAll(".js-login").forEach(b=>{ b.hidden=!(can&&acct.st==="guest"); });
  if(!authEl.hidden&&acct.st!=="pending"&&((authEl.dataset.mode==="consent")!==(acct.st==="consent"))) closeAuth();
}
const avBtn=()=>[...document.querySelectorAll(".js-av")].find(b=>b.getClientRects().length)||null;
// actions des boutons de l'accueil et de la barre du haut
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
  if(a==="open") showApp();
  else if(a==="example"){ showApp(); setT($("#srLive"),"Exemple ouvert : rien n'est enregistré tant que tu ne modifies rien."); const t=$("#weekTitle"); if(t) t.focus({preventScroll:true}); }
  else if(a==="wizard") openWizard(b);
  else if(a==="home") showHome();
  else if(a==="acct") openMe(b);
  else if(a==="login") openAuth("login",b);
});

/* assistant de création du plan : 5 étapes plein écran, rien n'est enregistré avant « Créer mon plan » */
let wzI=1, wzOpener=null;
const WZN=5, wzr=n=>{ const r=wizEl.querySelector(`input[name="${n}"]:checked`); return r?r.value:""; };
const wzset=(n,v)=>wizEl.querySelectorAll(`input[name="${n}"]`).forEach(r=>{ r.checked=String(v)===r.value; });
const wzv=id=>String($(id).value||"").trim();
function wzPrefill(){
  const ex=!state.isExample, p=ex? state.profile : {}, s=(id,v)=>{ $(id).value= v==null? "" : String(v); };
  wzset("wz_sexe",ex?p.sexe:""); s("#wzAge",ex?p.age:""); s("#wzTaille",ex?p.taille:""); s("#wzPoids",ex?p.poids:""); s("#wzCible",ex?p.cible:"");
  wzset("wz_niveau",ex?p.niveau:""); s("#wzObjectif",ex&&Object.hasOwn(OBJ,p.objectif)?p.objectif:EXAMPLE.objectif); s("#wzRace",ex&&okIso(p.raceDate)&&p.raceDate>=todayIso()?p.raceDate:"");
  s("#wzVolume",ex?p.volume:""); s("#wzLongest",ex?p.longest:"");
  wzset("wz_seances",ex?p.seances:EXAMPLE.seances); wzset("wz_renfo",ex?p.renfo:EXAMPLE.renfo); wzset("wz_lieu",ex?p.lieu:EXAMPLE.lieu); wzset("wz_equip",ex?p.equip:EXAMPLE.equip); wzset("wz_longDay",ex?p.longDay:EXAMPLE.longDay);
  wzset("wz_act",ex&&["1.25","1.4","1.55"].includes(String(p.activite))? String(p.activite) : (ex&&isFinite(+p.activite)&&+p.activite>0? ([1.25,1.4,1.55].reduce((a,b)=>Math.abs(b-p.activite)<Math.abs(a-p.activite)?b:a)) : EXAMPLE.activite));
  const d=ex&&isFinite(+p.deficit)&&String(p.deficit).trim()!==""? +p.deficit : 0, keep=$("#wzDefKeep");   // par défaut : maintien (la perte de poids est un choix explicite)
  if([0,200,300,400].includes(d)){ keep.hidden=true; keep.querySelector("input").value="-1"; } else{ keep.hidden=false; keep.querySelector("input").value=String(d); setT(keep.querySelector("span"),"garder "+d+" · actuel"); }
  wzset("wz_def",d); $("#wzAck").checked=false; wzSportPrefill14(ex,p);
}
// erreur de l'assistant : champ marqué invalide et relié au message (#wzErr) par aria-describedby
const wzClr=()=>wizEl.querySelectorAll("[aria-invalid]").forEach(x=>{ x.removeAttribute("aria-invalid"); const d=(x.getAttribute("aria-describedby")||"").split(" ").filter(y=>y&&y!=="wzErr"); if(d.length) x.setAttribute("aria-describedby",d.join(" ")); else x.removeAttribute("aria-describedby"); });
function wzFail(el,msg){ const e=$("#wzErr"); e.textContent=msg; e.hidden=false; wzClr();
  // message placé juste sous le champ fautif (sur petit écran, en bas du formulaire, il restait caché sous la barre « Continuer »)
  const f=el&&el.closest(".field,.ack"); if(f) f.after(e); else { const st=wizEl.querySelector(".wz-step:not([hidden])"); if(st) st.append(e); }
  if(el){ el.setAttribute("aria-invalid","true"); el.setAttribute("aria-describedby",((el.getAttribute("aria-describedby")||"")+" wzErr").trim()); el.focus(); }
  try{ e.scrollIntoView({block:"nearest"}); }catch(x){} return false; }
const wzNum=(id,lo,hi,int)=>{ const v=numOf($(id).value); return !isNaN(v)&&v>=lo&&v<=hi&&(!int||Number.isInteger(v))? v : NaN; };
function wzCheck(i){
  $("#wzErr").hidden=true; wzClr();
  const first=n=>wizEl.querySelector(`input[name="${n}"]`);
  if(i===1){
    if(!wzr("wz_sexe")) return wzFail(first("wz_sexe"),"Choisis ton sexe : la formule de dépense n'est pas la même pour tous.");
    if(isNaN(wzNum("#wzAge",15,90,true))) return wzFail($("#wzAge"),"Indique ton âge en années, entre 15 et 90 ans.");
    if(isNaN(wzNum("#wzTaille",130,220,true))) return wzFail($("#wzTaille"),"Indique ta taille en centimètres, entre 130 et 220.");
    const po=wzNum("#wzPoids",35,250); if(isNaN(po)) return wzFail($("#wzPoids"),"Indique ton poids en kilos, entre 35 et 250 (par exemple 81,5).");
    if(wzv("#wzCible")!==""){ const c=wzNum("#wzCible",35,250); if(isNaN(c)) return wzFail($("#wzCible"),"Ton poids visé doit être entre 35 et 250 kg, ou laisse le champ vide.");
      if(c>=po) return wzFail($("#wzCible"),"Ton poids visé doit être sous ton poids actuel, ou laisse le champ vide."); }
  }
  if(i===2){
    if(!wzr("wz_niveau")) return wzFail(first("wz_niveau"),"Choisis ton niveau.");
    const r=wzv("#wzRace"); if(wzRaceAllowed()&&r!==""){ if(!okIso(r)) return wzFail($("#wzRace"),"Cette date n'existe pas."); if(r<todayIso()) return wzFail($("#wzRace"),"La date de ta course doit être aujourd'hui ou plus tard."); }
    if(wzRun()&&isNaN(wzNum("#wzVolume",0,200))) return wzFail($("#wzVolume"),"Indique tes kilomètres par semaine, de 0 à 200 (0 si tu ne cours pas encore).");
    if(wzRun()&&isNaN(wzNum("#wzLongest",0,60))) return wzFail($("#wzLongest"),"Indique ta plus longue sortie du mois, de 0 à 60 km (0 si aucune).");
    if(wzSport()!=="force"&&!wzRun()&&wzv("#wzHSem")!==""&&isNaN(wzNum("#wzHSem",0,25))) return wzFail($("#wzHSem"),"Indique tes heures de sport par semaine, de 0 à 25, ou laisse le champ vide.");
  }
  if(i===3){ for(const [n,m] of [["wz_seances","le nombre de séances de course"],["wz_renfo","le nombre de séances de renforcement"],["wz_lieu","où tu cours"],["wz_equip","ton matériel"],["wz_longDay","ton jour de sortie longue"],["wz_act","ton activité hors sport"]]) if(!wzr(n)) return wzFail(first(n),"Choisis "+m+"."); }
  if(i===4){ if(!wzr("wz_def")) return wzFail(first("wz_def"),"Choisis ton déficit."); if(!$("#wzAck").checked) return wzFail($("#wzAck"),"Coche la case pour confirmer que tu as lu le rappel santé."); }
  return true;
}
function wzProfile(){
  const raceDate= !wzRaceAllowed()? "" : wzv("#wzRace"), niveau=wzr("wz_niveau");
  let seances=wzr("wz_seances"); if(niveau==="deb"&&+seances>4) seances="4";
  const base= state.isExample? EXAMPLE : {...EXAMPLE,...cleanProfile(state.profile)};   // les réglages que l'assistant ne pose pas sont conservés
  const p={...base,types:[...(base.types||EXAMPLE.types)],activite:wzr("wz_act")||base.activite,sexe:wzr("wz_sexe"),age:String(wzNum("#wzAge",15,90,true)),taille:String(wzNum("#wzTaille",130,220,true)),poids:wzv("#wzPoids"),cible:wzv("#wzCible"),
    niveau,objectif:$("#wzObjectif").value,raceDate,volume:wzv("#wzVolume"),longest:wzv("#wzLongest"),seances,renfo:wzr("wz_renfo"),lieu:wzr("wz_lieu"),equip:wzr("wz_equip"),longDay:wzr("wz_longDay"),deficit:wzr("wz_def"),sport:wzSport(),sObj:wzSObjVal(),hSem:wzSport()==="force"?"":wzv("#wzHSem")};
  if(p.sport==="force"&&+p.seances>5) p.seances="5";
  if(String(p.deficit)==="0") p.bonus=0;   // maintien : pas de supplément de déficit les jours faciles non plus
  p.evalOn= vmaOf(profileNums(p)).estimated? "1" : "0"; p.debRun=""; p.evalFrom="";   // nouveau plan : séances de test proposées, sauf si une référence de vitesse est déjà connue
  const lo=raceOn(p); p.start= lo? autoStart(lo) : todayIso();
  return p;
}
function wzMinorLive(){ const a=numOf($("#wzAge").value); $("#wzMinor").hidden=!(a>=15&&a<18); }
function wzPrep(i){
  wzSyncSport();
  if(i===2){ wzSyncSport(); }
  if(i===3){ const deb=wzr("wz_niveau")==="deb", h=$("#wzSeH");
    wizEl.querySelectorAll('input[name="wz_seances"]').forEach(r=>{ r.disabled=(deb&&+r.value>4)||(wzSport()==="force"&&+r.value>5); });
    if(deb&&+wzr("wz_seances")>4){ wzset("wz_seances",4); setT(h,"Débutant : 4 séances au plus, le temps que les tendons s'adaptent. Ton choix a été ramené à 4."); } else setT(h, deb? "Débutant : 4 séances au plus, le temps que les tendons s'adaptent." : "");
    const r=wzRaceAllowed()&&okIso(wzv("#wzRace"))&&wzv("#wzRace")>=todayIso()? wzv("#wzRace") : "", ri=r? (new Date(r+"T12:00:00").getDay()+6)%7 : -1, lh=$("#wzLoH");
    wizEl.querySelectorAll('input[name="wz_longDay"]').forEach(x=>{ x.disabled=ri>=5; });
    if(ri>=5){ wzset("wz_longDay",ri); setT(lh,(evSport(wzSport())?"Ton objectif tombe un ":"Ta course tombe un ")+(ri===5?"samedi":"dimanche")+" : la sortie longue sera ce jour-là."); } else setT(lh,"");
  }
  if(i===4){ const a=numOf($("#wzAge").value), po=numOf($("#wzPoids").value), t=numOf($("#wzTaille").value), bmi=po/Math.pow(t/100,2), w=$("#wzDefW"), seg=wizEl.querySelectorAll('input[name="wz_def"]');
    const minor=a<18, low=bmi<18.5;
    if(minor||low){ wzset("wz_def",0); seg.forEach(r=>{ r.disabled=+r.value>0; }); w.hidden=false; w.textContent= minor? "Avant 18 ans, l'outil ne met aucun déficit : ton plan reste au maintien. Un médecin peut t'aider à fixer un objectif adapté." : "Avec un IMC de "+fmt1(bmi)+" (sous 18,5), perdre du poids n'est pas conseillé : ton plan reste au maintien. Demande l'avis d'un médecin."; }
    else{ seg.forEach(r=>{ r.disabled=false; }); w.hidden=true; w.textContent=""; }
  }
  if(i===5){
    const p=wzProfile(), n=profileNums(p), pl=buildPlan(n), OBJL=wzObjLabel(p,n), lieu={dehors:"dehors",tapis:"sur tapis",mixte:"dehors et sur tapis"}[p.lieu], eq={salle:"en salle",maison:"avec des haltères",aucun:"sans matériel"}[p.equip];
    const row=(k,v)=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`, st=effStart(p);
    $("#wzSum").innerHTML=[row("Toi",(p.sexe==="F"?"Femme":"Homme")+", "+p.age+" ans, "+p.taille+" cm, "+p.poids+" kg"+(p.cible?" (visé : "+p.cible+" kg)":"")),
      row("Niveau",{deb:"Débutant",int:"Intermédiaire",conf:"Confirmé"}[p.niveau]),
      row("Objectif",OBJL+(p.raceDate?", le "+longDate(p.raceDate):"")),
      row("Aujourd'hui",wzToday14(p)),
      row("Ta semaine",wzWeek14(p,n,lieu,eq)),
      row("Quotidien",{"1.25":"Assis la plupart du temps","1.4":"Un peu actif","1.55":"Métier physique ou très actif"}[String(p.activite)]||"Assis la plupart du temps"),
      row("Déficit",+p.deficit>0? p.deficit+" kcal par jour" : "Aucun (maintien)")].join("");
    $("#wzPlan").className="alert "+(pl.unreal?"warn":"ok");   // objectif rétrogradé : avertissement, pas un encadré vert
    $("#wzPlan").textContent="Ton plan : "+pl.length+" semaine"+(pl.length>1?"s":"")+(st?", à partir du "+longDate(okIso(p.start)&&mondayOf(p.start)===st? p.start : st):"")+"."+(pl.unreal? pl.unreal.minor? " Avant 18 ans, pas de semi-marathon ni de marathon : le plan prépare "+OBJ[pl.unreal.used].label+"." : " Pour cette distance, il faut plus de temps depuis ton volume actuel : le plan prépare "+OBJ[pl.unreal.used].label+". Ajoute une date de course plus lointaine pour garder ton objectif." : "");
    $("#wzRepl").hidden=state.isExample;
  }
}
function wzShow(i,back){
  wzI=i; wizEl.querySelectorAll(".wz-step").forEach(s=>{ s.hidden=+s.dataset.s!==i; });
  wzPrep(i);
  $("#wzProg").setAttribute("aria-valuenow",i); $("#wzProg i").style.width=(i/WZN*100)+"%";
  $("#wzBack").hidden=i===1; setT($("#wzNext"),i===WZN? "Créer mon plan":"Continuer"); wizEl.setAttribute("aria-labelledby","wzT"+i);
  $("#wzErr").hidden=true; $("#wzForm").scrollTop=0; wzClr();
  const h=$("#wzT"+i); if(h) h.focus({preventScroll:true}); setT($("#srLive"),"Étape "+i+" sur "+WZN); wzDraftSave();
}
/* brouillon : valeurs saisies seulement (jamais de nom), relues avec contrôle, effacé à la création du plan */
const WZ_DK="carnet.wzdraft", WZ_TXT=["wzAge","wzTaille","wzPoids","wzCible","wzVolume","wzLongest","wzHSem"], WZ_RAD=["wz_sexe","wz_niveau","wz_seances","wz_renfo","wz_lieu","wz_equip","wz_longDay","wz_act","wz_def"];
let wzSnap="", wzTimer=0;
function wzCollect(){ const f={}; for(const id of WZ_TXT) f[id]=$("#"+id).value; f.wzObjectif=$("#wzObjectif").value; f.wzSport=$("#wzSport").value; f.wzSObj=$("#wzSObj").value; f.wzRace=$("#wzRace").value; for(const n of WZ_RAD) f[n]=wzr(n); return f; }
const wzDirty=()=> JSON.stringify(wzCollect())!==wzSnap;
function wzDraftClear(){ clearTimeout(wzTimer); try{ localStorage.removeItem(WZ_DK); }catch(e){} }
function wzDraftSave(){ clearTimeout(wzTimer); if(wizEl.hidden) return; try{ if(!wzDirty()){ localStorage.removeItem(WZ_DK); return; } localStorage.setItem(WZ_DK,JSON.stringify({t:Date.now(),s:wzI,f:wzCollect()})); }catch(e){} }
function wzDraftLoad(){ let d=null; try{ d=JSON.parse(localStorage.getItem(WZ_DK)||"null",(k,v)=> (k==="__proto__"||k==="constructor"||k==="prototype")? undefined : v); }catch(e){} 
  if(!d||typeof d!=="object"||!isFinite(+d.t)||Date.now()-d.t>14*864e5||d.t>Date.now()+6e4||!d.f||typeof d.f!=="object") return false;
  const f=d.f, num=v=> typeof v==="string"&&v.length<=14&&/^[0-9 .,\-]*$/.test(v)? v : null; let any=false;
  for(const id of WZ_TXT){ const v=num(f[id]); if(v!==null){ $("#"+id).value=v; any=true; } }
  if(typeof f.wzObjectif==="string"&&Object.hasOwn(OBJ,f.wzObjectif)) $("#wzObjectif").value=f.wzObjectif;
  wzDraftSport14(f);
  if(typeof f.wzRace==="string"&&(f.wzRace===""||okIso(f.wzRace))) $("#wzRace").value=f.wzRace;
  for(const n of WZ_RAD){ const v=f[n]; if(typeof v==="string"&&v!==""&&v!=="-1"&&v.length<=5) wzset(n,v); }
  wzI=Math.max(1,Math.min(4,Math.round(+d.s)||1)); return any||true; }
// « Quitter l'assistant ? » : la même feuille que toutes les autres (au-dessus de l'assistant, qui reste inerte derrière)
function wzLeaveSheet(){
  const row=(k,t,sub)=>`<button class="opt" type="button" data-lv="${k}"><span>${esc(t)}<small>${esc(sub)}</small></span><span aria-hidden="true">›</span></button>`;
  openSheet({title:"Quitter l'assistant ?",opener:$("#wzQuit"),kind:"leave",closeLabel:"Continuer l'assistant",firstClose:true,
    html:`<p class="note">Ce que tu as saisi est gardé comme brouillon sur cet appareil : tu pourras reprendre où tu en étais.</p><div class="grp">${row("keep","Quitter, garder le brouillon","Tu reprendras plus tard")}${row("drop","Quitter et effacer","Le brouillon est supprimé")}</div>`,
    onClose:()=>{ wizEl.inert=false; },
    onReady:sh=>{ sh.setAttribute("role","alertdialog"); sh.parentNode.style.zIndex="50"; wizEl.inert=true;
      sh.querySelectorAll("[data-lv]").forEach(b=>b.addEventListener("click",()=>{ if(b.dataset.lv==="drop") wzDraftClear(); else wzDraftSave(); closeSheet(true); closeWiz(); })); }});
}
function wzTryClose(){ if(!wzDirty()){ wzDraftClear(); closeWiz(); return; } wzDraftSave(); wzLeaveSheet(); }
function openWizard(opener){
  closeSheet(true); wzOpener=opener||document.activeElement; wzPrefill(); wzMinorLive(); wzSnap=JSON.stringify(wzCollect());
  const restored=wzDraftLoad(); if(restored){ wzMinorLive(); $("#wzObjectif").dispatchEvent(new Event("change")); }
  wizEl.hidden=false; wrapEl.inert=true; homeEl.inert=true; meInert(true); document.documentElement.style.overflow="hidden"; wzShow(restored? wzI : 1); if(restored) toast("Brouillon retrouvé : tu reprends où tu en étais.");
}
function closeWiz(){ if(wizEl.hidden) return; wizEl.hidden=true; wrapEl.inert=false; homeEl.inert=false; meInert(false); if(!sheetEl&&!timerEl) document.documentElement.style.overflow="";
  const o=wzOpener; wzOpener=null; if(o&&document.contains(o)&&o.getClientRects().length) o.focus({preventScroll:true}); }
function wzNext(){
  if(wizEl.hidden) return;   // double clic sur « Créer mon plan » : l'assistant est déjà fermé, rien n'est recréé
  if(!wzCheck(wzI)) return;
  if(wzI<WZN){ wzShow(wzI+1); return; }
  // dernière étape : toutes les étapes sont revérifiées (un brouillon forgé ne contourne rien), puis seulement ici le profil est créé et enregistré
  for(let k=1;k<WZN;k++) if(!wzCheck(k)){ wzShow(k); wzCheck(k); return; }
  const p=wzProfile(); state.profile=p; state.isExample=false; plan=buildPlan(profileNums(p)); const tp=todayPos(); state.week=tp?tp.w:1;
  wzDraftClear(); fillForm(); persist(); recompute(); closeWiz(); showApp(); selectTab("semaine"); window.scrollTo(0,0);
  const n=plan.length; toast("Ton plan est prêt : "+n+" semaine"+(n>1?"s":"")+".");
  const t=$("#weekTitle"); if(t) t.focus({preventScroll:true});
}
$("#wzNext").addEventListener("click",wzNext);
$("#wzForm").addEventListener("submit",e=>{ e.preventDefault(); wzNext(); });
$("#wzBack").addEventListener("click",()=>{ if(wzI>1) wzShow(wzI-1); });
$("#wzQuit").addEventListener("click",wzTryClose);
wizEl.addEventListener("input",()=>{ clearTimeout(wzTimer); wzTimer=setTimeout(wzDraftSave,300); });
wizEl.addEventListener("change",()=>{ clearTimeout(wzTimer); wzTimer=setTimeout(wzDraftSave,300); });
$("#wzAge").addEventListener("input",wzMinorLive);
$("#wzObjectif").addEventListener("change",()=>{ wzSyncSport(); });
$("#wzSport").addEventListener("change",()=>{ wzSObjFill(true); wzSyncSport(); });
wizEl.addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.preventDefault(); wzTryClose(); }
  else if(e.key==="Enter"&&!e.isComposing&&e.target.matches&&e.target.matches('input:not([type=checkbox]):not([type=radio]),select')){ e.preventDefault(); wzNext(); } else if(e.key==="Tab") trapTab(e,wizEl); });

/* compte : état de connexion, export / import / effacement des données */
const fmtDT=t=> t>0? new Date(t).toLocaleString("fr-FR",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}) : "";
const LEGAL_NAV=`<nav class="legalnav" aria-label="Informations légales"><a href="faq" target="_blank" rel="noopener">FAQ</a><a href="contact" target="_blank" rel="noopener">Contact</a><a href="cgu" target="_blank" rel="noopener">CGU</a><a href="confidentialite" target="_blank" rel="noopener">Confidentialité</a><a href="cookies" target="_blank" rel="noopener">Stockage local</a><a href="mentions-legales" target="_blank" rel="noopener">Mentions légales</a></nav>`;
// feuille Compte : invité ou accord manquant -> bouton vers l'écran de connexion
function loginCta(cs){ return `<div class="acc-login"><p><b>${cs?"Ton accord est nécessaire":"Synchronise tes données"}</b></p><p class="note">${cs?"Rien n'est enregistré dans ton compte tant que tu n'as pas donné ton accord.":"Crée ton compte ou connecte-toi en un clic avec Google ou GitHub. Ce que tu as déjà rempli ici est repris."}</p><div class="prov"><button class="btn" type="button" data-acc="login">${cs?"Donner mon accord":"Se connecter ou créer un compte"}</button>${cs?`<button class="btn ghost" type="button" data-acc="consent-no">Refuser et me déconnecter</button>`:""}</div></div>`; }
// un compte différent de celui qui a créé les données de cet appareil : rien n'est fusionné ni écrit avant ton choix
function ownerBlock(){ return `<div class="acc-login"><p><b>Que faire des données de cet appareil ?</b></p><p>Elles ont été enregistrées avec un autre compte. Pour protéger les deux comptes, rien n'est mélangé ni envoyé.</p><div class="prov"><button class="btn" type="button" data-acc="own-out" data-first>Me déconnecter et garder cet appareil</button><button class="btn ghost" type="button" data-acc="own-use">Utiliser les données de ce compte (celles de cet appareil seront remplacées)</button><button class="btn ghost" type="button" data-acc="own-zero">Repartir de zéro (efface cet appareil et les données de ce compte)</button></div></div>`; }
const consentRecord=()=>({cgu:window.CarnetAuth.CONSENT_V,privacy:window.CarnetAuth.CONSENT_V,terms:true,health:true,age15:true,at:new Date().toISOString()});
/* page « Mon profil » (plein écran, ouverte par l'avatar) : identité, stats, infos personnelles modifiables, compte et données.
   Remplace l'ancienne feuille Compte : mêmes actions (data-acc), mêmes confirmations en deux temps, ouvertes par-dessus la page.
   Rien de nouveau n'est enregistré ni envoyé : le nom vient de la session (mémoire seulement), les stats sont calculées sur cet appareil. */
const ME_PRIV="carnet.discret";   // mode discret (valeurs masquées à l'écran) : réglage de cet appareil seulement
let meFrom="app", meOpener=null, meEdit=false, mePushed=false, meSkipPop=false, meTitle="";
const meEl=()=>document.getElementById("me");
const meOpen=()=>{ const m=meEl(); return !!m&&!m.hidden; };
const mePriv=()=>lsGet(ME_PRIV)==="1";
// valeur personnelle affichée : masquée en mode discret (le texte est remplacé, pas seulement flouté : rien à lire pour un lecteur d'écran ni dans une capture)
const pv=t=> mePriv()? `<span class="pvh" aria-hidden="true">•••</span><span class="sr-only">masqué</span>` : esc(t);
function openMe(opener){
  const m=meEl(); if(!m) return;
  if(m.hidden){ meOpener=opener||document.activeElement; meFrom=homeEl.hidden? "app" : "home"; closeSheet(true); meEdit=false;
    wrapEl.hidden=true; homeEl.hidden=true; m.hidden=false; meTitle=document.title; document.title="Mon profil · Pacebook";
    // une entrée d'historique : le bouton retour du téléphone ou du navigateur ferme la page au lieu de quitter le site (aucune donnée dans l'URL)
    try{ history.pushState({pbMe:1},""); mePushed=true; }catch(e){ mePushed=false; }
    // données d'un autre compte : le focus va sur le choix sans risque ; sinon sur le titre
    renderMe(); window.scrollTo(0,0); const t= acct.st==="owner"&&$("#meAcct [data-first]") || $("#meT"); if(t) t.focus({preventScroll:true}); return; }
  renderMe();
}
// masque la page sans choisir la vue suivante (showHome / showApp s'en chargent)
function meHide(fromPop){ const m=meEl(); if(!m||m.hidden) return; m.hidden=true; meEdit=false; if(meTitle){ document.title=meTitle; meTitle=""; }
  if(mePushed&&!fromPop){ try{ if(history.state&&history.state.pbMe){ meSkipPop=true; history.back(); } }catch(e){ meSkipPop=false; } } mePushed=false; }
function closeMe(fromPop){ if(!meOpen()) return; const to=meFrom, o=meOpener; meOpener=null; closeSheet(true); meHide(fromPop);
  if(to==="home") showHome(); else showApp();
  const b= o&&document.contains(o)&&o.getClientRects().length? o : avBtn(); if(b) b.focus({preventScroll:true}); }
// le popstate provoqué par notre propre history.back() est ignoré : une page rouverte entre-temps reste ouverte
window.addEventListener("popstate",()=>{ if(meSkipPop){ meSkipPop=false; if(meOpen()&&!(history.state&&history.state.pbMe)){ try{ history.pushState({pbMe:1},""); mePushed=true; }catch(e){} } return; } if(meOpen()){ mePushed=false; closeMe(true); } });

// stats calculées depuis le plan et les coches (jusqu'à aujourd'hui), le suivi et les activités importées
function meStats(){
  const tdy=todayIso(), run=runSport(), wk=[]; let n=0,nd=0,vol=0,lng=0,lngD="";
  for(const w of plan){ const a=isoOf(w.w,0); if(!a||a>tdy) break; const f=dayFuel(P,E,w); let wn=0,wd=0,pv0=0,dv=0;
    for(const d of f.days){ if(!hasSession(d)) continue; const dt=isoOf(w.w,d.i); if(!dt||dt>tdy) continue; const dn=markOf(w.w,d.i)==="done"; if(dt===tdy&&!dn) continue;
      const v= run? (d.run?d.km:0) : (d.run?sessionDur(d.run):0)+(d.renfo?parseInt(d.renfo.m)||0:0); wn++; pv0+=v;
      if(!dn) continue; wd++; dv+=v; if(run&&d.run&&d.km>lng){ lng=d.km; lngD=dt; } }
    n+=wn; nd+=wd; vol+=dv; wk.push({w:w.w,n:wn,nd:wd,pv:pv0,dn:dv}); }
  // série : semaines d'affilée avec au moins une séance faite ; la semaine en cours et les semaines sans séance au plan ne la cassent pas
  const tw=(todayPos()||{}).w; let streak=0; for(let k=wk.length-1;k>=0;k--){ if(wk[k].nd>0) streak++; else if(wk[k].w===tw||wk[k].n===0) continue; else break; }
  const acts=actLive(), aKm=acts.reduce((s,a)=>s+(+a.km||0),0), aMin=acts.reduce((s,a)=>s+(+a.min||0),0);
  return {run,n,nd,vol,lng,lngD,streak,weeks:wk,nLog:state.log.length,nActs:acts.length,aKm,aMin};
}
const meDate=d=>new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
function renderMeId(){ const box=$("#meId"); if(!box) return; const hadT=document.activeElement&&document.activeElement.id==="meT"; const ex=state.isExample&&!localSaved, p=state.profile;
  const ini=acct.name&&!mePriv()? esc(acct.name.charAt(0).toUpperCase()) : `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6"/></svg>`;
  const tags=[]; if(!ex){ tags.push(SPORT_CAT[P.sport]||"Course à pied"); try{ tags.push(wzObjLabel(p,P)); }catch(e){} tags.push({deb:"Débutant",int:"Intermédiaire",conf:"Confirmé"}[P.niveau]||""); }
  const tp=todayPos(), st=effStart(p), N=plan.length, r=raceOn(p);
  let prog=""; if(!ex&&N){ const end=st&&addDays(st,N*7-1);
    const fr= tp? tp.w/N : st&&st>todayIso()? 0 : 1, lab= tp? "Semaine "+tp.w+" sur "+N : st&&st>todayIso()? "Ton plan commence le "+meDate(realStart()||st) : "Plan terminé"+(end?" le "+meDate(end):"");
    const dj= r? Math.round((new Date(p.raceDate+"T12:00:00")-new Date(todayIso()+"T12:00:00"))/864e5) : null;
    prog=`<div class="me-prog"><span class="ring">${ringSvg(fr,44)}</span><div><b>${esc(lab)}</b>${dj!=null?`<span>${dj===0?"C'est le jour J !":dj===1?"Demain : jour J":"J−"+dj+" avant le "+esc(meDate(p.raceDate))}</span>`:""}</div></div>`; }
  const tg=tags.filter(Boolean);
  box.innerHTML=`<div class="me-av" aria-hidden="true">${ini}</div><div class="me-idt"><h1 id="meT" tabindex="-1">Mon profil</h1>${acct.name?`<p class="me-nm">${pv(acct.name)}</p>`:""}
    <p class="me-st" data-st="${esc(acct.st)}"><span class="acc-dot" aria-hidden="true"></span>${esc(acctText())}</p>${tg.length?`<ul class="me-tags" aria-label="Ton plan">${tg.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>`:""}</div>${prog}`;
  if(hadT){ const t=$("#meT"); if(t) t.focus({preventScroll:true}); }
}
function renderMeStats(){ const box=$("#meStats"); if(!box) return;
  if(state.isExample&&!localSaved){ box.innerHTML=`<div class="me-empty"><p>Tes séances faites, tes kilomètres et ta régularité s'afficheront ici dès que tu auras créé ton plan.</p><button class="btn" type="button" data-me="wizard">Créer mon plan</button></div>`; return; }
  const s=meStats(), reg= s.n? Math.round(s.nd/s.n*100) : null, u= s.run? "km" : "min";
  const tile=(k,v,un,d)=>`<div class="stat"><div class="k">${esc(k)}</div><div class="v">${v}${un?` <small>${esc(un)}</small>`:""}</div><div class="d">${d}</div></div>`;
  const t=[ tile("Séances faites",fmt0(s.nd),"",s.n? "sur "+fmt0(s.n)+" prévues à ce jour" : "aucune séance passée pour l'instant"),
    tile("Régularité",reg==null?"–":fmt0(reg),reg==null?"":"%",reg==null? "dès ta première séance" : reg>=80? "bravo, c'est la clé" : reg>=50? "continue, chaque séance compte" : "une séance après l'autre"),
    s.run? tile("Distance",esc(kmTxt(s.vol)),"km","prévue sur les séances cochées « Faite »") : tile("Temps d'entraînement",esc(hmTxt(s.vol)),"","séances cochées « Faite »"),
    tile("Série",fmt0(s.streak),"sem.",s.streak>1? "semaines actives d'affilée" : "semaine active d'affilée (au moins une séance)"),
    s.run? tile("Plus longue séance",s.lng? esc(kmTxt(s.lng)) : "–",s.lng?"km":"",s.lngD? "le "+esc(dfmt(new Date(s.lngD+"T12:00:00"))) : "pas encore de séance faite") : "",
    tile("Suivi",fmt0(s.nLog),s.nLog>1?"semaines":"semaine",s.nLog? "notées dans l'onglet Suivi" : "note ton ressenti chaque semaine dans Suivi"),
    s.nActs? tile("Activités importées",fmt0(s.nActs),"",esc(hmTxt(s.aMin))+(s.aKm>0?" · "+fmt0(s.aKm)+" km":"")) : "" ].join("");
  // volume des 8 dernières semaines commencées : fait (plein) et prévu (pointillés), même graphique que l'onglet Suivi
  const rows=s.weeks.slice(-8).filter(r=>r.n), wd=Math.max(260,Math.min(720,(box.clientWidth||600)-32));
  box.innerHTML=`<div class="summary me-tiles">${t}</div>`+(rows.some(r=>r.nd)? `<div class="card me-chart"><h3>${s.run?"Kilomètres":"Minutes"} par semaine</h3>${barSvg(rows,u,"Volume fait et prévu sur les dernières semaines",wd)}<ul class="sr-only">${rows.map(r=>`<li>Semaine ${r.w} : ${esc(s.run? kmTxt(r.dn)+" km faits sur "+kmTxt(r.pv)+" prévus" : fmt0(r.dn)+" min faites sur "+fmt0(r.pv)+" prévues")}</li>`).join("")}</ul></div>` : "");
}
// champs modifiables ici : [clé, libellé, unité, min, max, entier, optionnel] ; mêmes bornes que BOUNDS (l'âge reste un entier, comme dans l'assistant)
const ME_F=[["age","Âge","ans",15,90,true],["taille","Taille","cm",130,220,true],["poids","Poids","kg",35,250,false],["fcmax","FC max","bpm",140,220,true,1],["mg","Masse grasse","%",5,55,false,1]];
function renderMeInfo(){ const box=$("#meInfo"), eb=$("#meEditB"); if(!box) return; const ex=state.isExample&&!localSaved, p=state.profile;
  if(eb) eb.hidden=ex||meEdit;
  if(ex){ box.innerHTML=`<p class="note">Ce sont des données d'exemple. Crée ton plan pour enregistrer tes propres infos.</p>`; return; }
  if(meEdit){ renderMeForm(box,p); return; }
  const val=(k,u)=>{ const v=numOf(p[k]); return isNaN(v)? "" : numTxt(v)+" "+u; };
  const row=(k,v,d)=>`<div><dt>${esc(k)}</dt><dd>${v}${d?`<small>${d}</small>`:""}</dd></div>`;
  box.innerHTML=`<dl class="me-dl">${[
    row("Sexe",pv(p.sexe==="F"?"Femme":"Homme")),
    row("Âge",val("age","ans")? pv(val("age","ans")) : "–",P.minor&&!mePriv()? "moins de 18 ans : plan prudent, sans déficit" : ""),
    row("Taille",val("taille","cm")? pv(val("taille","cm")) : "–"),
    row("Poids",val("poids","kg")? pv(val("poids","kg")) : "–","celui du profil, qui sert aux calories"),
    row("FC max",val("fcmax","bpm")? pv(val("fcmax","bpm")) : "non renseignée","sert aux zones de fréquence cardiaque"),
    row("Masse grasse",val("mg","%")? pv(val("mg","%")) : "estimée","sert au repère de sécurité des calories"),
    row("Activité hors sport",esc({"1.25":"Assis la plupart du temps","1.4":"Un peu actif","1.55":"Métier physique ou très actif"}[String(p.activite)]||"Assis la plupart du temps"))].join("")}</dl>
    <p class="note me-more">Ton objectif, tes séances et ta nutrition se règlent dans l'onglet Profil. <button class="linkbtn" type="button" data-me="settings">Ouvrir mes réglages</button></p>`;
}
function renderMeForm(box,p){
  const inp=([k,l,u,lo,hi,int,opt])=>`<div class="field"><label for="me_${k}">${esc(l)} (${esc(u)})${opt?" · optionnel":""}</label><input id="me_${k}" type="text" inputmode="${int?"numeric":"decimal"}" maxlength="8" autocomplete="off" value="${esc(String(p[k]??"").slice(0,8))}" aria-describedby="me_${k}H"><span class="hint" id="me_${k}H">Entre ${lo} et ${hi}${opt?" ; vide si tu ne sais pas":""}.</span></div>`;
  box.innerHTML=`<form class="form me-form" id="meForm" novalidate><div class="field"><span class="lbl" id="me_sexeL">Sexe</span><div class="seg" role="radiogroup" aria-labelledby="me_sexeL"><label><input type="radio" name="me_sexe" value="H"${p.sexe!=="F"?" checked":""}><span>Homme</span></label><label><input type="radio" name="me_sexe" value="F"${p.sexe==="F"?" checked":""}><span>Femme</span></label></div></div>
    <div class="row2">${inp(ME_F[0])}${inp(ME_F[1])}</div>${inp(ME_F[2])}<div class="row2">${inp(ME_F[3])}${inp(ME_F[4])}</div>
    ${mePriv()?`<p class="note" id="mePrivN">Mode discret : tes valeurs sont visibles pendant la modification.</p>`:""}<p class="alert warn" id="meMinor" hidden>Avant 18 ans, l'outil ne met aucun déficit et pas de semi-marathon ni de marathon : ton plan sera adapté.</p>
    <div class="alerts" id="meErr" role="alert"></div>
    <div class="me-fa"><button class="btn" type="submit" id="meSave">Enregistrer</button><button class="btn ghost" type="button" data-me="cancel">Annuler</button></div></form>`;
  const f=box.querySelector("#meForm"); f.dataset.init=JSON.stringify(Object.fromEntries(["sexe",...ME_F.map(x=>x[0])].map(k=>[k,String(p[k]??"")])));
  const minor=()=>{ const a=numOf(f.querySelector("#me_age").value); f.querySelector("#meMinor").hidden=!(a>=15&&a<18); };
  f.querySelector("#me_age").addEventListener("input",minor); minor();
  f.addEventListener("input",e=>{ if(e.target&&e.target.getAttribute("aria-invalid")) fieldErr(e.target,""); if(!f.querySelector("[aria-invalid]")) f.querySelector("#meErr").innerHTML=""; });
  f.addEventListener("submit",e=>{ e.preventDefault(); meSave(f); });
  f.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!sheetEl){ e.preventDefault(); e.stopPropagation(); meEdit=false; renderMeInfo(); const eb=$("#meEditB"); if(eb) eb.focus({preventScroll:true}); } });
}
// contrôle de chaque champ : nombre lisible, bornes du profil, entier quand il le faut ; rien n'est enregistré tant qu'une erreur reste
function meCheck(f){ const out={}, errs=[];
  const sx=f.querySelector('input[name="me_sexe"]:checked'); out.sexe= sx&&sx.value==="F"? "F" : "H";
  for(const [k,l,u,lo,hi,int,opt] of ME_F){ const el=f.querySelector("#me_"+k), raw=String(el.value||"").trim(); let msg="";
    if(!raw){ if(!opt) msg=l+" : ce champ est nécessaire au calcul."; else out[k]=""; }
    else{ const v=numOf(raw); if(!/^\d{1,3}([.,]\d{1,2})?$/.test(raw)||isNaN(v)) msg=l+" : écris un nombre"+(int?" entier":"")+" (ex. "+(int?lo+10:numTxt(lo+40.5))+").";
      else if(int&&!Number.isInteger(v)) msg=l+" : écris un nombre entier.";
      else if(v<lo||v>hi) msg= k==="age"&&v<lo? "Pacebook est réservé aux personnes de 15 ans et plus." : l+" : entre "+lo+" et "+hi+" "+u+".";
      else out[k]= int? String(v) : raw.replace(",","."); }
    fieldErr(el,msg); if(msg) errs.push(el); }
  return {out,errs};
}
function meSave(f){ const b=f.querySelector("#meSave"); if(b.disabled) return; const {out,errs}=meCheck(f), eb=f.querySelector("#meErr");
  if(errs.length){ eb.innerHTML=`<div class="alert warn"><b>${errs.length>1? errs.length+" champs à corriger" : "Un champ à corriger"}</b> : rien n'a été enregistré.</div>`; errs[0].focus(); return; }
  // seuls les champs modifiés dans ce formulaire sont écrits : un changement arrivé entre-temps (autre appareil, import) n'est pas écrasé
  let init={}; try{ init=JSON.parse(f.dataset.init||"{}"); }catch(e){} for(const k of Object.keys(out)) if(Object.hasOwn(init,k)&&String(out[k])===init[k]) delete out[k];
  const wasMinor=numOf(state.profile.age)<18, adult=out.age!=null&&numOf(out.age)>=18;
  if(wasMinor&&adult&&f.dataset.adult!=="1"){ f.dataset.adult="1"; eb.innerHTML=`<div class="alert warn"><b>Tu indiques 18 ans ou plus.</b> Ton plan va changer : un déficit calorique, le semi-marathon et le marathon deviennent possibles. Vérifie ton âge, puis appuie de nouveau sur « Enregistrer » pour confirmer.</div>`; b.focus(); return; }
  eb.innerHTML=""; b.disabled=true;
  // même chemin que le formulaire de l'onglet Profil : profil horodaté champ par champ, enregistré sur l'appareil puis dans le compte, plan recalculé
  const p={...state.profile,...out}; if(!valid(p)){ b.disabled=false; eb.innerHTML=`<div class="alert warn">Profil incomplet : rien n'a été enregistré.</div>`; return; }
  const chg=Object.keys(out).some(k=>String(state.profile[k]??"")!==String(out[k]));
  meEdit=false; if(chg){ state.profile=p; state.isExample=false; fillForm(); persist(); recompute(); }
  renderMe(); toast(chg? "Tes infos sont enregistrées : ton plan et tes calories sont recalculés." : "Rien n'a changé.");
  const eb2=$("#meEditB"); if(eb2) eb2.focus({preventScroll:true});
}
// compte : état, connexion, enregistrements, puis les actions (export, import, effacement, session) ; mêmes data-acc que l'ancienne feuille
function renderMeAcct(){ const b=$("#meAcct"); if(!b) return; const conn=acct.st==="connected", g=acct.st==="guest";
  const A=window.CarnetAuth, can=!!(A&&A.canLogin), cs=acct.st==="consent";
  const ex= conn? "Tes données sont aussi enregistrées dans ton compte : tu les retrouves sur tous tes appareils." : cs? "Ton compte est connecté, mais rien n'est enregistré dans ton compte tant que tu n'as pas donné ton accord ci-dessous." : g? (can? (acct.failed? "Impossible de joindre le service de connexion pour l'instant. Tes données restent sur cet appareil." : "Connecte-toi pour retrouver tes données sur tous tes appareils. Sans connexion, tout fonctionne : tes données restent sur cet appareil.") : "La connexion n'est pas activée sur ce site : tes données restent sur cet appareil. Tu peux les exporter à tout moment.") : acct.st==="owner"? "Les données de cet appareil appartiennent à un autre compte. Rien n'a été mélangé ni envoyé : choisis ce que tu veux en faire." : "Vérification de ton compte…";
  const loc= localSaved&&state.savedAtLocal? fmtDT(state.savedAtLocal) : "Rien d'enregistré encore", acc= conn? (acct.lastAt? fmtDT(acct.lastAt) : "Pas encore") : "Pas de compte connecté";
  const row=(k,t,s,cls)=>`<button class="opt${cls?" "+cls:""}" type="button" data-acc="${k}"><span>${esc(t)}<small>${esc(s)}</small></span><span aria-hidden="true">›</span></button>`;
  const ae=document.activeElement, hadF= ae&&b.contains(ae)? ae.dataset.acc||"" : "";
  b.innerHTML=`<div class="acc-st" data-st="${esc(acct.st)}"><span class="acc-dot" aria-hidden="true"></span><div><b id="accSt" tabindex="-1">${esc(acctText())}</b>${acct.name?`<div class="acc-nm">${pv(acct.name)}</div>`:""}<p>${esc(ex)}</p>${g&&can&&acct.failed?`<button class="btn ghost sm" type="button" data-acc="retry" data-first>Réessayer</button>`:""}</div></div>
    ${(g&&can)||cs? loginCta(cs) : acct.st==="owner"? ownerBlock() : ""}
    <dl class="acc-dl"><div><dt>Dernier enregistrement sur cet appareil</dt><dd>${esc(loc)}</dd></div><div><dt>Dernier enregistrement dans le compte</dt><dd>${esc(acc)}</dd></div></dl>
    <h3 class="me-gh">Mes données</h3><div class="grp">${row("export","Exporter mes données","Un fichier JSON : pacebook-donnees.json")}${row("import","Importer mes données","Depuis un fichier JSON exporté ici")}${row("erase","Effacer mes données","Profil, suivi, coches, déplacements, préférences (appareil et compte)","danger")}</div>
    ${conn||cs? `<h3 class="me-gh">Session et compte</h3><div class="grp">${row("signout","Me déconnecter","Ce navigateur seulement")+(conn?row("withdraw","Retirer mon consentement","Supprime tes données du compte, garde le compte"):"")+row("delacct","Supprimer mon compte","Compte et données supprimés définitivement","danger")}</div>` : ""}
    <h3 class="me-gh">Pacebook</h3><div class="grp">${row("home","Revoir l'accueil","La présentation de Pacebook")}${row("news","Quoi de neuf","Les nouveautés de la version "+APP_V)}</div>
    <div class="alerts msg" id="meMsg" role="status" aria-live="polite"></div>
    <details class="more why"><summary>Infos et confidentialité</summary><p class="note legal">Pacebook ne donne pas d'avis médical : en cas de doute, de douleur ou de trouble alimentaire, demande l'avis d'un médecin. Tes données restent sur cet appareil et, si tu te connectes, dans ton compte. Pacebook ne garde jamais ton nom ni ton e-mail ; en revanche, la session de connexion (gérée par la bibliothèque d'authentification) contient l'e-mail et le nom donnés par ton fournisseur, dans ce navigateur, jusqu'à la déconnexion. Le mode discret masque ton nom et tes mensurations sur cette page et sur l'avatar, sur cet appareil seulement. <span class="nw">Version ${APP_V}.</span></p></details>${LEGAL_NAV}`;
  // focus gardé sur l'action en cours quand la section est redessinée (changement d'état du compte)
  if(hadF&&/^[a-z-]{2,12}$/.test(hadF)){ const x=b.querySelector(`[data-acc="${hadF}"]`); if(x) x.focus({preventScroll:true}); }
  if(acct.st==="owner"){ const f=b.querySelector("[data-first]"), a2=document.activeElement; if(f&&(!a2||a2===document.body||a2.id==="meT"||a2.id==="accSt")) f.focus(); }
}
function renderMe(){ if(!meOpen()) return; const pr=mePriv(), pb=$("#mePriv");
  if(pb){ pb.setAttribute("aria-pressed",pr?"true":"false");  }
  const ae=document.activeElement, keepT=ae&&ae.id==="meT";
  renderMeId(); renderMeStats(); if(!meEdit) renderMeInfo(); renderMeAcct();
  if(keepT){ const t=$("#meT"); if(t) t.focus({preventScroll:true}); }
}
// données changées ailleurs (autre onglet, compte, import) : la page se redessine, sauf le formulaire en cours de saisie
function meRefresh(){ if(!meOpen()) return; const ae=document.activeElement, keepT=ae&&ae.id==="meT"; renderMeId(); renderMeStats(); if(!meEdit) renderMeInfo(); if(keepT){ const t=$("#meT"); if(t) t.focus({preventScroll:true}); } }
// actions de la page : un seul écouteur, posé une fois
(function meWire(){ const m=meEl(); if(!m) return;
  // rechargement sur une entrée « page ouverte » : la page démarre fermée, l'entrée est neutralisée (le retour ne la rouvre pas en double)
  try{ if(history.state&&history.state.pbMe) history.replaceState(null,""); }catch(e){}
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json"; inp.hidden=true; inp.id="meFile"; inp.setAttribute("aria-label","Fichier de données à importer"); m.appendChild(inp);
  const msg=t=>{ const x=$("#meMsg"); if(x) x.innerHTML=t; };
  inp.addEventListener("change",async()=>{ const f=inp.files&&inp.files[0]; inp.value=""; if(!f) return;
    if(f.size>2*1024*1024){ msg(`<div class="alert warn">Ce fichier est trop gros (2 Mo au plus).</div>`); return; }
    let txt; try{ txt=await f.text(); }catch(e){ msg(`<div class="alert warn">Impossible de lire ce fichier.</div>`); return; }
    const r=importClean(txt); if(r.err){ msg(`<div class="alert warn">${esc(r.err)}</div>`); return; }
    openImportConfirm(r.data,$("#meAcct [data-acc=import]")); });
  m.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!sheetEl&&authEl.hidden&&wizEl.hidden&&!meEdit){ e.preventDefault(); closeMe(); } });
  m.addEventListener("click",async e=>{
    const me=e.target.closest("[data-me]");
    if(me){ const k=me.dataset.me;
      if(k==="back") closeMe();
      else if(k==="wizard") openWizard(me);
      else if(k==="cancel"){ meEdit=false; renderMeInfo(); const eb=$("#meEditB"); if(eb) eb.focus({preventScroll:true}); }
      else if(k==="settings"){ meFrom="app"; meOpener=null; closeMe(); selectTab("profil"); const t=$("#tab-profil"); if(t) t.focus({preventScroll:true}); }
      return; }
    if(e.target.closest("#meEditB")){ if(state.isExample&&!localSaved) return; meEdit=true; renderMeInfo(); const a=$("#me_age"); if(a) a.focus(); return; }
    if(e.target.closest("#mePriv")){ lsSet(ME_PRIV,mePriv()?"0":"1"); renderAcct(); renderMe(); const pb=$("#mePriv"); if(pb) pb.focus({preventScroll:true}); setT($("#srLive"),mePriv()?"Mode discret activé : tes valeurs sont masquées.":"Mode discret désactivé."); return; }
    const b=e.target.closest("[data-acc]"); if(!b||!m.contains(b)||b.disabled) return; const k=b.dataset.acc, opener=b;
    if(k==="retry"){ acct.st="pending"; renderAcct(); await initAccount(); const s=$("#accSt"); if(s) s.focus({preventScroll:true}); }
    else if(k==="export") exportData(msg);
    else if(k==="import") inp.click();
    else if(k==="home"){ meFrom="home"; meOpener=null; closeMe(); }
    else if(k==="news") openNews(opener);
    else if(k==="erase") openErase(1,opener);
    else if(k==="login") openAuth(acct.st==="consent"?"consent":"login",opener);
    else if(k==="own-use"){ b.disabled=true; resetLocal(); acct.st="pending"; renderAcct(); await initAccount(); toast("Tu utilises maintenant les données de ce compte."); }
    else if(k==="own-zero"&&!b.dataset.arm){ b.dataset.arm="1"; b.textContent="Oui, effacer définitivement cet appareil et les données de ce compte"; b.classList.remove("ghost"); b.classList.add("danger"); msg(`<div class="alert bad" role="alert"><b>Dernière confirmation.</b> Les données de cet appareil et celles de ce compte seront effacées définitivement. Il n'y aura pas d'annulation possible. Pour renoncer, choisis une autre option.</div>`); }
    else if(k==="own-zero"){ b.disabled=true; const o=ownerPending; try{ if(o&&o.ref){ try{ await o.ref.set({erased:true,eid:newEid(),savedAt:Date.now()}); }catch(x){ if(!(x&&x.code==="NOROW")) throw x; } } resetLocal(); acct.st="pending"; renderAcct(); await initAccount(); toast("Tu repars de zéro avec ce compte."); }catch(x){ b.disabled=false; msg(`<div class="alert warn" role="alert">Impossible pour l'instant : rien n'a été effacé. Réessaie dans un instant.</div>`); } }
    else if(k==="own-out"||k==="consent-no"){ b.disabled=true; await signOutNow(false); }
    else if(k==="signout") openSignOut(opener);
    else if(k==="withdraw") openWithdraw(opener);
    else if(k==="delacct") openDelAcct(1,opener); });
})();
// données exportées : uniquement les champs connus, déjà nettoyés
function dataOut(){ return {app:"carnet-de-course",format:1,version:APP_V,exportedAt:new Date().toISOString(),profile:cleanProfile(state.profile),isExample:!!state.isExample,log:cleanLog(state.log),week:state.week,appliedByDate:cleanApplied(state.appliedByDate),deleted:cleanDeleted(state.deleted),moves:cleanMoves(state.moves),done:cleanDone(state.done),...liveX14()}; }
async function exportData(msg){
  const txt=JSON.stringify(dataOut(),null,1);
  if(!dlCap){ openSheet({title:"Exporter mes données",html:`<p class="msg">Le téléchargement n'est pas disponible ici : sélectionne le texte, copie-le et garde-le dans un fichier .json.</p><textarea readonly data-first aria-label="Tes données au format JSON">${esc(txt)}</textarea>`,onReady:sh=>{ const ta=sh.querySelector("textarea"); setTimeout(()=>ta.select(),0); }}); return; }
  try{ await dlCap.save({filename:"pacebook-donnees.json",data:new TextEncoder().encode(txt)}); msg(`<div class="alert ok"><b>Données exportées.</b> Garde ce fichier : tu pourras l'importer ici.</div>`); }
  catch(e){ const c=e&&e.code; if(c==="declined") return; msg(`<div class="alert warn">${c==="rate_limited"?"Une demande d'enregistrement est déjà ouverte : réessaie dans un instant.":"Export indisponible ici."}</div>`); }
}
// import : texte borné (2 Mo), clés « __proto__ » ignorées, champs connus seulement, mêmes nettoyeurs que le chargement ; jamais fusionné
function importClean(txt){
  if(typeof txt!=="string"||txt.length>2*1024*1024) return {err:"Ce fichier est trop gros (2 Mo au plus)."};
  let o; try{ o=JSON.parse(txt,(k,v)=> (k==="__proto__"||k==="constructor"||k==="prototype")? undefined : v); }catch(e){ return {err:"Ce fichier n'est pas un JSON lisible."}; }
  if(!o||typeof o!=="object"||Array.isArray(o)) return {err:"Ce fichier n'est pas un export de Pacebook."};
  if(o.app!=null&&o.app!=="carnet-de-course") return {err:"Ce fichier n'est pas un export de Pacebook."};
  if(!o.profile||typeof o.profile!=="object"||Array.isArray(o.profile)) return {err:"Ce fichier ne contient pas de profil."};
  const p=cleanProfile(o.profile);
  for(const k of ["age","taille","poids"]) if(isNaN(bound(k,numOf(p[k])))||numOf(p[k])<BOUNDS[k][0]||numOf(p[k])>BOUNDS[k][1]) return {err:"Le profil du fichier est incomplet (âge, taille ou poids illisible)."};
  const now=Date.now(), stamp=(m,f)=>Object.fromEntries(Object.entries(m).map(([k,v])=>[k,f(v)]));
  const d={profile:p,isExample:false,log:cleanLog(o.log),week:Math.max(1,Math.round(+o.week)||1),appliedByDate:cleanApplied(o.appliedByDate),deleted:cleanDeleted(o.deleted),moves:cleanMoves(o.moves),done:cleanDone(o.done),...x14Clean(o)};
  d.moves=stamp(d.moves,v=>({...v,at:now})); d.done=stamp(d.done,v=>({...v,at:now})); for(const k of x14Keys) d[k]=stamp(d[k],v=>({...v,at:now}));
  return {data:d};
}
function openImportConfirm(d,opener){
  const nd=Object.values(d.done).filter(v=>v.v!=="none").length, nm=Object.values(d.moves).filter(v=>v.to).length;
  openSheet({title:"Importer mes données",opener,kind:"import",html:`<p class="note">Ce fichier contient un profil, <b>${d.log.length}</b> semaine${d.log.length>1?"s":""} de suivi, <b>${nd}</b> séance${nd>1?"s":""} cochée${nd>1?"s":""} et <b>${nm}</b> déplacement${nm>1?"s":""}.${x14Sum(d)}</p><div class="alert warn">Ces données remplacent celles de cet appareil${acct.st==="connected"?" et de ton compte":""}. Exporte d'abord les tiennes si tu veux pouvoir revenir en arrière.</div>`,
    foot:`<button class="btn" type="button" id="impGo">Remplacer</button>`,onReady:sh=>{ sh.querySelector("#impGo").addEventListener("click",async()=>{ if(dbRef){ try{ const sn=await dbRef.get(); lastRemote=sn&&sn.exists? (sn.data()||null) : null; }catch(e){} } applyImport(d); closeSheet(true); const av=[...document.querySelectorAll(".js-av")].find(x=>x.getClientRects().length); if(av) av.focus({preventScroll:true}); }); }});
}
function applyImport(d){
  // ce qui n'est plus là (sur cet appareil ou dans le compte) reçoit une marque d'effacement horodatée : une autre synchronisation ne le ressuscite pas
  const r=lastRemote&&!lastRemote.erased? lastRemote : null, rl=r? cleanLog(r.log):[], rdn=r? cleanDone(r.done):{}, rmv=r? cleanMoves(r.moves):{};
  const now=Date.now(), del={...d.deleted}; for(const e of [...state.log,...rl]) if(!d.log.some(x=>x.date===e.date)) del[e.date]=now;
  const done={...d.done}; for(const k of new Set([...Object.keys(state.done||{}),...Object.keys(rdn)])) if(!done[k]) done[k]={v:"none",sig:"",at:now};
  const moves={...d.moves}; for(const [k,v] of Object.entries({...rmv,...(state.moves||{})})) if(v&&v.to&&!moves[k]) moves[k]={to:"",at:now};
  loadState({...d,...tomb14(d,r,now),deleted:cleanDeleted(del),done:cleanDone(done),moves:cleanMoves(moves),seen:state.seen});
  state.profileAt=now; lastPJ="";   // le profil importé est le plus récent : il remplace celui du compte
  state.isExample=false; fillForm(); persist(); recompute(); hvMark(); if(!homeEl.hidden) showApp();
  toast("Données importées : "+d.log.length+" semaine"+(d.log.length>1?"s":"")+" de suivi.");
}
// effacement en deux temps : explication, puis dernière confirmation (toujours une feuille, jamais confirm())
function openErase(step,opener){
  if(step===1) openSheet({title:"Effacer mes données",opener,kind:"erase",html:`<p class="note">Cette action supprime ton profil, ton suivi, tes séances cochées et déplacées et tes préférences, sur cet appareil${acct.st==="connected"?" et dans ton compte":""}.</p><div class="alert warn">Pense à exporter tes données avant, si tu veux pouvoir les retrouver.</div>`,closeLabel:"Annuler",firstClose:true,
    foot:`<button class="btn danger" type="button" id="erNext">Continuer</button>`,onReady:sh=>{ sh.querySelector("#erNext").addEventListener("click",()=>openErase(2,opener)); }});
  else openSheet({title:"Effacer mes données",opener,kind:"erase",html:`<div class="alert bad"><b>Dernière confirmation.</b> Tout sera effacé définitivement${acct.st==="connected"?", y compris dans ton compte":""}. Il n'y aura pas d'annulation possible.</div><p class="note">Tu reviendras ensuite à l'accueil.</p>`,closeLabel:"Annuler",firstClose:true,
    foot:`<button class="btn danger" type="button" id="erGo">Oui, tout effacer</button>`,onReady:sh=>{ const go=sh.querySelector("#erGo"); go.addEventListener("click",async()=>{ go.disabled=true; const ok=await eraseAll(); if(ok){ closeSheet(true); showHome(); toast("Tes données ont été effacées."); } else { go.disabled=false; const m=sh.querySelector(".sh-b"); m.insertAdjacentHTML("beforeend",`<div class="alert warn" role="alert">Impossible d'effacer les données de ton compte pour l'instant : rien n'a été effacé. Réessaie dans un instant.</div>`); } }); }});
}
// déconnexion : l'écriture en attente part d'abord ; l'effacement local est un choix
async function signOutNow(clearLocal,force){
  clearTimeout(timer);
  if(dbRef&&(dirty||pending||writing||flushFailed)){
    if(!writing){ try{ await flush(); }catch(e){ flushFailed=true; } }
    for(let n=0;n<100&&(writing||pending);n++) await new Promise(r=>setTimeout(r,50));
    // modifications jamais enregistrées dans le compte : on n'efface JAMAIS l'appareil sans que tu l'aies choisi
    if(clearLocal&&!force&&(flushFailed||dirty||pending||writing)) return false;
  }
  try{ await window.CarnetAuth.signOut(); }catch(e){}
  dbRef=null; acct.st="guest"; acct.name=""; acct.lastAt=0; noAccount=true; lastRemote=null; acct.uid="";
  if(clearLocal){ resetLocal(); showHome(); }
  setStore(localStatus()); renderAcct(); toast(clearLocal? "Tu es déconnecté et les données de cet appareil ont été effacées." : "Tu es déconnecté. Tes données restent sur cet appareil."); return true;
}
function openSignOut(opener){
  openSheet({title:"Me déconnecter",opener,kind:"signout",closeLabel:"Annuler",firstClose:true,
    html:`<p class="note">Tu seras déconnecté de ce navigateur. Tes données restent dans ton compte.</p><label class="ack"><input type="checkbox" id="soClear" checked><span>Effacer aussi les données de cet appareil (utile sur un appareil partagé).</span></label>`,
    foot:`<button class="btn" type="button" id="soGo">Me déconnecter</button>`,
    onReady:sh=>{ const body=sh.querySelector(".sh-b");
      const unsaved=()=>{ body.innerHTML=`<div class="alert warn" role="alert"><b>Modifications non enregistrées dans ton compte.</b> Les dernières modifications n'ont pas pu être envoyées. Si tu effaces cet appareil maintenant, elles seront perdues. Rien n'a été effacé.</div><div class="prov"><button class="btn" type="button" data-so="retry" id="soFirst">Réessayer l'enregistrement</button><button class="btn ghost" type="button" data-so="keep">Me déconnecter en gardant cet appareil</button><button class="btn ghost" type="button" data-so="force">Effacer quand même et me déconnecter</button></div><div class="alerts msg" id="soMsg" role="status" aria-live="polite"></div>`; const f=body.querySelector("#soFirst"); if(f) f.focus(); };
      const done=()=>closeSheet(true);
      body.addEventListener("click",async e=>{ const x=e.target.closest("[data-so]"); if(!x) return; const k=x.dataset.so;
        if(k==="retry"){ x.disabled=true; const r=await signOutNow(true); if(r) done(); else { x.disabled=false; const m=body.querySelector("#soMsg"); if(m) m.innerHTML=`<div class="alert warn">Toujours impossible d'enregistrer. Tu peux réessayer plus tard ou garder cet appareil.</div>`; } }
        else if(k==="keep"){ x.disabled=true; await signOutNow(false); done(); }
        else if(k==="force"&&!x.dataset.arm){ x.dataset.arm="1"; x.textContent="Oui, effacer et perdre ces modifications"; x.classList.add("danger"); const m=body.querySelector("#soMsg"); if(m) m.innerHTML=`<div class="alert bad" role="alert"><b>Dernière confirmation.</b> Les modifications non enregistrées seront perdues définitivement.</div>`; }
        else if(k==="force"){ x.disabled=true; await signOutNow(true,true); done(); } });
      const go=sh.querySelector("#soGo"); go.addEventListener("click",async()=>{ const c=sh.querySelector("#soClear").checked; go.disabled=true; const r=await signOutNow(c); if(r) done(); else { go.hidden=true; unsaved(); } }); }});
}
function openWithdraw(opener){
  openSheet({title:"Retirer mon consentement",opener,kind:"withdraw",closeLabel:"Annuler",firstClose:true,
    html:`<p class="note">Tes données de santé seront supprimées de ton compte et tu seras déconnecté. Ton compte (identifiant de connexion) reste ouvert : tu peux le supprimer à part. Les données de cet appareil sont conservées.</p>`,
    foot:`<button class="btn danger" type="button" id="wdGo">Retirer mon consentement</button>`,
    onReady:sh=>{ const go=sh.querySelector("#wdGo"); go.addEventListener("click",async()=>{ go.disabled=true; clearTimeout(timer); erasing=true;
      try{ await window.CarnetAuth.withdrawConsent(); }catch(e){ erasing=false; go.disabled=false; sh.querySelector(".sh-b").insertAdjacentHTML("beforeend",`<div class="alert warn" role="alert">Impossible de supprimer tes données du compte pour l'instant : rien n'a été retiré. Réessaie dans un instant.</div>`); return; }
      erasing=false; dirty=false; await signOutNow(false); closeSheet(true); }); }});
}
function openDelAcct(step,opener){
  if(step===1) openSheet({title:"Supprimer mon compte",opener,kind:"delacct",closeLabel:"Annuler",firstClose:true,
    html:`<p class="note">Cette action supprime ton compte et toutes tes données enregistrées dans le compte. Elle est définitive.</p><div class="alert warn">Pense à exporter tes données avant, si tu veux pouvoir les retrouver.</div>`,
    foot:`<button class="btn danger" type="button" id="daNext">Continuer</button>`,onReady:sh=>{ sh.querySelector("#daNext").addEventListener("click",()=>openDelAcct(2,opener)); }});
  else openSheet({title:"Supprimer mon compte",opener,kind:"delacct",closeLabel:"Annuler",firstClose:true,
    html:`<div class="alert bad"><b>Dernière confirmation.</b> Ton compte et tes données enregistrées dans le compte seront supprimés définitivement. Il n'y aura pas d'annulation possible.</div><label class="ack"><input type="checkbox" id="daLoc" checked><span>Effacer aussi les données de cet appareil.</span></label>`,
    foot:`<button class="btn danger" type="button" id="daGo">Oui, supprimer mon compte</button>`,
    onReady:sh=>{ const go=sh.querySelector("#daGo"); go.addEventListener("click",async()=>{ go.disabled=true; const loc=sh.querySelector("#daLoc").checked; clearTimeout(timer); erasing=true; dirty=false;
      try{ await window.CarnetAuth.deleteAccount(); }catch(e){ erasing=false; go.disabled=false; sh.querySelector(".sh-b").insertAdjacentHTML("beforeend",`<div class="alert warn" role="alert">Impossible de supprimer ton compte pour l'instant : rien n'a été supprimé. Réessaie dans un instant ou écris-nous (page « Tes droits RGPD »).</div>`); return; }
      erasing=false; await signOutNow(loc); closeSheet(true); toast("Ton compte et tes données ont été supprimés."); }); }});
}
async function eraseAll(){
  // une écriture en cours est attendue (et plus aucune ne démarre) avant de poser la marque d'effacement
  erasing=true; clearTimeout(timer); pending=false; dirty=false;
  try{
    for(let i=0;writing&&i<100;i++) await new Promise(r=>setTimeout(r,50));
    let eid; if(dbRef){ const t=Date.now(); eid=newEid(); try{ await dbRef.set({erased:true,eid,savedAt:t}); acct.lastAt=0; }catch(e){ if(!(e&&e.code==="NOROW")) return false; eid=undefined; } }
    resetLocal(); if(eid) state.eid=eid; if(acct.uid) lsSet(OWNER_KEY,acct.uid); setStore(dbRef? "rien d'enregistré encore. Dès que tu remplis ton profil, c'est sauvegardé dans ton compte." : localStatus()); return true;
  } finally{ erasing=false; }
}

/* écran de connexion / création de compte (plein écran) : trois accords distincts non précochés, puis un bouton par fournisseur.
   Mode « consent » : retour de connexion sans accord enregistré -> accepter (crée la ligne du compte) ou refuser (déconnexion). */
const PROV_ICON={
  google:`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.1V7H2a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7l3.7 2.9C6.6 7.3 9.1 5.4 12 5.4z"/></svg>`,
  github:`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.9c-2.9.6-3.5-1.2-3.5-1.2-.5-1.2-1.2-1.6-1.2-1.6-.9-.6.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2.1 1.1-2.8-.1-.3-.5-1.3.1-2.8 0 0 .9-.3 2.9 1.1a10 10 0 0 1 5.2 0c2-1.4 2.9-1.1 2.9-1.1.6 1.5.2 2.5.1 2.8.7.7 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7 1 .7 1.9v2.9c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5z"/></svg>`,
  azure:`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>`,
  apple:`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.5 1-1.4 1.3-2.7 1.4-2.8-.1 0-2.6-1-2.6-4.2zM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>`};
const AU_BOX=["#accAge","#accTerms","#accHealth"];
let auOpener=null, auBusy=false;
const auReady=()=>AU_BOX.every(q=>$(q).checked);
function auSync(){ const r=auReady(), cs=authEl.dataset.mode==="consent"; authEl.dataset.ready=r?"1":"0"; $("#auHint").hidden=r||!cs; if(r) $("#accMsg").innerHTML=""; AU_BOX.forEach(q=>{ if($(q).checked) $(q).removeAttribute("aria-invalid"); }); }
function openAuth(mode,opener){
  const A=window.CarnetAuth, cs=mode==="consent"; if(!cs&&!(A&&A.canLogin)){ openMe(opener); return; }
  closeSheet(true); auOpener=opener||document.activeElement; authEl.dataset.mode=cs?"consent":"login";
  setT($("#auK"),cs?"Dernière étape":"Gratuit · sans publicité");
  setT($("#auT"),cs?"Active la sauvegarde":"Retrouve tes données partout");
  setT($("#auSub"),cs? (acct.name&&!discreet()?"Tu es connecté en tant que "+acct.name+". ":"Tu es connecté. ")+"Donne ton accord pour enregistrer tes données dans ton compte : rien n'y est écrit avant."
    : "Connecte-toi ou crée ton compte : ton plan et ton suivi te suivent sur tous tes appareils.");
  $("#auProvs").innerHTML= cs? `<button class="au-prov" type="button" data-acc="consent-ok"><span>Accepter et activer la sauvegarde</span></button><button class="au-prov" type="button" data-acc="consent-no"><span>Refuser et me déconnecter</span></button>`
    : A.providers.map(p=>`<button class="au-prov" type="button" data-acc="prov" data-prov="${esc(p.id)}">${PROV_ICON[p.id]||""}<span>Continuer avec ${esc(p.label)}</span></button>`).join("");
  setT($("#auLater"),cs?"Plus tard":"Continuer sans compte");
  $("#auCons").hidden=!cs; $("#auTos").hidden=cs;   // connexion : boutons seulement ; les trois cases sont demandées une fois, à la première connexion
  { const m=$("#auMail"), on=!cs&&!!A.emailLogin; m.hidden=!on; $("#auOr").hidden=!A.providers.length; if(on){ $("#auEmail").value=""; $("#auPw").value=""; auMode("signup"); auEye(false); } }
  AU_BOX.forEach(q=>{ $(q).checked=false; $(q).removeAttribute("aria-invalid"); }); $("#accMsg").innerHTML=""; auBusy=false; auSync();
  authEl.hidden=false; wrapEl.inert=true; homeEl.inert=true; meInert(true); wizEl.inert=true; document.documentElement.style.overflow="hidden"; authEl.scrollTop=0;
  try{ $("#auT").focus({preventScroll:true}); }catch(e){}
}
function closeAuth(){ if(authEl.hidden) return; authEl.hidden=true; if(wizEl.hidden){ wrapEl.inert=false; homeEl.inert=false; meInert(false); } wizEl.inert=false;
  if(!sheetEl&&!timerEl&&wizEl.hidden) document.documentElement.style.overflow="";
  const o=auOpener; auOpener=null; if(o&&document.contains(o)&&o.getClientRects().length) o.focus({preventScroll:true}); }
authEl.addEventListener("change",e=>{ if(e.target&&e.target.type==="checkbox") auSync(); });
authEl.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!auBusy){ e.preventDefault(); closeAuth(); } else if(e.key==="Tab") trapTab(e,authEl); });
$("#auClose").addEventListener("click",()=>{ if(!auBusy) closeAuth(); });
$("#auLater").addEventListener("click",()=>{ if(!auBusy) closeAuth(); });
// retour arrière depuis la page du fournisseur (cache de navigation) : boutons rendus de nouveau utilisables
window.addEventListener("pageshow",e=>{ if(e.persisted&&!authEl.hidden){ auBusy=false; openAuth(authEl.dataset.mode,auOpener); } });
// les trois cases sont exigées avant toute connexion (fournisseur ou e-mail) : sinon message, cases marquées et reliées au message
function auGate(){ if(auReady()) return true;
  $("#accMsg").innerHTML=`<div class="alert warn" role="alert">Coche les trois cases pour continuer : ton âge (15 ans au moins), les CGU et la politique de confidentialité, et ton consentement pour tes données de santé.</div>`; const un=AU_BOX.map(q=>$(q)).filter(x=>!x.checked);
  un.forEach(x=>{ x.setAttribute("aria-invalid","true"); const d=x.getAttribute("aria-describedby")||""; if(!/\baccMsg\b/.test(d)) x.setAttribute("aria-describedby",(d+" accMsg").trim()); });
  if(un[0]) un[0].focus(); return false; }
authEl.addEventListener("click",async e=>{ const b=e.target.closest&&e.target.closest("[data-acc]"); if(!b||auBusy) return; const k=b.dataset.acc, msg=t=>{ $("#accMsg").innerHTML=t; };
  if(k==="consent-no"){ auBusy=true; b.disabled=true; await signOutNow(false); auBusy=false; closeAuth(); return; }
  if(k==="consent-ok"&&!auGate()) return;
  const A=window.CarnetAuth, lab=b.querySelector("span")||b, old=lab.textContent, all=[...authEl.querySelectorAll("[data-acc]")];
  auBusy=true; all.forEach(x=>{ x.disabled=true; }); b.setAttribute("aria-busy","true");
  setT(lab,k==="prov"? "Redirection vers "+((A.providers.find(p=>p.id===b.dataset.prov)||{}).label||"le fournisseur")+"…" : "Enregistrement…");
  let gone=false;
  try{
    if(k==="prov"){ await A.signIn(b.dataset.prov,auReady()?consentRecord():null); gone=true; setTimeout(()=>{ if(auBusy){ auBusy=false; all.forEach(x=>{ x.disabled=false; }); b.removeAttribute("aria-busy"); setT(lab,old); } },8000); }
    else { await A.saveConsent(consentRecord()); auBusy=false; closeAuth(); acct.st="pending"; renderAcct(); await initAccount(); toast("Sauvegarde dans ton compte activée."); return; }
  }catch(err){ msg(`<div class="alert warn" role="alert">${k==="prov"?"Impossible de lancer la connexion pour l'instant. Réessaie dans un instant.":"Impossible d'enregistrer ton accord pour l'instant. Réessaie dans un instant."}</div>`); }
  if(!gone){ auBusy=false; all.forEach(x=>{ x.disabled=false; }); b.removeAttribute("aria-busy"); setT(lab,old); }
});

/* Compte par e-mail et mot de passe : créer un compte ou se connecter, mot de passe oublié. Les erreurs sont traduites, jamais affichées telles quelles. */
const AU_MAILERR={creds:"E-mail ou mot de passe incorrect.",unconfirmed:"Confirme d'abord ton adresse : clique sur le lien de l'e-mail reçu (regarde aussi dans les indésirables).",exists:"Un compte existe déjà avec cette adresse : choisis « J'ai déjà un compte ».",
  weak:"Mot de passe trop court : 8 caractères au moins.",email:"Cette adresse e-mail n'est pas valide.",rate:"Trop de tentatives : réessaie dans quelques minutes.",disabled:"La création de compte par e-mail n'est pas encore activée sur ce site.",same:"Choisis un mot de passe différent de l'ancien.",other:"Impossible pour l'instant. Vérifie ta connexion et réessaie."};
let auMM="signup";
function auMode(m){ auMM=m==="signin"?"signin":"signup"; const up=auMM==="signup";
  authEl.querySelectorAll("[data-mm]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.mm===auMM)));
  $("#auPw").setAttribute("autocomplete",up?"new-password":"current-password"); $("#auPwH").hidden=!up; $("#auForgot").hidden=up;
  setT($("#auGo").querySelector("span"),up?"Créer mon compte":"Me connecter"); $("#accMsg").innerHTML=""; }
function auEye(show){ const i=$("#auPw"), b=$("#auEye"); i.type=show?"text":"password"; b.setAttribute("aria-pressed",String(!!show)); b.setAttribute("aria-label",show?"Masquer le mot de passe":"Afficher le mot de passe"); }
authEl.addEventListener("click",e=>{ const m=e.target.closest&&e.target.closest("[data-mm]"); if(m&&!auBusy){ auMode(m.dataset.mm); $("#auEmail").focus(); } });
$("#auEye").addEventListener("click",()=>auEye($("#auPw").type==="password"));
const auMailMsg=(cls,t)=>{ $("#accMsg").innerHTML=`<div class="alert ${cls}" role="${cls==="ok"?"status":"alert"}">${t}</div>`; };
function auMailBusy(on){ auBusy=on; authEl.querySelectorAll("#auMail button,#auMail input,[data-acc]").forEach(x=>{ x.disabled=on; }); $("#auGo").toggleAttribute("aria-busy",on); }
$("#auMail").addEventListener("submit",async e=>{ e.preventDefault(); if(auBusy) return; const A=window.CarnetAuth;
  const em=$("#auEmail"), pw=$("#auPw"), email=em.value.trim(), up=auMM==="signup";
  [em,pw].forEach(x=>x.removeAttribute("aria-invalid"));
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ em.setAttribute("aria-invalid","true"); auMailMsg("warn",AU_MAILERR.email); em.focus(); return; }
  if(up? pw.value.length<A.PW_MIN : !pw.value){ pw.setAttribute("aria-invalid","true"); auMailMsg("warn",up?AU_MAILERR.weak:"Saisis ton mot de passe."); pw.focus(); return; }
  const lab=$("#auGo").querySelector("span"), old=lab.textContent; auMailBusy(true); setT(lab,up?"Création du compte…":"Connexion…");
  try{
    if(up){ const r=await A.signUpEmail(email,pw.value,null); pw.value="";
      if(r.confirm){ auMailBusy(false); setT(lab,old); auMailMsg("ok",`<b>Vérifie ta boîte mail.</b> Clique sur le lien envoyé à ${esc(email)} pour activer ton compte (regarde aussi dans les indésirables). Si tu avais déjà un compte avec cette adresse, choisis « J'ai déjà un compte ».`); return; } }
    else await A.signInEmail(email,pw.value,null);
    pw.value=""; auMailBusy(false); closeAuth(); acct.st="pending"; renderAcct(); await initAccount(); toast(up?"Compte créé, tu es connecté.":"Tu es connecté."); return;
  }catch(err){ const c=err&&err.code||"other"; auMailBusy(false); setT(lab,old); auMailMsg("warn",AU_MAILERR[c]||AU_MAILERR.other); if(c==="exists") auMode("signin"); (c==="weak"||c==="creds"?pw:em).focus(); }
});
$("#auForgot").addEventListener("click",async()=>{ if(auBusy) return; const A=window.CarnetAuth, em=$("#auEmail"), email=em.value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ em.setAttribute("aria-invalid","true"); auMailMsg("warn","Saisis d'abord ton adresse e-mail, puis touche « Mot de passe oublié ? »."); em.focus(); return; }
  auMailBusy(true); try{ await A.resetPassword(email); auMailMsg("ok",`Si un compte existe pour ${esc(email)}, un e-mail avec un lien pour choisir un nouveau mot de passe vient d'être envoyé. Ouvre-le sur cet appareil.`); }
  catch(err){ auMailMsg("warn",AU_MAILERR[err&&err.code]||AU_MAILERR.other); } auMailBusy(false); });
// retour du lien « mot de passe oublié » : choisir le nouveau mot de passe
function openPwSheet(){ const A=window.CarnetAuth; if(!A||!A.inRecovery) return; closeAuth();
  openSheet({title:"Nouveau mot de passe",kind:"pw",closeLabel:"Plus tard",html:`<p class="note">Choisis le nouveau mot de passe de ton compte. 8 caractères au moins.</p><div class="field"><label for="npw">Nouveau mot de passe</label><input id="npw" type="password" autocomplete="new-password" minlength="8" maxlength="72" data-first></div><div class="alerts msg" id="npwMsg" role="status" aria-live="polite"></div>`,
    foot:`<button class="btn" type="button" id="npwGo">Enregistrer</button>`,onReady:sh=>{ const go=sh.querySelector("#npwGo"), i=sh.querySelector("#npw"), m=sh.querySelector("#npwMsg");
      const save=async()=>{ if(i.value.length<A.PW_MIN){ m.innerHTML=`<div class="alert warn" role="alert">${AU_MAILERR.weak}</div>`; i.focus(); return; } go.disabled=true;
        try{ await A.updatePassword(i.value); closeSheet(); toast("Mot de passe modifié."); }catch(err){ go.disabled=false; m.innerHTML=`<div class="alert warn" role="alert">${AU_MAILERR[err&&err.code]||AU_MAILERR.other}</div>`; } };
      go.addEventListener("click",save); i.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); save(); } }); }}); }
let pwHooked=false;

$("#profileForm").addEventListener("submit",e=>e.preventDefault());
let local=loadLocal();
$(".wrap").dataset.tab="semaine";
// données stockées illisibles : on repart de l'exemple sans rien écraser
function safeStart(d){ try{ if(d) loadState(d); fillForm(); recompute(); return true; }catch(e){ console.warn("données ignorées",e); state.profile={...EXAMPLE}; state.log=[]; state.isExample=true; try{ plan=buildPlan(profileNums(state.profile)); }catch(_){} fillForm(); recompute(); return false; } }
if(!safeStart(local)) local=null;
try{const t=localStorage.getItem("carnet.tab");if(t&&document.getElementById("p-"+t)&&!document.getElementById("tab-"+t).hidden)selectTab(t);}catch(e){}
// téléphone : on va à la carte du jour, sauf à la première visite (ou sur l'exemple), où l'on montre d'abord l'en-tête
if(window.innerWidth<=520 && $(".wrap").dataset.tab==="semaine" && local && !state.isExample && !$("#followedPlan")) requestAnimationFrame(scrollToToday);   // alerte « début dans le passé » : elle reste visible en haut
localSaved=!!(local&&!local.isExample);
setStore(!lsOK? LS_BLOCKED : local&&!local.isExample? "sur cet appareil." : "données d'exemple, rien d'enregistré encore.");
renderAcct();
// première visite (aucune donnée à toi) : page d'accueil ; rien n'est enregistré tant que tu n'agis pas
if(!local&&!hvSeen()) showHome();

// nouveautés : première visite, rien (la version est notée) ; sinon elles attendent dans le panneau Notifications, sans aucun signal (passif)
{ const sv=seenV(); if(!local&&!sv){ /* rien n'est écrit avant la première action (voir showApp) */ } else { newsFrom= sv||10; } }
// export Calendrier : seulement si la page peut proposer un fichier (capacité « downloads »)
// téléchargement : fichier local (Blob), aucune capacité externe
dlCap={ save:async({filename,data})=>{ const mime=/\.json$/.test(filename)?"application/json":/\.zip$/.test(filename)?"application/zip":"application/octet-stream";
  const url=URL.createObjectURL(new Blob([data],{type:mime})), a=document.createElement("a"); a.href=url; a.download=String(filename).replace(/[^\w.-]/g,"_"); a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); } };
{ const b=$("#icsW"); if(b) b.hidden=false; document.documentElement.classList.add("dl-on"); }
function guestMode(){ noAccount=true; if(!dbRef) acct.st="guest"; setStore(localStatus()); renderAcct(); }
async function initAccount(){
  try{
    if(window.CarnetAuth&&window.CarnetAuth.oauthError){ const code=window.CarnetAuth.oauthCode, cause=window.CarnetAuth.oauthCause;
      // cause reconnue (clé fixe venue d'auth.js) : message précis, utile aussi à l'éditeur pour corriger la configuration
      const CAUSE={exchange:"Le fournisseur a refusé l'échange de connexion : côté éditeur, vérifier le Client Secret et l'URL de rappel du fournisseur dans Supabase.",
        db:"Le compte n'a pas pu être créé dans la base (erreur Supabase « Database error saving new user »).",
        email:"Le fournisseur n'a pas transmis ton adresse e-mail : autorise le partage de l'e-mail, ou utilise une autre méthode.",
        exists:"Un compte existe déjà avec cette adresse e-mail : connecte-toi avec la méthode utilisée la première fois.",
        unverified:"Ton adresse e-mail n'est pas vérifiée chez ce fournisseur : vérifie-la, puis réessaie.",
        disabled:"Ce mode de connexion n'est pas activé pour l'instant. Utilise une autre méthode."};
      const m= /otp_expired|expired/.test(code)? "Ce lien a expiré ou a déjà servi. Si tu viens de confirmer ton adresse, connecte-toi avec ton e-mail et ton mot de passe."
        : /access_denied/.test(code)? "Connexion annulée. Tu peux réessayer quand tu veux."
        : /email.*(verif|confirm)/.test(code)? "Confirme d'abord ton adresse e-mail chez ce fournisseur, puis réessaie."
        : /bad_oauth_state|bad_oauth_callback|flow_state/.test(code)? "La connexion a expiré ou s'est terminée dans un autre onglet. Réessaie depuis cette page, sans changer d'onglet."
        : /provider_disabled|signup_disabled/.test(code)? "Ce mode de connexion n'est pas activé pour l'instant. Utilise une autre méthode."
        : "La connexion n'a pas abouti. Réessaie, ou utilise une autre méthode de connexion.";
      // le code (forme contrôlée par auth.js : lettres et « _ » seulement) aide à trouver la cause ; jamais le texte reçu
      const shown=(CAUSE[cause]||m)+(code?" (code : "+code+(cause?", "+cause:"")+")":"");
      setTimeout(()=>toast(shown),400); }
    const A=window.CarnetAuth; if(!A||!A.canLogin){ acct.failed=false; guestMode(); return; }   // pas de connexion configurée : invité
    if(!pwHooked&&A.onRecovery){ pwHooked=true; A.onRecovery(()=>setTimeout(openPwSheet,300)); }
    // compte injoignable (réseau, Supabase) : on le dit au lieu de passer en invité sans un mot ; la session reste enregistrée et sera reprise
    let c; try{ c=await A.connect(); }catch(e){ acct.failed=true; guestMode(); setTimeout(()=>toast("Impossible de joindre ton compte pour l'instant : tu es en mode invité sur cet appareil. Réessaie depuis le bouton Compte."),500); return; }
    acct.failed=false;
    if(!c){ guestMode();   // pas de session : invité
      // retour de connexion sans session : le plus souvent, lien de confirmation ouvert dans une autre appli que celle de l'inscription (l'adresse est quand même confirmée)
      if(A.returnFailed) setTimeout(()=>{ toast("La connexion n'a pas pu se terminer sur cet appareil. Si tu viens de confirmer ton adresse, elle est bien validée : connecte-toi avec ton e-mail et ton mot de passe.");
        if(A.emailLogin&&authEl.hidden&&wizEl.hidden&&!sheetEl){ openAuth("login",avBtn()); auMode("signin"); } },500);
      return; }
    const {db,user}=c, uid=user&&user.id? await user.id():null;
    if(!db||!uid||!/^[\w-]{1,128}$/.test(String(uid))){ guestMode(); return; }
    A.onSignedOut(()=>{ if(dbRef||acct.st==="consent"){ dbRef=null; acct.st="guest"; acct.name=""; noAccount=true; setStore(localStatus()); renderAcct(); toast("Tu as été déconnecté."); } });
    try{ acct.name= user.me? nameOf(await user.me()) : ""; }catch(e){ acct.name=""; }
    if(A.inRecovery) setTimeout(openPwSheet,300);
    if(!c.consent){   // pas d'accord enregistré pour ce compte : rien n'est écrit tant qu'il n'est pas donné
      let ok=false; const p=A.takePendingConsent(); if(p){ try{ ok=await A.saveConsent(p); }catch(e){} }
      if(!ok){ dbRef=null; noAccount=true; acct.st="consent"; setStore(localStatus()); renderAcct(); if(!sheetEl&&authEl.hidden&&wizEl.hidden) openAuth("consent",avBtn()); return; } }
    const ref=db.doc("carnet"); acct.uid=String(uid);
    const snap=await ref.get();   // la référence n'est gardée qu'après une lecture réussie : jamais d'écriture à l'aveugle
    const d=snap.exists? (snap.data()||{}) : null; lastRemote=d;
    const erased=!!(d&&d.erased===true);
    const remoteOk=!!(d&&d.profile&&typeof d.profile==="object"&&!Array.isArray(d.profile));
    // chargement lent : on repart de l'état le plus récent de cet appareil (modifs faites pendant la lecture, autre onglet)
    { const ls=loadLocal(); local= ls&&(+ls.savedAtLocal||0)>(+state.savedAtLocal||0)? ls : (state.savedAtLocal||!state.isExample? {...state} : ls); }
    const del=mergeDeleted(local&&local.deleted, remoteOk&&d.deleted);
    const localT=(local&&+local.savedAtLocal)||0, remoteT=remoteOk?(+d.savedAt||0):0;
    // données d'un AUTRE compte sur cet appareil : on ne fusionne ni n'écrit rien avant le choix de la personne
    const ow=lsGet(OWNER_KEY); if(local&&!local.isExample&&ow&&ow!==String(uid)){ dbRef=null; noAccount=true; ownerPending={ref,uid:String(uid)}; acct.st="owner"; setStore(localStatus()); renderAcct(); if(!sheetEl&&authEl.hidden&&wizEl.hidden) openMe(avBtn()); return; }
    ownerPending=null;
    // époque du compte : si cet appareil était déjà synchronisé dans une autre époque, ses données datent d'avant un effacement
    const ep=epochOf(d), leid=local&&local.eid; let wiped=false;
    if(hasEpoch(d)&&local&&!local.isExample&&leid!==undefined&&leid!==ep){ resetLocal(); local=null; wiped=true; if(!wizEl.hidden) closeWiz(); showHome(); toast("Tes données ont été effacées depuis un autre appareil."); }
    dbRef=ref; noAccount=false; acct.st="connected"; acct.lastAt=remoteOk? remoteT : 0; lsSet(OWNER_KEY,String(uid)); if(hasEpoch(d)) state.eid=ep;
    if(wiped&&!remoteOk) setStore("rien d'enregistré encore. Dès que tu remplis ton profil, c'est sauvegardé dans ton compte.");
    else if(remoteOk && (!local||local.isExample||remoteT>=localT)){
      // le compte est plus récent : on le charge, en gardant les entrées de suivi qui n'existent que sur cet appareil
      const log=dropDeleted(cleanLog([...(local&&!local.isExample?cleanLog(local.log):[]),...cleanLog(d.log)]),del);
      // séances cochées : réunies (celles de cet appareil l'emportent), dernière version vue : la plus récente des deux
      const lo=local&&!local.isExample, done=mergeStamped(d.done,lo?local.done:{},cleanDone), moves=mergeStamped(d.moves,lo?local.moves:{},cleanMoves), seen=Math.max(+d.seen||0,+(local&&local.seen)||0);
      const mp= lo&&!d.isExample? mergeProfile(d.profile,d.pAt,local.profile,local.pAt) : {profile:d.profile,pAt:cleanPAt(d.pAt)}, pmerged=JSON.stringify(mp.profile)!==JSON.stringify(d.profile);
      const ok=safeStart({...x14Merge(d,lo?local:null),profile:mp.profile,pAt:mp.pAt,profileAt:Math.max(+d.profileAt||0,pmerged?+(local&&local.profileAt)||0:0),isExample:d.isExample,log,week:d.week,appliedByDate:d.appliedByDate,deleted:del,moves,done,seen,eid:ep});
      const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      if(ok){ persistLocal(); if(pmerged||log.length!==cleanLog(d.log).length||Object.keys(del).length!==Object.keys(cleanDeleted(d.deleted)).length||!same(done,cleanDone(d.done))||!same(moves,cleanMoves(d.moves))||!same(cleanFeel(d.feel),state.feel)||!same(cleanActs(d.acts),state.acts)||!same(cleanRhr(d.rhr),state.rhr)||!same(cleanAip(d.aip),cleanAip(state.aip))||!same(cleanEvr(d.evr),cleanEvr(state.evr))) flush(); setStore(ACCOUNT_OK); }
      else setStore("données du compte illisibles, rien n'a été écrasé.");
    }else if(local && !local.isExample){
      if(remoteOk){ state.deleted=del; state.log=dropDeleted(cleanLog([...cleanLog(d.log),...state.log]),del); state.done=mergeStamped(d.done,state.done,cleanDone); state.moves=mergeStamped(d.moves,state.moves,cleanMoves); Object.assign(state,x14Merge(d,state)); state.seen=Math.max(+state.seen||0,Math.min(APP_V,+d.seen||0)); recompute(); persistLocal(); }
      flush();
    }else if(remoteOk===false&&d&&!erased&&Object.keys(d).length) setStore("données du compte illisibles, rien n'a été écrasé.");
    else setStore("Rien d'enregistré encore. Dès que tu remplis ton profil, c'est sauvegardé dans ton compte.");
    renderAcct();
  }catch(e){ guestMode(); }
}
initAccount();
})();
