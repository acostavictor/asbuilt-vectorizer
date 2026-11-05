import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const get=path=>readFileSync(new URL(path,root),"utf8");

const htmlPages=["index.html","classic/index.html","studio-preview/index.html"];
const ids=["tab-dimensions","panel-dimensions","scanDimensions","dimPick","dimToggleDrawer",
  "dimReset","dimTolerancePercent","dimToleranceAbsolute","dimDownloadCSV",
  "dimensionDrawer","dimensionSummary","dimensionList","dimensionDetail",
  "dimSelectedId","dimEditLabel","dimDetailMetrics","dimPickDrawer",
  "dimConfirm","dimIgnore","dimAddLabel","dimNewLabel","dimCloseDrawer"];
test("Every live VecBuilt interface contains the interactive dimension controls",()=>{
 for(const page of htmlPages){
  const html=get(page),found=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  for(const id of ids)assert.ok(found.includes(id),page+": missing "+id);
  assert.equal(found.length,new Set(found).size,page+": duplicate HTML IDs");
  assert.match(html,/role="tabpanel" aria-labelledby="tab-dimensions"/);
  assert.match(html,/dimensions\.css/);
 }
});
test("Dimension editing and review use one shared browser-local controller",()=>{
 const app=get("src/app.js"),controller=get("src/dimension-ui.js");
 assert.match(app,/import \{setupDimensionUI\} from "\.\/dimension-ui\.js"/);
 assert.match(app,/dimensionUI\.scan\(s,\{preserveManual:false\}\)/);
 assert.match(app,/dimensionUI\.handlePick/);
 assert.match(app,/dimensionUI\.drawOverlay/);
 assert.match(app,/dimensionUI\.onScaleChanged/);
 assert.match(app,/dimensionUI\.stats\(s\)/);
 assert.match(app,/dimensionUI\.details\(s\)/);
 assert.match(app,/dimensionUI\.report\(s\)/);
 assert.match(controller,/detectPrintedDimensions/);
 assert.match(controller,/dimTolerancePercent/);
 assert.match(controller,/dimToleranceAbsolute/);
 assert.match(controller,/manualEndpoints/);
 assert.match(controller,/d\.reviewed=false/);
 assert.doesNotMatch(controller,/fetch\s*\(|XMLHttpRequest|WebSocket/);
});
test("Review tools allow precise picks, cancellation and source-text correction",()=>{
 const viewport=get("src/viewport.js"),controller=get("src/dimension-ui.js");
 assert.match(viewport,/"dimension"\]\.includes\(tool\)/);
 assert.match(viewport,/function centerOn\(/);
 assert.match(controller,/viewport\.setTool\("dimension"\)/);
 assert.match(controller,/viewport\.setTool\("pan"\)/);
 assert.match(controller,/cancelPick/);
 assert.match(controller,/dimEditLabel/);
 assert.match(controller,/dimNewLabel/);
 assert.match(controller,/dimConfirm/);
 assert.match(controller,/dimIgnore/);
});
test("Help Center explains dimension QA, calibration and uncertainty",()=>{
 const help=get("help/index.html");
 assert.match(help,/id="dimension-qa"/);
 assert.match(help,/href="#dimension-qa"/);
 assert.match(help,/two witness\/extension lines/);
 assert.match(help,/not automatically corrected or approved/);
 assert.match(help,/does not create native associative DXF DIMENSION/);
});
test("Styles keep the review panel present and operable at desktop and mobile sizes",()=>{
 const style=get("src/dimensions.css");
 assert.match(style,/\.dimension-drawer\s*\{/);
 assert.match(style,/\.dimension-drawer\[hidden\]/);
 assert.match(style,/@media\(max-width:560px\)/);
 assert.match(style,/\.dimension-detail-actions/);
});
