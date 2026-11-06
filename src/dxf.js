// Minimal ASCII DXF R2000 writer. Layered lines, polylines, text and true linetype table.
// Native DWG is not supported. All input coordinates are page-relative raster pixels.
import {completeDrawing,validateDrawingStructure} from "./dxf-structure.js";
import {effectiveLineType,LINE_TYPES,linePattern} from "./linetype.js";
const clean=v=>String(v??"").replace(/[\r\n\x00-\x1f]/g," ").trim();
const layerName=v=>clean(v).replace(/[<>\/\\":;?*|=,]/g,"_").slice(0,120)||"UNCLASSIFIED";
const pair=(k,v)=>String(k)+"\n"+String(v)+"\n";
const number=v=>{if(!Number.isFinite(v))throw Error("DXF contains a non-finite number");return String(Number(v.toPrecision(15)));};
const coords=(x,y)=>pair(10,number(x))+pair(20,number(y));
function median(values){const a=values.slice().sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0;}
export function filenameBase(name){
  return String(name).replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"_").slice(0,80)||"drawing";
}
function makeLinetype(name,pattern){
 return pair(0,"LTYPE")+pair(100,"AcDbSymbolTableRecord")+pair(100,"AcDbLinetypeTableRecord")+pair(2,name)+pair(70,0)+pair(3,"As-built raster pattern (verify)")+
  pair(72,65)+pair(73,pattern.length)+pair(40,number(pattern.reduce((sum,x)=>sum+Math.abs(x),0)))+
  pattern.map(x=>pair(49,number(x))+pair(74,0)).join("");
}
export function annotationHeight(units="unitless",heightInches=.1,scale=1){
 if(!Number.isFinite(heightInches)||heightInches<=0||!Number.isFinite(scale)||scale<=0)throw Error("Invalid annotation height or plot scale");
 const factors={unitless:1,inches:1,feet:1/12,millimeters:25.4,centimeters:2.54,meters:.0254};
 if(!(units in factors))throw Error("Unsupported annotation units");
 const height=heightInches*scale*factors[units];
 if(!Number.isFinite(height)||height<=0)throw Error("Invalid annotation height");
 return height;
}
export function buildDxf({width,height,paths=[],circles=[],arcs=[],hatches=[],hatchLayer="HATCH-REVIEW",styledPaths=[],lineTypeOverride="auto",
  texts=[],textHeightInches=.1,annotationScale=1,unitsPerPixel=1,geometryLayer="VEC-POLYLINES",
  textLayer="ANNO-TEXT",units="unitless",originX=0,originY=0}){
  if(!Number.isFinite(unitsPerPixel)||unitsPerPixel<=0)throw Error("Invalid calibration scale");
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(width)||width<=0)
    throw Error("Invalid sheet dimensions");
  if(!Number.isFinite(originX)||!Number.isFinite(originY))throw Error("Invalid drawing origin");
  const point=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
  for(const list of [paths,styledPaths,circles,arcs,hatches,texts])if(!Array.isArray(list))throw Error("Invalid export collection");
  for(const path of [...paths,...styledPaths.map(p=>p?.points)])
    if(!Array.isArray(path)||path.length<2||!path.every(point))throw Error("Invalid path coordinates");
  for(const c of circles)if(!point(c?.center)||!Number.isFinite(c.radius)||c.radius<=0)throw Error("Invalid circle");
  for(const a of arcs)if(!point(a?.center)||!Number.isFinite(a.radius)||a.radius<=0||!Number.isFinite(a.startAngle)||!Number.isFinite(a.endAngle))throw Error("Invalid arc");
  for(const h of hatches){
    if(!Array.isArray(h?.boundary)||h.boundary.length<3||!h.boundary.every(point))throw Error("Invalid hatch boundary");
    const patterns=h.patterns?.length?h.patterns:[{angleDegrees:h.angleDegrees,spacingPx:h.spacingPx,origin:h.origin}];
    if(!h.solid&&patterns.some(p=>!Number.isFinite(p.angleDegrees)||!Number.isFinite(p.spacingPx)||p.spacingPx<=0||(p.origin&&!point(p.origin))))throw Error("Invalid hatch pattern");
  }
  for(const t of texts)if(!t||!Number.isFinite(t.x)||!Number.isFinite(t.y)||
    (t.height!==undefined&&(!Number.isFinite(t.height)||t.height<=0))||
    (t.rotation!==undefined&&!Number.isFinite(t.rotation)))throw Error("Invalid text coordinates or size");
  const textHeight=annotationHeight(units,textHeightInches,annotationScale);
  const geometry=layerName(geometryLayer),annotation=layerName(textLayer),hatched=layerName(hatchLayer);
  const names=[...new Set([geometry,annotation,hatched,"QA-REVIEW","UNCLASSIFIED","0"])];
  const indices={"QA-REVIEW":1,"ANNO-TEXT":2,"VEC-POLYLINES":4,"HATCH-REVIEW":8,"UNCLASSIFIED":7};
  const insunits={unitless:0,inches:1,feet:2,millimeters:4,centimeters:5,meters:6}[units]??0;
  const styles={};
  for(const item of styledPaths){
    if(!item||!Array.isArray(item.points)||item.points.length<2)continue;
    const type=effectiveLineType(item,lineTypeOverride);
    if(!LINE_TYPES.includes(type))continue;
    if(!styles[type])styles[type]={dashes:[],gaps:[],shorts:[]};
    if(Number.isFinite(item.dashPx)&&item.dashPx>0)styles[type].dashes.push(item.dashPx);
    if(Number.isFinite(item.shortPx)&&item.shortPx>0)styles[type].shorts.push(item.shortPx);
    if(Number.isFinite(item.gapPx)&&item.gapPx>0)styles[type].gaps.push(item.gapPx);
  }
  let d=pair(0,"SECTION")+pair(2,"HEADER")+pair(9,"$ACADVER")+pair(1,"AC1015")+
    pair(9,"$INSUNITS")+pair(70,insunits)+pair(9,"$LTSCALE")+pair(40,1)+
    pair(0,"ENDSEC")+pair(0,"SECTION")+pair(2,"TABLES")+
    pair(0,"TABLE")+pair(2,"LTYPE")+pair(100,"AcDbSymbolTable")+pair(70,1+Object.keys(styles).length)+
    pair(0,"LTYPE")+pair(100,"AcDbSymbolTableRecord")+pair(100,"AcDbLinetypeTableRecord")+pair(2,"CONTINUOUS")+pair(70,0)+pair(3,"Solid line")+pair(72,65)+pair(73,0)+pair(40,0);
  const linePatterns={};
  for(const [type,metrics] of Object.entries(styles)){
    // A consistent pattern per DXF linetype. Store observed periods in source-pixel units
    // as metadata; the exported pattern is correctly expressed in CAD drawing units.
    const dash=median(metrics.dashes)||20,gap=median(metrics.gaps)||10;
    const short=median(metrics.shorts)||dash/4;
    const pattern=linePattern({dashPx:dash,gapPx:gap,shortPx:short},type);
    linePatterns[type]={dashPx:dash,gapPx:gap,shortPx:short,patternPx:pattern};
    d+=makeLinetype(type,pattern.map(x=>x*unitsPerPixel));
  }
  d+=pair(0,"ENDTAB")+pair(0,"TABLE")+pair(2,"LAYER")+pair(100,"AcDbSymbolTable")+pair(70,names.length);
  for(const name of names)d+=pair(0,"LAYER")+pair(100,"AcDbSymbolTableRecord")+pair(100,"AcDbLayerTableRecord")+pair(2,name)+pair(70,0)+pair(62,indices[name]??7)+pair(6,"CONTINUOUS");
  d+=pair(0,"ENDTAB")+pair(0,"TABLE")+pair(2,"STYLE")+pair(100,"AcDbSymbolTable")+pair(70,1)+
    pair(0,"STYLE")+pair(100,"AcDbSymbolTableRecord")+pair(100,"AcDbTextStyleTableRecord")+
    pair(2,"SIMPLEX")+pair(70,0)+pair(40,0)+pair(41,1)+pair(50,0)+pair(71,0)+pair(42,textHeight)+pair(3,"simplex.shx")+pair(4,"")+
    pair(0,"ENDTAB")+pair(0,"ENDSEC")+pair(0,"SECTION")+pair(2,"ENTITIES");
  const map=p=>[originX+p[0]*unitsPerPixel,originY+(height-p[1])*unitsPerPixel];
  const counts=Object.fromEntries(LINE_TYPES.map(type=>[type,0])),geometryCount={solid:0,styled:0};let textCount=0;
  function addPath(path,linetype=null){
    if(!Array.isArray(path)||path.length<2)return false;
    const closed=path.length>3&&Math.hypot(path[0][0]-path.at(-1)[0],path[0][1]-path.at(-1)[1])<1e-7;
    const points=(closed?path.slice(0,-1):path).map(map);
    if(points.some(p=>!p.every(Number.isFinite)))throw Error("Path exceeds finite drawing coordinates");
    const suffix=linetype?pair(6,linetype):"";
    if(points.length===2){
      d+=pair(0,"LINE")+pair(100,"AcDbEntity")+pair(8,geometry)+suffix+pair(100,"AcDbLine")+coords(points[0][0],points[0][1])+
        pair(11,number(points[1][0]))+pair(21,number(points[1][1]));
    }else{
      d+=pair(0,"LWPOLYLINE")+pair(100,"AcDbEntity")+pair(8,geometry)+suffix+pair(100,"AcDbPolyline")+pair(90,points.length)+pair(70,closed?1:0);
      for(const point of points)d+=coords(point[0],point[1]);
    }
    return true;
  }
  for(const path of paths)if(addPath(path))geometryCount.solid++;
  for(const item of styledPaths){
    if(!item?.points)continue;
    const type=effectiveLineType(item,lineTypeOverride);
    if(!styles[type])throw Error("Unsupported styled path linetype");
    if(addPath(item.points,type)){geometryCount.styled++;counts[type]++;}
  }
  // Geometrically fitted circles are true editable CIRCLE objects, not a
  // circle-shaped collection of LINE and LWPOLYLINE segments.
  let circleCount=0;
  for(const circle of circles){
    if(!Array.isArray(circle?.center)||circle.center.length<2)continue;
    if(!Number.isFinite(circle.radius)||circle.radius<=0)continue;
    const center=map(circle.center),radius=circle.radius*unitsPerPixel;
    if(!center.every(Number.isFinite)||!Number.isFinite(radius))throw Error("Circle exceeds finite drawing coordinates");
    d+=pair(0,"CIRCLE")+pair(100,"AcDbEntity")+pair(8,geometry)+
      pair(100,"AcDbCircle")+coords(center[0],center[1])+
      pair(30,0)+pair(40,number(radius));
    circleCount++;
  }
  for(const arc of arcs){
    const center=map(arc.center);
    d+=pair(0,"ARC")+pair(100,"AcDbEntity")+pair(8,geometry)+pair(100,"AcDbCircle")+
      coords(...center)+pair(30,0)+pair(40,number(arc.radius*unitsPerPixel))+pair(100,"AcDbArc")+
      pair(50,number(arc.startAngle))+pair(51,number(arc.endAngle));
  }
  // Native non-associative HATCH supports SOLID, diagonal and dual-angle
  // patterns. The scanned pattern is measured in source pixels and expressed
  // in calibrated CAD model units.
  let hatchCount=0,solidHatchCount=0,crossHatchCount=0;
  for(const hatch of hatches){
    if(!Array.isArray(hatch?.boundary)||hatch.boundary.length<3)continue;
    const vertices=hatch.boundary.map(map);
    if(vertices.some(p=>!p.every(Number.isFinite)))throw Error("Hatch exceeds finite drawing coordinates");
    const solid=Boolean(hatch.solid);
    const patternLines=solid?[]:Array.isArray(hatch.patterns)&&hatch.patterns.length?
      hatch.patterns:[{angleDegrees:hatch.angleDegrees,spacingPx:hatch.spacingPx,
        origin:hatch.origin||hatch.boundary[0]}];
    if(!solid&&patternLines.some(p=>!Number.isFinite(p.angleDegrees)||
      !Number.isFinite(p.spacingPx)||p.spacingPx<=0))continue;
    const name=solid?"SOLID":patternLines.length>1?"AV_CROSS":"AV_SCAN";
    d+=pair(0,"HATCH")+pair(100,"AcDbEntity")+pair(8,hatched)+
      pair(100,"AcDbHatch")+pair(10,0)+pair(20,0)+pair(30,0)+
      pair(210,0)+pair(220,0)+pair(230,1)+
      pair(2,name)+pair(70,solid?1:0)+pair(71,0)+pair(91,1)+
      pair(92,3)+pair(72,0)+pair(73,1)+pair(93,vertices.length);
    for(const p of vertices)d+=coords(p[0],p[1]);
    d+=pair(97,0)+pair(75,0)+pair(76,0);
    if(!solid){
      d+=pair(52,0)+pair(41,1)+pair(77,0)+pair(78,patternLines.length);
      for(const pattern of patternLines){
        const angleRad=-pattern.angleDegrees*Math.PI/180;
        const spacing=pattern.spacingPx*unitsPerPixel;
        const origin=map(pattern.origin||hatch.boundary[0]);
        const deltaX=-Math.sin(angleRad)*spacing,deltaY=Math.cos(angleRad)*spacing;
        d+=pair(53,number(angleRad*180/Math.PI))+
          pair(43,number(origin[0]))+pair(44,number(origin[1]))+
          pair(45,number(deltaX))+pair(46,number(deltaY))+pair(79,0);
      }
    }
    d+=pair(98,0);hatchCount++;
    if(solid)solidHatchCount++;
    if(patternLines.length>1)crossHatchCount++;
  }
  for(const item of texts){
    const txt=clean(item.value).slice(0,240);if(!txt)continue;
    const pt=map([item.x,item.y]);
    d+=pair(0,"TEXT")+pair(100,"AcDbEntity")+pair(8,annotation)+pair(100,"AcDbText")+coords(pt[0],pt[1])+
      pair(40,number(textHeight))+pair(7,"SIMPLEX")+
      pair(1,txt.replace(/[^\x20-\x7e]/g,"?"))+pair(50,number(item.rotation||0))+pair(100,"AcDbText");
    textCount++;
  }
  d+=pair(0,"ENDSEC")+pair(0,"EOF");
  d=completeDrawing(d,insunits,{textHeight});
  const integrity=validateDxf(d);
  return {content:d,integrity,textStyle:"SIMPLEX",textHeight,textHeightInches,annotationScale,geometryCount:geometryCount.solid+geometryCount.styled+circleCount+arcs.length,textCount,circleCount,arcCount:arcs.length,
    styledCount:geometryCount.styled,lineTypes:Object.keys(styles),lineTypeCounts:counts,
    linePatterns,hatchCount,solidHatchCount,crossHatchCount,hatchLayer:hatched,layers:names,insunits};
}

