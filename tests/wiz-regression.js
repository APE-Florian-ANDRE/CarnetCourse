const {chromium}=require('playwright'); const L=require('./lib'); const fs=require('fs'), path=require('path');
const rnd=(a)=>{let x=a;return ()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;}}; const R=rnd(+(process.argv[2]||5)), pick=a=>a[Math.floor(R()*a.length)];
const iso=d=>d.toISOString().slice(0,10);
async function fill(pg,v){ return pg.evaluate(async v=>{
  const set=(id,x)=>{const e=document.getElementById(id); e.value=x; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));};
  const rad=(n,x)=>{ const r=[...document.querySelectorAll(`#wiz input[name="${n}"]`)].find(r=>r.value===String(x)&&!r.disabled); if(r){ r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); } };
  const next=()=>document.getElementById('wzNext').click(); const err=()=>{const e=document.getElementById('wzErr'); return e.hidden?'':e.textContent;};
  const step=()=>[...document.querySelectorAll('#wiz [id^="wzT"]')].length;
  rad('wz_sexe',v.sexe); set('wzAge',v.age); set('wzTaille',v.taille); set('wzPoids',v.poids); set('wzCible',v.cible); next(); let e=err(); if(e) return {err:e,step:1};
  rad('wz_niveau',v.niveau); set('wzObjectif',v.objectif); set('wzRace',v.race); set('wzVolume',v.volume); set('wzLongest',v.longest); next(); e=err(); if(e) return {err:e,step:2};
  rad('wz_seances',v.seances); rad('wz_renfo',v.renfo); rad('wz_lieu',v.lieu); rad('wz_equip',v.equip); rad('wz_longDay',v.longDay); rad('wz_act',v.act||'1.25'); next(); e=err(); if(e) return {err:e,step:3};
  rad('wz_def',v.def); const ack=document.getElementById('wzAck'); ack.checked=true; next(); e=err(); if(e) return {err:e,step:4};
  const T=window.__t; const defSel=[...document.querySelectorAll('#wiz input[name="wz_def"]:checked')].map(r=>r.value)[0];
  next(); e=err(); if(e) return {err:e,step:5};
  const st=T.state; return {ok:true,profile:JSON.parse(JSON.stringify(st.profile)),isExample:st.isExample,defSel,ls:localStorage.getItem('carnet-course.v1')?1:0};
 },v); }
