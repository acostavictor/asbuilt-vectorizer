/**
 * Conservative line straightening for scanned CAD centerlines.
 * PCA / orthogonal regression fits every pixel point (not endpoints only).
 * Straight paths are shortened to one LINE; real curved paths remain polylines.
 */
const deg=Math.PI/180;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function fitStraightLine(path,{maxDeviation=2.0,maxRelativeDeviation=.025,
  minLength=13,orthogonal=false,snapDegrees=1.25}={}){
  if(!Array.isArray(path)||path.length<3)return null;
  if(path.some(p=>!Array.isArray(p)||!p.every(Number.isFinite)))return null;
  const n=path.length,first=path[0],last=path[n-1],chord=dist(first,last);
  if(chord<minLength)return null;
  let cx=0,cy=0;
  for(const [x,y] of path){cx+=x;cy+=y;}cx/=n;cy/=n;
  let xx=0,yy=0,xy=0,travel=0;
  for(let i=0;i<n;i++){
    const dx=path[i][0]-cx,dy=path[i][1]-cy;
    xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;
    if(i)travel+=dist(path[i],path[i-1]);
  }
  if(travel>chord*1.12)return null;
  const theta=.5*Math.atan2(2*xy,xx-yy);
  let ux=Math.cos(theta),uy=Math.sin(theta);
  if((last[0]-first[0])*ux+(last[1]-first[1])*uy<0){ux=-ux;uy=-uy;}
  let max=0,sum=0,prior=-Infinity;
  for(const [x,y] of path){
    const dx=x-cx,dy=y-cy,offset=Math.abs(-uy*dx+ux*dy);
    max=Math.max(max,offset);sum+=offset*offset;
    const projected=ux*dx+uy*dy;
    if(projected<prior-2.5)return null; // do not collapse switchbacks.
    prior=projected;
  }
  if(max>Math.min(maxDeviation,chord*maxRelativeDeviation))return null;
  if(orthogonal){
    const horizontal=Math.abs(uy),vertical=Math.abs(ux);
    if(horizontal<Math.sin(snapDegrees*deg)){ux=ux<0?-1:1;uy=0;}
    else if(vertical<Math.sin(snapDegrees*deg)){uy=uy<0?-1:1;ux=0;}
  }
  const t0=(first[0]-cx)*ux+(first[1]-cy)*uy;
  const t1=(last[0]-cx)*ux+(last[1]-cy)*uy;
  const points=[[cx+ux*t0,cy+uy*t0],[cx+ux*t1,cy+uy*t1]];
  return {points,maximumDeviation:max,rmsDeviation:Math.sqrt(sum/n),
    length:dist(points[0],points[1]),orthogonal:ux===0||uy===0};
}
export function straightenPaths(paths,options={}){
  if(!Array.isArray(paths))throw Error("Paths must be an array");
  const result=[],stats={considered:0,straightened:0,preserved:0,maxDeviation:0,
    orthogonalSnaps:0};
  for(const path of paths){
    if(path.length>=3)stats.considered++;
    const fitted=fitStraightLine(path,options);
    if(!fitted){stats.preserved++;result.push(path);continue;}
    stats.straightened++;stats.maxDeviation=Math.max(stats.maxDeviation,fitted.maximumDeviation);
    if(options.orthogonal&&fitted.orthogonal)stats.orthogonalSnaps++;
    result.push(fitted.points);
  }
  return {paths:result,stats};
}
