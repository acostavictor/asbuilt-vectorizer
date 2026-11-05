import test from "node:test";
import assert from "node:assert/strict";
import {recognizeLineTypes,effectiveLineType} from "../src/linetype.js";
import {buildDxf} from "../src/dxf.js";

function strokeTrain({count=7,dash=32,gap=12,angle=0,x=20,y=50}={}){
  const u=[Math.cos(angle),Math.sin(angle)];
  return Array.from({length:count},(_,i)=>{
    const start=i*(dash+gap);
    return [[x+u[0]*start,y+u[1]*start],[x+u[0]*(start+dash),y+u[1]*(start+dash)]];
  });
}
test("Detects regular long dash patterns and emits one complete DXF line",()=>{
  const strokes=strokeTrain({count:7,dash:32,gap:13});
  const result=recognizeLineTypes(strokes);
  assert.equal(result.styledPaths.length,1);
  assert.equal(result.styledPaths[0].linetype,"DASHED");
  assert.equal(result.solidPaths.length,0);
  assert.equal(result.stats.segmentsConsumed,7);
  const out=buildDxf({width:500,height:150,styledPaths:result.styledPaths,unitsPerPixel:.1,units:"feet"});
  assert.equal(out.styledCount,1);
  assert.equal(out.lineTypeCounts.DASHED,1);
  assert.match(out.content,/0\nLTYPE\n5\n[0-9A-F]+\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nDASHED\n/);
  assert.match(out.content,/0\nLINE\n5\n[0-9A-F]+\n100\nAcDbEntity\n8\nVEC-POLYLINES\n6\nDASHED\n/);
  assert.match(out.content,/49\n3\.2\n74\n0\n49\n-1\.3\n/);
});
test("Short regular strokes can be classified as HIDDEN geometry",()=>{
  const result=recognizeLineTypes(strokeTrain({count:8,dash:13,gap:6,y:150}));
  assert.equal(result.styledPaths.length,1);
  assert.equal(result.styledPaths[0].linetype,"HIDDEN");
  const dxf=buildDxf({width:300,height:300,styledPaths:result.styledPaths});
  assert.match(dxf.content,/0\nLTYPE\n5\n[0-9A-F]+\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nHIDDEN\n/);
  assert.match(dxf.content,/6\nHIDDEN\n/);
});
test("Detection supports diagonal line patterns",()=>{
  const result=recognizeLineTypes(strokeTrain({dash:30,gap:10,angle:Math.PI/4,count:7}));
  assert.equal(result.styledPaths.length,1);
  assert.ok(Math.abs(result.styledPaths[0].points[0][0]-20)<2);
});
test("Isolated unrelated strokes are not joined",()=>{
  const result=recognizeLineTypes([[[0,0],[60,0]],[[70,30],[130,30]],[[160,0],[230,0]]]);
  assert.equal(result.styledPaths.length,0);
  assert.equal(result.solidPaths.length,3);
});
test("Irregular gaps do not create a fictitious dashed line",()=>{
  const starts=[0,42,108,141,233,265,359];
  const paths=starts.map(start=>[[start,100],[start+30,100]]);
  assert.equal(recognizeLineTypes(paths).styledPaths.length,0);
});
test("User can force all detected groups to HIDDEN or DASHED",()=>{
  const styled=recognizeLineTypes(strokeTrain({dash:16,gap:8,count:7})).styledPaths;
  assert.equal(styled.length,1);
  assert.equal(effectiveLineType(styled[0],"DASHED"),"DASHED");
  const dxf=buildDxf({width:200,height:200,styledPaths:styled,lineTypeOverride:"DASHED",unitsPerPixel:1});
  assert.equal(dxf.lineTypeCounts.DASHED,1);
  assert.equal(dxf.lineTypeCounts.HIDDEN,0);
  assert.doesNotMatch(dxf.content,/0\nLTYPE\n5\n[0-9A-F]+\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nHIDDEN\n/);
});
test("Disabled detection leaves the original polylines untouched",()=>{
  const paths=strokeTrain();
  const result=recognizeLineTypes(paths,{enabled:false});
  assert.strictEqual(result.solidPaths,paths);
  assert.equal(result.styledPaths.length,0);
});
test("Keeps long continuous lines as unstyled geometry",()=>{
  const long=[[[0,0],[400,0]]],regular=strokeTrain({y:80});
  const result=recognizeLineTypes([...long,...regular]);
  assert.equal(result.styledPaths.length,1);
  assert.ok(result.solidPaths.some(p=>p===long[0]));
});
test("DXF has continuous geometry and style table together",()=>{
  const styled=recognizeLineTypes(strokeTrain()).styledPaths;
  const out=buildDxf({width:500,height:100,paths:[[[0,20],[300,20]]],
    styledPaths:styled,geometryLayer:"C-EXISTING"});
  assert.equal(out.geometryCount,2);
  assert.equal(out.lineTypes.length,1);
  assert.match(out.content,/0\nLTYPE\n5\n[0-9A-F]+\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nCONTINUOUS\n/);
  assert.match(out.content,/6\nDASHED\n/);
  assert.match(out.content,/0\nEOF\n$/);
});
