import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const pages=["index.html","studio-preview/index.html","classic/index.html"];
const required=["tab-repair","panel-repair","repairScan","repairShow","repairApply",
  "repairApplySafe","repairUndo","repairRedo","repairTolerance","repairStatus",
  "repairDrawer","repairClose","repairSummary","repairList","repairDetail",
  "repairSelectedTitle","repairSelectedReason","repairSelectedId",
  "repairSelectedMetrics","repairApplyDrawer","repairSkip","repairFilter"];
test("Studio, preview and Classic expose the complete Repair workflow",()=>{
 for(const page of pages){
  const html=read(page),found=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  for(const id of required)assert.ok(found.includes(id),page+" missing "+id);
  assert.equal(found.length,new Set(found).size,page+" has duplicate HTML IDs");
  assert.match(html,/id="tab-repair".*?data-ribbon="repair"/);
  assert.match(html,/id="panel-repair".*?role="tabpanel"/);
  assert.match(html,/repair\.css"/);
 }
});
test("The topology engine never edits non-LINE entities and makes no web requests",()=>{
 const engine=read("src/repair.js");
 assert.match(engine,/path\.length!==2/);
 assert.match(engine,/!path\.every\(valid\)/);
 assert.match(engine,/function sameLine\(/);
 assert.match(engine,/function intersection\(/);
 assert.match(engine,/function analyzeRepairs/);
 assert.doesNotMatch(engine,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
test("Application preserves HATCH and CIRCLE paths and uses repaired vectors for export",()=>{
 const app=read("src/app.js");
 assert.match(app,/import \{setupRepairUI\} from "\.\/repair-ui\.js"/);
 assert.match(app,/onGeometryChanged:sheet=>\{/);
 assert.match(app,/dimensionUI\.scan\(sheet,\{preserveManual:true,useCurrentGeometry:true\}\)/);
 assert.match(app,/repairUI\.drawOverlay\(ctx,sheet,sx,sy\)/);
 assert.match(app,/repairUI\.onSheetChanged\(\)/);
 assert.match(app,/repairUI\.resetSheet\(sheet\)/);
 assert.match(app,/cadRepair:repairUI\.report\(s\)/);
 assert.match(app,/zip\.file\("repair-QA\/"/);
 assert.match(app,/paths:s\.paths,circles:s\.circles/);
 assert.match(app,/hatches:s\.hatches/);
});
test("Repair review supports apply, safe batch, per-sheet undo and redo",()=>{
 const ui=read("src/repair-ui.js");
 assert.match(ui,/function applySafe\(\)/);
 assert.match(ui,/const safe=available\(sheet\)\.filter\(p=>p\.safe\)/);
 assert.match(ui,/function applySelected\(\)/);
 assert.match(ui,/function undo\(\)/);
 assert.match(ui,/function redo\(\)/);
 assert.match(ui,/function restore\(entry,mode\)/);
 assert.match(ui,/const source=sheet\.paths\.slice\(\)/);
 assert.match(ui,/s\.undo\.push/);
 assert.match(ui,/s\.redo=\[\]/);
 assert.match(ui,/function report\(sheet\)/);
 assert.match(ui,/acceptedRepairs:/);
});
test("Manually rebuilding hatches cannot silently erase approved CAD fixes",()=>{
 const app=read("src/app.js");
 assert.match(app,/Hatch edits would rebuild linework and discard applied CAD repairs/);
 assert.match(app,/Undo CAD repairs before undoing a hatch/);
});
test("Repair preview and stylesheet are included and mobile responsive",()=>{
 const css=read("src/repair.css"),app=read("src/repair-ui.js");
 assert.match(css,/\.repair-drawer\s*\{/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(app,/const p=chosen\(\)/);
 assert.match(app,/ctx\.setLineDash\(\[8,4\]\)/);
 assert.ok(existsSync(new URL("src/repair.js",root)));
 assert.ok(existsSync(new URL("src/repair-ui.js",root)));
});
