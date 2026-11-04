/**
 * Conservative hatch detector for scanned engineering sections.
 * v0.5: finds SINGLE-ANGLE, regular, clipped line families INSIDE an already
 * closed boundary. Does not guess missing boundaries or interpret material type.
 */
const pi=Math.PI, rad=pi/180;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const median=values=>{const a=values.slice().sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0;};
const bbox=points=>({minX:Math.min(...points.map(x=>x[0])),maxX:Math.max(...points.map(x=>x[0])),
  minY:Math.min(...points.map(x=>x[1])),maxY:Math.max(...points.map(x=>x[1]))});
export function polygonArea(poly){
  let sum=0;
  for(let i=0;i<poly.length;i++){
    const [x,y]=poly[i],[xx,yy]=poly[(i+1)%poly.length];
    sum+=x*yy-xx*y;
  }
  return Math.abs(sum)/2;
}
export function pointInPolygon(point,poly){
  let inside=false;const [x,y]=point;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
export function isClosedBoundary(path,tolerance=3){
  if(!Array.isArray(path)||path.length<4||path.length>4000)return false;
  if(dist(path[0],path[path.length-1])>tolerance)return false;
  const poly=path.slice(0,-1);
  return polygonArea(poly)>400;
}
function distanceToEdge(point,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1],d=vx*vx+vy*vy;
  if(d<1e-7)return dist(point,a);
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*vx+(point[1]-a[1])*vy)/d));
  return dist(point,[a[0]+t*vx,a[1]+t*vy]);
}
function boundaryDistance(point,poly){
  let min=Infinity;
  for(let i=0;i<poly.length;i++)min=Math.min(min,distanceToEdge(point,poly[i],poly[(i+1)%poly.length]));
  return min;
}
function classifyStroke(path,index){
  if(path.length<2||path.length>250)return null;
  const a=path[0],b=path[path.length-1];
  if(!a?.every(Number.isFinite)||!b?.every(Number.isFinite))return null;
  const len=dist(a,b);if(len<9||len>600)return null;
  let travel=0,off=0;
  const vx=(b[0]-a[0])/len,vy=(b[1]-a[1])/len;
  for(let i=1;i<path.length;i++){
    travel+=dist(path[i-1],path[i]);
    off=Math.max(off,Math.abs((path[i][0]-a[0])*vy-(path[i][1]-a[1])*vx));
  }
  if(off>2.5||travel>len*1.09)return null;
  let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
  if(angle<0)angle+=pi;
  if(angle>=pi)angle-=pi;
  const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
  return {index,path,len,angle,mid:[mx,my],a,b};
}
function spacingScore(strokes,normal){
  const offsets=strokes.map(s=>s.mid[0]*normal[0]+s.mid[1]*normal[1]).sort((a,b)=>a-b);
  const gaps=[];
  for(let i=1;i<offsets.length;i++){
    const gap=offsets[i]-offsets[i-1];
    if(gap>1.25)gaps.push(gap);
  }
  if(gaps.length<5)return null;
  const step=median(gaps);
  if(step<3||step>45)return null;
  // Gaps of double-spacing are acceptable where one line was missing in the scan.
  const residual=gaps.map(g=>Math.abs(g-step*Math.max(1,Math.round(g/step)))/step);
  const consistent=residual.filter(r=>r<.21).length/gaps.length;
  if(consistent<.86)return null;
  return {step,consistent,span:offsets[offsets.length-1]-offsets[0]};
}
function isDiagonal(angle,allowAxis){
  if(allowAxis)return true;
  const mod=Math.abs(Math.sin(angle)*Math.cos(angle));
  return mod>.19; // excludes near horizontal/vertical dimension and grid lines
}
export function detectHatches(paths,{enabled=true,allowAxis=false,minStrokes=7,maxBoundaries=600}={}){
  const stats={closedBoundaries:0,candidateStrokes:0,accepted:0,removedStrokes:0,
    skippedNoBoundary:false};
  if(!enabled||!paths?.length)return {paths:paths||[],hatches:[],stats};
  const closed=[];
  for(let i=0;i<paths.length&&closed.length<maxBoundaries;i++){
    if(isClosedBoundary(paths[i])){
      const points=paths[i].slice(0,-1);
      closed.push({index:i,points,area:polygonArea(points),box:bbox(points)});
    }
  }
  closed.sort((a,b)=>a.area-b.area);
  stats.closedBoundaries=closed.length;
  if(!closed.length){stats.skippedNoBoundary=true;return {paths,hatches:[],stats};}
  const candidates=[];
  for(let i=0;i<paths.length;i++){
    const candidate=classifyStroke(paths[i],i);
    if(candidate)candidates.push(candidate);
  }
  stats.candidateStrokes=candidates.length;
  const used=new Set(),hatches=[];
  for(const boundary of closed){
    if(boundary.area>5e7)continue;
    const candidatesInside=[];
    for(const s of candidates){
      if(used.has(s.index)||s.index===boundary.index)continue;
      const [mx,my]=s.mid;
      if(mx<boundary.box.minX||mx>boundary.box.maxX||my<boundary.box.minY||my>boundary.box.maxY)continue;
      if(!pointInPolygon(s.mid,boundary.points))continue;
      if(!pointInPolygon(s.a,boundary.points)&&boundaryDistance(s.a,boundary.points)>4)continue;
      if(!pointInPolygon(s.b,boundary.points)&&boundaryDistance(s.b,boundary.points)>4)continue;
      candidatesInside.push(s);
    }
    if(candidatesInside.length<minStrokes)continue;
    const buckets=new Map();
    for(const s of candidatesInside){
      if(!isDiagonal(s.angle,allowAxis))continue;
      // Allow +/-3 degree scan jitter between the strokes.
      const key=Math.round(s.angle/(5*rad));
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(s);
    }
    let best=null;
    for(const family of buckets.values()){
      if(family.length<minStrokes)continue;
      const angles=family.map(s=>s.angle),angle=median(angles);
      if(angles.some(a=>Math.abs(a-angle)>3.5*rad))continue;
      const u=[Math.cos(angle),Math.sin(angle)],n=[-u[1],u[0]];
      const rhythm=spacingScore(family,n);
      if(!rhythm)continue;
      const projected=boundary.points.map(p=>p[0]*n[0]+p[1]*n[1]);
      const polygonSpan=Math.max(...projected)-Math.min(...projected);
      if(polygonSpan<=0||rhythm.span/polygonSpan<.64)continue;
      if(rhythm.step>Math.sqrt(boundary.area)/6)continue;
      const endpointHits=family.filter(s=>
        boundaryDistance(s.a,boundary.points)<=4.5&&
        boundaryDistance(s.b,boundary.points)<=4.5).length;
      if(endpointHits/family.length<.54)continue;
      const confidence=Math.min(.98,.6+.15*rhythm.consistent+
        .13*endpointHits/family.length+.1*Math.min(1,rhythm.span/polygonSpan));
      if(!best||family.length>best.family.length)best={family,angle,step:rhythm.step,
        confidence,boundary};
    }
    if(!best)continue;
    const group={
      boundary:boundary.points.map(p=>[...p]),
      angleDegrees:best.angle*180/pi,spacingPx:best.step,
      origin:best.family[0].a.slice(),confidence:best.confidence,
      sourceStrokeCount:best.family.length,
      boundaryType:"existing-closed-polyline",
      needsReview:true,patternName:"AV_SCAN"
    };
    hatches.push(group);stats.accepted++;
    for(const s of best.family)used.add(s.index);
  }
  stats.removedStrokes=used.size;
  return {paths:paths.filter((_,i)=>!used.has(i)),hatches,stats};
}
