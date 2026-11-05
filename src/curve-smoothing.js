// Bounded raster-noise filtering before simplification. Keep CAD junctions and corners.
export function smoothRasterPath(path,{enabled=true,maxShift=.4}={}){
 if(!enabled||path.length<7)return path;
 const closed=Math.hypot(path[0][0]-path.at(-1)[0],path[0][1]-path.at(-1)[1])<.01;
 const points=closed?path.slice(0,-1):path;
 if(points.length<6)return path;
 const get=i=>points[(i+points.length)%points.length];
 const protectedPoints=new Set();
 for(let i=0;i<points.length;i++){
  if(!closed&&(i<2||i>=points.length-2))continue;
  const a=get(i-2),p=get(i),b=get(i+2),u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]],lengths=Math.hypot(...u)*Math.hypot(...v);
  if(!lengths||(u[0]*v[0]+u[1]*v[1])/lengths<.55)for(let k=-2;k<=2;k++)protectedPoints.add((i+k+points.length)%points.length);
 }
 const out=points.map((point,i)=>{
  if(protectedPoints.has(i)||(!closed&&(i<2||i>=points.length-2)))return point.slice();
  const a=get(i-2),b=get(i+2),u=[point[0]-a[0],point[1]-a[1]],v=[b[0]-point[0],b[1]-point[1]];
  const lengths=Math.hypot(...u)*Math.hypot(...v);
  // A strong turn is a corner; never round it off to create a false fillet.
  if(!lengths||(u[0]*v[0]+u[1]*v[1])/lengths<.55)return point.slice();
  const weights=[-3,12,17,12,-3],next=[0,0];
  for(let k=-2;k<=2;k++){next[0]+=get(i+k)[0]*weights[k+2]/35;next[1]+=get(i+k)[1]*weights[k+2]/35;}
  const dx=next[0]-point[0],dy=next[1]-point[1],shift=Math.hypot(dx,dy),factor=shift>maxShift?maxShift/shift:1;
  return [point[0]+dx*factor,point[1]+dy*factor];
 });
 if(closed)out.push(out[0].slice());
 return out;
}
export function detailTolerance(path,epsilon){
 if(path.length<3)return epsilon;
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const [x,y] of path){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 // A fixed 1.6 px error can flatten an entire small radius. Scale error to feature size.
 return Math.min(epsilon,Math.max(.18,Math.hypot(x1-x0,y1-y0)*.012));
}
