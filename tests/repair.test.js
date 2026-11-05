import test from "node:test";
import assert from "node:assert/strict";
import {analyzeRepairs,applyRepairs,repairStats} from "../src/repair.js";

const line=(a,b)=>[a,b];
function byType(plan,type){return plan.proposals.filter(p=>p.type===type);}

test("Detects reversed duplicate LINE without mutating source",()=>{
 const paths=[line([0,0],[100,0]),line([100.2,.2],[.1,-.2])];
 const original=structuredClone(paths);
 const plan=analyzeRepairs(paths);
 const dup=byType(plan,"duplicate");
 assert.equal(dup.length,1);
 assert.equal(dup[0].safe,true);
 const output=applyRepairs(paths,dup);
 assert.equal(output.applied.length,1);
 assert.equal(output.paths.length,1);
 assert.deepEqual(paths,original);
});
test("Does not erase parallel CAD walls or partially overlapping geometry",()=>{
 const paths=[
   line([0,0],[100,0]),line([0,1.8],[100,1.8]),line([30,0],[150,0])
 ];
 const plan=analyzeRepairs(paths);
 assert.equal(byType(plan,"duplicate").length,0);
});
test("Suggests collinear endpoint join and retains exact long-span endpoints",()=>{
 const paths=[line([0,0],[40,0]),line([41,0],[90,0])];
 const proposals=byType(analyzeRepairs(paths,{tolerance:3}),"join");
 assert.equal(proposals.length,1);
 assert.equal(proposals[0].safe,true);
 const output=applyRepairs(paths,proposals);
 assert.equal(output.paths.length,1);
 assert.deepEqual(output.paths[0],[[0,0],[90,0]]);
});
test("Reverse stored order still applies correctly and does not produce stale edits",()=>{
 const paths=[line([43,0],[90,0]),line([0,0],[40,0])];
 const proposals=byType(analyzeRepairs(paths,{tolerance:3}),"join");
 assert.equal(proposals.length,1);
 const out=applyRepairs(paths,proposals);
 assert.equal(out.applied.length,1);
 assert.equal(out.paths.length,1);
 const result=out.paths[0];
 assert.ok(Math.abs(result[0][0]-result[1][0])>=89);
});
test("Rejects angled near-coincident endpoints as a collinear join",()=>{
 const paths=[line([0,0],[40,0]),line([41,1],[70,28])];
 const plan=analyzeRepairs(paths,{tolerance:4});
 assert.equal(byType(plan,"join").length,0);
});
test("Proposes an angled corner repair but never marks it safe",()=>{
 const paths=[line([0,0],[40,0]),line([42,-2],[42,50])];
 const proposals=byType(analyzeRepairs(paths,{tolerance:4}),"corner");
 assert.equal(proposals.length,1);
 assert.equal(proposals[0].safe,false);
 const result=applyRepairs(paths,proposals);
 assert.deepEqual(result.paths[0][1],[42,0]);
 assert.deepEqual(result.paths[1][0],[42,0]);
});
test("Does not invent intersections far from line endpoints",()=>{
 const paths=[line([0,0],[100,0]),line([50,-100],[50,100])];
 assert.equal(byType(analyzeRepairs(paths,{tolerance:4}),"corner").length,0);
});
test("Excludes curves and polylines from geometry repair",()=>{
 const curve=[[0,0],[20,5],[30,25],[40,30]];
 const paths=[curve,line([10,10],[60,10])];
 const plan=analyzeRepairs(paths);
 assert.equal(plan.stats.skippedNonlinear,1);
 assert.equal(plan.proposals.length,0);
});
test("Rejects stale proposal and does not modify geometry after a later edit",()=>{
 const paths=[line([0,0],[30,0]),line([30.8,0],[70,0])];
 const p=byType(analyzeRepairs(paths),"join")[0];
 assert.ok(p);
 const edited=[line([0,0],[30,0]),line([35,0],[70,0])];
 const result=applyRepairs(edited,[p]);
 assert.equal(result.applied.length,0);
 assert.strictEqual(result.paths,edited);
});
test("Conflicting proposals are applied at most once per original entity",()=>{
 const paths=[line([0,0],[45,0]),line([45.8,0],[85,0]),
 line([86,0],[130,0])];
 const plan=analyzeRepairs(paths);
 const out=applyRepairs(paths,byType(plan,"join"));
 assert.equal(out.applied.length,1);
 assert.equal(out.paths.length,2);
});
test("The tolerance cannot be infinite or so wide it merges nearby objects",()=>{
 assert.throws(()=>analyzeRepairs([],{tolerance:100}),/tolerance/);
 assert.throws(()=>analyzeRepairs([],{tolerance:Infinity}),/tolerance/);
});
test("Cleanup history statistics describe accepted proposals",()=>{
 const log=[{type:"duplicate"},{type:"join"},{type:"join"},{type:"corner"}];
 assert.deepEqual(repairStats(log),{total:4,duplicate:1,join:2,corner:1});
});
test("Small test fixtures use exact source endpoints, not raster approximations",()=>{
 const paths=[line([0,0],[60,0]),line([61,0],[130,0])];
 const safe=analyzeRepairs(paths).proposals.filter(p=>p.safe);
 const output=applyRepairs(paths,safe);
 assert.equal(output.applied.length,1);
 assert.deepEqual(output.paths,[[[0,0],[130,0]]]);
});