(async()=>{const b=await chromium.launch(); const errs=[];
const S=await L.serve({'/app.js':()=>fs.readFileSync(path.join(L.ROOT,'app.js'),'utf8').replace(/initAccount\(\);\n\}\)\(\);\s*$/,'initAccount();\n'+fs.readFileSync(path.join(__dirname,'inst-line.txt'),'utf8')+'\n})();')}); const pg=await (await b.newContext()).newPage(); pg.on('pageerror',e=>errs.push(e.message)); await pg.goto(S.url+'/');
const A=await b.newPage(); await A.goto('file://'+path.resolve(__dirname,'../../qa/r4/calc/r13/v12.i.html'));
const bad=[ {k:'age 14',o:{age:14}},{k:'age 91',o:{age:91}},{k:'age 17,5',o:{age:'17.5'}},{k:'taille 129',o:{taille:129}},{k:'taille 221',o:{taille:221}},{k:'poids 34',o:{poids:'34'}},{k:'poids 251',o:{poids:'251'}},{k:'poids abc',o:{poids:'abc'}},{k:'poids vide',o:{poids:''}},{k:'cible>=poids',o:{cible:'90'}},{k:'cible 20',o:{cible:'20'}},{k:'course passée',o:{race:'2020-01-01'}},{k:'date 31 fév',o:{race:'2027-02-31'}},{k:'volume 201',o:{volume:'201'}},{k:'volume -1',o:{volume:'-1'}},{k:'volume vide',o:{volume:''}},{k:'longest 61',o:{longest:'61'}},{k:'longest abc',o:{longest:'abc'}} ];
const base={act:'1.25',sexe:'H',age:'32',taille:'178',poids:'82',cible:'76',niveau:'int',objectif:'10',race:'',volume:'20',longest:'10',seances:'4',renfo:'2',lieu:'dehors',equip:'salle',longDay:'6',def:'300'};
console.log('--- entrées invalides (doivent être refusées) ---');
for(const t of bad){ await pg.evaluate(()=>{ localStorage.clear(); }); await pg.reload(); await pg.evaluate(()=>{document.querySelector('[data-act="wizard"]').click();}); const r=await fill(pg,{...base,...t.o}); console.log(t.k.padEnd(14), r.ok?'ACCEPTÉ !! age='+r.profile.age+' poids='+r.profile.poids:'refusé étape '+r.step+' : '+r.err.slice(0,70)); }
console.log('--- profils valides : plan v13 (assistant) vs v12 même profil + invariants ---');
let n=0, diff=0, inv=[]; const seenDef=new Set();
for(let k=0;k<40;k++){
  const obj=pick(['forme','5','10','21','42']);
  const v={sexe:pick(['H','F']),age:String(pick([15,16,17,18,30,60,90])),taille:String(pick([130,150,170,190,220])),poids:String(pick(['35','45','60,5','82','120','250'])),cible:pick(['','',String(30)]),niveau:pick(['deb','int','conf']),objectif:obj,race:obj!=='forme'&&R()<.6?iso(new Date(Date.now()+Math.floor(R()*400)*864e5)):'',volume:String(pick([0,10,40,200])),longest:String(pick([0,5,60])),seances:String(pick([3,4,5,6])),renfo:String(pick([0,1,2])),lieu:pick(['dehors','tapis','mixte']),equip:pick(['salle','maison','aucun']),longDay:pick(['5','6']),act:pick(['1.25','1.4','1.55']),def:String(pick([0,200,300,400]))};
  if(v.cible==='30'){ const po=+v.poids.replace(',','.'); v.cible=String(Math.max(35,Math.floor(po*0.85))); if(+v.cible>=po) v.cible=''; }
  await pg.evaluate(()=>{ localStorage.clear(); }); await pg.reload(); await pg.evaluate(()=>{document.querySelector('[data-act="wizard"]').click();});
  const r=await fill(pg,v); if(!r.ok){ inv.push('refusé alors que valide '+JSON.stringify(v)+' '+r.err); continue; } n++;
  if(r.isExample||!r.ls) inv.push('non enregistré / isExample '+JSON.stringify(v));
  const calc=async(page,prof)=>page.evaluate(prof=>{const T=window.__t; T.state.profile={...prof}; T.setProfile(prof); const P=T.P,E=T.E; return {P:{age:P.age,taille:P.taille,poids:P.poids,deficit:P.deficit,seances:P.seances,activite:P.activite,start:P.start,nW:T.plan.length},E:{bmr:E.bmr,ffm:E.ffm},w:T.plan.map(wk=>{const f=T.dayFuel(P,E,wk);return {k:f.days.map(d=>d.kcal).join(','),ea:f.ea,lowBmi:f.lowBmi,minor:f.minor,realDef:f.realDef,noDef:f.noDef,maint:f.days.map(d=>d.maint),bmr:E.bmr,race:f.days.map(d=>d.kind)}})};},prof);
  const c13=await calc(pg,r.profile), c12=await calc(A,r.profile);
  if(String(r.profile.activite)!==String(v.act)) inv.push('activité non appliquée '+r.profile.activite+' vs '+v.act); if(JSON.stringify(c13)!==JSON.stringify(c12)){ diff++; inv.push('v13≠v12 '+JSON.stringify(r.profile).slice(0,120)); }
  const P=c13.P, bmi=P.poids/(P.taille/100)**2;
  for(const w of c13.w){ const am=v.sexe==='F'?1200:1500; w.k.split(',').forEach((x,i)=>{ if(+x<Math.min(am,w.maint[i])-5.5||+x<w.bmr-10) inv.push('plancher '+x+' '+JSON.stringify(v).slice(0,100)); if(w.race[i]==='race'&&Math.abs(+x-w.maint[i])>5) inv.push('course≠équilibre'); });
    if((P.age<18||bmi<18.5)&&!w.noDef&&w.realDef>15) inv.push(`déficit pour ${P.age<18?'mineur':'IMC<18,5'} realDef=${w.realDef.toFixed(0)} ${JSON.stringify(v).slice(0,90)}`);
    if(!w.noDef&&w.ea<24.9) inv.push('EA<25 '+w.ea.toFixed(1)); }
  if((P.age<18||bmi<18.5)&&r.defSel!=='0') inv.push('assistant: déficit non forcé à 0 pour '+(P.age<18?'mineur':'IMC<18,5')+' (sélection '+r.defSel+')');
  seenDef.add(r.profile.deficit);
}
console.log('profils valides',n,'différences v13/v12',diff,'déficits écrits',[...seenDef]); console.log([...new Set(inv)].slice(0,8).join('\n')||'aucune anomalie'); console.log('errs',errs.slice(0,3)); await b.close(); S.close(); process.exit(inv.length||errs.length||diff?1:0);})();
