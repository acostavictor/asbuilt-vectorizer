import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDimensionLabel,detectPrintedDimensions} from '../src/dimensions.js';
import {recognizeLineTypes} from '../src/linetype.js';
import {unrotateDimensionBox,rotatedDimensionOcr,normalizeDimensionOcr,suppressRulingLines} from '../src/ocr-dimensions.js';
test('Drafting qualifiers and OCR imperial fractions from the example parse',()=>{
 for(const label of ["2'-0±","2'-0 TYPICAL","2'-6 1/4","7'-4","18'-8"])
  assert.ok(parseDimensionLabel(label),label);
 assert.equal(parseDimensionLabel("2'-0 ± 1/4"),null);
});
test('Vertical chain dimensions match individual spans with endpoint witnesses',()=>{
 const paths=[[[500,100],[500,650]],...([100,320,430,650].map(y=>[[300,y],[500,y]]))];
 const labels=[{value:"7'-4",x:470,y:230,height:12,bbox:{x0:458,y0:170,x1:475,y1:230}},
  {value:"4'-0",x:470,y:400,height:12,bbox:{x0:458,y0:340,x1:475,y1:400}}];
 const dims=detectPrintedDimensions(labels,paths);
 assert.deepEqual(dims[0].autoEndpoints,[[500,100],[500,320]]);
 assert.deepEqual(dims[1].autoEndpoints,[[500,320],[500,430]]);
 assert.equal(dims[0].sourcePathIndices.length,0,'Shared baseline must not be removed wholesale');
});
test('Leader-offset dimension labels associate without deleting shared geometry',()=>{
 const texts=[{value:"2'-6 1/4",x:260,y:110,height:16,bbox:{x0:260,y0:94,x1:380,y1:110}}];
 const paths=[[[200,170],[280,170]],[[200,150],[200,290]],[[280,150],[280,290]],[[250,135],[390,135]],[[250,135],[240,170]]];
 const dim=detectPrintedDimensions(texts,paths)[0];assert.ok(dim.autoEndpoints);assert.equal(dim.association,'dimension-line-via-leader');
});
test('Center patterns cross split junctions, short mark gaps and bucket edges',()=>{
 const paths=[];let x=20;
 for(let n=0;n<3;n++){
  paths.push([[x,101.4],[x+20,101.4]],[[x+20,101.4],[x+56,101.4]]);x+=56+16;
  paths.push([[x,102.0],[x+5,102.0]]);x+=5+16;
 }
 const crossing=[[40,70],[40,140]];paths.push(crossing);
 const out=recognizeLineTypes(paths);assert.equal(out.styledPaths[0]?.linetype,'CENTER');
 assert.ok(out.solidPaths.includes(crossing));assert.equal(out.styledPaths[0].sourceSegments,9);
});
test('Two full center cycles are sufficient; one cycle remains unclassified',()=>{
 const p=[[[0,0],[56,0]],[[72,0],[77,0]],[[93,0],[149,0]],[[165,0],[170,0]]];
 assert.equal(recognizeLineTypes(p).styledPaths[0]?.linetype,'CENTER');
 assert.equal(recognizeLineTypes(p.slice(0,2)).styledPaths.length,0);
});
test('Rotated dimension boxes map back to original drawing coordinates',async()=>{
 assert.deepEqual(unrotateDimensionBox({x0:10,y0:20,x1:30,y1:80},200,100,90),{x0:20,y0:70,x1:80,y1:90});
 assert.deepEqual(unrotateDimensionBox({x0:10,y0:20,x1:30,y1:80},200,100,-90),{x0:120,y0:10,x1:180,y1:30});
 let calls=0;
 const worker={recognize:async()=>{calls++;return {data:{blocks:[{paragraphs:[{lines:[{text:"7'-4",confidence:90,bbox:{x0:10,y0:20,x1:90,y1:35}},{text:'SLOPE 2%',bbox:{x0:0,y0:0,x1:10,y1:10}}]}]}]}};}};
 const make=()=>({getContext:()=>({translate(){},rotate(){},drawImage(){}})});
 const result=await rotatedDimensionOcr({width:200,height:100},worker,make);
 assert.equal(calls,5);assert.equal(result.length,3);assert.deepEqual(result.map(r=>r.rotation),[0,90,-90]);
});

test('Missing OCR foot marks are flagged and never trigger automatic geometry deletion',()=>{
 const normalized=normalizeDimensionOcr('7-4');assert.equal(normalized.value,"7'-4\"");assert.equal(normalized.ocrInferred,true);
 assert.equal(normalizeDimensionOcr('A-201'),null);assert.equal(normalizeDimensionOcr('7-81'),null);
 const paths=[[[50,100],[250,100]],[[50,80],[50,120]],[[250,80],[250,120]]];
 const candidate=detectPrintedDimensions([{...normalized,x:130,y:90,height:12}],paths)[0];
 assert.ok(candidate.autoEndpoints);assert.equal(candidate.sourcePathIndices.length,0);
});
test('OCR ruling-line suppression removes long rules while retaining short glyph strokes',()=>{
 const width=100,height=30,pixels=new Uint8ClampedArray(width*height*4).fill(255);
 for(let x=0;x<100;x++)for(let c=0;c<3;c++)pixels[(5*width+x)*4+c]=0;
 for(let y=15;y<25;y++)for(let c=0;c<3;c++)pixels[(y*width+20)*4+c]=0;
 const cleaned=suppressRulingLines(pixels,width,height);
 assert.equal(cleaned[(5*width+50)*4],255);assert.equal(cleaned[(20*width+20)*4],0);
 assert.equal(pixels[(5*width+50)*4],0);
});
