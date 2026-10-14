// fichiers d'export factices (Apple Santé, Polar) pour les tests : valides, piégés, énormes
const zlib=require("zlib"), fs=require("fs"), path=require("path");
const DTD=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord|Audiogram|VisionPrescription)*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
<!ELEMENT Record ((MetadataEntry|HeartRateVariabilityMetadataList)*)>
<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
<!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<HealthData locale="fr_FR">
 <ExportDate value="2025-05-20 08:00:00 +0200"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-01" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>
`;
const rec=(type,unit,value,date)=>` <Record type="${type}" sourceName="iPhone &lt;b&gt;x&lt;/b&gt;" unit="${unit}" creationDate="${date} 07:30:00 +0200" startDate="${date} 07:30:00 +0200" endDate="${date} 07:30:00 +0200" value="${value}"/>\n`;
const wo=(t,dur,dist,kc,date,stats)=>` <Workout workoutActivityType="HKWorkoutActivityType${t}" duration="${dur}" durationUnit="min" totalDistance="${dist}" totalDistanceUnit="km" totalEnergyBurned="${kc}" totalEnergyBurnedUnit="kcal" sourceName="Apple Watch" creationDate="${date} 07:30:00 +0200" startDate="${date} 07:30:00 +0200" endDate="${date} 08:30:00 +0200">\n${stats||""}  <MetadataEntry key="HKIndoorWorkout" value="0"/>\n </Workout>\n`;
const hrStat=a=>`  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="2025-04-02 07:30:00 +0200" endDate="2025-04-02 08:30:00 +0200" average="${a}" minimum="90" maximum="180" unit="count/min"/>\n`;
function appleXml(){
  let s=DTD;
  s+=wo("Running","45.5","8.12","512.4","2025-04-02",hrStat(152));
  s+=wo("Running","45.5","8.12","512.4","2025-04-02",hrStat(152));             // doublon exact
  s+=wo("Cycling","92","31.5","780","2025-04-05");
  s+=wo("TraditionalStrengthTraining","60","0","310","2025-04-06",hrStat(121));
  s+=wo("Hiking","150","11.2","900","2025-04-09");
  s+=wo("Swimming","40","1.5","300","2025-04-10");
  s+=` <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2025-04-12 07:30:00 +0200"><WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5" unit="km"/><WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="250" unit="kcal"/></Workout>\n`;
  s+=wo("Running","0","5","100","2025-04-13");                                  // durée nulle : refusée
  s+=wo("Running","99999","5","100","2025-04-14");                              // durée absurde : refusée
  s+=wo("Running","40","99999","30000","2025-04-15",hrStat(900));               // distance, énergie, FC hors bornes : champs ignorés
  s+=wo("Running","40","8","400","2031-01-01");                                 // date future
  s+=wo("Running","40","8","400","1980-01-01");                                 // date trop ancienne
  s+=wo("Running","40","8","400","2025-02-30");                                 // date inexistante
  s+=wo("Running","40","8","400","__proto__");
  s+=wo("OtherThing&lt;script&gt;alert(1)&lt;/script&gt;","41","0","100","2025-04-16");     // type inconnu -> « autre »
  s+=wo("Running<script>alert(1)</script>","41","0","100","2025-04-17");        // « < » brut dans un attribut (XML mal formé) : la séance est refusée
  for(const [d,v] of [["2025-03-31",81.2],["2025-04-01",81.0],["2025-04-02",80.8],["2025-04-08",80.1],["2025-04-09",80.3]]) s+=rec("HKQuantityTypeIdentifierBodyMass","kg",v,d);
  s+=rec("HKQuantityTypeIdentifierBodyMass","lb",176,"2025-04-15");
  s+=rec("HKQuantityTypeIdentifierBodyMass","kg",5,"2025-04-16");               // 5 kg : refusé
  s+=rec("HKQuantityTypeIdentifierBodyMassIndex","count",24,"2025-04-16");      // autre type : ignoré
  for(const [d,v] of [["2025-03-31",54],["2025-04-01",56],["2025-04-08",52],["2025-04-09",900]]) s+=rec("HKQuantityTypeIdentifierRestingHeartRate","count/min",v,d);
  s+=rec("HKQuantityTypeIdentifierStepCount","count",1200,"2025-04-01");
  s+=" <Workout workoutActivityType=\"HKWorkoutActivityTypeRunning\" duration=\"10\"" + " ".repeat(20000) + "\n";   // balise ouverte sans fin
  s+="</HealthData>\n";
  return s;
}
// polar
function tcx(){ return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2025-04-03T17:30:00.000Z</Id>
<Lap StartTime="2025-04-03T17:30:00.000Z"><TotalTimeSeconds>1800.0</TotalTimeSeconds><DistanceMeters>5200.5</DistanceMeters><Calories>380</Calories><AverageHeartRateBpm><Value>148</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>171</Value></MaximumHeartRateBpm>
<Track><Trackpoint><Time>2025-04-03T17:30:01.000Z</Time><DistanceMeters>3.2</DistanceMeters><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2025-04-03T17:30:02.000Z</Time><DistanceMeters>6.4</DistanceMeters></Trackpoint></Track></Lap>
<Lap StartTime="2025-04-03T18:00:00.000Z"><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>1800</DistanceMeters><Calories>120</Calories><AverageHeartRateBpm><Value>152</Value></AverageHeartRateBpm><Track></Track></Lap>
</Activity></Activities></TrainingCenterDatabase>`; }
function csv(){ return `Name,Sport,Date,Start time,Duration,Total distance (km),Average heart rate (bpm),Average speed (km/h),Max speed (km/h),Average pace (min/km),Max pace (min/km),Calories,Fat percentage of calories(%),Average cadence (rpm),Average stride length (m),Running index,Training load,Ascent (m),Descent (m),Average power (W),Max power (W),Notes,Height (cm),Weight (kg),HR sit,HR max,HR min,HR max (%),HR sit (%),HR min (%),HR limits (%),HR limits (bpm),HR limits (zones),HRV
,Running,05-04-2025,18:19:46,00:51:44,9.6,151,11.1,14.2,5:24,4:13,640,40,81,1.1,52,120,80,82,,,"<img src=x onerror=alert(1)>",178,81,48,188,48,,,,,,,
,Cycling,07-04-2025,18:00:00,01:30:00,34.2,138,22.8,40,2:38,1:30,820,,,,,,,,,,,178,81,48,188,48,,,,,,,
,Strength training,08-04-2025,18:00:00,00:55:00,,121,,,,,350,,,,,,,,,,,178,81,48,188,48,,,,,,,

Sample interval,Distance (km)
1,0.01
`; }
function polarJson(){ return JSON.stringify({name:"x",startTime:"2025-04-10T07:00:00.000",exercises:[{startTime:"2025-04-10T07:00:00.000",duration:"PT1H3M44.200S",distance:10400.0,kiloCalories:701,sport:"RUNNING",heartRate:{min:90,avg:150,max:180}}]}); }
function polarJsonArr(){ return JSON.stringify([{startTime:"2025-04-11T07:00:00",durationMillis:3600000,distanceMeters:20000,kiloCalories:600,sport:"ROAD_BIKING",heartRateAvg:140},{"__proto__":{"polluted":1},startTime:"2025-04-12T07:00:00",duration:"PT45M",distance:7000,sport:"TRAIL_RUNNING"},{constructor:{prototype:{x:1}},startTime:"2025-04-13T07:00:00",duration:"PT30M",sport:"STRENGTH_TRAINING"}]); }
// zip (stored ou deflate)
function crc32(buf){ let c, crc=0xFFFFFFFF; for(let i=0;i<buf.length;i++){ c=(crc^buf[i])&0xFF; for(let k=0;k<8;k++) c=c&1?(c>>>1)^0xEDB88320:c>>>1; crc=(crc>>>8)^c; } return (crc^0xFFFFFFFF)>>>0; }
function zip(files,{deflate=true}={}){
  const parts=[], cds=[]; let off=0;
  for(const [name,data0] of files){ const data=Buffer.isBuffer(data0)?data0:Buffer.from(data0); const comp=deflate?zlib.deflateRawSync(data,{level:6}):data; const nm=Buffer.from(name), crc=crc32(data);
    const lh=Buffer.alloc(30); lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6); lh.writeUInt16LE(deflate?8:0,8); lh.writeUInt32LE(crc,14); lh.writeUInt32LE(comp.length,18); lh.writeUInt32LE(data.length,22); lh.writeUInt16LE(nm.length,26);
    parts.push(lh,nm,comp);
    const ch=Buffer.alloc(46); ch.writeUInt32LE(0x02014b50,0); ch.writeUInt16LE(20,4); ch.writeUInt16LE(20,6); ch.writeUInt16LE(deflate?8:0,10); ch.writeUInt32LE(crc,16); ch.writeUInt32LE(comp.length,20); ch.writeUInt32LE(data.length,24); ch.writeUInt16LE(nm.length,28); ch.writeUInt32LE(off,42);
    cds.push(ch,nm); off+=30+nm.length+comp.length; }
  const cd=Buffer.concat(cds), eo=Buffer.alloc(22); eo.writeUInt32LE(0x06054b50,0); eo.writeUInt16LE(files.length,8); eo.writeUInt16LE(files.length,10); eo.writeUInt32LE(cd.length,12); eo.writeUInt32LE(off,16);
  return Buffer.concat([...parts,cd,eo]);
}
function appleZip(){ return zip([["apple_health_export/export_cda.xml","<ClinicalDocument>"+"x".repeat(1000)+"</ClinicalDocument>"],["apple_health_export/workout-routes/route_2025-04-02.gpx","<gpx></gpx>"],["apple_health_export/export.xml",appleXml()]]); }
function polarZip(){ return zip([["training-session-2025-04-10.json",polarJson()],["training-session-2025-04-11.json",polarJsonArr()],["data/session.csv",csv()],["data/s.tcx",tcx()],["../evil.json","{}"]]); }
function bombZip(mb){ return zip([["apple_health_export/export.xml",Buffer.alloc(mb*1024*1024,0x20)]]); }
function bigAppleXml(mb){ // ~mb Mo d'enregistrements de pas (ignorés) autour de quelques séances
  const line=' <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" creationDate="2025-04-01 07:30:00 +0200" startDate="2025-04-01 07:30:00 +0200" endDate="2025-04-01 07:31:00 +0200" value="42"/>\n';
  const n=Math.ceil(mb*1024*1024/line.length), blk=line.repeat(20000), parts=[DTD, wo("Running","30","5","250","2025-04-02",hrStat(150))];
  for(let i=0;i<n;i+=20000) parts.push(blk); parts.push(wo("Cycling","60","20","500","2025-04-03")); parts.push(rec("HKQuantityTypeIdentifierBodyMass","kg",80,"2025-04-03")); parts.push("</HealthData>\n"); return parts; }
module.exports={appleXml,tcx,csv,polarJson,polarJsonArr,zip,appleZip,polarZip,bombZip,bigAppleXml,DTD};
