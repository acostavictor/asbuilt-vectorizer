import test from "node:test";
import assert from "node:assert/strict";
import {recognizeCircles} from "../src/circles.js";

function loop({cx=120,cy=90,r=35,n=65,noise=0}={}){
 return Array.from({length:n},(_,i)=>{
  const theta=2*Math.PI*i/(n-1);
  const wobble=noise*Math.sin(i*3.72);
  return [cx+(r+wobble)*Math.cos(theta),cy+(r+wobble)*Math.sin(theta)];
 });
}
function fragmented({cx=120,cy=80,r=45,n=18}={}){
 const arcs=[];
 for(const [lo,hi] of [[0,1.65],[1.76,3.48],[3.60,5.05],[5.20,6.27]]){
  arcs.push(Array.from({length:n},(_,i)=>{
   const t=lo+(hi-lo)*i/(n-1);
   return [cx+r*Math.cos(t),cy+r*Math.sin(t)];
  }));
 }
 return arcs;
}
test("Converts a slightly wobbly scanned closed loop to one CIRCLE",()=>{
 const result=recognizeCircles([loop({noise:.45})]);
 assert.equal(result.circles.length,1);
 assert.equal(result.paths.length,0);
 assert.ok(Math.abs(result.circles[0].center[0]-120)<.3);
 assert.ok(Math.abs(result.circles[0].radius-35)<.3);
 assert.equal(result.stats.completeCircles,1);
});
test("Groups near-complete fragmented arcs into one CIRCLE",()=>{
 const pieces=fragmented();
 const result=recognizeCircles(pieces);
 assert.equal(result.circles.length,1);
 assert.equal(result.circles[0].sourcePaths,4);
 assert.equal(result.paths.length,0);
 assert.equal(result.stats.fragmentedCircles,1);
});
test("Rejects semicircles and leaves original arc geometry",()=>{
 const arc=Array.from({length:26},(_,i)=>{
  const t=Math.PI*i/25;return [50+20*Math.cos(t),50+20*Math.sin(t)];
 });
 const result=recognizeCircles([arc]);
 assert.equal(result.circles.length,0);
 assert.strictEqual(result.paths[0],arc);
});
test("Does not turn a square or rounded rectangle into a circle",()=>{
 const box=[[20,20],[30,20],[40,20],[50,20],[50,30],[50,40],[50,50],
 [40,50],[30,50],[20,50],[20,40],[20,30],[20,20]];
 const out=recognizeCircles([box]);
 assert.equal(out.circles.length,0);
});
test("Rejects small text-like loops",()=>{
 const out=recognizeCircles([loop({r:3})]);
 assert.equal(out.circles.length,0);
});
test("Disabled circle pass retains every input path",()=>{
 const original=[loop()];
 const out=recognizeCircles(original,{enabled:false});
 assert.strictEqual(out.paths,original);
 assert.equal(out.circles.length,0);
});
