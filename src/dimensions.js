/**
 * VecBuilt dimension QA (v0.7). Browser-local, deterministic and conservative.
 *
 * Recognition is not a DWG/Civil 3D DIMENSION reconstruction. It locates
 * linear numeric notes and, only with two witness/extension lines, proposes
 * a measurable raster dimension line. A reviewer may pick endpoints manually.
 * A result inside tolerance is preliminary until reviewed and confirmed.
 */
const UNIT_TO_METERS={feet:0.3048,inches:0.0254,meters:1,millimeters:0.001,centimeters:0.01};
const metricUnit={mm:"millimeters",millimeter:"millimeters",millimeters:"millimeters",
  cm:"centimeters",centimeter:"centimeters",centimeters:"centimeters",
  m:"meters",meter:"meters",meters:"meters",
  ft:"feet",foot:"feet",feet:"feet",in:"inches",inch:"inches",inches:"inches"};
const numeric=/^(?:\d+(?:\.\d+)?|\.\d+)$/;
const nice=v=>Math.round(v*1000000)/1000000;
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const finitePoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
function fraction(text){
  const s=String(text||"").trim();
  const m=s.match(/^(\d+(?:\.\d+)?)?(?:[ -]+)?(\d+)\/(\d+)$/);
  if(m){
    const top=+m[2],bottom=+m[3];
    if(!bottom||bottom>128||top>=bottom)return null;
    return +(m[1]||0)+top/bottom;
  }
  return numeric.test(s)?+s:null;
}
export function parseDimensionLabel(raw,{defaultUnits="unitless"}={}){
  let text=String(raw??"").trim().replace(/\s+/g," ");
  if(!text||text.length>48||/[=:%°Ø⌀@]/.test(text)||
     /(?:\b(?:EL|ELEV|ELEVATION|RADIUS|RAD|DIA|SLOPE|TYP|NTS|SCALE|REV|STA)\b)/i.test(text))return null;
  // Exclude point elevations, stations and symbols rather than validating
  // unrelated numbers. Numeric-only notes remain provisional candidates.
  if(/^[+-]|^\d+\+\d+/.test(text))return null;
  text=text.replace(/[′’]/g,"'").replace(/[″“”]/g,'"');
  let value,units,explicitUnit=false;
  // 12'-6 1/2", 12' 6", 12' and 12'-6 all share the same parser.
  if(text.includes("'")){
    const m=text.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:-?\s*(\d+(?:\.\d+)?(?:[ -]\d+\/\d+)?|\d+\/\d+)\s*(?:"|in\b)?)?$/i);
    if(!m)return null;
    const feet=+m[1],inch=m[2]?fraction(m[2]):0;
    if(inch===null||inch>=12||!Number.isFinite(feet))return null;
    value=feet+inch/12;units="feet";explicitUnit=true;
  }else if(text.endsWith('"')){
    const inch=fraction(text.slice(0,-1));if(inch===null)return null;
    value=inch;units="inches";explicitUnit=true;
  }else{
    const m=text.match(/^((?:\d+(?:\.\d+)?|\.\d+)(?:[ -]\d+\/\d+)?|\d+\/\d+)\s*(mm|millimeters?|cm|centimeters?|m|meters?|ft|feet|foot|in|inches?|inch)?$/i);
    if(!m)return null;
    value=fraction(m[1]);if(value===null)return null;
    explicitUnit=Boolean(m[2]);units=metricUnit[(m[2]||"").toLowerCase()]||defaultUnits;
  }
  if(!Number.isFinite(value)||value<=0||value>1e8)return null;
  return {value:nice(value),units,explicitUnit,kind:"linear",raw:String(raw).trim()};
}
export function convertLength(value,fromUnits,toUnits){
  if(!Number.isFinite(value)||!(fromUnits in UNIT_TO_METERS)||!(toUnits in UNIT_TO_METERS))return null;
  return value*UNIT_TO_METERS[fromUnits]/UNIT_TO_METERS[toUnits];
}
export function evaluateDimension(d,{scale=1,units="unitless",calibrated=false,
    relativeTolerance=1,absoluteTolerance=.05}={}){
  const parsed=parseDimensionLabel(d.label,{defaultUnits:units});
  const points=d.manualEndpoints||d.autoEndpoints||null;
  const base={...d,parsed,method:d.manualEndpoints?"manual":d.autoEndpoints?"auto":"none",
    measured:null,expected:null,delta:null,absoluteDelta:null,allowed:null,
    status:"unmatched",reviewed:Boolean(d.reviewed)};
  if(d.ignored)return {...base,status:"ignored"};
  if(!parsed)return {...base,status:"unreadable",reviewed:false};
  if(!points||points.length!==2||!points.every(finitePoint))return {...base,status:"unmatched",reviewed:false};
  if(!calibrated||!Number.isFinite(scale)||scale<=0)return {...base,status:"uncalibrated",reviewed:false};
  const expected=convertLength(parsed.value,parsed.units,units);
  if(expected===null)return {...base,status:"needs-units",reviewed:false};
  const measured=len(points[0],points[1])*scale;
  const delta=measured-expected,allowed=Math.max(Math.max(0,absoluteTolerance),
    Math.abs(expected)*Math.max(0,relativeTolerance)/100);
  const status=Math.abs(delta)<=allowed+1e-9?"match":"mismatch";
  return {...base,expected:nice(expected),measured:nice(measured),delta:nice(delta),
    absoluteDelta:nice(Math.abs(delta)),allowed:nice(allowed),status,
    reviewed:Boolean(d.reviewed)&&Boolean(d.manualEndpoints||d.autoEndpoints)};
}
function segmentDistance(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],sq=dx*dx+dy*dy;
  const t=sq?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/sq)):0;
  return {distance:len(point,[a[0]+dx*t,a[1]+dy*t]),t};
}
const cellKey=(x,y)=>x+":"+y;
function makeIndex(paths,{cellSize=100,maxLines=60000}={}){
  const cells=new Map(),segments=[];
  for(const [sourceIndex,path] of (paths||[]).entries()){
    if(segments.length>=maxLines)break;
    // Curves and complex shapes cannot serve as dimension lines/witnesses.
    if(path?.length!==2||!path.every(finitePoint))continue;
    const length=len(path[0],path[1]);if(length<12||length>5000)continue;
    const index=segments.length,seg={path,axis:[
      (path[1][0]-path[0][0])/length,(path[1][1]-path[0][1])/length],length,index,sourceIndex};
    segments.push(seg);
    const x0=Math.floor(Math.min(path[0][0],path[1][0])/cellSize);
    const x1=Math.floor(Math.max(path[0][0],path[1][0])/cellSize);
    const y0=Math.floor(Math.min(path[0][1],path[1][1])/cellSize);
    const y1=Math.floor(Math.max(path[0][1],path[1][1])/cellSize);
    if((x1-x0+1)*(y1-y0+1)>260)continue;
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const key=cellKey(x,y);
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(index);
    }
  }
  function near(point,radius){
    const out=new Set();
    for(let x=Math.floor((point[0]-radius)/cellSize);x<=Math.floor((point[0]+radius)/cellSize);x++)
      for(let y=Math.floor((point[1]-radius)/cellSize);y<=Math.floor((point[1]+radius)/cellSize);y++)
        for(const id of cells.get(cellKey(x,y))||[])out.add(id);
    return [...out].map(id=>segments[id]);
  }
  return {near,segments};
}
function witnessAt(point,dimension,index,radius){
  const witnesses=index.near(point,radius+13);
  for(const witness of witnesses){
    if(witness.index===dimension.index||witness.length<10)continue;
    if(Math.abs(witness.axis[0]*dimension.axis[0]+witness.axis[1]*dimension.axis[1])>.31)continue;
    const m=segmentDistance(point,witness.path[0],witness.path[1]);
    if(m.distance<=radius&&m.t>.03&&m.t<.97)return witness;
  }
  return false;
}
function bboxCenter(t){
  return t.bbox?
    [(t.bbox.x0+t.bbox.x1)/2,(t.bbox.y0+t.bbox.y1)/2]:
    [t.x,t.y-(t.height||10)*.5];
}
function associate(t,index,used){
  const center=bboxCenter(t),height=Math.max(7,Math.min(80,t.height||12));
  const radius=Math.max(22,height*5,Math.min(160,(t.bbox?.x1-t.bbox?.x0||0)*1.5));
  const options=[];
  const nearby=index.near(center,radius);
  const baselines=nearby.slice();
  // A printed label commonly interrupts the baseline. Join only collinear pieces
  // whose gap straddles this text and whose outer endpoints have witnesses.
  for(let i=0;i<Math.min(nearby.length,100);i++)for(let j=i+1;j<Math.min(nearby.length,100);j++){
    const a=nearby[i],b=nearby[j];
    if(Math.abs(a.axis[0]*b.axis[0]+a.axis[1]*b.axis[1])<.998)continue;
    const u=a.axis,project=p=>p[0]*u[0]+p[1]*u[1];
    const ordered=[a,b].map(seg=>({seg,ends:seg.path.slice().sort((p,q)=>project(p)-project(q))})).sort((p,q)=>project(p.ends[0])-project(q.ends[0]));
    const left=ordered[0],right=ordered[1],gap=project(right.ends[0])-project(left.ends[1]),at=project(center);
    const lateral=Math.abs((b.path[0][0]-a.path[0][0])*u[1]-(b.path[0][1]-a.path[0][1])*u[0]);
    if(lateral>1.5||gap<=1||gap>Math.max(height*5,(t.bbox?.x1-t.bbox?.x0||0)*2)||at<project(left.ends[1])-height||at>project(right.ends[0])+height)continue;
    const path=[left.ends[0],right.ends[1]];
    baselines.push({path,axis:u,length:len(...path),index:a.index,sourceIndex:a.sourceIndex,parts:[a,b]});
  }
  for(const seg of baselines){
    if((seg.parts||[seg]).some(s=>used.has(s.index))||seg.length<30)continue;
    const closest=segmentDistance(center,seg.path[0],seg.path[1]);
    if(closest.distance>Math.min(radius,height*4+12)||closest.t<.12||closest.t>.88)continue;
    const witnessRadius=Math.min(18,Math.max(6,height*1.6));
    const firstWitness=witnessAt(seg.path[0],seg,index,witnessRadius),lastWitness=witnessAt(seg.path[1],seg,index,witnessRadius);
    if(!firstWitness||!lastWitness||firstWitness.index===lastWitness.index)continue;
    // Parallel dimension baselines and original linework are indistinguishable
    // at some locations. Keep the result explicitly provisional.
    const alignment=1-Math.min(1,Math.abs(closest.t-.5)*1.8);
    const distanceScore=1-Math.min(1,closest.distance/Math.max(1,radius));
    const confidence=Math.min(.88,.61+.13*alignment+.12*distanceScore);
    options.push({seg,confidence,dist:closest.distance,witnesses:[firstWitness,lastWitness]});
  }
  if(!options.length)return null;
  options.sort((a,b)=>b.confidence-a.confidence||a.dist-b.dist);
  const best=options[0];for(const part of best.seg.parts||[best.seg])used.add(part.index);
  return {autoEndpoints:best.seg.path.map(p=>p.slice()),
    sourcePathIndices:[...(best.seg.parts||[best.seg]).map(s=>s.sourceIndex),...best.witnesses.map(s=>s.sourceIndex)],
    confidence:nice(best.confidence),association:"dimension-line-with-two-witnesses"};
}
export function detectPrintedDimensions(texts,paths,{maxCandidates=500}={}){
  const index=makeIndex(paths),used=new Set(),out=[];
  for(const item of texts||[]){
    if(out.length>=maxCandidates)break;
    if(!item||!Number.isFinite(item.x)||!Number.isFinite(item.y))continue;
    // Only full linear labels; isolated marks and scale/elevation notes are not
    // counted as dimensions. Numeric labels may still need human filtering.
    const parsed=parseDimensionLabel(item.value,{defaultUnits:"unitless"});
    if(!parsed)continue;
    const suggestion=associate(item,index,used);
    out.push({id:"dim-"+out.length,label:String(item.value).trim(),
      originalLabel:String(item.value).trim(),textX:item.x,textY:item.y,
      bbox:item.bbox?{...item.bbox}:null,height:item.height||12,
      autoEndpoints:suggestion?.autoEndpoints||null,
      manualEndpoints:null,confidence:suggestion?.confidence||0,
      association:suggestion?.association||null,sourcePathIndices:suggestion?.sourcePathIndices||[],reviewed:false,ignored:false});
  }
  return out;
}
export function summarizeDimensionQA(dimensions,options={}){
  const counts={total:0,match:0,mismatch:0,unmatched:0,uncalibrated:0,
    "needs-units":0,unreadable:0,ignored:0,reviewed:0,manual:0,auto:0};
  for(const d of dimensions||[]){
    const r=evaluateDimension(d,options);
    counts.total++;
    if(Object.hasOwn(counts,r.status))counts[r.status]++;
    if(r.reviewed&&r.status!=="ignored")counts.reviewed++;
    if(r.method==="manual")counts.manual++;
    if(r.method==="auto")counts.auto++;
  }
  counts.checked=counts.match+counts.mismatch;
  counts.unresolved=counts.unmatched+counts.uncalibrated+counts["needs-units"]+counts.unreadable;
  return counts;
}
function csvCell(value){
  let s=String(value==null?"":value);
  // Prevent spreadsheet formula execution when the CSV is opened in Excel.
  if(/^[\s]*[=+\-@]/.test(s))s="\u0027"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function dimensionCsv(dimensions,{sheetName="",...options}={}){
  const header=["Sheet","ID","Printed label","Expected","Measured","Delta","Allowed",
    "Drawing units","Status","Measurement source","Confidence","Reviewer confirmed",
    "Ignored","Point A X px","Point A Y px","Point B X px","Point B Y px"];
  const lines=[header.map(csvCell).join(",")];
  for(const d of dimensions||[]){
    const v=evaluateDimension(d,options),points=d.manualEndpoints||d.autoEndpoints||[];
    const values=[sheetName,d.id,d.label,v.expected,v.measured,v.delta,v.allowed,
      options.units,v.status,v.method,d.confidence,v.reviewed?"yes":"no",d.ignored?"yes":"no",
      points[0]?.[0],points[0]?.[1],points[1]?.[0],points[1]?.[1]];
    lines.push(values.map(csvCell).join(","));
  }
  return lines.join("\r\n")+"\r\n";
}
