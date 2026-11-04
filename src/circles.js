/**
 * Conservative scanned-circle reconstruction for CAD DXF CIRCLE entities.
 * Handles complete wobbly loops and, when sufficiently covered, fragments that
 * share one circle. The source polyline remains when evidence is uncertain.
 */
const PI2=Math.PI*2;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const normalize=a=>(a%PI2+PI2)%PI2;
const signedDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
function fitLeastSquares(points){
  const n=points.length;
  if(n<5||points.some(p=>!p||!Number.isFinite(p[0])||!Number.isFinite(p[1])))return null;
  let mx=0,my=0;
  for(const p of points){mx+=p[0];my+=p[1];}
  mx/=n;my/=n;
  let xx=0,xy=0,yy=0,bx=0,by=0;
  for(const p of points){
    const u=p[0]-mx,v=p[1]-my,q=u*u+v*v;
    xx+=u*u;xy+=u*v;yy+=v*v;bx+=u*q/2;by+=v*q/2;
  }
  const det=xx*yy-xy*xy;
  if(det<1e-5*Math.max(1,xx*yy))return null;
  const cx=mx+(bx*yy-by*xy)/det,cy=my+(by*xx-bx*xy)/det;
  if(!Number.isFinite(cx)||!Number.isFinite(cy))return null;
  let radius=0;
  for(const p of points)radius+=Math.hypot(p[0]-cx,p[1]-cy);
  radius/=n;
  if(!Number.isFinite(radius)||radius<5||radius>2500)return null;
  let maxError=0,square=0;
  for(const p of points){
    const error=Math.abs(Math.hypot(p[0]-cx,p[1]-cy)-radius);
    maxError=Math.max(maxError,error);square+=error*error;
  }
  return {center:[cx,cy],radius,maxError,rmsError:Math.sqrt(square/n)};
}
function angularShape(points,center){
  const values=points.map(p=>Math.atan2(p[1]-center[1],p[0]-center[0]));
  let sum=0,signReversals=0,maxStep=0,lastSign=0;
  for(let i=1;i<values.length;i++){
    const delta=signedDelta(values[i-1],values[i]);
    maxStep=Math.max(maxStep,Math.abs(delta));
    const sign=Math.sign(delta);
    if(sign&&lastSign&&sign!==lastSign)signReversals++;
    if(sign)lastSign=sign;
    sum+=delta;
  }
  return {turn:sum,span:Math.abs(sum),start:normalize(values[0]),maxStep,signReversals};
}
function intervalsForArc(arc){
  if(arc.span>=PI2)return [[0,PI2]];
  const a=arc.turn>=0?arc.start:arc.start-arc.span;
  const b=a+arc.span;
  const min=normalize(a),max=min+arc.span;
  return max<=PI2?[[min,max]]:[[min,PI2],[0,max-PI2]];
}
function mergedCoverage(arcs){
  const a=arcs.flatMap(intervalsForArc).sort((x,y)=>x[0]-y[0]);
  const merged=[];
  for(const interval of a){
    if(merged.length&&interval[0]<=merged[merged.length-1][1]+.01)
      merged[merged.length-1][1]=Math.max(interval[1],merged[merged.length-1][1]);
    else merged.push([...interval]);
  }
  let cover=0;
  for(const [begin,end] of merged)cover+=end-begin;
  let gap=merged.length?merged[0][0]+PI2-merged[merged.length-1][1]:PI2;
  for(let i=1;i<merged.length;i++)gap=Math.max(gap,merged[i][0]-merged[i-1][1]);
  return {coverage:cover,maxGap:gap};
}
function qualified(path,options){
  if(!Array.isArray(path)||path.length<options.minVertices)return null;
  // Centerline tracing can return a repeated terminal point.
  const points=distance(path[0],path.at(-1))<.2?path.slice(0,-1):path;
  if(points.length<options.minVertices)return null;
  const fit=fitLeastSquares(points);
  if(!fit||fit.radius<options.minRadius)return null;
  const deviation=Math.max(1.3,Math.min(options.maxDeviation,fit.radius*options.maxRelativeError));
  if(fit.maxError>deviation||fit.rmsError>deviation*.68)return null;
  const angle=angularShape(points,fit.center);
  if(angle.maxStep>1.1||angle.signReversals>Math.max(2,points.length*.12))return null;
  if(angle.span<.8||angle.span>PI2*1.15)return null;
  const closed=distance(path[0],path.at(-1))<=Math.min(6,Math.max(2.5,fit.radius*.09));
  return {...fit,angle,closed,path};
}
function averageFit(group){
  const total=group.reduce((sum,g)=>sum+g.angle.span,0);
  return {center:[
    group.reduce((sum,g)=>sum+g.center[0]*g.angle.span,0)/total,
    group.reduce((sum,g)=>sum+g.center[1]*g.angle.span,0)/total],
    radius:group.reduce((sum,g)=>sum+g.radius*g.angle.span,0)/total};
}
export function recognizeCircles(paths,{enabled=true,minRadius=6,maxDeviation=2.7,
  maxRelativeError=.045,minVertices=7,includeFragments=true}={}){
  const stats={completeCircles:0,fragmentedCircles:0,sourcePathsReplaced:0,candidates:0};
  if(!enabled||!Array.isArray(paths)||!paths.length)return {paths:paths||[],circles:[],stats};
  const options={minRadius,maxDeviation,maxRelativeError,minVertices};
  const candidates=[],circles=[],used=new Set();
  for(let i=0;i<paths.length;i++){
    const fit=qualified(paths[i],options);
    if(!fit)continue;
    stats.candidates++;
    candidates.push({...fit,index:i});
    if(!fit.closed||fit.angle.span<5.43)continue;
    const {center,radius,maxError,rmsError}=fit;
    circles.push({center,radius,confidence:Math.min(.98,.95-maxError/(radius*16)),
      sourcePaths:1,sourceIndices:[i],fitError:maxError,rmsError});
    used.add(i);stats.completeCircles++;
  }
  if(includeFragments){
    const fragments=candidates.filter(v=>!used.has(v.index)&&v.angle.span>=.85&&v.angle.span<=5.5)
      .sort((a,b)=>b.angle.span-a.angle.span);
    for(let i=0;i<fragments.length;i++){
      const first=fragments[i];if(used.has(first.index))continue;
      const group=[first];
      for(let j=i+1;j<fragments.length;j++){
        const other=fragments[j];if(used.has(other.index))continue;
        const centerTol=Math.max(2,Math.min(4,first.radius*.035));
        if(distance(first.center,other.center)>centerTol||
          Math.abs(first.radius-other.radius)>Math.max(2,first.radius*.035))continue;
        group.push(other);
      }
      if(group.length<2)continue;
      const measure=mergedCoverage(group.map(x=>x.angle));
      if(measure.coverage<5.65||measure.maxGap>.65)continue;
      const fit=averageFit(group);
      // Revalidate all source pixels against the pooled circle. Fragment fit
      // agreement alone is insufficient for engineering geometry.
      const maxAllowed=Math.max(1.3,Math.min(maxDeviation,fit.radius*maxRelativeError));
      let maxError=0,square=0,count=0;
      for(const g of group)for(const p of g.path){
        const e=Math.abs(distance(p,fit.center)-fit.radius);
        maxError=Math.max(maxError,e);square+=e*e;count++;
      }
      if(maxError>maxAllowed||Math.sqrt(square/count)>maxAllowed*.68)continue;
      circles.push({center:fit.center,radius:fit.radius,
        confidence:Math.min(.93,Math.max(.62,measure.coverage/PI2*.9)),
        sourcePaths:group.length,sourceIndices:group.map(g=>g.index),fitError:maxError,
        rmsError:Math.sqrt(square/count),fragmented:true});
      for(const g of group)used.add(g.index);
      stats.fragmentedCircles++;
    }
  }
  stats.sourcePathsReplaced=used.size;
  return {paths:paths.filter((_,i)=>!used.has(i)),circles,stats};
}
