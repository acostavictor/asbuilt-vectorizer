// High-resolution tiled raster processing helpers. No network requests.
export function normalizeRoi(roi,width,height){
  if(!roi)return {x0:0,y0:0,x1:width,y1:height};
  const x0=Math.max(0,Math.min(width,Math.floor(Math.min(roi.x0,roi.x1)*width)));
  const x1=Math.max(0,Math.min(width,Math.ceil(Math.max(roi.x0,roi.x1)*width)));
  const y0=Math.max(0,Math.min(height,Math.floor(Math.min(roi.y0,roi.y1)*height)));
  const y1=Math.max(0,Math.min(height,Math.ceil(Math.max(roi.y0,roi.y1)*height)));
  if(x1-x0<4||y1-y0<4)throw Error("Drawing region is too small");
  return {x0,y0,x1,y1};
}
export function planTiles(width,height,{tileSize=1024,overlap=48,roi=null,maxTiles=600}={}){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)throw Error("Invalid drawing size");
  const area=normalizeRoi(roi,width,height);
  const tiles=[];
  for(let y=0;y<height;y+=tileSize)for(let x=0;x<width;x+=tileSize){
    const core={x0:x,y0:y,x1:Math.min(width,x+tileSize),y1:Math.min(height,y+tileSize)};
    if(core.x0>=area.x1||core.x1<=area.x0||core.y0>=area.y1||core.y1<=area.y0)continue;
    const left=Math.max(0,core.x0-overlap),top=Math.max(0,core.y0-overlap);
    const right=Math.min(width,core.x1+overlap),bottom=Math.min(height,core.y1+overlap);
    tiles.push({...core,left,top,width:right-left,height:bottom-top});
    if(tiles.length>maxTiles)throw Error("Too many tiles at this DPI. Lower the resolution or select a smaller drawing area.");
  }
  return {tiles,area,width,height};
}
// Liang-Barsky clipping; works on scan-global pixel coordinates.
export function clipSegment(a,b,r){
  let t0=0,t1=1;
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const p=[-dx,dx,-dy,dy],q=[a[0]-r.x0,r.x1-a[0],a[1]-r.y0,r.y1-a[1]];
  for(let j=0;j<4;j++){
    if(Math.abs(p[j])<1e-12){if(q[j]<0)return null;continue;}
    const t=q[j]/p[j];
    if(p[j]<0){t0=Math.max(t0,t);}else{t1=Math.min(t1,t);}
    if(t0>t1)return null;
  }
  return [[a[0]+dx*t0,a[1]+dy*t0],[a[0]+dx*t1,a[1]+dy*t1]];
}
function near(a,b){return Math.abs(a[0]-b[0])<1e-5&&Math.abs(a[1]-b[1])<1e-5;}
export function clipPolyline(path,rect){
  const result=[];let current=[];
  for(let i=1;i<path.length;i++){
    const pair=clipSegment(path[i-1],path[i],rect);
    if(!pair){if(current.length>=2)result.push(current);current=[];continue;}
    const [a,b]=pair;if(near(a,b))continue;
    if(current.length&&near(current[current.length-1],a)){current.push(b);}
    else{if(current.length>=2)result.push(current);current=[a,b];}
  }
  if(current.length>=2)result.push(current);
  return result;
}
export function clipToTileAndRoi(path,tile,roi){
  const r={x0:Math.max(tile.x0,roi.x0),y0:Math.max(tile.y0,roi.y0),
    x1:Math.min(tile.x1,roi.x1),y1:Math.min(tile.y1,roi.y1)};
  if(r.x1<=r.x0||r.y1<=r.y0)return [];
  return clipPolyline(path,r);
}
export function isEditorWatermark(items){
  const values=items.map(x=>String(x.str||x.value||"").trim()).filter(Boolean);
  if(values.length<40)return false;
  const buying=values.filter(x=>/click\s+to\s+buy\s+now/i.test(x)).length;
  const isolated=values.filter(x=>x.length===1).length/values.length;
  return buying>=2&&isolated>.60;
}
export function looksLikeEditorUrl(url){
  return /(?:^|[/.])tracker-software\.com(?:[/:?]|$)/i.test(String(url||""));
}
export function overlaps(a,b){
  return a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
}
export function dedupeText(texts,tolerance=10){
  const result=[],seen=new Set();
  for(const t of texts){
    if(!t.value?.trim())continue;
    const key=t.value.trim().toLowerCase().replace(/\s+/g," ");
    const x=Math.round(t.x/tolerance),y=Math.round(t.y/tolerance);
    const nearText=[-1,0,1].some(dx=>[-1,0,1].some(dy=>seen.has(key+":"+(x+dx)+":"+(y+dy))));
    if(nearText)continue;
    seen.add(key+":"+x+":"+y);result.push(t);
  }
  return result;
}
