// Minimal ASCII DXF R2000 writer, pixel-to-unit mapping, no DWG support.
const clean=v=>String(v??"").replace(/[\r\n\x00-\x1f]/g," ").trim();
const layerName=v=>clean(v).replace(/[<>\/\\":;?*|=,]/g,"_").slice(0,120)||"UNCLASSIFIED";
const pair=(k,v)=>String(k)+"\n"+String(v)+"\n";
const number=v=>Number.isFinite(+v)?String(Number((+v).toFixed(6))):"0";
const coords=(x,y)=>pair(10,number(x))+pair(20,number(y));
export function filenameBase(name){
  return String(name).replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"_").slice(0,80)||"drawing";
}
export function buildDxf({width,height,paths=[],texts=[],unitsPerPixel=1,geometryLayer="VEC-POLYLINES",
  textLayer="ANNO-TEXT",units="unitless",originX=0,originY=0}){
  if(!Number.isFinite(unitsPerPixel)||unitsPerPixel<=0)throw Error("Invalid calibration scale");
  const geometry=layerName(geometryLayer),annotation=layerName(textLayer);
  const names=[...new Set([geometry,annotation,"QA-REVIEW","UNCLASSIFIED"])];
  const indices={"QA-REVIEW":1,"ANNO-TEXT":2,"VEC-POLYLINES":4,"UNCLASSIFIED":7};
  const insunits={unitless:0,inches:1,feet:2,millimeters:4,centimeters:5,meters:6}[units]??0;
  let d=pair(0,"SECTION")+pair(2,"HEADER")+pair(9,"$ACADVER")+pair(1,"AC1015")+
    pair(9,"$INSUNITS")+pair(70,insunits)+pair(0,"ENDSEC")+pair(0,"SECTION")+pair(2,"TABLES")+
    pair(0,"TABLE")+pair(2,"LTYPE")+pair(70,1)+pair(0,"LTYPE")+pair(2,"CONTINUOUS")+pair(70,0)+pair(3,"Solid line")+pair(72,65)+pair(73,0)+pair(40,0)+pair(0,"ENDTAB")+
    pair(0,"TABLE")+pair(2,"LAYER")+pair(70,names.length);
  for(const name of names){d+=pair(0,"LAYER")+pair(2,name)+pair(70,0)+pair(62,indices[name]??7)+pair(6,"CONTINUOUS");}
  d+=pair(0,"ENDTAB")+pair(0,"ENDSEC")+pair(0,"SECTION")+pair(2,"ENTITIES");
  const map=p=>[originX+p[0]*unitsPerPixel,originY+(height-p[1])*unitsPerPixel];
  let geometryCount=0,textCount=0;
  for(const path of paths){
    if(!Array.isArray(path)||path.length<2)continue;
    const points=path.map(map);
    if(points.length===2){
      d+=pair(0,"LINE")+pair(8,geometry)+coords(points[0][0],points[0][1])+
        pair(11,number(points[1][0]))+pair(21,number(points[1][1]));
    }else{
      d+=pair(0,"LWPOLYLINE")+pair(8,geometry)+pair(90,points.length)+pair(70,0);
      for(const point of points)d+=coords(point[0],point[1]);
    }
    geometryCount++;
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
  return {content:d,geometryCount,textCount,layers:names,insunits};
}