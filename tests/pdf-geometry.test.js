import test from 'node:test';import assert from 'node:assert/strict';
import {fitRectangle,reconstructRectangles} from '../src/rectangles.js';
import {buildDxf,validateDxf} from '../src/dxf.js';
import {extractPdfGeometry} from '../src/pdf-geometry.js';
import {subtractPolygon} from '../src/pdf-knockout.js';
const OPS={save:10,restore:11,transform:12,constructPath:13,stroke:20,fill:22,endPath:28,clip:29,eoClip:30,setFillRGBColor:59,setStrokeRGBColor:58,closeFillStroke:26};
const viewport={width:500,height:500,transform:[1,0,0,1,0,0]};
const extract=(fnArray,argsArray)=>extractPdfGeometry({fnArray,argsArray},OPS,viewport);
test('Noisy closed rectangles reduce to four orthogonal corners without forcing irregular loops',()=>{
 const box=[[0,0],[30,.1],[60,0],[60.2,20],[60,40],[30,40.1],[0,40],[-.1,20],[0,0]];
 const fit=fitRectangle(box);assert.ok(fit);assert.equal(fit.points.length,5);
 const rotated=box.map(([x,y])=>[x*Math.cos(.4)-y*Math.sin(.4),x*Math.sin(.4)+y*Math.cos(.4)]);assert.ok(fitRectangle(rotated));
 assert.equal(fitRectangle([[0,0],[30,0],[45,20],[30,40],[0,40],[0,0]]),null);
 assert.equal(fitRectangle(box.slice(0,-1)),null);
 const output=buildDxf({width:100,height:100,paths:reconstructRectangles([box]).paths});
 assert.match(output.content,/90\n4\n70\n1\n/);assert.equal(validateDxf(output.content).entityCount,1);
});
test('PDF transforms and closed rectangles preserve four vertices and ignore clipping borders',()=>{
 const geometry=extract([OPS.save,OPS.transform,OPS.constructPath,OPS.restore],[[],[2,0,0,2,10,20],[20,[new Float32Array([0,0,0,1,40,0,1,40,20,1,0,20,3])],[0,0,40,20]],[]]);
 assert.equal(geometry.usable,true);assert.deepEqual(geometry.paths[0],[[10,20],[90,20],[90,60],[10,60],[10,20]]);
 const clipped=extract([OPS.clip,OPS.constructPath],[[],[28,[new Float32Array([0,0,0,1,400,0,1,400,400,1,0,400,3])],[0,0,400,400]]]);
 assert.equal(clipped.paths.length,0);
});
test('PDF cubic circular arcs become native editable ARC entities',()=>{
 const k=.5522847498307936,r=40;
 const geometry=extract([OPS.constructPath],[[20,[new Float32Array([0,100+r,100,2,100+r,100+k*r,100+k*r,100+r,100,100+r])],[100,100,140,140]]]);
 assert.equal(geometry.arcs.length,1);
 const arc=geometry.arcs[0];assert.ok(Math.abs(arc.radius-r)<.03);
 const output=buildDxf({width:500,height:500,arcs:geometry.arcs});assert.equal(output.arcCount,1);assert.match(output.content,/100\nAcDbArc\n/);
});
test('White PDF knockout polygons remove hidden background strokes',()=>{
 const path=[[-10,5],[20,5]],rect=[[0,0],[10,0],[10,10],[0,10],[0,0]];
 assert.deepEqual(subtractPolygon(path,rect),[[[-10,5],[0,5]],[[10,5],[20,5]]]);
 const geometry=extract([OPS.constructPath,OPS.setFillRGBColor,OPS.setStrokeRGBColor,OPS.constructPath],
 [[20,[new Float32Array([0,0,5,1,20,5])],[0,5,20,5]],['#ffffff'],['#ffffff'],[26,[new Float32Array([0,5,0,1,15,0,1,15,10,1,5,10,3])],[5,0,15,10]]]);
 assert.equal(geometry.paths.length,2);
});
test('Unsupported paths do not silently enable native PDF mode',()=>{
 const geometry=extract([OPS.constructPath],[[20,[new Float32Array([99])],[0,0,1,1]]]);assert.equal(geometry.usable,false);
});

test('Four isolated rectangle edges become one closed polygon without duplicated lines',()=>{
 const paths=[[[0,0],[20,0]],[[20,0],[20,10]],[[20,10],[0,10]],[[0,10],[0,0]],[[100,100],[110,110]]];
 const result=reconstructRectangles(paths,{tolerance:.02});
 assert.equal(result.paths.length,2);assert.equal(result.paths.filter(p=>p.length===5).length,1);
 assert.equal(paths.length,5);
 const branch=[...paths,[[20,0],[30,0]]];assert.equal(reconstructRectangles(branch,{tolerance:.02}).paths.length,branch.length);
});

test('Zero-length PDF marks do not break rectangle cycle reconstruction',()=>{
 const points=[[[1,1],[1,1]],[[0,0],[20,0]],[[20,0],[20,10]],[[20,10],[0,10]],[[0,10],[0,0]]];
 const result=reconstructRectangles(points,{tolerance:.02});assert.equal(result.paths.length,2);assert.equal(result.paths[0].length,2);
});

test('Optional PDF content marked hidden is not exported',()=>{
 const custom={...OPS,beginMarkedContentProps:70,endMarkedContent:71};
 const list={fnArray:[70,13,71],argsArray:[['OC',{id:'hidden'}],[20,[new Float32Array([0,0,0,1,10,10])],[0,0,10,10]],[]]};
 const result=extractPdfGeometry(list,custom,viewport,{isVisible:()=>false});assert.equal(result.paths.length,0);assert.equal(result.usable,false);
});
