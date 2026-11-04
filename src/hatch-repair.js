/**
 * Hatch-boundary repair and opt-in user polygon conversion.
 * Keeps all original strokes when pattern confidence is insufficient.
 */
import {detectHatches,polygonArea,pointInPolygon} from "./hatch.js";
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const angleDiff=(a,b)=>{
 const d=Math.abs(((a-b)%180+180)%180);
 return Math.min(d,180-d);
};
function bbox(poly){return {
  minX:Math.min(...poly.map(p=>p[0])),maxX:Math.max(...poly.map(p=>p[0])),
  minY:Math.min(...poly.map(p=>p[1])),maxY:Math.max(...poly.map(p=>p[1]))
};}
export function repairNearClosedContours(paths,{enabled=true,maxGap=5}={}){
 const stats={repaired:0,preserved:0};
 if(!enabled)return {paths,stats};
 const adjusted=paths.map(path=>{
  if(!Array.isArray(path)||path.length<4||path.length>4000){stats.preserved++;return path;}
  const first=path[0],last=path.at(-1),gap=dist(first,last);
  if(gap<.2||gap>maxGap){stats.preserved++;return path;}
  const box=bbox(path),size=Math.hypot(box.maxX-box.minX,box.maxY-box.minY);
  if(size<25||gap>size*.09||polygonArea(path)<400){stats.preserved++;return path;}
  // A near-complete contour must not double back at either endpoint.
  if(dist(path[0],path[1])<1||dist(path.at(-1),path.at(-2))<1){
    stats.preserved++;return path;
  }
  stats.repaired++;return [...path,first.slice()];
 });
 return {paths:adjusted,stats};
}
function orient(a,b){return (b[0]-a[0])*(b[1]-a[1]);}
function crosses(a,b,c,d){
 const ab1=orient(a,b,c),ab2=orient(a,b,d),cd1=orient(c,d,a),cd2=orient(c,d,b);
 return ab1*ab2<0&&cd1*cd2<0;
}
export function validatePolygon(poly){
 if(!Array.isArray(poly)||poly.length<3||poly.length>500)return "Choose 3–500 boundary vertices.";
 if(poly.some(p=>!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)))
   return "Boundary vertices must contain finite coordinates.";
 const points=dist(poly[0],poly.at(-1))<.1?poly.slice(0,-1):poly;
 if(points.length<3||polygonArea(points)<250)return "Boundary area is too small.";
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  if(dist(a,b)<3)return "Boundary edges are too short.";
  for(let j=i+1;j<points.length;j++){
   if(j===i||j===(i+1)%points.length||(i===0&&j===points.length-1))continue;
   if(crosses(a,b,points[j],points[(j+1)%points.length]))return "Boundary crosses itself.";
  }
 }
 return null;
}
function isHatchStroke(path,poly,angles){
 if(!Array.isArray(path)||path.length<2||path.length>150)return false;
 if(dist(path[0],path.at(-1))<=2)return false; // never delete a closed outline
 const a=path[0],b=path.at(-1),length=dist(a,b);
 if(length<5||length>650)return false;
 const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
 if(!pointInPolygon(mid,poly))return false;
 if(!pointInPolygon(a,poly)||!pointInPolygon(b,poly))return false;
 const bearing=(Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+180)%180;
 if(!angles.some(angle=>angleDiff(angle,bearing)<5))return false;
 let travel=0,maxPerp=0;
 const vx=(b[0]-a[0])/length,vy=(b[1]-a[1])/length;
 for(let i=1;i<path.length;i++){
  travel+=dist(path[i-1],path[i]);
  maxPerp=Math.max(maxPerp,Math.abs((path[i][0]-a[0])*vy-(path[i][1]-a[1])*vx));
 }
 return travel<=length*1.10&&maxPerp<=2.5;
}
function makePattern(angleDegrees,spacingPx,origin){
 const a=((angleDegrees%180)+180)%180;
 return {angleDegrees:a,spacingPx,origin:origin.slice()};
}
export function applyManualHatches(paths,specs,{enabled=true}={}){
 if(!Array.isArray(paths))throw Error("Source linework unavailable");
 if(!Array.isArray(specs)||!specs.length)return {paths,hatches:[],results:[]};
 let working=paths.slice();const hatches=[],results=[];
 for(const spec of specs){
  const polygon=spec.boundary?.map(p=>[...p]);
  const problem=validatePolygon(polygon);
  if(problem){results.push({ok:false,error:problem});continue;}
  const spacing=Number(spec.spacingPx),angle=Number(spec.angleDegrees);
  if(!Number.isFinite(spacing)||spacing<2||spacing>1000||
    !Number.isFinite(angle)){results.push({ok:false,error:"Enter a valid angle and spacing in processed pixels."});continue;}
  const pattern=spec.pattern||"auto";
  if(pattern==="auto"){
   const synthetic=[...polygon,polygon[0].slice()];
   const inside=working.filter(path=>path.length>=2&&
     pointInPolygon(path[Math.floor(path.length/2)],polygon));
   const outside=working.filter(path=>!inside.includes(path));
   const detected=detectHatches([synthetic,...inside],{enabled:true,allowAxis:true,minStrokes:5});
   const matched=detected.hatches.find(h=>Math.hypot(h.boundary[0][0]-polygon[0][0],h.boundary[0][1]-polygon[0][1])<2);
   if(!matched){
    results.push({ok:false,error:"No reliable repeated hatch pattern inside this boundary. Choose Diagonal, Crosshatch, or Solid fill."});
    continue;
   }
   const hatch={...matched,boundary:polygon,boundaryType:"operator-selected",
     needsReview:true,manual:true};
   hatches.push(hatch);
   // The temporary manual boundary is the first synthetic path, not original geometry.
   working=[...outside,...detected.paths.filter(path=>path!==synthetic)];
   results.push({ok:true,removed:matched.sourceStrokeCount||0,pattern:"auto"});
   continue;
  }
  if(!["diagonal","cross","solid"].includes(pattern)){
   results.push({ok:false,error:"Unknown hatch pattern."});continue;
  }
  const patterns=pattern==="solid"?[]:
   [makePattern(angle,spacing,polygon[0]),...(pattern==="cross"?
     [makePattern(angle+90,spacing,polygon[0])]:[])];
  let removed=0;
  if(spec.removeMatchingStrokes&&pattern!=="solid"){
   const bearings=patterns.map(p=>p.angleDegrees);
   working=working.filter(path=>{
    if(isHatchStroke(path,polygon,bearings)){removed++;return false;}
    return true;
   });
  }
  hatches.push({boundary:polygon,patternName:pattern==="solid"?"SOLID":
    pattern==="cross"?"AV_CROSS":"AV_SCAN",solid:pattern==="solid",
    patterns,angleDegrees:angle,spacingPx:spacing,origin:polygon[0].slice(),
    confidence:1,manual:true,needsReview:true,boundaryType:"operator-selected",
    sourceStrokeCount:removed});
  results.push({ok:true,removed,pattern});
 }
 return {paths:working,hatches,results};
}
