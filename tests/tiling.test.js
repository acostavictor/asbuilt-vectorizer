import test from "node:test";
import assert from "node:assert/strict";
import {planTiles,normalizeRoi,clipSegment,clipPolyline,clipToTileAndRoi,
  isEditorWatermark,looksLikeEditorUrl,dedupeText} from "../src/tile-engine.js";

test("Tiled sheet covers area without duplicate core tiles",()=>{
  const result=planTiles(2500,1700,{tileSize:1024,overlap:48});
  assert.equal(result.tiles.length,6);
  const t0=result.tiles[0];assert.deepEqual([t0.x0,t0.y0,t0.x1,t0.y1],[0,0,1024,1024]);
  assert.ok(result.tiles.every(t=>t.width<=1120&&t.height<=1120));
  const sum=result.tiles.reduce((total,t)=>total+(t.x1-t.x0)*(t.y1-t.y0),0);
  assert.equal(sum,2500*1700);
});

test("Only tiles that intersect drawing area are created",()=>{
  const result=planTiles(2400,1800,{tileSize:1024,overlap:48,
    roi:{x0:.12,y0:.20,x1:.40,y1:.45}});
  assert.equal(result.tiles.length,1);
  assert.deepEqual(normalizeRoi({x0:.1,y0:.2,x1:.5,y1:.6},100,100),
    {x0:10,y0:20,x1:50,y1:60});
});
test("Clipping line at adjacent tile seams does not duplicate interiors",()=>{
  const a={x0:0,y0:0,x1:1024,y1:1000},b={x0:1024,y0:0,x1:2048,y1:1000};
  const roi={x0:0,y0:0,x1:2048,y1:1000};
  const path=[[100,500],[1950,500]];
  const p1=clipToTileAndRoi(path,a,roi),p2=clipToTileAndRoi(path,b,roi);
  assert.deepEqual(p1,[[[100,500],[1024,500]]]);
  assert.deepEqual(p2,[[[1024,500],[1950,500]]]);
});
test("Liang-Barsky ignores external segments and handles crossing",()=>{
  const r={x0:10,y0:10,x1:20,y1:20};
  assert.equal(clipSegment([0,0],[4,4],r),null);
  assert.deepEqual(clipSegment([0,15],[30,15],r),[[10,15],[20,15]]);
  assert.deepEqual(clipPolyline([[0,15],[15,15],[30,15]],r),[[[10,15],[15,15],[20,15]]]);
});
test("Detects PDF-XChange trial overlay text without treating native engineering text as an overlay",()=>{
  const chars=Array.from("PDF-XChange Editor".repeat(12),str=>({str}));
  const sample=[...chars,{str:"Click to BUY NOW!"},{str:"Click to BUY NOW!"}];
  assert.equal(isEditorWatermark(sample),true);
  assert.equal(isEditorWatermark([{str:"PLATFORM SECTION A"},{str:"TOP OF WALL"}]),false);
  assert.equal(looksLikeEditorUrl("https://www.tracker-software.com/product/pdf-xchange-editor"),true);
  assert.equal(looksLikeEditorUrl("https://example.com/engineering"),false);
});
test("OCR detections on neighboring overlapping tiles are deduplicated",()=>{
  const original=[{value:"DRY DOCK",x:100,y:50},{value:"DRY DOCK",x:104,y:55},
    {value:"Dry Dock",x:300,y:50}];
  assert.equal(dedupeText(original,10).length,2);
});
test("Rejects impractically large tile counts and malformed ROIs",()=>{
  assert.throws(()=>planTiles(50000,50000,{maxTiles:10}),/Too many tiles/);
  assert.throws(()=>normalizeRoi({x0:.5,y0:.5,x1:.5001,y1:.5001},100,100),/too small/);
});
