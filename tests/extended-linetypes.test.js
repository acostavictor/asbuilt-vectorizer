import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeLineTypes,effectiveLineType,linePattern} from '../src/linetype.js';
import {buildDxf} from '../src/dxf.js';
function train(cycle,repeats=4,angle=0){let x=10;const out=[],point=v=>[v*Math.cos(angle),v*Math.sin(angle)];for(let i=0;i<repeats;i++)for(const length of cycle){out.push([point(x),point(x+length)]);x+=length+8;}return out;}
for(const [type,cycle] of [['CENTER',[40,10]],['PHANTOM',[40,8,8]],['DASHDOT',[40,2]]]){
 test(type+' recognizes periodic strokes and writes calibrated DXF patterns',()=>{
  const result=recognizeLineTypes(train(cycle));assert.equal(result.styledPaths.length,1);assert.equal(result.styledPaths[0].linetype,type);
  assert.equal(result.solidPaths.length,0);
  const out=buildDxf({width:1000,height:1000,styledPaths:result.styledPaths,unitsPerPixel:.5});
  assert.equal(out.lineTypeCounts[type],1);assert.ok(out.content.includes('2\n'+type+'\n'));
  const pattern=out.linePatterns[type].patternPx;assert.deepEqual(pattern,linePattern(result.styledPaths[0]));
  assert.equal(pattern.length,type==='PHANTOM'?6:4);
  if(type==='DASHDOT')assert.ok(out.content.includes('49\n0\n74\n0\n'));
 });
 test(type+' supports diagonal trains and override',()=>{
  const result=recognizeLineTypes(train(cycle,4,Math.PI/4));assert.equal(result.styledPaths[0]?.linetype,type);
  assert.equal(effectiveLineType({linetype:'HIDDEN'},type),type);
 });
}
test('Irregular mixed marks and too few cycles stay as original geometry',()=>{
 const paths=train([40,7,16,3],2);assert.equal(recognizeLineTypes(paths).styledPaths.length,0);
 assert.equal(recognizeLineTypes(train([40,10],1)).styledPaths.length,0);
});
import {vectorize} from '../src/geometry.js';
for(const [type,cycle] of [['CENTER',[40,10]],['PHANTOM',[40,8,8]],['DASHDOT',[40,3]]]){
 test(type+' survives raster tracing before pattern recognition',()=>{
  const width=800,height=50,rgba=new Uint8ClampedArray(width*height*4).fill(255);let x=10;
  for(let n=0;n<4;n++)for(const stroke of cycle){
   for(let dx=0;dx<stroke;dx++){const offset=(20*width+x+dx)*4;rgba[offset]=rgba[offset+1]=rgba[offset+2]=0;}
   x+=stroke+8;
  }
  const traced=vectorize({rgba,width,height,minLength:2,epsilon:1,minComponent:0});
  const result=recognizeLineTypes(traced.paths);assert.equal(result.styledPaths[0]?.linetype,type);
 });
}
