const XLSX=require('xlsx'),PF=require('./engine.js'),fs=require('fs');
PF.setHsIndex(require('../assets/hs_index.json'));
const wb=XLSX.read(fs.readFileSync('../assets/Preflight_Test_Cases.xlsx'),{type:'buffer'});
const sheets=wb.SheetNames.map(n=>({name:n,rows:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:true})}));
const {bookings,notices}=PF.parseSheets(sheets);
console.log('notices:',notices.map(n=>n.level+': '+n.text));
for(const b of bookings){const e=PF.evaluate(b,{today:'2026-10-25'});
 const flags=e.checks.filter(c=>c.status!=='pass'&&c.status!=='na').map(c=>c.id+(c.status==='fail'?'':'('+c.status+')'));
 const fx=e.checks.find(c=>c.id==='R-05').fixes;
 console.log(b.id.padEnd(6),e.status.padEnd(6),flags.join(',').padEnd(40),'|',e.rec?e.rec.chosen.carrier+' '+PF.gbp(e.rec.chosen.cost):'-','|',e.dataIssues.map(i=>i.text).join(' ; ').slice(0,90), fx? '| FIX: '+fx.map(f=>f.type+' '+f.carrier+' '+(f.pallets||'')+' '+f.cost).join(' / '):'');}
