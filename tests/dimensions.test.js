import test from "node:test";
import assert from "node:assert/strict";
import {parseDimensionLabel,convertLength,evaluateDimension,detectPrintedDimensions,
  summarizeDimensionQA,dimensionCsv} from "../src/dimensions.js";

test("Parses engineering imperial foot and fractional-inch dimensions",()=>{
  let v=parseDimensionLabel("12'-6 1/2\"");
  assert.ok(v);assert.equal(v.units,"feet");assert.ok(Math.abs(v.value-(12+6.5/12))<.00001);
  assert.equal(parseDimensionLabel("8'").value,8);
  assert.equal(parseDimensionLabel('12 3/8"').value,12.375);
  assert.equal(parseDimensionLabel('3/4"').value,.75);
  assert.equal(parseDimensionLabel("10'-0\"").value,10);
  assert.equal(parseDimensionLabel("1'-13\""),null);
});
test("Parses metric, decimal, and unitless candidate values",()=>{
  assert.deepEqual(parseDimensionLabel("2500 mm").units,"millimeters");
  assert.equal(parseDimensionLabel("2.4m").value,2.4);
  assert.equal(parseDimensionLabel("5.5 ft").units,"feet");
  assert.equal(parseDimensionLabel("1200",{defaultUnits:"millimeters"}).units,"millimeters");
  assert.equal(parseDimensionLabel("1200").units,"unitless");
  assert.equal(convertLength(1000,"millimeters","meters"),1);
  assert.ok(Math.abs(convertLength(12,"inches","feet")-1)<1e-12);
  assert.equal(convertLength(1,"meters","feet")!==null,true);
});
test("Rejects elevations, stationing, angles, scales, diameter and non-dimensions",()=>{
  for(const label of ["EL. 12.5","ELEV 25","R25","Ø 25","5°","2%","1:100","STA 10+20",
    "A-201","SCALE 1:50","10 + 20","100/200",""]){
    assert.equal(parseDimensionLabel(label),null,"Should ignore "+label);
  }
});
function fixture({measurement=200,label="10",px=200,dimensionY=100}={}){
  const xa=50,xb=xa+px;
  const line=[[xa,dimensionY],[xb,dimensionY]];
  const witnesses=[
    [[xa,dimensionY-23],[xa,dimensionY+23]],
    [[xb,dimensionY-23],[xb,dimensionY+23]]
  ];
  const texts=[{value:label,x:(xa+xb)/2-12,y:dimensionY-8,height:12,
    bbox:{x0:(xa+xb)/2-12,y0:dimensionY-20,x1:(xa+xb)/2+12,y1:dimensionY-8}}];
  return {texts,paths:[line,...witnesses],measurement};
}
test("Only associates a printed note when a nearby line has two witnesses",()=>{
  const f=fixture();
  const list=detectPrintedDimensions(f.texts,f.paths);
  assert.equal(list.length,1);
  assert.deepEqual(list[0].autoEndpoints,[[50,100],[250,100]]);
  assert.ok(list[0].confidence>.6);
  const noWitness=detectPrintedDimensions(f.texts,[f.paths[0]]);
  assert.equal(noWitness[0].autoEndpoints,null);
  const noText=detectPrintedDimensions([{value:"SLOPE 2%",x:100,y:80}],f.paths);
  assert.equal(noText.length,0);
});
test("Compares calibrated geometry against printed dimensions with explicit tolerance",()=>{
  const f=fixture(),d=detectPrintedDimensions(f.texts,f.paths)[0];
  let status=evaluateDimension(d,{calibrated:true,scale:.05,units:"feet",
    relativeTolerance:1,absoluteTolerance:.05});
  assert.equal(status.status,"match");
  assert.equal(status.expected,10);assert.equal(status.measured,10);
  status=evaluateDimension(d,{calibrated:true,scale:.055,units:"feet",
    relativeTolerance:1,absoluteTolerance:.05});
  assert.equal(status.status,"mismatch");
  assert.equal(status.measured,11);
  assert.equal(status.delta,1);
});
test("Automatic matching never counts as reviewer confirmation",()=>{
  const f=fixture();let d=detectPrintedDimensions(f.texts,f.paths)[0];
  let r=evaluateDimension(d,{calibrated:true,scale:.05,units:"feet"});
  assert.equal(r.reviewed,false);assert.equal(r.method,"auto");
  d={...d,reviewed:true};r=evaluateDimension(d,{calibrated:true,scale:.05,units:"feet"});
  assert.equal(r.reviewed,true);
  assert.equal(r.status,"match");
});
test("Uncalibrated or unitless measurement does not report a false match",()=>{
  const f=fixture(),d=detectPrintedDimensions(f.texts,f.paths)[0];
  assert.equal(evaluateDimension(d,{calibrated:false,units:"feet"}).status,"uncalibrated");
  assert.equal(evaluateDimension(d,{calibrated:true,units:"unitless"}).status,"needs-units");
  assert.equal(evaluateDimension({...d,autoEndpoints:null,manualEndpoints:null},
    {calibrated:true,units:"feet"}).status,"unmatched");
});
test("User-picked endpoints override automatic association and can expose discrepancy",()=>{
  const f=fixture(),d=detectPrintedDimensions(f.texts,f.paths)[0];
  d.manualEndpoints=[[50,100],[220,100]];
  d.reviewed=false;
  const result=evaluateDimension(d,{calibrated:true,scale:.05,units:"feet"});
  assert.equal(result.status,"mismatch");
  assert.equal(result.method,"manual");
  assert.equal(result.measured,8.5);
});
test("Converts written metric units to selected drawing units for comparison",()=>{
  const d={label:"1 m",manualEndpoints:[[0,0],[100,0]],ignored:false};
  assert.equal(evaluateDimension(d,{calibrated:true,scale:10,units:"millimeters"}).status,"match");
  assert.equal(evaluateDimension(d,{calibrated:true,scale:.01,units:"meters"}).status,"match");
});
test("Summarizes unresolved, checked, reviewed and ignored separately",()=>{
  const f=fixture();const a=detectPrintedDimensions(f.texts,f.paths)[0];
  const b={...a,id:"dim-1",autoEndpoints:null};
  const c={...a,id:"dim-2",ignored:true};
  const result=summarizeDimensionQA([a,b,c],{calibrated:true,scale:.05,units:"feet"});
  assert.equal(result.total,3);assert.equal(result.checked,1);assert.equal(result.unmatched,1);
  assert.equal(result.ignored,1);assert.equal(result.reviewed,0);
});
test("Exports Excel-safe quoted CSV and exact status without claiming approval",()=>{
  const d={id:"dim-0",label:'10" NOT, SAFE',autoEndpoints:null};
  const report=dimensionCsv([d],{sheetName:'Dock "11", plan',units:"feet",calibrated:true});
  assert.match(report,/"Dock ""11"", plan"/);
  assert.match(report,/"10"" NOT, SAFE"/);
  assert.match(report,/"unreadable"/);
  assert.match(report,/Reviewer confirmed/);
});
