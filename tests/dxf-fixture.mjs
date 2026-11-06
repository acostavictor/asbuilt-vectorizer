// Synthetic raster conversion plus all supported native entity types. No private drawings.
import {vectorize} from '../src/geometry.js';
import {buildDxf} from '../src/dxf.js';
const width=100,height=100,rgba=new Uint8ClampedArray(width*height*4).fill(255);
for(let x=10;x<90;x++){const i=(50*width+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=0;}
const {paths}=vectorize({rgba,width,height,minLength:5,epsilon:1});
console.log(buildDxf({width,height,paths:[...paths,[[1,1],[5,8],[12,10]]],units:'feet',unitsPerPixel:.5,
 styledPaths:[{points:[[1,10],[50,10]],linetype:'DASHED',dashPx:4,gapPx:2},
 {points:[[1,20],[50,20]],linetype:'HIDDEN',dashPx:2,gapPx:1},
 ...['CENTER','PHANTOM','DASHDOT'].map((linetype,i)=>({points:[[1,30+i*10],[90,30+i*10]],linetype,dashPx:20,shortPx:5,gapPx:4}))],
 arcs:[{center:[70,70],radius:6,startAngle:20,endAngle:140}],circles:[{center:[50,50],radius:10}],texts:[{value:'Synthetic QA',x:10,y:15,height:4}],
 hatches:[{boundary:[[10,10],[20,10],[20,20],[10,20]],solid:true},
 {boundary:[[30,30],[40,30],[40,40],[30,40]],patterns:[{angleDegrees:45,spacingPx:3},{angleDegrees:135,spacingPx:3}]}]
}).content);
