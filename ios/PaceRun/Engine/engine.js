/* FICHIER GÉNÉRÉ : ne pas modifier. Source : public/app.js (lignes 14 à 1805). Regénérer : node ios/tools/build-engine.js */
"use strict";
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
    capLong(weeks,{...p,objectif:weeks.unreal.used}); capSimple(weeks,{...p,objectif:weeks.unreal.used}); capLong(weeks,{...p,objectif:weeks.unreal.used}); return weeks; }
  let weeks=buildPlanFor(p);
  if(!ok(o,weeks)){
    // repli sur la distance atteignable la plus proche : marathon → semi → 10 km → 5 km → forme
    const asked=o, top=weeks.topLong, chain=["42","21","10","5","forme"];
    for(const c of chain.slice(chain.indexOf(o)+1)){
      const w2= c==="forme"? null : buildPlanFor({...p,objectif:c});
      if(c==="forme"||ok(c,w2)){ weeks= w2||buildPlanFor({...p,objectif:"forme"}); weeks.unreal={asked,used:c,top}; break; }
    }
  }
  capLong(weeks,weeks.unreal? {...p,objectif:weeks.unreal.used} : p);
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
  // déficit : socle fixe tous les jours, supplément les jours de repos et de footing SEULEMENT (pas les jours de renfo, qui restent des jours d'entraînement) ; l'ajustement manuel entre dans le contrôle de sécurité
  const isRaceWk = wk.phase==="race", taper = wk.phase==="taper"||isRaceWk;
  const base=Math.min(p.deficit,500), extra= taper?0:Math.min(p.bonus,200), adj=p.adj||0;
  const lowBmi=E.bmi<18.5||!!p.minor; // maigreur : aucun déficit, seul un ajustement vers le haut reste possible
  // semaine de course : veille (et avant-veille en semi et marathon) ; en semi et marathon, ces 2 jours sont à l'équilibre pour remplir les réserves de glucides
  const raceI=days.findIndex(d=>d.kind==="race"||d.obj), long_= p.objectif==="21"||p.objectif==="42";
  const preOf=i=> raceI<0? null : i===(raceI+6)%7? "eve" : long_&&i===(raceI+5)%7? "pre" : null;
  let defs=days.map(d=> d.kind==="race"||d.obj||d.kind==="before"||((long_||evSport(p.sport))&&preOf(d.i))?0 : lowBmi? Math.min(0,-adj) : base + ((!d.renfo&&(d.kind==="rest"||d.kind==="easy"))?extra:0) - adj);
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
    // tous les nombres d'un jour se recoupent, sans décalage d'arrondi : dépense = maintien arrondi à 10, déficit arrondi à 10,
    // objectif = dépense − déficit (donc « dépense − objectif = déficit » tombe toujours juste à l'affichage).
    const mR=Math.round(d.maint/10)*10, absMin=p.sexe==="F"?1200:1500, flo=Math.max(E.bmr,Math.min(d.maint,absMin));
    // objectif arrondi à 10 comme avant (le plancher d'énergie disponible RED-S est calé sur cette valeur), puis déficit = dépense − objectif (se recoupe toujours)
    let raw=d.maint-want, clamp=raw<flo; if(clamp) raw=flo;
    let kcal= clamp? Math.ceil(raw/10)*10 : Math.round(raw/10)*10, def=mR-kcal;
    const bmrHit=clamp&&want>0, absHit=clamp&&want>0&&absMin>E.bmr&&kcal<=Math.ceil(absMin/10)*10&&d.maint>absMin;
    // macros en grammes ENTIERS dont la somme vaut EXACTEMENT l'objectif (P·4 + G·4 + L·9 = kcal) : protéines 2 g/kg, lipides ~20 %
    // (0,6 g/kg au moins), glucides = le reste ; on prend le L entier le plus proche tel que l'objectif restant se partage en glucides entiers.
    const P=Math.round(2*(E.protW||p.poids)), pre=preOf(d.i), need=kcal-4*P;
    let Ft= pre&&long_? .6*p.poids : Math.max(.6*p.poids,.2*kcal/9);
    if((need-9*Ft)/4<2*p.poids) Ft=Math.max(.6*p.poids,(need-8*p.poids)/9);
    // lipides en grammes entiers tels que les glucides (need−9·L)/4 soient aussi entiers (L ≡ need mod 4) et tiennent dans le budget (9·L ≤ need) :
    // on énumère ces valeurs et on prend la plus proche de la cible en gardant le plancher 0,6 g/kg quand le budget le permet. La somme P·4+G·4+L·9 vaut alors toujours exactement l'objectif.
    const Fmin=Math.floor(Math.min(.6*p.poids,need/9)-1e-9), r=((need%4)+4)%4, Fmax=Math.max(0,Math.floor(need/9));
    let F=r<=Fmax?r:0, bestD=Infinity, bestFl=2;
    for(let F2=r;F2<=Fmax;F2+=4){ const fl=F2>=Fmin?0:1, dd=Math.abs(F2-Ft); if(fl<bestFl||(fl===bestFl&&dd<bestD)){ bestFl=fl; bestD=dd; F=F2; } }
    const C=Math.max(0,(need-9*F)/4);
    const raceKcal= d.kind==="race"? .95*p.poids*(RACE_KM[p.objectif]||5) : 0;
    return {...d,def,want,bmrHit,absHit,kcal,P,C,F,pre,eqPre:!!(pre&&long_),raceKcal};
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
