const PF=require('./engine.js'); PF.setHsIndex(require('../assets/hs_index.json')); const CHAT=require('./chat.js'); const run=require('./tests.js');
const r=run(PF,CHAT); const f=r.filter(x=>!x.pass);
console.log(`${r.length-f.length}/${r.length} passed`);
f.forEach(x=>console.log('FAIL',x.group,'|',x.name,'|',x.detail));
