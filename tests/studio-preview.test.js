import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";

const root=new URL("../",import.meta.url);
const text=path=>readFileSync(new URL(path,root),"utf8");
const main=text("index.html"),classic=text("classic/index.html"),studio=text("studio-preview/index.html");
const help=text("help/index.html"),helpCSS=text("help/help.css");
const js=text("studio-preview/studio.js"),css=text("studio-preview/studio.css");
const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);

test("Studio is the default and its script and style paths resolve from repo root",()=>{
  assert.match(main,/<body data-design="studio">/);
  assert.match(main,/href="\.\/src\/ui\.css"/);
  assert.match(main,/href="\.\/studio-preview\/studio\.css"/);
  assert.match(main,/src="\.\/studio-preview\/studio\.js"/);
  assert.match(main,/src="\.\/src\/app\.js"/);
  assert.match(main,/id="studioExport"/);
  assert.match(main,/id="studioImport"/);
  assert.match(main,/href="\.\/help\/"/);
  assert.match(main,/href="\.\/classic\/"/);
});
test("Classic interface has been preserved with corrected relative app paths",()=>{
  assert.doesNotMatch(classic,/data-design="studio"/);
  assert.match(classic,/src="\.\.\/src\/app\.js"/);
  assert.match(classic,/href="\.\.\/src\/ui\.css"/);
  assert.match(classic,/href="\.\.\/help\/"/);
  assert.match(classic,/href="\.\.\/"/);
});
test("Studio preview and default preserve all converter controls without duplicate IDs",()=>{
  const mainIDs=new Set(ids(main)),legacyIDs=new Set(ids(classic));
  for(const id of legacyIDs)assert.ok(mainIDs.has(id),"Missing converter control: "+id);
  assert.equal(mainIDs.size,ids(main).length,"Duplicate root ID");
  assert.equal(new Set(ids(studio)).size,ids(studio).length,"Duplicate preview ID");
  for(const id of ["dpi","threshold","ocr","recognizeCircles","detectHatches",
      "straightenLines","detectLinetypes","lineTypeSensitivity","manualHatchPattern",
      "manualHatchAngle","manualHatchSpacing","removeHatchStrokes"]){
    assert.ok(mainIDs.has(id),"Lost conversion setting: "+id);
  }
});
test("Advanced settings keep their actual converter control IDs and event wiring",()=>{
  assert.match(js,/advancedPanel\("convert",\[1,2,4\]/);
  assert.match(js,/advancedPanel\("review",\[1,2\]/);
  assert.match(js,/input\.click\(\)/);
  assert.match(js,/mainExport\.click\(\)/);
  assert.match(js,/MutationObserver/);
});
test("Help Center is a styled, accessible static page with working internal sections",()=>{
  assert.match(help,/href="\.\/help\.css"/);
  assert.match(help,/href="\.\.\/"/);
  assert.match(help,/href="\.\.\/classic\/"/);
  assert.match(help,/class="skip" href="#main"/);
  assert.match(helpCSS,/\.toc\s*\{/);
  assert.match(helpCSS,/@media\(max-width:760px\)/);
  const fragmentTargets=[...help.matchAll(/href="#([^"]+)"/g)].map(x=>x[1]);
  const anchors=new Set(ids(help));
  for(const fragment of fragmentTargets)assert.ok(anchors.has(fragment),"Missing section #"+fragment);
});
test("All locally linked page assets exist in their deployed repository paths",()=>{
  const pages=[["index.html",main],["classic/index.html",classic],
    ["studio-preview/index.html",studio],["help/index.html",help]];
  for(const [filename,html] of pages){
    for(const [,href] of html.matchAll(/(?:href|src)="(\.{1,2}\/[^"#?]+)"/g)){
      const resolved=new URL(href,new URL(filename,root));
      const path=decodeURIComponent(resolved.pathname).replace(new URL(root).pathname,"");
      if(href.endsWith("/"))assert.ok(existsSync(new URL("index.html",resolved)),filename+" missing linked page: "+href);
      else assert.ok(existsSync(resolved),filename+" missing asset: "+href);
    }
  }
});
test("Studio retains drawing-first design across desktop and mobile widths",()=>{
  assert.match(css,/\.drawing-view\s*\{/);
  assert.match(css,/\.floating-tools\s*\{/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.studio-advanced-content\s*\{/);
  assert.doesNotMatch(main,/cdn.*stageshow|import.*stageshow/i);
});
