import test from "node:test";
import assert from "node:assert/strict";
import {fitStraightLine,straightenPaths} from "../src/straightening.js";
import {detectHatches,pointInPolygon,polygonArea} from "../src/hatch.js";
import {buildDxf} from "../src/dxf.js";

function clippedDiagonalHatch(size=100,step=10){
  const boundary=[[0,0],[size,0],[size,size],[0,size],[0,0]];
  const lines=[];
  for(let offset=-(size-10);offset<size-9;offset+=step){
    const pts=[];
    // y = x + offset, clipped against all four rectangle edges.
    for(const x of [0,size]){
      const y=x+offset;if(y>=0&&y<=size)pts.push([x,y]);
    }
    for(const y of [0,size]){
      const x=y-offset;if(x>=0&&x<=size)pts.push([x,y]);
    }
    const unique=pts.filter((p,i)=>pts.findIndex(v=>Math.hypot(p[0]-v[0],p[1]-v[1])<1e-5)===i);
    if(unique.length>=2&&Math.hypot(unique[0][0]-unique[1][0],unique[0][1]-unique[1][1])>9)lines.push([unique[0],unique[1]]);
  }
  return {boundary,lines};
}
test("Straightens a slightly crooked scan to one best-fit LINE",()=>{
  const path=[[0,0],[10,.7],[20,-.5],[30,.3],[40,0]];
  const fit=fitStraightLine(path,{maxDeviation:2});
  assert.ok(fit);
  assert.equal(fit.points.length,2);
  assert.ok(Math.abs(fit.points[0][1]-fit.points[1][1])<1);
  const result=straightenPaths([path]);
  assert.equal(result.stats.straightened,1);
});
test("True circular and irregular geometry remains a polyline",()=>{
  const curve=[[40,0],[36,16],[28,28],[16,36],[0,40]];
  assert.equal(fitStraightLine(curve),null);
  const result=straightenPaths([curve]);assert.equal(result.paths[0],curve);
});
test("Orthogonal snapping only for almost horizontal lines",()=>{
  const line=[[0,0],[20,.13],[40,.34],[60,.4]];
  const out=fitStraightLine(line,{orthogonal:true,maxDeviation:2});
  assert.ok(out);
  assert.equal(out.points[0][1],out.points[1][1]);
});
test("Recognizes section hatch inside an existing closed rectangular boundary",()=>{
  const {boundary,lines}=clippedDiagonalHatch(100,10);
  assert.ok(lines.length>=12);
  const result=detectHatches([boundary,...lines]);
  assert.equal(result.hatches.length,1);
  assert.equal(result.hatches[0].boundaryType,"existing-closed-polyline");
  assert.equal(result.paths.length,1);
  assert.equal(result.hatches[0].sourceStrokeCount,lines.length);
  assert.ok(Math.abs(result.hatches[0].angleDegrees-45)<1);
  assert.ok(result.hatches[0].spacingPx>5);
});
test("Produces a native HATCH entity, not individual stroke entities",()=>{
  const {boundary,lines}=clippedDiagonalHatch(100,10);
  const recognized=detectHatches([boundary,...lines]);
  const dxf=buildDxf({width:100,height:100,paths:recognized.paths,
    hatches:recognized.hatches,hatchLayer:"C-HATCH",unitsPerPixel:.5,units:"feet"});
  assert.equal(dxf.hatchCount,1);
  assert.equal(dxf.geometryCount,1); // closed boundary polyline, not ~20 separate hatch lines
  assert.match(dxf.content,/0\nHATCH\n5\n[0-9A-F]+\n330\n[0-9A-F]+\n100\nAcDbEntity\n8\nC-HATCH\n100\nAcDbHatch\n/);
  assert.match(dxf.content,/2\nAV_SCAN\n70\n0\n71\n0\n91\n1\n/);
  assert.match(dxf.content,/92\n3\n72\n0\n73\n1\n93\n4\n/);
  assert.match(dxf.content,/78\n1\n53\n-45\n/);
  assert.match(dxf.content,/79\n0\n98\n0\n/);
});
test("No closed boundary means no hatch and no source stroke deletion",()=>{
  const {lines}=clippedDiagonalHatch();
  const result=detectHatches(lines);
  assert.equal(result.hatches.length,0);
  assert.equal(result.paths.length,lines.length);
  assert.equal(result.stats.skippedNoBoundary,true);
});
test("Does not reinterpret ordinary orthogonal grid lines as section hatches",()=>{
  const poly=[[0,0],[100,0],[100,100],[0,100],[0,0]];
  const strokes=Array.from({length:14},(_,i)=>[[2,5+i*7],[98,5+i*7]]);
  const result=detectHatches([poly,...strokes]);
  assert.equal(result.hatches.length,0);
});
test("Does not infer a hatch without enough regular internal strokes",()=>{
  const boundary=[[0,0],[100,0],[100,100],[0,100],[0,0]];
  const strokes=[[[0,10],[90,100]],[[10,0],[100,90]],[[0,35],[65,100]]];
  const result=detectHatches([boundary,...strokes]);
  assert.equal(result.hatches.length,0);
});
test("Point-in-polygon and boundary area are deterministic",()=>{
  const p=[[0,0],[10,0],[10,10],[0,10]];
  assert.equal(pointInPolygon([5,5],p),true);
  assert.equal(pointInPolygon([15,5],p),false);
  assert.equal(polygonArea(p),100);
});
