// Conservative closed-box reconstruction, including rotated rectangles.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function fitRectangle(path,{tolerance=1.2}={}){
 if(path?.length<5||distance(path[0],path.at(-1))>tolerance)return null;
 const points=path.slice(0,-1);let perimeter=0;
 for(let i=1;i<path.length;i++)perimeter+=distance(path[i-1],path[i]);
 const angles=[0,...points.map((p,i)=>{const q=points[(i+1)%points.length];return {angle:Math.atan2(q[1]-p[1],q[0]-p[0]),length:distance(p,q)};}).sort((a,b)=>b.length-a.length).slice(0,12).map(e=>e.angle)];
 let best=null;
 for(const angle of angles){
  const u=[Math.cos(angle),Math.sin(angle)],v=[-u[1],u[0]];
  const q=points.map(p=>[p[0]*u[0]+p[1]*u[1],p[0]*v[0]+p[1]*v[1]]);
  const xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),w=xmax-xmin,h=ymax-ymin;
  if(w<6||h<6||Math.abs(perimeter-2*(w+h))>2*(w+h)*.12)continue;
  const corners=[[xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax]];
  if(corners.some(c=>!q.some(p=>distance(p,c)<=tolerance*1.7)))continue;
  const errors=q.map(p=>Math.min(Math.abs(p[0]-xmin),Math.abs(p[0]-xmax),Math.abs(p[1]-ymin),Math.abs(p[1]-ymax)));
  if(Math.max(...errors)>Math.min(tolerance,Math.min(w,h)*.04))continue;
  const error=errors.reduce((s,e)=>s+e*e,0);
  if(!best||error<best.error)best={error,points:corners.map(([x,y])=>[u[0]*x+v[0]*y,u[1]*x+v[1]*y])};
 }
 if(!best)return null;
 best.points.push(best.points[0].slice());return best;
}
export function reconstructRectangles(paths,options={}){
 const tolerance=options.tolerance??1.2,key=p=>p.map(x=>Math.round(x/Math.max(.0001,tolerance*.1))).join(":");
 const endpoints=new Map(),used=new Set(),joined=[];
 paths.forEach((p,i)=>{if(p.length!==2||key(p[0])===key(p[1]))return;for(const point of p){const k=key(point);if(!endpoints.has(k))endpoints.set(k,[]);endpoints.get(k).push(i);}});
 for(let i=0;i<paths.length;i++){
  if(used.has(i)||paths[i].length!==2||key(paths[i][0])===key(paths[i][1]))continue;
  let index=i,current=paths[i][0];const cycle=[],indices=[];
  for(let step=0;step<4;step++){
   if(index===undefined||indices.includes(index))break;
   const segment=paths[index],next=key(segment[0])===key(current)?segment[1]:segment[0];
   cycle.push(current);indices.push(index);current=next;
   const adjacent=endpoints.get(key(current));if(adjacent?.length!==2)break;
   index=adjacent.find(j=>j!==index);
  }
  if(indices.length===4&&index===i&&key(current)===key(cycle[0])){
   const loop=[...cycle,cycle[0]],fit=fitRectangle(loop,{tolerance});
   if(fit){indices.forEach(j=>used.add(j));joined.push(fit.points);}
  }
 }
 const input=[...paths.filter((_,i)=>!used.has(i)),...joined];
 let rectangles=0,reducedVertices=used.size*2-joined.length*5;
 const result=input.map(path=>{const fitted=fitRectangle(path,options);if(!fitted)return path;rectangles++;reducedVertices+=path.length-fitted.points.length;return fitted.points;});
 return {paths:result,stats:{rectangles,reducedVertices}};
}
