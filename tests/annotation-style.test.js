import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDxf,annotationHeight} from '../src/dxf.js';
for(const [units,expected] of [['inches',.1],['feet',.1/12],['millimeters',2.54],['centimeters',.254],['meters',.00254]]){
 test('Simplex annotation height converts inches to '+units,()=>{
  const out=buildDxf({width:100,height:100,units,unitsPerPixel:2,texts:[{value:'NOTE',x:10,y:20,height:50},{value:"7'-4",x:20,y:40,height:12,rotation:90}]});
  assert.ok(Math.abs(out.textHeight-expected)<1e-12);assert.equal(out.textStyle,'SIMPLEX');
  const entityPart=out.content.split('0\nSECTION\n2\nENTITIES\n')[1].split('0\nENDSEC\n')[0];
  assert.equal((entityPart.match(/7\nSIMPLEX\n/g)||[]).length,2);
  assert.ok(out.content.includes('3\nsimplex.shx\n'));
  assert.equal(out.textCount,2);
 });
}
test('Printed 0.10 inch at 1 inch = 20 feet becomes 2 feet in model space',()=>{
 assert.equal(annotationHeight('feet',.1,240),2);
 assert.throws(()=>annotationHeight('feet',.1,0),/Invalid/);
 assert.throws(()=>annotationHeight('feet',NaN),/Invalid/);
 assert.throws(()=>annotationHeight('feet',.1,Infinity),/Invalid/);
});
