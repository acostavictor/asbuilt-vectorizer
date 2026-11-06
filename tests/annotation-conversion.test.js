import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {planTiles,overlaps,dedupeText,clipToTileAndRoi} from '../src/tile-engine.js';
import {detectPrintedDimensions} from '../src/dimensions.js';
import {excludeDimensions} from '../src/annotation-cleanup.js';
const label={value:'200 mm',x:140,y:95,height:12,bbox:{x0:140,y0:83,x1:160,y1:95},native:false};
const paths=[[[0,0],[20,20]],[[50,100],[250,100]],[[50,75],[50,125]],[[250,75],[250,125]]];
async function convert({removeText=false,removeDimensions=false,ocr=false,nativeGeometry=null}={}){
 const controls={dpi:{value:'150'},ocr:{checked:ocr},removeText:{checked:removeText},removeDimensions:{checked:removeDimensions},detectDimensionText:{checked:true},
 detectLinetypes:{checked:false},threshold:{value:'auto'},minLength:{value:'17'},epsilon:{value:'1.6'},speckles:{value:'0'},progress:{style:{}},lineTypeSensitivity:{value:'balanced'}};
 const sheet={name:'synthetic',type:'image',status:'pending',width:300,scale:1};let traced,ocrCalls=0;
 const context={state:{sheets:[sheet],selected:0},$:id=>controls[id]||{checked:false},updateList(){},status(){},console,planTiles,overlaps,dedupeText,clipToTileAndRoi,detectPrintedDimensions,excludeDimensions,
 makeTileSource:async()=>({width:300,height:300,nativeTexts:[],nativeGeometry,render:async()=>({width:300,height:300}),close(){}}),
 readOcr:async()=>{ocrCalls++;return [label];},trace:async(c,options)=>{traced=options;return {paths,thinningConverged:true};},
 recognizeCircles:p=>({paths:p,circles:[],stats:{}}),repairNearClosedContours:p=>({paths:p,stats:{}}),
 rebuildSheetGeometry:s=>{s.paths=s.sourcePaths;},dimensionUI:{scan:s=>{s.dimensions=detectPrintedDimensions(s.detectedTexts,s.dimensionSourcePaths||s.paths);}},
 selectSheet:async()=>{},setTimeout:fn=>fn()};
 vm.createContext(context);const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('async function convertSheet('),source.indexOf('function rebuildSheetGeometry(')),context);
 await context.convertSheet(0);assert.equal(sheet.status,'done',sheet.warning);
 return {sheet,traced,ocrCalls};
}
test('Detection-only OCR masks text without exporting glyph paths or TEXT entities',async()=>{
 const {sheet,traced,ocrCalls}=await convert({removeText:true});
 assert.equal(ocrCalls,1);assert.equal(traced.masks.length,1);assert.equal(sheet.texts.length,0);
 assert.equal(sheet.detectedTexts.length,1);assert.equal(sheet.dimensions.length,1);
});
test('Dimension exclusion runs before final geometry export and keeps detection results',async()=>{
 const {sheet}=await convert({removeDimensions:true});assert.equal(sheet.paths.length,1);
 assert.equal(sheet.dimensions.length,1);assert.equal(sheet.annotationCleanup.dimensionRemoval.matched,1);
 assert.equal(sheet.texts.length,0);assert.equal(sheet.dimensionSourcePaths.length,4);
});
test('OCR export is independent of detection and removal options',async()=>{
 const {sheet,traced}=await convert({ocr:true});assert.equal(sheet.texts.length,1);assert.equal(traced.masks.length,1);
 const kept=await convert();assert.equal(kept.traced.masks.length,0);assert.equal(kept.sheet.paths.length,4);
});


test('Native PDF geometry bypasses raster tracing and retains arcs for export',async()=>{
 const geometry={paths:[[[10,10],[40,10],[40,40],[10,40],[10,10]]],circles:[],arcs:[{center:[100,100],radius:20,startAngle:0,endAngle:90}],stats:{mode:'native-pdf'}};
 const result=await convert({nativeGeometry:geometry});assert.equal(result.traced,undefined);
 assert.equal(result.sheet.arcs.length,1);assert.equal(result.sheet.paths.length,1);
 assert.equal(result.sheet.nativeGeometryStats.mode,'native-pdf');
});