// Fast, local pre-download checks; independent parser audit lives in tests/validate-dxf.py.
export function validateDxf(content){
  if(typeof content!=="string"||!content.endsWith("0\nEOF\n"))throw Error("DXF is truncated");
  const lines=content.trimEnd().split("\n");
  validateDrawingStructure(content);
  if(lines.length%2)throw Error("DXF has an incomplete group pair");
  let section=false,entities=false,count=0,record=[];
  const subclasses={LINE:"AcDbLine",LWPOLYLINE:"AcDbPolyline",TEXT:"AcDbText",CIRCLE:"AcDbCircle",ARC:"AcDbArc",HATCH:"AcDbHatch"};
  const check=()=>{
    if(!record.length)return;
    const type=record[0][1],required=subclasses[type];
    if(!required)throw Error("Unsupported DXF entity: "+type);
    if(!record.some(([c,v])=>c===100&&v==="AcDbEntity")||!record.some(([c,v])=>c===100&&v===required))throw Error("Missing DXF subclass for "+type);
    if(type==="LWPOLYLINE"&&Number(record.find(([c])=>c===90)?.[1])!==record.filter(([c])=>c===10).length)throw Error("DXF vertex count mismatch");
    count++;
  };
  for(let i=0;i<lines.length;i+=2){
    if(!/^\d+$/.test(lines[i]))throw Error("Invalid DXF group code");
    const c=Number(lines[i]),v=lines[i+1];
    if(((c>=10&&c<=59)||(c>=90&&c<=99))&&(!v.trim()||!Number.isFinite(Number(v))))throw Error("Invalid DXF numeric value");
    if(c===0&&v==="TABLE"){
      if(lines[i+2]!=="2"||!lines[i+3]?.trim())
        throw Error("DXF TABLE must begin with table name (code 2), before handle (code 5)");
      if(lines[i+4]!=="5"||!/^[0-9A-F]+$/i.test(lines[i+5]||""))
        throw Error("DXF TABLE is missing its handle after the table name");
      const start=lines[i+6]==="330"?i+8:i+6;
      if(lines[start]!=="100"||lines[start+1]!=="AcDbSymbolTable"||lines[start+2]!=="70")
        throw Error("Invalid DXF TABLE header");
    }
    if(c===0){
      if(entities){check();record=[];}
      if(v==="SECTION"){if(section)throw Error("Nested DXF section");section=true;entities=lines[i+3]==="ENTITIES";}
      else if(v==="ENDSEC"){if(!section)throw Error("Unexpected DXF section end");section=false;entities=false;}
      else if(entities)record.push([c,v]);
    }else if(entities&&record.length)record.push([c,v]);
  }
  if(section)throw Error("Unclosed DXF section");
  if(!count)throw Error("No drawable entities to export");
  return {valid:true,entityCount:count};
}
export function uniqueDxfName(name,used){
  const base=filenameBase(name);let stem=base,index=2;
  while(used.has(stem.toLowerCase()))stem=base+"-"+index++;
  used.add(stem.toLowerCase());return stem;
}
