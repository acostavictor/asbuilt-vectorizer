// PDF.js 5.x packed path extraction. No raster tracing for supported vector pages.
import {subtractPolygon} from './pdf-knockout.js';
import {clipPolyline} from './tile-engine.js';
import {fitCirclePoints} from './circles.js';
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const transform=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function flatten(a,b,c,d,out,tolerance,depth=0){
 const dx=d[0]-a[0],dy=d[1]-a[1],len=Math.hypot(dx,dy);
 const error=p=>len?Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/len:distance(a,p);
 if(depth>=12||Math.max(error(b),error(c))<=tolerance){out.push(d);return;}
 const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2],ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
 flatten(a,ab,abc,center,out,tolerance,depth+1);flatten(center,bcd,cd,d,out,tolerance,depth+1);
}
function circular(path){
 if(!path.curves||path.lines)return null;
 const points=path.points,fit=fitCirclePoints(points);
 if(!fit||fit.maxError>Math.max(.04,fit.radius*.001))return null;
 let turn=0;
 for(let i=1;i<points.length;i++){
  const a=Math.atan2(points[i-1][1]-fit.center[1],points[i-1][0]-fit.center[0]),b=Math.atan2(points[i][1]-fit.center[1],points[i][0]-fit.center[0]);
  turn+=Math.atan2(Math.sin(b-a),Math.cos(b-a));
 }
 if(Math.abs(turn)<Math.PI/12)return null;
 if(distance(points[0],points.at(-1))<.05&&Math.abs(turn)>6)return {kind:'circle',center:fit.center,radius:fit.radius};
 const angle=p=>(Math.atan2(fit.center[1]-p[1],p[0]-fit.center[0])*180/Math.PI+360)%360;
 return {kind:'arc',center:fit.center,radius:fit.radius,startAngle:angle(turn<0?points[0]:points.at(-1)),endAngle:angle(turn<0?points.at(-1):points[0])};
}
export function extractPdfGeometry(list,OPS,viewport,{tolerance=.08,isVisible=()=>true}={}){
 let matrix=[1,0,0,1,0,0],pendingClip=false,unsupported=false,imageArea=0,stroke='#000000',fill='#000000',clip={x0:0,y0:0,x1:viewport.width,y1:viewport.height};
 let visible=true;const visibility=[];
 const stack=[],paths=[],circles=[],arcs=[];let rects=0,curves=0,knockouts=0;
 const erase=polygon=>{
  const remaining=paths.flatMap(path=>subtractPolygon(path,polygon));paths.splice(0,paths.length,...remaining);
  for(const collection of [circles,arcs])for(let j=collection.length-1;j>=0;j--){
   const item=collection[j],start=item.startAngle??0;let end=item.endAngle??360;if(end<=start)end+=360;
   const count=Math.max(16,Math.ceil((end-start)*Math.PI/180*Math.sqrt(item.radius/(8*tolerance))));
   const samples=Array.from({length:count+1},(_,k)=>{const a=(start+(end-start)*k/count)*Math.PI/180;return [item.center[0]+item.radius*Math.cos(a),item.center[1]-item.radius*Math.sin(a)];});
   const parts=subtractPolygon(samples,polygon);
   if(parts.length===1&&parts[0]===samples)continue;
   collection.splice(j,1);for(const points of parts)paths.push(points);
  }
  knockouts++;
 };
 const emit=path=>{
  if(path.points.length<2)return;
  const inside=p=>p[0]>=clip.x0-.01&&p[0]<=clip.x1+.01&&p[1]>=clip.y0-.01&&p[1]<=clip.y1+.01;
  if(!path.points.every(inside)){paths.push(...clipPolyline(path.points,clip));return;}
  const shape=circular(path);
  if(shape?.kind==='circle'){const {kind,...item}=shape;circles.push(item);}
  else if(shape?.kind==='arc'){const {kind,...item}=shape;arcs.push(item);}
  else paths.push(path.points);
 };
 for(let i=0;i<list.fnArray.length;i++){
  const fn=list.fnArray[i],args=list.argsArray[i]||[];
  if(fn===OPS.beginMarkedContentProps){visibility.push(visible);if(args[1])visible=visible&&isVisible(args[1]);continue;}
  if(fn===OPS.beginMarkedContent){visibility.push(visible);continue;}
  if(fn===OPS.endMarkedContent){visible=visibility.pop()??true;continue;}
  if(fn===OPS.save){stack.push({matrix:matrix.slice(),clip:{...clip},stroke,fill});continue;}
  if(fn===OPS.restore){const saved=stack.pop();if(saved){matrix=saved.matrix;clip=saved.clip;stroke=saved.stroke;fill=saved.fill;}continue;}
  if(fn===OPS.setStrokeRGBColor){stroke=args[0];continue;}
  if(fn===OPS.setFillRGBColor){fill=args[0];continue;}
  if([OPS.paintFormXObjectBegin,OPS.beginGroup].filter(x=>x!==undefined).includes(fn)){unsupported=true;}
  if(fn===OPS.transform){matrix=multiply(matrix,args);continue;}
  if(fn===OPS.clip||fn===OPS.eoClip){pendingClip=true;continue;}
  if([OPS.paintImageXObject,OPS.paintInlineImageXObject].includes(fn)){
   if(!visible)continue;
   const m=multiply(viewport.transform,matrix);imageArea+=Math.abs(m[0]*m[3]-m[1]*m[2]);continue;
  }
  if(fn!==OPS.constructPath)continue;
  if(!visible)continue;
  const [paint,data]=args,packed=data?.[0];
  if(!packed||typeof packed.length!=='number'){unsupported=true;continue;}
  // Clip-only paths are not drawing entities. Detect unsupported nonrectangular clips.
  const clipping=pendingClip||paint===OPS.endPath;pendingClip=false;
  const m=multiply(viewport.transform,matrix),subpaths=[];let current=null;
  for(let k=0;k<packed.length;){
   const op=packed[k++];
   if(op===0){current={points:[transform(m,packed[k++],packed[k++])],lines:0,curves:0};subpaths.push(current);}
   else if(op===1&&current){current.points.push(transform(m,packed[k++],packed[k++]));current.lines++;}
   else if(op===2&&current){
    const b=transform(m,packed[k++],packed[k++]),c=transform(m,packed[k++],packed[k++]),d=transform(m,packed[k++],packed[k++]);
    flatten(current.points.at(-1),b,c,d,current.points,tolerance);current.curves++;curves++;
   }else if(op===3&&current){if(distance(current.points[0],current.points.at(-1))>1e-6)current.points.push(current.points[0].slice());}
   else{unsupported=true;break;}
  }
  if(clipping){
   if(subpaths.length!==1||subpaths[0].curves||subpaths[0].points.length>5){unsupported=true;continue;}
   const points=subpaths[0].points;
   if(points.some((p,j)=>j&&Math.abs(p[0]-points[j-1][0])>.01&&Math.abs(p[1]-points[j-1][1])>.01)){unsupported=true;continue;}
   clip={x0:Math.max(clip.x0,Math.min(...points.map(p=>p[0]))),y0:Math.max(clip.y0,Math.min(...points.map(p=>p[1]))),x1:Math.min(clip.x1,Math.max(...points.map(p=>p[0]))),y1:Math.min(clip.y1,Math.max(...points.map(p=>p[1])))};continue;
  }
  const fills=[OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(paint);
  const closes=[OPS.closeStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(paint)||fills;
  if(closes)for(const p of subpaths)if(distance(p.points[0],p.points.at(-1))>.001)p.points.push(p.points[0].slice());
  if(fills&&fill==='#ffffff')for(const p of subpaths)erase(p.points);
  if((fills&&fill==='#ffffff'&&stroke==='#ffffff')||([OPS.stroke,OPS.closeStroke].includes(paint)&&stroke==='#ffffff'))continue;
  // Fill-only paths must be closed, but preserve their boundaries rather than skeletonizing fills.
  if([OPS.fill,OPS.eoFill].includes(paint))for(const p of subpaths)if(distance(p.points[0],p.points.at(-1))>.001)p.points.push(p.points[0].slice());
  for(const p of subpaths){if(p.points.length===5&&distance(p.points[0],p.points[4])<.001)rects++;emit(p);}
 }
 return {paths,circles,arcs,usable:!unsupported&&(paths.length+circles.length+arcs.length)>0&&imageArea<viewport.width*viewport.height*.2,
  stats:{mode:'native-pdf',paths:paths.length,circles:circles.length,arcs:arcs.length,closedFourSides:rects,beziers:curves,unsupported,imageArea,knockouts}};
}
