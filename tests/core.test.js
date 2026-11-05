import test from "node:test";
import assert from "node:assert/strict";
import {vectorize,simplifyPath,thinZhangSuen} from "../src/geometry.js";
import {buildDxf,filenameBase} from "../src/dxf.js";

test("Line entity uses requested layer and engineering units",()=>{
 const out=buildDxf({width:100,height:100,paths:[[[10,20],[80,20]]],
   unitsPerPixel:2,geometryLayer:"C-UTIL",units:"feet"});
 assert.match(out.content,/0\nLINE\n5\n[0-9A-F]+\n100\nAcDbEntity\n8\nC-UTIL\n/);
 assert.match(out.content,/70\n2\n/);
 assert.match(out.content,/10\n20\n20\n160\n/);
 assert.equal(out.geometryCount,1);
});
test("Annotations are editable DXF TEXT entities",()=>{
 const dxf=buildDxf({width:200,height:100,texts:[{value:"EX PIPE",x:20,y:60,height:10}],textLayer:"C-ANNO"});
 assert.match(dxf.content,/0\nTEXT\n5\n[0-9A-F]+\n100\nAcDbEntity\n8\nC-ANNO\n/);assert.equal(dxf.textCount,1);
});
test("Traces a synthetic horizontal black raster line",()=>{
 const w=60,h=40,rgba=new Uint8ClampedArray(w*h*4);rgba.fill(255);
 for(let x=5;x<50;x++){const i=(20*w+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=0;}
 const result=vectorize({rgba,width:w,height:h,minLength:10,epsilon:1});
 assert.ok(result.paths.length>=1);
 assert.ok(result.paths.some(p=>p[0][1]===20));
});
test("Excludes OCR text zones from raster vector tracing",()=>{
 const w=60,h=40,rgba=new Uint8ClampedArray(w*h*4);rgba.fill(255);
 for(let x=5;x<50;x++){const i=(20*w+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=0;}
 const result=vectorize({rgba,width:w,height:h,minLength:10,masks:[{x0:0,y0:10,x1:60,y1:30}]});
 assert.equal(result.paths.length,0);
});
test("Thinning, simplification, layer names and filenames",()=>{
 assert.equal(thinZhangSuen(new Uint8Array(100),10,10).pixels.reduce((a,b)=>a+b,0),0);
 assert.deepEqual(simplifyPath([[0,0],[1,0],[2,0],[3,0]],.1),[[0,0],[3,0]]);
 const dxf=buildDxf({width:1,height:1,geometryLayer:"C:/UTIL?*",paths:[[[0,0],[1,1]]]});
 assert.ok(dxf.layers.includes("C__UTIL__"));
 assert.equal(filenameBase("my scanned plans.pdf"),"my_scanned_plans");
});
test("Rejects invalid DXF scale",()=>assert.throws(()=>buildDxf({width:10,height:10,unitsPerPixel:0}),/calibration scale/));
