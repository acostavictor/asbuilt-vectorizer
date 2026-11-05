import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDxf,validateDxf} from '../src/dxf.js';
const minimal={width:100,height:100,paths:[[[0,0],[10,10]]]};
function tableBlock(content,name){return content.match(new RegExp('^0\\nTABLE\\n2\\n'+name+'\\n[\\s\\S]*?^0\\nENDTAB\\n','m'))?.[0];}
test('Raw R2000 export contains APPID/ACAD and all essential drawing structures',()=>{
 const {content}=buildDxf(minimal);
 for(const name of ['VPORT','LTYPE','LAYER','STYLE','VIEW','UCS','APPID','DIMSTYLE','BLOCK_RECORD'])assert.ok(tableBlock(content,name),name);
 assert.match(tableBlock(content,'APPID'),/100\nAcDbRegAppTableRecord\n2\nACAD\n/);
 for(const name of ['CLASSES','BLOCKS','OBJECTS'])assert.ok(content.includes('0\nSECTION\n2\n'+name+'\n'));
 assert.match(content,/3\nACAD_GROUP\n/);assert.match(content,/9\n\$HANDSEED\n5\n[0-9A-F]+\n/);
 assert.equal(validateDxf(content).entityCount,1);
});
test('Raw validator rejects omitted APPID, Standard style, dictionaries and space blocks',()=>{
 const {content}=buildDxf(minimal);
 for(const table of ['APPID','STYLE','DIMSTYLE','BLOCK_RECORD','LTYPE'])
  assert.throws(()=>validateDxf(content.replace(tableBlock(content,table),'')),new RegExp('table '+table));
 assert.throws(()=>validateDxf(content.replace('AcDbRegAppTableRecord\n2\nACAD\n','AcDbRegAppTableRecord\n2\nOTHER\n')),/APPID entry ACAD/);
 assert.throws(()=>validateDxf(content.replace('3\nACAD_GROUP\n','3\nREMOVED\n')),/ACAD_GROUP/);
 assert.throws(()=>validateDxf(content.replace(/0\nSECTION\n2\nBLOCKS\n[\s\S]*?0\nENDSEC\n/,'')),/section BLOCKS/);
});
test('Modelspace geometry and new table entries have resolvable unique owners',()=>{
 const out=buildDxf({...minimal,geometryLayer:'Custom',textLayer:'custom'});
 assert.equal(validateDxf(out.content).valid,true);
 const entities=out.content.split('0\nSECTION\n2\nENTITIES\n')[1].split('0\nENDSEC\n')[0];
 assert.match(entities,/0\nLINE\n5\n[0-9A-F]+\n330\n[0-9A-F]+\n100\nAcDbEntity/);
 assert.equal((tableBlock(out.content,'LAYER').match(/2\nCustom\n/g)||[]).length,1);
 const broken=entities.replace(/330\n[0-9A-F]+\n/,'330\nDEADBEEF\n');
 assert.throws(()=>validateDxf(out.content.replace(entities,broken)),/Unresolved DXF handle/);
});
function layerRecords(content){
 const lines=content.trimEnd().split('\n'),records=[];let record;
 for(let i=0;i<lines.length;i+=2){
  const tag=[Number(lines[i]),lines[i+1]];
  if(tag[0]===0){record=[];records.push(record);}record?.push(tag);
 }
 return records.filter(r=>r[0][1]==='LAYER');
}
const tagValue=(record,code)=>record.find(t=>t[0]===code)?.[1];
test('Every exported layer has a registered PlotStyleName and default lineweight',()=>{
 const {content}=buildDxf({...minimal,geometryLayer:'CUSTOM-GEOMETRY',textLayer:'CUSTOM-TEXT',hatchLayer:'CUSTOM-HATCH'});
 const layers=layerRecords(content),zero=layers.find(r=>tagValue(r,2)==='0');
 assert.ok(layers.length>=7);
 for(const layer of layers){
  assert.equal(tagValue(layer,390),tagValue(zero,390));
  assert.equal(tagValue(layer,370),'-3');
 }
 assert.equal(validateDxf(content).valid,true);
});
test('Missing, dangling or wrong-type PlotStyleName references block export',()=>{
 const {content}=buildDxf(minimal);
 const layer=layerRecords(content).find(r=>tagValue(r,2)==='VEC-POLYLINES');
 const serialize=r=>r.map(t=>t.join('\n')+'\n').join('');
 const original=serialize(layer);
 const without=layer.filter(t=>t[0]!==390);
 assert.throws(()=>validateDxf(content.replace(original,serialize(without))),/missing PlotStyleName/);
 const dangling=layer.map(t=>t[0]===390?[390,'DEADBEEF']:t);
 assert.throws(()=>validateDxf(content.replace(original,serialize(dangling))),/Unresolved DXF handle/);
 const wrong=layer.map(t=>t[0]===390?[390,tagValue(layer,5)]:t);
 assert.throws(()=>validateDxf(content.replace(original,serialize(wrong))),/registered plot style/);
});
