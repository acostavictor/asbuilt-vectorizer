/**
 * Experimental reconstruction of repeated short raster strokes into DXF line types.
 * Recognizes visual rhythm, not engineering intent. HIDDEN vs DASHED is heuristic;
 * the operator must verify and may override the result for each sheet.
 *
 * Inputs: paths as pixel-space polyline arrays. Output: solidPaths plus styledPaths
 * whose endpoints cover each recognized dash train. This never uploads drawing data.
 */
const rad=Math.PI/180;
function median(values){
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted.length?sorted[Math.floor(sorted.length/2)]:0;
}
function spread(values,mid){
  if(values.length<2||!mid)return 0;
  return median(values.map(x=>Math.abs(x-mid)))/mid;
}
function lineCandidate(path,index,maxStroke){
  if(!Array.isArray(path)||path.length<2)return null;
  const first=path[0],last=path[path.length-1];
  if(!first?.every(Number.isFinite)||!last?.every(Number.isFinite))return null;
  const vx=last[0]-first[0],vy=last[1]-first[1],len=Math.hypot(vx,vy);
  if(len<1||len>maxStroke)return null;
  // Discard bends. Curves and branching polylines must not become dashed lines.
  let travel=0,offAxis=0;
  const ux=vx/len,uy=vy/len;
  for(let k=1;k<path.length;k++){
    const p=path[k],previous=path[k-1];
    travel+=Math.hypot(p[0]-previous[0],p[1]-previous[1]);
    const dist=Math.abs((p[0]-first[0])*uy-(p[1]-first[1])*ux);
    offAxis=Math.max(offAxis,dist);
  }
  if(offAxis>Math.max(1.8,Math.min(3.2,len*.045))||travel>len*1.09)return null;
  let angle=Math.atan2(vy,vx);
  if(angle<0)angle+=Math.PI;
  if(angle>=Math.PI)angle-=Math.PI;
  const u=[Math.cos(angle),Math.sin(angle)],n=[-u[1],u[0]];
  const tA=first[0]*u[0]+first[1]*u[1],tB=last[0]*u[0]+last[1]*u[1];
  const mid=[(first[0]+last[0])/2,(first[1]+last[1])/2];
  return {index,path,len,angle,axis:u,normal:n,offset:mid[0]*n[0]+mid[1]*n[1],
    start:Math.min(tA,tB),end:Math.max(tA,tB)};
}
export const LINE_TYPES=["DASHED","HIDDEN","CENTER","PHANTOM","DASHDOT"];
export function linePattern(item,type=item.linetype){
 const dash=item.dashPx||20,gap=item.gapPx||10,short=item.shortPx||dash/4;
 if(type==="CENTER")return [dash,-gap,short,-gap];
 if(type==="PHANTOM")return [dash,-gap,short,-gap,short,-gap];
 if(type==="DASHDOT")return [dash,-gap,0,-gap];
 return [dash,-gap];
}
function mixedPattern(series,gaps,limit){
 const lengths=series.map(s=>s.len),gap=median(gaps);
 if(gap<2.2||spread(gaps,gap)>limit.gapSpread)return null;
 for(const period of [2,3]){
  if(series.length<period*2)continue;
  for(const phase of [0]){
   const long=lengths.filter((_,i)=>i%period===phase),short=lengths.filter((_,i)=>i%period!==phase);
   const dash=median(long),small=median(short);
   if(dash<small*2.4||dash<10||gap>dash*limit.maxRatio)continue;
   if(long.some(x=>Math.abs(x-dash)>dash*limit.dashSpread)||short.some(x=>Math.abs(x-small)>Math.max(.8,small*limit.dashSpread)))continue;
   // A phantom repeats long-short-short; dash-dot repeats long-dot.
   const linetype=period===3?"PHANTOM":small<=Math.min(3.5,dash*.12)?"DASHDOT":"CENTER";
   return {linetype,dashPx:dash,shortPx:small,gapPx:gap,
    // Require a long first stroke so the CAD pattern starts in the observed phase.
    patternPx:lengths.slice(0,period).flatMap((x,i)=>[(linetype==="DASHDOT"&&x<dash*.5)?0:(i===phase?dash:small),-gap])};
  }
 }
 return null;
}
function contiguousSeries(items,limit,minDashCount){
  const runs=[],used=new Set();
  const sorted=items.slice().sort((a,b)=>a.start-b.start);
  for(let i=0;i<sorted.length;i++){
    if(used.has(sorted[i].index))continue;
    const series=[sorted[i]],gaps=[];
    for(let j=i+1;j<sorted.length;j++){
      const previous=series[series.length-1],next=sorted[j];
      if(used.has(next.index))continue;
      const gap=next.start-previous.end;
      // Stop on overlapping strokes: they are likely different objects.
      if(gap<=1.8)break;
      const maxGap=Math.min(limit.maxGap,Math.max(32,previous.len*limit.maxRatio));
      if(gap>Math.max(maxGap,Math.min(limit.maxGap,12)))break;
      // Prevent drifting diagonals from accidentally coalescing.
      const midAngle=Math.abs(previous.angle-next.angle);
      if(midAngle>limit.maxAngle||Math.abs(previous.offset-next.offset)>limit.maxOffset)break;
      series.push(next);gaps.push(gap);
      if(series.length>=limit.maxSeries)break;
    }
    if(series.length<4)continue;
    const dashes=series.map(v=>v.len),dash=median(dashes),gap=median(gaps);
    const dashCV=spread(dashes,dash),gapCV=spread(gaps,gap);
    const mixed=mixedPattern(series,gaps,limit);
    if(!Number.isFinite(gap)||gap<2.2||(!mixed&&gap>dash*limit.maxRatio))continue;
    if(!mixed&&series.length<minDashCount)continue;
    if(!mixed&&(dashCV>limit.dashSpread||gapCV>limit.gapSpread||dashes.some(x=>Math.abs(x-dash)>dash*limit.dashSpread)))continue;
    const totalLength=series[series.length-1].end-series[0].start;
    if(totalLength<45||(!mixed&&totalLength<dash*minDashCount+gap*(minDashCount-1)*.6))continue;
    // Very short repeated marks may be actual point symbols; require sufficient travel.
    if(dash<7&&series.length<6)continue;
    const maxOffset=median(series.map(v=>v.offset));
    const u=series[0].axis,n=series[0].normal;
    const point=t=>[u[0]*t+n[0]*maxOffset,u[1]*t+n[1]*maxOffset];
    const points=[point(series[0].start),point(series[series.length-1].end)];
    // HIDDEN is a shorter-dash convention, not semantic hidden-object recognition.
    const linetype=dash<=limit.hiddenThreshold?"HIDDEN":"DASHED";
    const confidence=Math.max(.3,Math.min(.95,.94-(dashCV*.6+gapCV*.4)));
    const matched=series.flatMap(x=>x.sourceIndices||[x.index]);
    runs.push({points,linetype,dashPx:dash,gapPx:gap,sourceSegments:matched.length,
      confidence,sourceIndices:matched,...mixed});
    for(const id of matched)used.add(id);
  }
  return {runs,used};
}
export function recognizeLineTypes(paths,{sensitivity="balanced",enabled=true}={}){
  if(!enabled||!paths?.length)return {
    solidPaths:paths||[],styledPaths:[],
    stats:{candidateCount:0,recognizedRuns:0,dashedCount:0,hiddenCount:0,segmentsConsumed:0}
  };
  const loose=sensitivity==="sensitive";
  const limit={maxStroke:loose?1200:600,maxGap:loose?130:85,
    maxRatio:loose?1.5:1.12,maxAngle:(loose?3.5:2.3)*rad,
    maxOffset:loose?4.5:3.0,dashSpread:loose?.39:.26,
    gapSpread:loose?.43:.29,hiddenThreshold:loose?25:22,maxSeries:100};
  const bins=new Map();let candidates=0;
  // A narrow angular bucket + normal intercept avoids cross-connecting parallel
  // pipes, dimensions and geometry on neighboring lines.
  const angleStep=2.5*rad,offsetStep=3.5;
  for(let i=0;i<paths.length;i++){
    const c=lineCandidate(paths[i],i,limit.maxStroke);
    if(!c)continue;
    candidates++;
    const angleBucket=Math.round(c.angle/angleStep);
    const interceptBucket=Math.round(c.offset/offsetStep);
    const key=angleBucket+":"+interceptBucket;
    if(!bins.has(key))bins.set(key,[]);
    bins.get(key).push(c);
  }
  const used=new Set(),styledPaths=[];
  for(const [key,local] of bins){
    const [angle,offset]=key.split(":").map(Number),near=[];
    for(let da=-1;da<=1;da++)for(let dn=-1;dn<=1;dn++)
      near.push(...(bins.get((angle+da)+":"+(offset+dn))||[]));
    // Adjacent quantization buckets may hold the same scanned centerline.
    const reference=local[0];
    const items=near.filter(c=>Math.abs(c.angle-reference.angle)<=limit.maxAngle&&Math.abs(c.offset-reference.offset)<=limit.maxOffset)
      .map(c=>({...c,sourceIndices:[c.index]})).sort((a,b)=>a.start-b.start);
    const merged=[];
    for(const item of items){
      const previous=merged.at(-1),gap=previous?item.start-previous.end:Infinity;
      if(previous&&gap>=-1&&gap<=1.8&&Math.abs(previous.offset-item.offset)<=1.5){
        previous.end=Math.max(previous.end,item.end);previous.len=previous.end-previous.start;
        previous.sourceIndices.push(...item.sourceIndices);
      }else merged.push({...item});
    }
    if(merged.length<4)continue;
    const recognized=contiguousSeries(merged,limit,loose?4:5);
    for(const run of recognized.runs){
      if(run.sourceIndices.some(i=>used.has(i)))continue;
      for(const index of run.sourceIndices)used.add(index);
      // Export only rendered geometry and measured metrics, not the raw index list.
      const {sourceIndices,...result}=run;styledPaths.push(result);
    }
  }
  return {solidPaths:paths.filter((_,i)=>!used.has(i)),styledPaths,
    stats:{candidateCount:candidates,recognizedRuns:styledPaths.length,
      dashedCount:styledPaths.filter(p=>p.linetype==="DASHED").length,
      hiddenCount:styledPaths.filter(p=>p.linetype==="HIDDEN").length,
      centerCount:styledPaths.filter(p=>p.linetype==="CENTER").length,
      phantomCount:styledPaths.filter(p=>p.linetype==="PHANTOM").length,
      dashdotCount:styledPaths.filter(p=>p.linetype==="DASHDOT").length,
      segmentsConsumed:used.size}};
}
export function effectiveLineType(group,override="auto"){
  return LINE_TYPES.includes(override)?override:group.linetype;
}
