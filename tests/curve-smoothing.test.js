import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothRasterPath,detailTolerance} from '../src/curve-smoothing.js';
import {simplifyPath,vectorize} from '../src/geometry.js';
import {recognizeCircles} from '../src/circles.js';
test('Small arcs retain substantially more curve detail than fixed simplification',()=>{
 const radius=6,arc=Array.from({length:33},(_,i)=>[20+radius*Math.cos(i*Math.PI/64),20+radius*Math.sin(i*Math.PI/64)]);
 const smooth=smoothRasterPath(arc),out=simplifyPath(smooth,detailTolerance(smooth,1.6));
 assert.ok(out.length>simplifyPath(arc,1.6).length);
 assert.deepEqual(out[0],arc[0]);assert.deepEqual(out.at(-1),arc.at(-1));
 for(const p of out)assert.ok(Math.abs(Math.hypot(p[0]-20,p[1]-20)-radius)<.05);
});
test('Raster jitter is reduced with subpixel displacement and fixed endpoints',()=>{
 const p=Array.from({length:40},(_,i)=>[i,Math.sin(i*.08)*10+(i%2?.25:-.25)]);
 const out=smoothRasterPath(p);
 let before=0,after=0;
 for(let i=2;i<p.length-2;i++){before+=(p[i][1]-Math.sin(i*.08)*10)**2;after+=(out[i][1]-Math.sin(i*.08)*10)**2;assert.ok(Math.hypot(out[i][0]-p[i][0],out[i][1]-p[i][1])<=.400001);}
 assert.ok(after<before*.4);assert.deepEqual(out[0],p[0]);assert.deepEqual(out.at(-1),p.at(-1));
 assert.strictEqual(smoothRasterPath(p,{enabled:false}),p);
});
test('Square corners and their adjacent straight legs are not rounded',()=>{
 const path=[...Array.from({length:11},(_,x)=>[x,0]),...Array.from({length:10},(_,i)=>[10,i+1])];
 const out=smoothRasterPath(path);
 for(let i=8;i<=12;i++)assert.deepEqual(out[i],path[i]);
});
test('Small raster loops retain rounded detail without forcing text-like loops into circles',()=>{
 const width=40,height=40,rgba=new Uint8ClampedArray(width*height*4).fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(Math.abs(Math.hypot(x-20,y-20)-5)<.7){const i=(y*width+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=0;}
 const result=vectorize({rgba,width,height,minLength:2,epsilon:1.6});
 const loop=result.paths.find(p=>p.length>=8);assert.ok(loop);
 for(const p of loop)assert.ok(Math.abs(Math.hypot(p[0]-20,p[1]-20)-5)<.75);
 assert.equal(recognizeCircles(result.paths).circles.length,0);
});
