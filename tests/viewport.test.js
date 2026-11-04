import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fitScale,zoomAround,screenToDrawing} from "../src/viewport.js";

test("Fit scales engineering sheets inside the drawing viewport",()=>{
  assert.equal(fitScale(1000,600,2000,1000,0),.5);
  assert.equal(fitScale(1200,800,1000,500,0),1.2);
  assert.equal(fitScale(200,150,5000,5000,0),.03);
});
test("Cursor-centered zoom retains the same underlying CAD point",()=>{
  const before={scale:.5,tx:140,ty:70},screen=[700,440];
  const sourcePoint=screenToDrawing(before,...screen);
  const after=zoomAround(before,2,screen[0],screen[1]);
  assert.deepEqual(screenToDrawing(after,...screen),sourcePoint);
});
test("Pan translation maps browser screen coordinates to page coordinates",()=>{
  assert.deepEqual(screenToDrawing({scale:2,tx:-100,ty:50},500,450),[300,200]);
});
test("Ribbon controls and canvas are present without ID duplication",()=>{
  const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const seen=new Set(ids);
  assert.equal(ids.length,seen.size,"Duplicate HTML IDs");
  for(const id of ["canvaswrap","imageCanvas","vectorCanvas","stage","zoomIn","zoomOut","zoomFit",
    "zoomActual","toolPan","zoomReadout","calibrate","distance","units","geometryLayer","textLayer",
    "processAll","processSelected","exportSelected","exportZip","previewStats","files","viewTabs"]){
    assert.ok(seen.has(id),"Missing control: "+id);
  }
  for(const tab of ["home","convert","review","layers","export"]){
    assert.ok(seen.has("tab-"+tab)&&seen.has("panel-"+tab),"Missing ribbon tab: "+tab);
  }
});
