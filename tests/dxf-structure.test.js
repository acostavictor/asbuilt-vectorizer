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
