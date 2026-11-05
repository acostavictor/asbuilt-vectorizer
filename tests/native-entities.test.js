import test from "node:test";
import assert from "node:assert/strict";
import {recognizeCircles} from "../src/circles.js";
import {buildDxf} from "../src/dxf.js";
import {applyManualHatches,repairNearClosedContours,validatePolygon} from "../src/hatch-repair.js";
import {detectHatches} from "../src/hatch.js";

const rectangle=[[10,10],[150,10],[150,120],[10,120]];
function loop(r=22,cx=70,cy=60,pts=49){
 return Array.from({length:pts},(_,i)=>{
  const t=2*Math.PI*i/(pts-1);return [cx+r*Math.cos(t),cy+r*Math.sin(t)];
 });
}
test("CAD CIRCLE entity contains exact center/radius instead of short LWPOLYLINE chords",()=>{
 const circle=recognizeCircles([loop()]);
 assert.equal(circle.circles.length,1);
 const out=buildDxf({width:180,height:140,paths:circle.paths,circles:circle.circles,
   unitsPerPixel:.5,geometryLayer:"C-SITE"});
 assert.equal(out.circleCount,1);
 assert.equal(out.geometryCount,1);
 assert.match(out.content,/0\nCIRCLE\n5\n[0-9A-F]+\n330\n[0-9A-F]+\n100\nAcDbEntity\n8\nC-SITE\n100\nAcDbCircle\n10\n35\n20\n40\n30\n0\n40\n11\n/);
 assert.doesNotMatch(out.content,/0\nLWPOLYLINE\n5\n[0-9A-F]+\n/);
});
test("Slightly open closed-boundary contour is repaired but an open U remains untouched",()=>{
 const poly=[[10,10],[150,10],[150,120],[10,120],[12,12]];
 const u=[[10,10],[10,100],[150,100],[150,15]];
 const out=repairNearClosedContours([poly,u]);
 assert.equal(out.stats.repaired,1);
 assert.deepEqual(out.paths[0].at(-1),poly[0]);
 assert.strictEqual(out.paths[1],u);
});
test("User-drawn polygon generates an editable solid CAD HATCH",()=>{
 const result=applyManualHatches([], [{boundary:rectangle,pattern:"solid",
   spacingPx:12,angleDegrees:45,removeMatchingStrokes:false}]);
 assert.equal(result.results[0].ok,true);
 assert.equal(result.hatches.length,1);
 const out=buildDxf({width:200,height:150,hatches:result.hatches,unitsPerPixel:1});
 assert.equal(out.hatchCount,1);assert.equal(out.solidHatchCount,1);
 assert.match(out.content,/0\nHATCH\n5\n[0-9A-F]+\n330\n[0-9A-F]+\n100\nAcDbEntity\n8\nHATCH-REVIEW\n/);
 assert.match(out.content,/2\nSOLID\n70\n1\n71\n0\n91\n1\n/);
 assert.doesNotMatch(out.content.split("2\nENTITIES\n")[1].split("0\nENDSEC\n")[0],/^78\n1\n/m);
});
test("Manually selected crosshatch writes two CAD hatch definition lines",()=>{
 const result=applyManualHatches([], [{boundary:rectangle,pattern:"cross",
   spacingPx:15,angleDegrees:30,removeMatchingStrokes:false}]);
 const out=buildDxf({width:200,height:150,hatches:result.hatches});
 assert.equal(out.crossHatchCount,1);
 assert.match(out.content,/2\nAV_CROSS\n70\n0\n71\n0\n91\n1\n/);
 assert.match(out.content,/78\n2\n/);
 assert.match(out.content,/53\n-30\n/);
 assert.match(out.content,/53\n-120\n/);
});
test("Manual replace-matching-strokes preserves unrelated orthogonal geometry",()=>{
 const diagonal=[[[30,20],[75,65]],[[40,20],[85,65]],[[50,20],[95,65]]];
 const vertical=[[[120,15],[120,100]]];
 const result=applyManualHatches([...diagonal,...vertical],[{
   boundary:rectangle,pattern:"diagonal",angleDegrees:45,spacingPx:10,
   removeMatchingStrokes:true
 }]);
 assert.equal(result.hatches.length,1);
 assert.equal(result.results[0].removed,3);
 assert.equal(result.paths.length,1);
 assert.equal(result.paths[0],vertical[0]);
});
test("Conservative manual auto hatch does not invent a pattern when none is present",()=>{
 const original=[[[20,50],[120,50]]];
 const result=applyManualHatches(original,[{
   boundary:rectangle,pattern:"auto",angleDegrees:45,spacingPx:12
 }]);
 assert.equal(result.hatches.length,0);
 assert.equal(result.results[0].ok,false);
 assert.deepEqual(result.paths,original);
});
test("Polygon validation rejects crossing, tiny and degenerate shapes",()=>{
 assert.match(validatePolygon([[10,10],[120,120],[10,120],[120,10]]),/crosses|small/i);
 assert.match(validatePolygon([[0,0],[1,0],[1,1]]),/small/i);
 assert.equal(validatePolygon(rectangle),null);
});
test("Manual region exclusion prevents auto-duplicate hatch recognition",()=>{
 const boundary=[...rectangle,rectangle[0]];
 const strokes=Array.from({length:12},(_,i)=>[[10,15+i*8],[70,75+i*8]]);
 const result=detectHatches([boundary,...strokes],{excludedRegions:[rectangle]});
 assert.equal(result.hatches.length,0);
});
