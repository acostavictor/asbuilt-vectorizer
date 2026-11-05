import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildDxf,validateDxf,filenameBase,uniqueDxfName} from '../src/dxf.js';
const sheet={name:'plan.pdf',status:'done',width:100,height:100,scale:1,paths:[[[1,2],[3,4],[5,6]]]};
test('R2000 subclasses, counts and truncation guard',()=>{
 const out=buildDxf(sheet);assert.equal(out.integrity.entityCount,1);
 assert.throws(()=>validateDxf(out.content.replace('100\nAcDbPolyline\n','')),/subclass/);
 assert.throws(()=>validateDxf(out.content.slice(0,-8)),/truncated/);
 assert.throws(()=>validateDxf(out.content.replace('90\n3\n','90\n4\n')),/vertex/);
});
test('Invalid inputs never become zero coordinates or silently disappear',()=>{
 for(const extra of [{height:NaN},{originX:Infinity},{paths:[[[1,2],null]]},
  {paths:[[[0,0],[Infinity,2]]]},{circles:[{center:[0,0],radius:-1}]},
  {texts:[{x:NaN,y:0,value:'x'}]},{hatches:[{boundary:[[0,0],[2,0],[2,2]],spacingPx:0,angleDegrees:45}]},
  {unitsPerPixel:1e308,paths:[[[10,10],[20,20]]]}])assert.throws(()=>buildDxf({...sheet,...extra}));
 assert.throws(()=>buildDxf({width:10,height:10}),/No drawable/);
});
test('Tiny calibrated geometry retains nonzero precision',()=>{
 assert.match(buildDxf({...sheet,unitsPerPixel:1e-10}).content,/10\n1e-10\n/);
});
function harness(sheets){
 const messages=[],downloads=[],archives=[];
 class Zip{constructor(){this.files={};archives.push(this);}file(n,v){assert.ok(!(n in this.files));this.files[n]=v;}async generateAsync(){return new Blob(['zip']);}}
 const ctx={state:{sheets,selected:0},buildDxf,filenameBase,uniqueDxfName,Blob,
  window:{JSZip:Zip},download:(...a)=>downloads.push(a),status:m=>messages.push(m),busy:()=>{},
  dimensionUI:{report:()=>'',stats:()=>({}),details:()=>[]},repairUI:{report:()=>({})},$:()=>({value:'1'})};
 vm.createContext(ctx);
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('function makeDxf('),source.indexOf('function download('))+
  source.slice(source.indexOf('async function exportSelected('),source.indexOf('async function processIndices(')),ctx);
 return {ctx,messages,downloads,archives};
}
test('Selected download is blocked on invalid geometry',async()=>{
 const h=harness([{...sheet,paths:[[[NaN,0],[1,1]]]}]);await h.ctx.exportSelected();
 assert.equal(h.downloads.length,0);assert.match(h.messages.at(-1),/Export error/);
 const ok=harness([sheet]);await ok.ctx.exportSelected();
 assert.equal(validateDxf(await ok.downloads[0][0].text()).entityCount,1);
});
test('ZIP preserves colliding sheets and reports integrity for every DXF',async()=>{
 const h=harness([sheet,{...sheet,name:'PLAN.pdf'},{...sheet,name:'plan-2.pdf'},sheet]);
 await h.ctx.exportZip();assert.equal(h.downloads.length,1);
 const files=h.archives[0].files,names=Object.keys(files).filter(n=>n.endsWith('.dxf'));
 assert.equal(names.length,4);assert.equal(new Set(names.map(n=>n.toLowerCase())).size,4);
 for(const n of names)validateDxf(files[n]);
 assert.ok(JSON.parse(files['QA-manifest.json']).drawings.every(d=>d.integrity.valid));
});
test('One invalid sheet aborts ZIP download',async()=>{
 const h=harness([sheet,{...sheet,height:NaN}]);await h.ctx.exportZip();
 assert.equal(h.downloads.length,0);assert.match(h.messages.at(-1),/ZIP export error/);
});

test('Civil 3D table headers put name code 2 before handle code 5',()=>{
 const content=buildDxf(sheet).content;
 const tables=[...content.matchAll(/^0\nTABLE\n2\n([^\n]+)\n5\n([0-9A-F]+)\n330\n0\n100\nAcDbSymbolTable\n70\n(\d+)\n/gm)];
 assert.deepEqual(tables.map(m=>m[1]),['VPORT','LTYPE','LAYER','STYLE','VIEW','UCS','APPID','DIMSTYLE','BLOCK_RECORD']);
 assert.equal(validateDxf(content).valid,true);
 // Reproduce the previous handle injection exactly: Civil 3D expected 2, received 5.
 const broken=content.replace(/0\nTABLE\n2\nLTYPE\n5\n([0-9A-F]+)\n/,'0\nTABLE\n5\n$1\n2\nLTYPE\n');
 assert.throws(()=>validateDxf(broken),/table name \(code 2\)/);
});
test('Single and ZIP downloads reject the reported malformed TABLE ordering',async()=>{
 const content=buildDxf(sheet).content.replace(/0\nTABLE\n2\nLTYPE\n5\n([0-9A-F]+)\n/,'0\nTABLE\n5\n$1\n2\nLTYPE\n');
 for(const action of ['exportSelected','exportZip']){
  const h=harness([sheet]);
  h.ctx.buildDxf=()=>{validateDxf(content);throw Error('Should reject malformed table');};
  await h.ctx[action]();assert.equal(h.downloads.length,0);
  assert.match(h.messages.at(-1),/code 2/);
 }
});
