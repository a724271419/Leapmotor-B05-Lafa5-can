// verify_carstate.js - independent structural checks on the CarState shadow JSONL
const fs=require('fs'),rl=require('readline');
const f=process.argv[2];
(async()=>{
 let n=0, badParse=0, nullInCarState=0, nonFinite=0, typeErr=0;
 const gears={}; let stock=0, timeout=0, valid=0, acc=0, aEgoMax=0;
 const vs=[], as=[], ts=[], valids=[];
 for await(const ln of rl.createInterface({input:fs.createReadStream(f)})){
  if(!ln)continue; n++;
  let o; try{ o=JSON.parse(ln);}catch(e){badParse++;continue;}
  const c=o.carState; if(!c){ typeErr++; continue; }
  const walk=(v,path)=>{ if(v===null) nullInCarState++; else if(typeof v==='number'){ if(!Number.isFinite(v)) nonFinite++; } else if(Array.isArray(v)) v.forEach((x,i)=>walk(x,path+'['+i+']')); else if(typeof v==='object') for(const k of Object.keys(v)) walk(v[k],path+'.'+k); };
  walk(c,'carState');
  for(const [k,t] of [['canValid','boolean'],['canTimeout','boolean'],['vEgo','number'],['aEgo','number'],['steeringAngleDeg','number'],['gearShifter','string'],['stockLkas','boolean']]) if(typeof c[k]!==t) typeErr++;
  if(typeof c.cruiseState!=='object'||typeof c.cruiseState.enabled!=='boolean') typeErr++;
  if(typeof c.wheelSpeeds!=='object') typeErr++;
  gears[c.gearShifter]=(gears[c.gearShifter]||0)+1;
  if(c.stockLkas)stock++; if(c.canTimeout)timeout++; if(c.canValid)valid++; if(c.cruiseState.enabled)acc++;
  aEgoMax=Math.max(aEgoMax,Math.abs(c.aEgo)); vs.push(c.vEgo); as.push(c.aEgo); ts.push(o.t); valids.push(c.canValid);
 }
 console.log('rows',n,'badParse',badParse,'nullInCarState',nullInCarState,'nonFinite',nonFinite,'typeErr',typeErr);
 console.log('canValid',valid,'canTimeout',timeout,'accEnabled',acc,'stockLkas',stock,'maxAbsAEgo',aEgoMax.toFixed(3));
 console.log('gears',JSON.stringify(gears));
 // aEgo consistency: 100 ms diff on 20 ms grid = 5 samples
 let worst=0, worstAt=-1, checked=0;
 for(let i=5;i<vs.length;i+=37){ if(!valids[i]||!valids[i-5])continue; const dt=(ts[i]-ts[i-5]); if(dt<=0)continue; const a=(vs[i]-vs[i-5])/dt; const d=Math.abs(a-as[i]); checked++; if(d>worst){worst=d;worstAt=i;} }
 console.log('aEgo recompute sample',checked,'max deviation',worst.toFixed(4),'at row',worstAt);
 // invalid rows coincide with timeout?
 console.log('done');
})();
