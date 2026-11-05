/**
 * VecBuilt v0.8 conservative topology QA. Works on reconstructed two-point LINE
 * paths only, never on HATCH boundaries, CIRCLEs, detected linetype patterns,
 * text, or multi-vertex curves.
 *
 * Decisions are proposals, not automatic edits. Each proposal stores the exact
 * source paths it will replace and is rejected if the drawing has changed.
 * The returned paths use new arrays without mutating any input geometry.
 */
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const clone=p=>p.map(x=>x.slice());
const round=v=>Math.round(v*1000)/1000;
const bucket=(p,step)=>Math.floor(p[0]/step)+","+Math.floor(p[1]/step);
const around=(p,step)=>{
  const x=Math.floor(p[0]/step),y=Math.floor(p[1]/step),keys=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)keys.push((x+dx)+","+(y+dy));
  return keys;
};
function add(index,key,item){if(!index.has(key))index.set(key,[]);index.get(key).push(item);}
function close(a,b,tol){return distance(a,b)<=tol;}
function sameLine(a,b,tol){
  return (close(a[0],b[0],tol)&&close(a[1],b[1],tol))||
         (close(a[0],b[1],tol)&&close(a[1],b[0],tol));
}
function intersection(a,b,c,d){
  const u=sub(b,a),v=sub(d,c),denom=cross(u,v);
  if(Math.abs(denom)<.000001*Math.hypot(...u)*Math.hypot(...v))return null;
  const t=cross(sub(c,a),v)/denom;
  return [a[0]+t*u[0],a[1]+t*u[1]];
}
const length=path=>distance(path[0],path[1]);
export function analyzeRepairs(paths,{tolerance=3,duplicateTolerance=.85,
  maxProposals=350,maxSegments=75000,minLength=12}={}){
  if(!Array.isArray(paths))throw Error("Expected an array of vector paths");
  if(!Number.isFinite(tolerance)||tolerance<.2||tolerance>25)throw Error("Repair tolerance must be between 0.2 and 25 pixels");
  const proposals=[],seen=new Set();
  const segmentIndex=[],endpointBins=new Map(),duplicateBins=new Map();
  let skipped=0,short=0;
  const push=(type,indices,source,replacement,anchor,distancePx,confidence,safe,why)=>{
    if(proposals.length>=maxProposals)return;
    const signature=type+":"+indices.slice().sort((a,b)=>a-b).join(":");
    if(seen.has(signature))return;
    seen.add(signature);
    proposals.push({
      id:signature,type,sourceIndices:indices,sourcePaths:source.map(clone),
      replacementPaths:replacement.map(clone),anchor:anchor.slice(),
      gapPx:round(distancePx),confidence:round(confidence),
      safe:Boolean(safe),reason:why
    });
  };
  const dupeCell=Math.max(.6,duplicateTolerance);
  const endpointCell=Math.max(1,tolerance);
  for(let i=0;i<paths.length;i++){
    const path=paths[i];
    if(!Array.isArray(path)||path.length!==2||!path.every(valid)){skipped++;continue;}
    const len=length(path);
    if(len<minLength||!Number.isFinite(len)){short++;continue;}
    if(segmentIndex.length>=maxSegments){skipped++;continue;}
    const seg={index:i,path,len,axis:sub(path[1],path[0]).map(c=>c/len)};
    segmentIndex.push(seg);
    // Duplicate candidates require BOTH endpoints to match, not just overlapping
    // portions of a collinear line. Preserve intentional parallel lines.
    const v0=path[0],v1=path[1];
    const first=(v0[0]<v1[0]||v0[0]===v1[0]&&v0[1]<=v1[1])?v0:v1;
    for(const key of around(first,dupeCell)){
      for(const other of duplicateBins.get(key)||[]){
        if(proposals.length>=maxProposals)break;
        if(!sameLine(path,other.path,duplicateTolerance))continue;
        const gap=Math.max(
          Math.min(distance(path[0],other.path[0]),distance(path[0],other.path[1])),
          Math.min(distance(path[1],other.path[0]),distance(path[1],other.path[1]))
        );
        push("duplicate",[other.index,i],[other.path,path],[other.path],
          [(path[0][0]+path[1][0])/2,(path[0][1]+path[1][1])/2],
          gap,.99,true,"Two almost-identical lines occupy the same location; retain the earlier entity.");
      }
    }
    add(duplicateBins,bucket(first,dupeCell),seg);
    add(endpointBins,bucket(v0,endpointCell),{seg,end:0,point:v0});
    add(endpointBins,bucket(v1,endpointCell),{seg,end:1,point:v1});
  }
  const examined=new Set();
  for(const seg of segmentIndex){
    if(proposals.length>=maxProposals)break;
    for(let end=0;end<2;end++){
      const point=seg.path[end],far=seg.path[1-end];
      for(const key of around(point,endpointCell)){
        for(const item of endpointBins.get(key)||[]){
          if(proposals.length>=maxProposals)break;
          const other=item.seg;
          if(other.index===seg.index)continue;
          const pair=[seg.index,other.index].sort((a,b)=>a-b);
          const pairSources=seg.index<other.index?[seg.path,other.path]:[other.path,seg.path];
          const key=pair[0]+":"+pair[1];if(examined.has(key))continue;
          examined.add(key);
          const gap=distance(point,item.point);
          if(gap>.2&&gap<=tolerance){
            const farOther=other.path[1-item.end];
            const u=sub(point,far),v=sub(farOther,item.point);
            const ua=u.map(c=>c/seg.len),va=v.map(c=>c/other.len);
            const angle=dot(ua,va);
            const lateral=Math.abs(cross(ua,sub(item.point,point)));
            const mergedLength=distance(far,farOther);
            const collinear=angle>.996&&lateral<=Math.min(1.4,tolerance*.45)&&
              mergedLength>=seg.len+other.len-Math.min(1.4,tolerance*.4);
            if(collinear){
              const safe=gap<=Math.min(1.25,tolerance*.5)&&angle>.9998&&lateral<.42&&
                Math.min(seg.len,other.len)>22;
              push("join",pair,pairSources,[[...far],[...farOther]],
                [(point[0]+item.point[0])/2,(point[1]+item.point[1])/2],
                gap,safe?.98:.88,safe,
                safe?"Small, nearly exact collinear gap with no line reversal.":
                  "Two aligned line segments have a gap; verify the connection.");
              continue;
            }
          }
          // Corner repair: project two nonparallel baselines to a shared
          // intersection near an endpoint on BOTH segments. Review is required.
          const acute=Math.abs(dot(seg.axis,other.axis));
          if(acute>.91||acute<.06)continue;
          const crossAt=intersection(seg.path[0],seg.path[1],other.path[0],other.path[1]);
          if(!crossAt)continue;
          const endA=distance(crossAt,seg.path[0])<distance(crossAt,seg.path[1])?0:1;
          const endB=distance(crossAt,other.path[0])<distance(crossAt,other.path[1])?0:1;
          const deltaA=distance(crossAt,seg.path[endA]),deltaB=distance(crossAt,other.path[endB]);
          if(deltaA>tolerance||deltaB>tolerance||deltaA<.3&&deltaB<.3)continue;
          if(deltaA>seg.len*.2||deltaB>other.len*.2)continue;
          const newA=clone(seg.path),newB=clone(other.path);
          newA[endA]=crossAt.slice();newB[endB]=crossAt.slice();
          push("corner",pair,pairSources,seg.index<other.index?[newA,newB]:[newB,newA],crossAt,
            Math.max(deltaA,deltaB),.76,false,
            "Extended or trimmed two angled endpoints to their shared intersection. Review before applying.");
        }
      }
    }
  }
  // Preference order: duplicate > tiny joins > potential joins > corner repairs.
  const priority={duplicate:0,join:1,corner:2};
  proposals.sort((a,b)=>priority[a.type]-priority[b.type]||
    Number(b.safe)-Number(a.safe)||a.gapPx-b.gapPx||a.id.localeCompare(b.id));
  const totals={duplicate:0,join:0,corner:0,safe:0,review:0};
  for(const p of proposals){totals[p.type]++;totals[p.safe?"safe":"review"]++;}
  return {proposals,stats:{
    analyzedSegments:segmentIndex.length,skippedNonlinear:skipped,skippedShort:short,
    capped:proposals.length>=maxProposals||segmentIndex.length>=maxSegments,
    tolerance,duplicateTolerance,counts:totals
  }};
}
export function applyRepairs(paths,proposals){
  if(!Array.isArray(paths)||!Array.isArray(proposals))throw Error("Invalid repair inputs");
  const used=new Set(),replacements=new Map(),applied=[];
  for(const p of proposals){
    if(!p||!Array.isArray(p.sourceIndices)||p.sourceIndices.length!==p.sourcePaths?.length||
       !Array.isArray(p.replacementPaths)||p.sourceIndices.length!==2)continue;
    if(p.sourceIndices.some(i=>used.has(i)||!Number.isSafeInteger(i)||i<0||i>=paths.length))continue;
    // Source paths must match exactly. Stale proposals cannot modify a
    // changed drawing, even after an undo or another repair.
    const validSource=p.sourceIndices.every((idx,k)=>{
      const current=paths[idx],previous=p.sourcePaths[k];
      return current?.length===2&&previous?.length===2&&
        current.every((pt,i)=>valid(pt)&&valid(previous[i])&&
          pt[0]===previous[i][0]&&pt[1]===previous[i][1]);
    });
    if(!validSource)continue;
    const validReplacement=p.replacementPaths.every(path=>
      path.length===2&&path.every(valid)&&length(path)>.25);
    if(!validReplacement)continue;
    p.sourceIndices.forEach(i=>used.add(i));
    replacements.set(Math.min(...p.sourceIndices),p.replacementPaths.map(clone));
    applied.push({id:p.id,type:p.type,safe:p.safe,gapPx:p.gapPx});
  }
  if(!applied.length)return {paths,applied};
  const output=[];
  for(let i=0;i<paths.length;i++){
    if(replacements.has(i))output.push(...replacements.get(i));
    if(!used.has(i))output.push(paths[i]);
  }
  return {paths:output,applied};
}
export function repairStats(log=[]){
  const counts={total:log.length,duplicate:0,join:0,corner:0};
  for(const entry of log)if(entry?.type in counts)counts[entry.type]++;
  return counts;
}
