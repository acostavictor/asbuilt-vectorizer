// Minimal ASCII DXF R2000 writer. Layered lines, polylines, text and true linetype table.
// Native DWG is not supported. All input coordinates are page-relative raster pixels.
import {effectiveLineType} from "./linetype.js";
const clean=v=>String(v??"").replace(/[\r\n\x00-\x1f]/g," ").trim();
const layerName=v=>clean(v).replace(/[<>\/\\":;?*|=,]/g,"_").slice(0,120)||"UNCLASSIFIED";
const pair=(k,v)=>String(k)+"\n"+String(v)+"\n";
const number=v=>Number.isFinite(+v)?String(Number((+v).toFixed(6))):"0";
const coords=(x,y)=>pair(10,number(x))+pair(20,number(y));
function median(values){const a=values.slice().sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0;}
export function filenameBase(name){
  return String(name).replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"_").slice(0,80)||"drawing";
}
function makeLinetype(name,dash,gap){
  // DXF LTYPE pattern 49 uses positive lengths for ink and negative for spaces.
  // The detected pixel period is converted to actual model-space units.
  const positive=Math.max(.0001,dash),negative=Math.max(.0001,gap);
  return pair(0,"LTYPE")+pair(2,name)+pair(70,0)+pair(3,"As-built raster pattern (verify)")+
    pair(72,65)+pair(73,2)+pair(40,number(positive+negative))+
    pair(49,number(positive))+pair(74,0)+pair(49,number(-negative))+pair(74,0);
}
export function buildDxf({width,height,paths=[],hatches=[],hatchLayer="HATCH-REVIEW",styledPaths=[],lineTypeOverride="auto",
  texts=[],unitsPerPixel=1,geometryLayer="VEC-POLYLINES",
  textLayer="ANNO-TEXT",units="unitless",originX=0,originY=0}){
  if(!Number.isFinite(unitsPerPixel)||unitsPerPixel<=0)throw Error("Invalid calibration scale");
  const geometry=layerName(geometryLayer),annotation=layerName(textLayer),hatched=layerName(hatchLayer);
  const names=[...new Set([geometry,annotation,hatched,"QA-REVIEW","UNCLASSIFIED"])];
  const indices={"QA-REVIEW":1,"ANNO-TEXT":2,"VEC-POLYLINES":4,"HATCH-REVIEW":8,"UNCLASSIFIED":7};
  const insunits={unitless:0,inches:1,feet:2,millimeters:4,centimeters:5,meters:6}[units]??0;
  const styles={};
  for(const item of styledPaths){
    if(!item||!Array.isArray(item.points)||item.points.length<2)continue;
    const type=effectiveLineType(item,lineTypeOverride);
    if(!["HIDDEN","DASHED"].includes(type))continue;
    if(!styles[type])styles[type]={dashes:[],gaps:[]};
    if(Number.isFinite(item.dashPx)&&item.dashPx>0)styles[type].dashes.push(item.dashPx);
    if(Number.isFinite(item.gapPx)&&item.gapPx>0)styles[type].gaps.push(item.gapPx);
  }
  let d=pair(0,"SECTION")+pair(2,"HEADER")+pair(9,"$ACADVER")+pair(1,"AC1015")+
    pair(9,"$INSUNITS")+pair(70,insunits)+pair(9,"$LTSCALE")+pair(40,1)+
    pair(0,"ENDSEC")+pair(0,"SECTION")+pair(2,"TABLES")+
    pair(0,"TABLE")+pair(2,"LTYPE")+pair(70,1+Object.keys(styles).length)+
    pair(0,"LTYPE")+pair(2,"CONTINUOUS")+pair(70,0)+pair(3,"Solid line")+pair(72,65)+pair(73,0)+pair(40,0);
  const linePatterns={};
  for(const [type,metrics] of Object.entries(styles)){
    // A consistent pattern per DXF linetype. Store observed periods in source-pixel units
    // as metadata; the exported pattern is correctly expressed in CAD drawing units.
    const dash=median(metrics.dashes)||20,gap=median(metrics.gaps)||10;
    linePatterns[type]={dashPx:dash,gapPx:gap};
    d+=makeLinetype(type,dash*unitsPerPixel,gap*unitsPerPixel);
  }
  d+=pair(0,"ENDTAB")+pair(0,"TABLE")+pair(2,"LAYER")+pair(70,names.length);
  for(const name of names)d+=pair(0,"LAYER")+pair(2,name)+pair(70,0)+pair(62,indices[name]??7)+pair(6,"CONTINUOUS");
  d+=pair(0,"ENDTAB")+pair(0,"ENDSEC")+pair(0,"SECTION")+pair(2,"ENTITIES");
  const map=p=>[originX+p[0]*unitsPerPixel,originY+(height-p[1])*unitsPerPixel];
  const counts={DASHED:0,HIDDEN:0},geometryCount={solid:0,styled:0};let textCount=0;
  function addPath(path,linetype=null){
    if(!Array.isArray(path)||path.length<2)return false;
    const points=path.map(map);
    if(points.some(p=>!p.every(Number.isFinite)))return false;
    const suffix=linetype?pair(6,linetype):"";
    if(points.length===2){
      d+=pair(0,"LINE")+pair(8,geometry)+suffix+coords(points[0][0],points[0][1])+
        pair(11,number(points[1][0]))+pair(21,number(points[1][1]));
    }else{
      d+=pair(0,"LWPOLYLINE")+pair(8,geometry)+suffix+pair(90,points.length)+pair(70,0);
      for(const point of points)d+=coords(point[0],point[1]);
    }
    return true;
  }
  for(const path of paths)if(addPath(path))geometryCount.solid++;
  for(const item of styledPaths){
    if(!item?.points)continue;
    const type=effectiveLineType(item,lineTypeOverride);
    if(!styles[type])continue;
    if(addPath(item.points,type)){geometryCount.styled++;counts[type]++;}
  }
  // Native non-associative HATCH: one real boundary loop with the scanned line
  // family encoded as a regular user-defined pattern. No source hatch strokes
  // are exported separately when they were consumed by the hatch recognizer.
  let hatchCount=0;
  for(const hatch of hatches){
    if(!Array.isArray(hatch?.boundary)||hatch.boundary.length<3)continue;
    const vertices=hatch.boundary.map(map);
    if(vertices.some(p=>!p.every(Number.isFinite)))continue;
    const spacing=hatch.spacingPx*unitsPerPixel;
    const angleRad=-(hatch.angleDegrees||0)*Math.PI/180;
    if(!Number.isFinite(spacing)||spacing<=0||!Number.isFinite(angleRad))continue;
    const origin=map(hatch.origin||hatch.boundary[0]);
    const deltaX=-Math.sin(angleRad)*spacing,deltaY=Math.cos(angleRad)*spacing;
    d+=pair(0,"HATCH")+pair(100,"AcDbEntity")+pair(8,hatched)+
      pair(100,"AcDbHatch")+pair(10,0)+pair(20,0)+pair(30,0)+
      pair(210,0)+pair(220,0)+pair(230,1)+
      pair(2,"AV_SCAN")+pair(70,0)+pair(71,0)+pair(91,1)+
      pair(92,3)+pair(72,0)+pair(73,1)+pair(93,vertices.length);
    for(const p of vertices)d+=coords(p[0],p[1]);
    d+=pair(97,0)+pair(75,0)+pair(76,0)+pair(52,0)+pair(41,1)+
      pair(77,0)+pair(78,1)+pair(53,number(angleRad*180/Math.PI))+
      pair(43,number(origin[0]))+pair(44,number(origin[1]))+
      pair(45,number(deltaX))+pair(46,number(deltaY))+pair(79,0)+
      pair(98,0);
    hatchCount++;
  }
  for(const item of texts){
    const txt=clean(item.value).slice(0,240);if(!txt)continue;
    const pt=map([item.x,item.y]);
    d+=pair(0,"TEXT")+pair(8,annotation)+coords(pt[0],pt[1])+
      pair(40,number(Math.max(.01,(item.height||10)*unitsPerPixel)))+
      pair(1,txt.replace(/[^\x20-\x7e]/g,"?"))+pair(50,number(item.rotation||0));
    textCount++;
  }
  d+=pair(0,"ENDSEC")+pair(0,"EOF");
  return {content:d,geometryCount:geometryCount.solid+geometryCount.styled,textCount,
    styledCount:geometryCount.styled,lineTypes:Object.keys(styles),lineTypeCounts:counts,
    linePatterns,hatchCount,hatchLayer:hatched,layers:names,insunits};
}
