const PF=require('./engine.js'); const HSI=require('../assets/hs_index.json'); const t0=Date.now(); PF.setHsIndex(HSI); console.log(`HS index ${PF.hsMeta().version} loaded in ${Date.now()-t0} ms`); const CHAT=require('./chat.js'); const run=require('./tests.js');
const r=run(PF,CHAT); const f=r.filter(x=>!x.pass);
console.log(`${r.length-f.length}/${r.length} passed`);
f.forEach(x=>console.log('FAIL',x.group,'|',x.name,'|',x.detail));
