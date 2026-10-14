// module d'import Apple Santé / Polar Flow (code extrait de public/app.js, testé sous Node) : node tests/import-pure.js
const fs=require("fs"), path=require("path"), FX=require("./fx14");
const app=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8"), src=app.slice(app.indexOf("/*PURE14:start*/"),app.indexOf("/*PURE14:end*/")+14);
const IMP14=new Function(src+"\nreturn IMP14;")();
let fails=0; const ok=(c,m,x)=>{ if(!c) fails++; console.log((c?"OK   ":"FAIL ")+m+(x!==undefined&&!c?" -> "+JSON.stringify(x):"")); };
const T={today:"2025-05-20"};
(async()=>{
  const a=IMP14._apple(FX.appleXml(),T);
  ok(a.acts.length===8,"Apple : 8 activités valides (doublon, durées/dates invalides retirés)",a.acts.map(x=>x.date+x.type+x.min));
  const run=a.acts.find(x=>x.date==="2025-04-02"); ok(run&&run.type==="course"&&run.min===46&&run.km===8.1&&run.kcal===512&&run.fc===152&&run.src==="apple","Apple : course (durée, km, kcal, FC)",run);
  const r2=a.acts.find(x=>x.date==="2025-04-12"); ok(r2&&r2.km===5&&r2.kcal===250,"Apple : distance et énergie lues dans WorkoutStatistics",r2);
  const r3=a.acts.find(x=>x.date==="2025-04-15"); ok(r3&&r3.km===0&&r3.kcal===0&&r3.fc===null&&r3.min===40,"Apple : valeurs hors bornes ignorées (km, kcal, FC)",r3);
  ok(!a.acts.some(x=>x.date>"2025-05-21"||x.date<"2000-01-01"),"Apple : dates futures / trop anciennes refusées");
  ok(a.acts.some(x=>x.type==="autre"&&x.date==="2025-04-16"),"Apple : type inconnu -> « autre »");
  ok(JSON.stringify(a).indexOf("script")<0&&JSON.stringify(a).indexOf("iPhone")<0&&JSON.stringify(a).indexOf("passwd")<0,"Apple : aucun texte du fichier n'est conservé");
  ok(a.weeks.length===3,"poids : 3 semaines (moyennes hebdomadaires)",a.weeks);
  const w0=a.weeks.find(x=>x.week==="2025-03-31"); ok(w0&&w0.kg===81&&w0.n===3,"poids : moyenne de la semaine du 31 mars = 81,0 (3 pesées)",w0);
  const w2=a.weeks.find(x=>x.week==="2025-04-14"); ok(w2&&Math.abs(w2.kg-79.8)<.05,"poids : 176 lb convertis (79,8 kg), 5 kg refusé",w2);
  ok(a.rhr.length===2&&a.rhr.find(x=>x.week==="2025-04-07").bpm===52,"FC de repos : 900 refusé, moyennes par semaine",a.rhr);
  // fichiers (Blob) : tranches, zip, bombes
  const mk=(buf,name)=>new File([buf],name||"x");
  const f1=await IMP14.parseFile(mk(Buffer.from(FX.appleXml())),T); ok(f1.acts.length===8&&f1.kinds[0]==="apple","fichier export.xml (Blob) : mêmes résultats");
  const f2=await IMP14.parseFile(mk(FX.appleZip(),"export.zip"),T); ok(f2.acts.length===8&&f2.weeks.length===3,"export.zip (deflate) : mêmes résultats",f2.acts.length);
  const f2b=await IMP14.parseFile(mk(FX.zip([["apple_health_export/export.xml",FX.appleXml()]],{deflate:false}),"s.zip"),T); ok(f2b.acts.length===8,"zip non compressé : mêmes résultats");
  const pz=await IMP14.parseFile(mk(FX.polarZip(),"polar.zip"),T); ok(pz.kinds.includes("polar")&&pz.acts.length>=8,"zip Polar (json, csv, tcx) lu ; chemin « ../ » ignoré",pz.acts.map(x=>x.date+x.type+x.min));
  const t=IMP14._tcx(FX.tcx(),T); ok(t.acts.length===1&&t.acts[0].min===40&&t.acts[0].km===7&&t.acts[0].kcal===500&&t.acts[0].fc===150,"TCX : tours additionnés, points GPS ignorés",t.acts);
  const c=IMP14._csv(FX.csv(),T); ok(c.acts.length===3&&c.acts[0].src==="polar","CSV Polar : 3 séances (note HTML ignorée, 2e tableau ignoré)",c.acts);
  const cr=c.acts.find(x=>x.date==="2025-04-05"); ok(cr&&cr.type==="course"&&cr.min===52&&cr.km===9.6&&cr.fc===151,"CSV : date jour-mois-année, durée hh:mm:ss",cr);
  const j=IMP14._json(FX.polarJson(),T); ok(j.acts.length===1&&j.acts[0].min===64&&j.acts[0].km===10.4&&j.acts[0].kcal===701&&j.acts[0].fc===150,"JSON Polar (exercices)",j.acts);
  const ja=IMP14._json(FX.polarJsonArr(),T); ok(ja.acts.length===3&&({}).polluted===undefined&&({}).x===undefined&&Object.prototype.polluted===undefined,"JSON : tableau, __proto__ et constructor ignorés",ja.acts);
  const expect=async(file,code,msg)=>{ try{ await IMP14.parseFile(file,T); ok(false,msg+" (aucune erreur)"); }catch(e){ ok(e.code===code,msg,e.code||e.message); } };
  await expect(mk(Buffer.from("hello world")),"unknown","fichier inconnu : refusé");
  await expect(mk(Buffer.from("")),"empty","fichier vide : refusé");
  await expect(mk(Buffer.from("<gpx></gpx>")),"gpx","GPX : refusé avec un code dédié");
  await expect(mk(Buffer.from("<?xml version='1.0'?><note>x</note>")),"unknown","XML quelconque : refusé");
  await expect(mk(Buffer.from('{"a":1}')),"unknown","JSON sans séance : refusé");
  await expect(mk(Buffer.from("PK\x03\x04garbage")),"badzip","zip tronqué : refusé");
  await expect(mk(FX.zip([["readme.txt","hi"]],{})),"unknown","zip sans fichier reconnu : refusé");
  await expect(new Blob([new Blob([Buffer.alloc(1024*1024)])]),"unknown","Blob de 1 Mo de zéros : refusé (inconnu)");
  // énorme : 600 Mo virtuels -> refus immédiat ; 120 Mo d'enregistrements -> lu par tranches
  const mb=new Blob([Buffer.alloc(1024*1024)]); await expect(new Blob(Array(600).fill(mb)),"toobig","fichier de 600 Mo : refusé (plafond 500 Mo)");
  const parts=FX.bigAppleXml(120); const big=new Blob(parts.map(p=>Buffer.from(p))); let t0=Date.now(), prog=0; const fb=await IMP14.parseFile(big,{...T,onProgress:f=>{ prog=f; }}); console.log("   120 Mo lus en",Date.now()-t0,"ms");
  ok(big.size>120*1024*1024&&fb.acts.length===2&&fb.weeks.length===1&&prog>0.99,"fichier de 120 Mo : lu par tranches, 2 séances + 1 poids",{n:fb.acts.length,size:big.size});
  // bombe zip : 200 Mo d'espaces compressés ; plafond de sortie réglé à 50 Mo
  const bz=FX.bombZip(200); console.log("   bombe : zip de",bz.length,"octets pour 200 Mo");
  await expect(mk(bz,"bomb.zip"),"bomb","bombe zip (rapport de compression de 1000 pour 1) : arrêtée");
  const okBomb=await (async()=>{ try{ await IMP14.parseFile(mk(bz,"b.zip"),{...T,maxOut:50*1024*1024}); return "no"; }catch(e){ return e.code; } })(); ok(okBomb==="bomb","bombe zip (plafond de 50 Mo) : code bomb",okBomb);
  // annulation
  const ac=new AbortController(); const pr=IMP14.parseFile(new Blob(parts.map(p=>Buffer.from(p))),{...T,signal:ac.signal}); setTimeout(()=>ac.abort(),30); let ab="no"; try{ await pr; }catch(e){ ab=e.code; } ok(ab==="abort","annulation en cours de lecture",ab);
  // v14 sécurité : plages de zip qui se recouvrent, limites par type de fichier, clé de dédoublonnage, lecture linéaire des balises sans « > »
  { const two=FX.zip([["a.json",FX.polarJson()],["b.json",FX.polarJsonArr()]]), v=new DataView(two.buffer,two.byteOffset,two.byteLength); let p=-1; for(let i=0,c=0;i<two.length-4;i++) if(v.getUint32(i,true)===0x02014b50){ if(++c===2){ p=i; break; } }
    const o1=(()=>{ for(let i=0;i<two.length-4;i++) if(v.getUint32(i,true)===0x02014b50) return v.getUint32(i+42,true); })(); v.setUint32(p+42,o1,true);
    await expect(mk(two,"dup.zip"),"badzip","zip : deux entrées au même décalage (plages qui se recouvrent) : refusé");
    const three=FX.zip([["a.json",FX.polarJson()],["b.json",FX.polarJsonArr()]]); const v3=new DataView(three.buffer,three.byteOffset,three.byteLength); let q=-1; for(let i=0,c=0;i<three.length-4;i++) if(v3.getUint32(i,true)===0x02014b50){ if(++c===2){ q=i; break; } } v3.setUint32(q+42,v3.getUint32(q+42,true)-10,true);
    await expect(mk(three,"ovl.zip"),"badzip","zip : une entrée qui commence avant la fin de la précédente : refusé"); }
  { const big=Buffer.from('{"exercises":[{"startTime":"2026-09-20T07:00:00","duration":"PT45M","sport":"RUNNING"}],"pad":"'+"x".repeat(17*1024*1024)+'"}'); await expect(mk(big,"big.json"),"textbig","JSON de 17 Mo : refusé (16 Mo au plus)");
    const zz=FX.zip([["big.json",big],["ok.json",FX.polarJson()]]); const rz=await IMP14.parseFile(mk(zz,"z.zip"),T); ok(rz.acts.length>=1&&rz.skipped>=1,"zip : entrée JSON de 17 Mo ignorée, les autres sont lues",{n:rz.acts.length,skipped:rz.skipped}); }
  { const fake={size:9*1024*1024*1024,slice:()=>({arrayBuffer:async()=>new ArrayBuffer(0)})}; await expect(fake,"xmlbig","fichier de plus de 8 Go : message dédié"); }
  { const wo=(h,d)=>`<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" durationUnit="min" totalDistance="${d}" totalDistanceUnit="km" startDate="2025-04-02 ${h}:00 +0200"/>`;
    const r=IMP14._apple(`<HealthData>${wo("07:30",8)}${wo("18:00",8)}${wo("07:30",8)}${wo("07:30",12)}</HealthData>`,T); ok(r.acts.length===3,"dédoublonnage : date, type, durée, heure de début et distance (même séance = 1, deux séances le même jour = 2)",r.acts.map(IMP14.keyOf)); }
  { const t0=Date.now(); try{ IMP14._apple("<HealthData>"+"<Record ".repeat(2000000),T); }catch(e){} const ms=Date.now()-t0; ok(ms<2000,"2 millions de « <Record » sans « > » : lecture linéaire ("+ms+" ms)",ms); }
  console.log(fails?"ECHECS "+fails:"TOUT OK"); process.exit(fails?1:0);
})();
