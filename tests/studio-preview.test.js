import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../",import.meta.url);
const text=path=>readFileSync(new URL(path,root),"utf8");
const studio=text("studio-preview/index.html");
const original=text("index.html");
const js=text("studio-preview/studio.js");
const css=text("studio-preview/studio.css");
const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);

test("Studio preview preserves all functional app control IDs",()=>{
  const primary=new Set(ids(original)),alt=new Set(ids(studio));
  for(const id of primary)assert.ok(alt.has(id),"Missing application element: "+id);
  assert.equal(ids(studio).length,alt.size,"Duplicate element ID in studio preview");
});
test("Studio is isolated from the production page and shares the same engine",()=>{
  assert.match(studio,/href="\.\.\/src\/ui\.css"/);
  assert.match(studio,/href="\.\/studio\.css"/);
  assert.match(studio,/src="\.\.\/src\/app\.js"/);
  assert.match(studio,/src="\.\/studio\.js"/);
  assert.doesNotMatch(original,/studio-preview\/studio\.css/);
  assert.doesNotMatch(original,/studioExport/);
});
test("Advanced settings remain in the DOM with their original IDs",()=>{
  for(const id of ["dpi","threshold","ocr","recognizeCircles","detectHatches",
    "straightenLines","detectLinetypes","lineTypeSensitivity","manualHatchPattern",
    "manualHatchAngle","manualHatchSpacing","removeHatchStrokes"]){
    assert.ok(studio.includes('id="'+id+'"'),"Lost conversion setting "+id);
  }
  assert.match(js,/advancedPanel\("convert",\[1,2,4\]/);
  assert.match(js,/advancedPanel\("review",\[1,2\]/);
});
test("New import and export actions invoke real app actions",()=>{
  assert.match(studio,/id="studioImport"/);
  assert.match(studio,/id="studioExport"[^>]*disabled/);
  assert.match(js,/input\.click\(\)/);
  assert.match(js,/mainExport\.click\(\)/);
  assert.match(js,/MutationObserver/);
});
test("Workspace and canvas remain focus of layout at desktop and mobile sizes",()=>{
  assert.match(css,/\.drawing-view\s*\{/);
  assert.match(css,/\.floating-tools\s*\{/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.studio-advanced-content\s*\{/);
  assert.ok(!/cdn.*stageshow|import.*stageshow/i.test(studio),"Design should not depend on StageShow runtime");
});
