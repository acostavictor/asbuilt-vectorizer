import {parseDimensionLabel} from './dimensions.js';
export function normalizeDimensionOcr(raw){
 const text=String(raw).trim();
 if(parseDimensionLabel(text))return {value:text,ocrInferred:false};
 const match=text.match(/^(\d{1,3})\s*-\s*(\d{1,2}(?:\s+\d+\/\d+)?)\s*"?$/);
 if(match){const value=match[1]+"'-"+match[2]+'"';if(parseDimensionLabel(value))return {value,ocrInferred:true};}
 return null;
}
export function suppressRulingLines(rgba,width,height,minRun=45){
 const ink=new Uint8Array(width*height),erase=new Uint8Array(width*height),out=new Uint8ClampedArray(rgba);
 for(let p=0;p<ink.length;p++)ink[p]=(.299*rgba[p*4]+.587*rgba[p*4+1]+.114*rgba[p*4+2])<200?1:0;
 for(let y=0;y<height;y++)for(let x=0;x<width;){
  if(!ink[y*width+x]){x++;continue;}const start=x;while(x<width&&ink[y*width+x])x++;
  if(x-start>=minRun)for(let k=start;k<x;k++)erase[y*width+k]=1;
 }
 for(let x=0;x<width;x++)for(let y=0;y<height;){
  if(!ink[y*width+x]){y++;continue;}const start=y;while(y<height&&ink[y*width+x])y++;
  if(y-start>=minRun)for(let k=start;k<y;k++)erase[k*width+x]=1;
 }
 for(let p=0;p<erase.length;p++)if(erase[p])out[p*4]=out[p*4+1]=out[p*4+2]=255;
 return out;
}
export function unrotateDimensionBox(box,width,height,direction){
 const corners=[[box.x0,box.y0],[box.x1,box.y0],[box.x1,box.y1],[box.x0,box.y1]]
  .map(([x,y])=>direction===90?[y,height-x]:[width-y,x]);
 return {x0:Math.min(...corners.map(p=>p[0])),y0:Math.min(...corners.map(p=>p[1])),x1:Math.max(...corners.map(p=>p[0])),y1:Math.max(...corners.map(p=>p[1]))};
}
export async function rotatedDimensionOcr(canvas,worker,createCanvas=()=>document.createElement('canvas')){
 const found=[],clean=createCanvas();clean.width=canvas.width;clean.height=canvas.height;
 const cleanCtx=clean.getContext('2d');cleanCtx.drawImage(canvas,0,0);
 if(cleanCtx.getImageData){const pixels=cleanCtx.getImageData(0,0,canvas.width,canvas.height);pixels.data.set(suppressRulingLines(pixels.data,canvas.width,canvas.height));cleanCtx.putImageData(pixels,0,0);}
 for(const [direction,source] of [[0,clean],[90,clean],[-90,clean],[90,canvas],[-90,canvas]]){
  const rotated=createCanvas();rotated.width=direction?canvas.height:canvas.width;rotated.height=direction?canvas.width:canvas.height;
  const ctx=rotated.getContext('2d');
  if(direction===90){ctx.translate(canvas.height,0);ctx.rotate(Math.PI/2);}else if(direction===-90){ctx.translate(0,canvas.width);ctx.rotate(-Math.PI/2);}
  ctx.drawImage(source,0,0);
  const response=await worker.recognize(rotated,{}, {blocks:true});
  for(const block of response.data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
   const value=(line.text||(line.words||[]).map(w=>w.text).join(' ')).trim();
   const normalized=normalizeDimensionOcr(value),confidence=line.confidence??line.conf??100;
   if(!normalized||!line.bbox||confidence<20)continue;
   const bbox=direction?unrotateDimensionBox(line.bbox,canvas.width,canvas.height,direction):{...line.bbox};
   found.push({...normalized,rawOcrValue:value,confidence,x:bbox.x0,y:bbox.y1,height:Math.max(3,line.bbox.y1-line.bbox.y0),bbox,rotation:direction,native:false});
  }
  rotated.width=rotated.height=0;
 }
 // Competing readings at the same location are one finding, not two dimensions.
 const selected=[];
 for(const item of found){
  const box=item.bbox;
  const overlap=selected.findIndex(other=>{
   const b=other.bbox,area=Math.max(0,Math.min(box.x1,b.x1)-Math.max(box.x0,b.x0))*Math.max(0,Math.min(box.y1,b.y1)-Math.max(box.y0,b.y0));
   return area/Math.max(1,Math.min((box.x1-box.x0)*(box.y1-box.y0),(b.x1-b.x0)*(b.y1-b.y0)))>.6;
  });
  if(overlap<0)selected.push(item);else if(item.confidence>selected[overlap].confidence)selected[overlap]=item;
 }
 return selected;
}
