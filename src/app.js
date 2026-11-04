import {buildDxf,filenameBase} from "./dxf.js";
import {planTiles,normalizeRoi,clipToTileAndRoi,isEditorWatermark,looksLikeEditorUrl,overlaps,dedupeText} from "./tile-engine.js";

const $=id=>document.getElementById(id);
const state={sheets:[],selected:-1,busy:false,view:"overlay",calibration:null,pdfjs:null,ocrWorker:null,worker:null,
  token:0,workerId:0,pending:new Map(),cropping:null};
const MAX_SHEETS=50,MAX_RENDER_PIXELS=3200000;
const presets={
  generic:["VEC-POLYLINES","ANNO-TEXT"],civil:["C-UNCLASSIFIED","C-ANNO"],
  architecture:["A-UNCLASSIFIED","A-ANNO"],structure:["S-UNCLASSIFIED","S-ANNO"],
  mep:["M-UNCLASSIFIED","M-ANNO"]
};
const escapeName=name=>String(name).replace(/\.[^.]+$/,"");
function status(message){$("jobStatus").textContent=message;}
function busy(value){
  state.busy=value;
  ["processSelected","processAll","exportSelected","exportZip","clear"].forEach(id=>$(id).disabled=value);
  refreshButtons();
}
function refreshButtons(){
  const active=state.sheets[state.selected],converted=state.sheets.filter(s=>s.status==="done").length;
  $("processSelected").disabled=state.busy||!active;
  $("processAll").disabled=state.busy||!state.sheets.length;
  $("exportSelected").disabled=state.busy||!active||active.status!=="done";
  $("exportZip").disabled=state.busy||!converted;
  $("clear").disabled=state.busy||!state.sheets.length;
  $("sheetCount").textContent="("+state.sheets.length+"/"+MAX_SHEETS+")";
}
function updateList(){
  const host=$("sheetList");host.replaceChildren();
  if(!state.sheets.length){const empty=document.createElement("div");empty.className="empty";
    empty.style.minHeight="110px";empty.textContent="No files loaded";host.append(empty);refreshButtons();return;}
  for(let i=0;i<state.sheets.length;i++){
    const s=state.sheets[i],btn=document.createElement("button");btn.type="button";
    btn.className="sheet"+(i===state.selected?" active":"");
    const left=document.createElement("span");left.className="sheetname";left.textContent=s.name;
    const meta=document.createElement("span");meta.className="sheetmeta";meta.textContent=s.type==="pdf"?"PDF":"IMAGE";
    const pill=document.createElement("span");pill.className="chip "+(s.status==="done"?"done":s.status==="error"?"error":"");
    pill.textContent=s.status==="done"?"Converted":s.status==="running"?"Processing":s.status==="error"?"Error":"Pending";
    btn.append(left,meta,pill);btn.addEventListener("click",()=>selectSheet(i));host.append(btn);
  }
  refreshButtons();
}
async function ensurePdf(){
  if(!state.pdfjs){
    const library=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs");
    library.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs";
    state.pdfjs=library;
  }
  return state.pdfjs;
}
function blankSheet(file,name,type,extra={}){
  return {file,name,type,status:"pending",paths:[],texts:[],width:0,height:0,
    scale:1,calibrated:false,units:"unitless",roi:null,processingDpi:null,tilesProcessed:0,watermarkDetected:false,geometryLayer:presets[$("preset").value][0],
    textLayer:presets[$("preset").value][1],warning:"",...extra};
}
async function ingest(files){
  if(state.busy)return;
  busy(true);
  let rejected=0;const errors=[];
  try{
    for(const file of files){
      if(state.sheets.length>=MAX_SHEETS){rejected++;continue;}
      const pdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
      const image=file.type.startsWith("image/")||/\.(png|jpe?g)$/i.test(file.name);
      if(!pdf&&!image){errors.push(file.name+" (unsupported format)");continue;}
      if(!pdf){state.sheets.push(blankSheet(file,file.name,"image"));continue;}
      try{
        status("Reading pages: "+file.name);
        const pdfjs=await ensurePdf();
        const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
        for(let page=1;page<=doc.numPages&&state.sheets.length<MAX_SHEETS;page++){
          const suffix=doc.numPages===1?"":" - p"+String(page).padStart(2,"0");
          state.sheets.push(blankSheet(file,escapeName(file.name)+suffix+".pdf","pdf",{document:doc,page}));
        }
        if(state.sheets.length>=MAX_SHEETS&&doc.numPages>1)rejected++;
      }catch(e){errors.push(file.name+": "+(e?.message||String(e)));}
    }
  }finally{busy(false);}
  updateList();
  if(state.selected<0&&state.sheets.length)await selectSheet(0);
  status(state.sheets.length+" sheets ready."+(rejected?" Additional sheets exceeded the 50-sheet limit.":"")+
    (errors.length?" Errors: "+errors.slice(0,2).join("; "):"")+" Files remain in this browser.");
}
async function renderSheet(sheet){
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(sheet.type==="pdf"){
    const page=await sheet.document.getPage(sheet.page),base=page.getViewport({scale:1});
    const scale=Math.min(2.4,Math.sqrt(MAX_RENDER_PIXELS/(base.width*base.height)));
    const viewport=page.getViewport({scale});
    canvas.width=Math.max(1,Math.round(viewport.width));
    canvas.height=Math.max(1,Math.round(viewport.height));
    await page.render({canvasContext:ctx,viewport}).promise;
    let nativeTexts=[];
    try{
      const content=await page.getTextContent();
      for(const item of content.items){
        if(!item.str?.trim()||!item.transform)continue;
        const matrix=state.pdfjs.Util.transform(viewport.transform,item.transform);
        const x=matrix[4],y=matrix[5],h=Math.max(3,Math.hypot(matrix[2],matrix[3]));
        if(!Number.isFinite(x)||!Number.isFinite(y))continue;
        nativeTexts.push({value:item.str.trim(),x,y,height:h,
          bbox:{x0:x-2,y0:y-h-2,x1:x+Math.max(h,item.width*scale),y1:y+3},native:true});
      }
    }catch(e){console.warn("Could not extract PDF text:",e);}
    page.cleanup();
    return {canvas,nativeTexts};
  }
  const bmp=await createImageBitmap(sheet.file),ratio=Math.min(1,Math.sqrt(MAX_RENDER_PIXELS/(bmp.width*bmp.height)));
  canvas.width=Math.max(1,Math.round(bmp.width*ratio));
  canvas.height=Math.max(1,Math.round(bmp.height*ratio));
  ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();
  return {canvas,nativeTexts:[]};
}
async function getOcrWorker(){
  if(!window.Tesseract)throw Error("OCR library unavailable. Check your network connection.");
  if(!state.ocrWorker){
    status("Downloading local OCR language model (first use may take longer)...");
    state.ocrWorker=await window.Tesseract.createWorker("eng",1,{
      logger:m=>{if(m.status==="recognizing text")status("OCR: "+Math.round((m.progress||0)*100)+"%");}
    });
  }
  return state.ocrWorker;
}
async function readOcr(canvas){
  const worker=await getOcrWorker();
  const response=await worker.recognize(canvas,{}, {blocks:true});
  const results=[];
  for(const block of response.data.blocks||[]){
    for(const paragraph of block.paragraphs||[]){
      for(const line of paragraph.lines||[]){
        const text=(line.text||(line.words||[]).map(w=>w.text).join(" ")).trim();
        const box=line.bbox,confidence=line.confidence??line.conf??100;
        if(!box||!text||confidence<35)continue;
        results.push({value:text,x:box.x0,y:box.y1,height:Math.max(3,box.y1-box.y0),
          bbox:{x0:box.x0,y0:box.y0,x1:box.x1,y1:box.y1},native:false});
      }
    }
  }
  return results;
}
function getVectorWorker(){
  if(state.worker)return state.worker;
  const worker=new Worker(new URL("./vector-worker.js",import.meta.url),{type:"module"});
  worker.onmessage=event=>{
    const {id,result,error}=event.data,pending=state.pending.get(id);if(!pending)return;
    state.pending.delete(id);
    if(error)pending.reject(Error(error));else pending.resolve(result);
  };
  worker.onerror=event=>{
    for(const pending of state.pending.values())pending.reject(Error(event.message||"Raster worker failure"));
    state.pending.clear();
  };
  state.worker=worker;return worker;
}
function trace(canvas,options){
  return new Promise((resolve,reject)=>{
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const image=ctx.getImageData(0,0,canvas.width,canvas.height),id=++state.workerId;
    state.pending.set(id,{resolve,reject});
    try{
      getVectorWorker().postMessage({id,pixels:image.data.buffer,width:canvas.width,height:canvas.height,options},[image.data.buffer]);
    }catch(e){state.pending.delete(id);reject(e);}
  });
}
async function makeTileSource(sheet,dpi){
  if(sheet.type==="pdf"){
    const page=await sheet.document.getPage(sheet.page);
    const viewport=page.getViewport({scale:dpi/72});
    const width=Math.max(1,Math.round(viewport.width)),height=Math.max(1,Math.round(viewport.height));
    const watermarkZones=[];
    let nativeTexts=[],watermarkDetected=false;
    try{
      const annotations=await page.getAnnotations({intent:"display"});
      for(const item of annotations){
        const url=item.url||item.unsafeUrl||"";
        if(!looksLikeEditorUrl(url)||!item.rect)continue;
        const rect=viewport.convertToViewportRectangle(item.rect);
        watermarkZones.push({x0:Math.min(rect[0],rect[2]),y0:Math.min(rect[1],rect[3]),
          x1:Math.max(rect[0],rect[2]),y1:Math.max(rect[1],rect[3])});
      }
      const content=await page.getTextContent();
      watermarkDetected=isEditorWatermark(content.items)||watermarkZones.length>=2;
      const discardAllNative=$("removeWatermark").checked&&isEditorWatermark(content.items);
      if(!discardAllNative)for(const item of content.items){
        if(!item.str?.trim()||!item.transform)continue;
        if($("removeWatermark").checked&&/click\s+to\s+buy\s+now/i.test(item.str))continue;
        const matrix=state.pdfjs.Util.transform(viewport.transform,item.transform);
        const x=matrix[4],y=matrix[5],h=Math.max(3,Math.hypot(matrix[2],matrix[3]));
        const bbox={x0:x-2,y0:y-h-2,x1:x+Math.max(h,(item.width||0)*dpi/72),y1:y+3};
        if(!Number.isFinite(x)||!Number.isFinite(y))continue;
        if($("removeWatermark").checked&&watermarkZones.some(zone=>overlaps(zone,bbox)))continue;
        nativeTexts.push({value:item.str.trim(),x,y,height:h,bbox,native:true});
      }
    }catch(e){console.warn("PDF text/watermark inspection failed:",e);}
    return {width,height,nativeTexts,watermarkDetected,
      async render(tile){
        const canvas=document.createElement("canvas");
        canvas.width=tile.width;canvas.height=tile.height;
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        // PDF.js draws in sheet-wide viewport coordinates shifted to the tile.
        await page.render({canvasContext:ctx,viewport,transform:[1,0,0,1,-tile.left,-tile.top],
          background:"#FFFFFF"}).promise;
        if($("removeWatermark").checked){
          ctx.fillStyle="#FFFFFF";
          for(const zone of watermarkZones){
            if(zone.x1<tile.left||zone.x0>tile.left+tile.width||zone.y1<tile.top||zone.y0>tile.top+tile.height)continue;
            ctx.fillRect(zone.x0-tile.left-2,zone.y0-tile.top-2,
              zone.x1-zone.x0+4,zone.y1-zone.y0+4);
          }
        }
        return canvas;
      },
      close(){page.cleanup();}
    };
  }
  const bitmap=await createImageBitmap(sheet.file);
  if(bitmap.width*bitmap.height>160000000){bitmap.close();throw Error("Image exceeds the 160 MP local processing limit");}
  return {width:bitmap.width,height:bitmap.height,nativeTexts:[],watermarkDetected:false,
    async render(tile){
      const canvas=document.createElement("canvas");canvas.width=tile.width;canvas.height=tile.height;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      ctx.fillStyle="#FFFFFF";ctx.fillRect(0,0,tile.width,tile.height);
      ctx.drawImage(bitmap,tile.left,tile.top,tile.width,tile.height,0,0,tile.width,tile.height);
      return canvas;
    },
    close(){bitmap.close();}
  };
}
async function convertSheet(i){
  const s=state.sheets[i];s.status="running";s.warning="";updateList();
  let source;
  try{
    const dpi=Number($("dpi").value)||150;
    status("Preparing high-resolution tiles for "+s.name+"...");
    source=await makeTileSource(s,dpi);
    const {tiles,area}=planTiles(source.width,source.height,
      {tileSize:1024,overlap:48,roi:s.roi,maxTiles:600});
    const previousWidth=s.width;
    const texts=source.nativeTexts.filter(t=>overlaps(t.bbox,area));
    const paths=[];let truncatedTiles=0,nonConvergedTiles=0;
    for(let t=0;t<tiles.length;t++){
      const tile=tiles[t];
      status("Processing "+s.name+": tile "+(t+1)+"/"+tiles.length+
        ($("ocr").checked?" (OCR enabled)":""));
      const canvas=await source.render(tile);
      const nativeTileTexts=texts.filter(x=>x.x>=tile.left&&x.x<tile.left+tile.width&&
        x.y>=tile.top&&x.y<tile.top+tile.height);
      const tileTexts=[];
      if($("ocr").checked){
        try{
          const found=await readOcr(canvas);
          for(const item of found){
            const gx=item.x+tile.left,gy=item.y+tile.top;
            if(gx<tile.x0||gx>=tile.x1||gy<tile.y0||gy>=tile.y1)continue;
            if(gx<area.x0||gx>=area.x1||gy<area.y0||gy>=area.y1)continue;
            if(nativeTileTexts.some(n=>Math.hypot(n.x-gx,n.y-gy)<Math.max(12,item.height)))continue;
            tileTexts.push({...item,x:gx,y:gy,
              bbox:{x0:item.bbox.x0+tile.left,y0:item.bbox.y0+tile.top,
                x1:item.bbox.x1+tile.left,y1:item.bbox.y1+tile.top}});
          }
        }catch(e){throw Error("Local OCR failed: "+e.message);}
      }
      texts.push(...tileTexts);
      const masks=nativeTileTexts.concat(tileTexts).map(x=>({
        x0:x.bbox.x0-tile.left,y0:x.bbox.y0-tile.top,
        x1:x.bbox.x1-tile.left,y1:x.bbox.y1-tile.top
      }));
      const options={threshold:$("threshold").value==="auto"?null:Number($("threshold").value),
        minLength:Math.max(4,Number($("minLength").value)||17),
        epsilon:Math.max(.2,Number($("epsilon").value)||1.6),maxPaths:12000,masks};
      const result=await trace(canvas,options);
      if(result.truncated)truncatedTiles++;
      if(!result.thinningConverged)nonConvergedTiles++;
      for(const path of result.paths){
        const global=path.map(p=>[p[0]+tile.left,p[1]+tile.top]);
        paths.push(...clipToTileAndRoi(global,tile,area));
      }
      canvas.width=canvas.height=0;
      $("progress").style.width=Math.round(100*(t+1)/tiles.length)+"%";
      // Yield so the UI can repaint and browser controls remain responsive.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    s.paths=paths;s.texts=dedupeText(texts);s.width=source.width;s.height=source.height;
    if(previousWidth>0&&s.calibrated)s.scale*=previousWidth/source.width;
    s.watermarkDetected=source.watermarkDetected;s.processingDpi=s.type==="pdf"?dpi:null;
    s.tilesProcessed=tiles.length;s.status="done";
    s.warning=(truncatedTiles?truncatedTiles+" tiles reached the vector cap. ":"")+
      (nonConvergedTiles?nonConvergedTiles+" tiles did not fully thin. ":"")+
      (source.watermarkDetected?"PDF-XChange overlay detected"+($("removeWatermark").checked?" and filtered. ":". "):"")+
      (!s.calibrated?"Output is not calibrated. ":"");
  }catch(e){s.status="error";s.warning=e?.message||String(e);console.error("Conversion error",e);}
  finally{if(source)source.close();}
  updateList();
  if(i===state.selected)await selectSheet(i,true);
}
function applySheetSettings(){
  const sheet=state.sheets[state.selected];if(!sheet)return;
  $("scale").value=sheet.scale;$("units").value=sheet.units;
  $("geometryLayer").value=sheet.geometryLayer;$("textLayer").value=sheet.textLayer;
}
async function selectSheet(i,force=false){
  if(i<0||i>=state.sheets.length)return;
  state.selected=i;state.calibration=null;state.cropping=null;
  $("canvaswrap").classList.remove("calibrating");$("calibrate").textContent="Select 2 points";$("crop").textContent="Select drawing area";
  const s=state.sheets[i];applySheetSettings();updateList();$("previewTitle").textContent=s.name;
  const token=++state.token;
  if(!force&&s.previewToken===token)return;
  try{
    const {canvas}=await renderSheet(s);if(token!==state.token)return;
    const original=$("imageCanvas"),vectors=$("vectorCanvas");
    original.width=vectors.width=canvas.width;original.height=vectors.height=canvas.height;
    original.getContext("2d").drawImage(canvas,0,0);
    const box=$("canvaswrap"),stage=$("stage");
    const maxWidth=Math.max(230,box.clientWidth-44),displayWidth=Math.min(canvas.width,maxWidth);
    stage.style.width=displayWidth+"px";stage.style.height=(displayWidth*canvas.height/canvas.width)+"px";
    original.style.width=vectors.style.width="100%";
    original.style.height=vectors.style.height="100%";
    stage.hidden=false;$("empty").hidden=true;
    drawVectors();updateStats();
  }catch(e){if(token===state.token)status("Preview error: "+(e?.message||e));}
}
function updateStats(){
  const s=state.sheets[state.selected];if(!s)return;
  $("previewStats").textContent=(s.paths.length||0)+" vectors · "+(s.texts.length||0)+" text entities · "+s.status+
    (s.tilesProcessed?" · "+s.tilesProcessed+" tiles":"")+
    (s.processingDpi?" · "+s.processingDpi+" DPI":"")+
    (s.warning?" · "+s.warning:"");
  $("cropHint").textContent=s.roi?
    "Drawing area selected. Only that region will be traced. Reconvert after changes.":
    "Optional: choose two opposite corners of the drawing to exclude borders or title blocks.";
  $("coordinateStatus").textContent=(s.calibrated?"Calibrated":"UNCALIBRATED")+" · "+s.units+
    " · "+Number(s.scale).toPrecision(5)+" drawing units/pixel · page-relative origin";
  $("calibrationHint").textContent=s.calibrated?
    "Scale set for this sheet. Confirm a second independent dimension before use.":
    "This sheet is not calibrated. Click two known-distance endpoints to set scale.";
}
function drawVectors(){
  const s=state.sheets[state.selected],canvas=$("vectorCanvas");
  if(!s||!canvas.width)return;
  const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  if(s.width>0&&s.height>0)ctx.scale(canvas.width/s.width,canvas.height/s.height);
  ctx.strokeStyle="#1261ed";ctx.lineWidth=1.5;ctx.lineJoin="round";
  for(const path of s.paths){
    if(path.length<2)continue;ctx.beginPath();ctx.moveTo(path[0][0],path[0][1]);
    for(let j=1;j<path.length;j++)ctx.lineTo(path[j][0],path[j][1]);ctx.stroke();
  }
  ctx.strokeStyle="#00a88f";ctx.lineWidth=1;
  for(const item of s.texts){
    if(item.bbox){const b=item.bbox;ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);}
  }
  ctx.restore();
  if(s.roi){
    ctx.save();ctx.strokeStyle="#ed9415";ctx.lineWidth=2;ctx.setLineDash([9,5]);
    ctx.strokeRect(s.roi.x0*canvas.width,s.roi.y0*canvas.height,
      (s.roi.x1-s.roi.x0)*canvas.width,(s.roi.y1-s.roi.y0)*canvas.height);
    ctx.restore();
  }
  if(state.cropping?.points?.length===1){
    const p=state.cropping.points[0];
    ctx.strokeStyle="#ed9415";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(p[0]*canvas.width-10,p[1]*canvas.height);
    ctx.lineTo(p[0]*canvas.width+10,p[1]*canvas.height);
    ctx.moveTo(p[0]*canvas.width,p[1]*canvas.height-10);
    ctx.lineTo(p[0]*canvas.width,p[1]*canvas.height+10);ctx.stroke();
  }
  const mode=state.view;
  $("imageCanvas").style.opacity=mode==="vector"?"0":mode==="overlay"?"0.55":"1";
  canvas.style.display=mode==="original"?"none":"block";
}
function setView(view){
  state.view=view;document.querySelectorAll("#viewTabs button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));drawVectors();
}
function makeDxf(s){
  if(s.status!=="done")throw Error("Sheet must be converted first");
  return buildDxf({width:s.width,height:s.height,paths:s.paths,texts:s.texts,
    unitsPerPixel:s.scale,units:s.units,geometryLayer:s.geometryLayer,textLayer:s.textLayer});
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function exportSelected(){
  const s=state.sheets[state.selected];if(!s||s.status!=="done")return;
  try{
    const output=makeDxf(s);
    download(new Blob([output.content],{type:"application/dxf"}),filenameBase(s.name)+".dxf");
    status("Downloaded "+filenameBase(s.name)+".dxf. Verify it in AutoCAD/Civil 3D.");
  }catch(e){status("Export error: "+e.message);}
}
async function exportZip(){
  if(!window.JSZip){status("ZIP library unavailable. Check your network connection.");return;}
  const completed=state.sheets.filter(s=>s.status==="done");if(!completed.length)return;
  busy(true);
  try{
    status("Packaging "+completed.length+" DXF files...");
    const zip=new window.JSZip(),manifest=[];
    for(const s of completed){
      const output=makeDxf(s),name=filenameBase(s.name)+".dxf";
      zip.file(name,output.content);
      manifest.push({name:s.name,output:name,entities:output.geometryCount,texts:output.textCount,
        layers:output.layers,units:s.units,calibrated:s.calibrated,unitsPerPixel:s.scale,
        pageRelativeCoordinates:true,processingDpi:s.processingDpi,tilesProcessed:s.tilesProcessed,
        drawingArea:s.roi,watermarkDetected:s.watermarkDetected,
        warning:s.warning||"Manual QA required"});
    }
    zip.file("QA-manifest.json",JSON.stringify({
      product:"AsBuilt Vectorizer",status:"experimental",generatedAt:new Date().toISOString(),
      warning:"This is unverified centerline tracing. Drawings are not engineering-certified or georeferenced.",
      drawings:manifest},null,2));
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    download(blob,"asbuilt-vectorizer-dxf-batch.zip");
    status("Downloaded "+completed.length+" DXFs and QA manifest.");
  }catch(e){status("ZIP export error: "+e.message);}finally{busy(false);}
}
async function processIndices(indices){
  if(state.busy)return;busy(true);
  try{
    for(let i=0;i<indices.length;i++){
      const index=indices[i];$("progress").style.width=Math.round(100*i/indices.length)+"%";
      await convertSheet(index);
    }
    $("progress").style.width="100%";
    const success=indices.filter(i=>state.sheets[i].status==="done").length;
    status(success+" of "+indices.length+" sheets converted. Review and calibrate before export.");
  }finally{busy(false);}
}
function syncValue(id,key,validate=null){
  $(id).addEventListener("change",()=>{
    const s=state.sheets[state.selected];if(!s)return;
    const value=$(id).value;
    if(validate&&!validate(value)){status("Invalid value for "+id);$(id).value=s[key];return;}
    s[key]=id==="scale"?Number(value):value;
    if(id==="scale")s.calibrated=true;
    updateStats();
  });
}
$("files").addEventListener("change",e=>{ingest([...e.target.files]);e.target.value="";});
const drop=$("drop");
drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("drag");});
drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag");ingest([...e.dataTransfer.files]);});
$("processSelected").addEventListener("click",()=>processIndices([state.selected]));
$("processAll").addEventListener("click",()=>processIndices(state.sheets.map((_,i)=>i)));
$("exportSelected").addEventListener("click",exportSelected);
$("exportZip").addEventListener("click",exportZip);
$("clear").addEventListener("click",()=>{
  if(state.busy)return;state.sheets=[];state.selected=-1;state.token++;state.calibration=null;
  $("stage").hidden=true;$("empty").hidden=false;$("previewTitle").textContent="Drawing preview";
  $("previewStats").textContent="No sheet selected";$("progress").style.width="0";status("Files cleared from this page.");
  updateList();
});
$("viewTabs").addEventListener("click",e=>{const view=e.target?.dataset?.view;if(view)setView(view);});
$("preset").addEventListener("change",()=>{
  const s=state.sheets[state.selected];if(!s)return;
  [s.geometryLayer,s.textLayer]=presets[$("preset").value];applySheetSettings();updateStats();
});
syncValue("geometryLayer","geometryLayer",v=>!!v.trim());
syncValue("textLayer","textLayer",v=>!!v.trim());
syncValue("units","units");
syncValue("scale","scale",v=>Number.isFinite(Number(v))&&Number(v)>0);
$("calibrate").addEventListener("click",()=>{
  const s=state.sheets[state.selected],known=Number($("distance").value);
  if(!s||!s.width){status("Load a drawing preview first.");return;}
  if(!Number.isFinite(known)||known<=0){status("Enter a positive known distance, in the selected drawing units.");return;}
  state.calibration={points:[],known};
  $("canvaswrap").classList.add("calibrating");$("calibrate").textContent="Click point 1 on drawing";
  status("Calibration: click the first point, then the second point of the known distance.");
});
function invalidateConversion(s){
  if(s.status==="done"||s.status==="error"){
    s.status="pending";s.paths=[];s.texts=[];s.warning="Drawing area changed; reconvert this sheet.";
    s.tilesProcessed=0;s.processingDpi=null;updateList();
  }
}
$("crop").addEventListener("click",()=>{
  const s=state.sheets[state.selected];if(!s)return;
  state.calibration=null;state.cropping={points:[]};
  $("calibrate").textContent="Select 2 points";$("crop").textContent="Click first corner";
  $("canvaswrap").classList.add("calibrating");
  status("Select two opposite corners of the engineering drawing in the preview.");
});
$("clearCrop").addEventListener("click",()=>{
  const s=state.sheets[state.selected];if(!s)return;
  s.roi=null;state.cropping=null;
  $("crop").textContent="Select drawing area";$("canvaswrap").classList.remove("calibrating");
  invalidateConversion(s);drawVectors();updateStats();status("Drawing area cleared. Reconvert for full-sheet output.");
});
$("stage").addEventListener("click",e=>{
  if(!state.calibration&&!state.cropping)return;
  const rect=$("stage").getBoundingClientRect(),s=state.sheets[state.selected];
  const nx=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
  const ny=Math.min(1,Math.max(0,(e.clientY-rect.top)/rect.height));
  if(!Number.isFinite(nx)||!Number.isFinite(ny))return;
  if(state.cropping){
    state.cropping.points.push([nx,ny]);
    if(state.cropping.points.length===1){$("crop").textContent="Click opposite corner";drawVectors();return;}
    const [a,b]=state.cropping.points,roi={
      x0:Math.min(a[0],b[0]),y0:Math.min(a[1],b[1]),
      x1:Math.max(a[0],b[0]),y1:Math.max(a[1],b[1])
    };
    if((roi.x1-roi.x0)<.01||(roi.y1-roi.y0)<.01){
      status("Selected area is too small. Please try again.");
    }else{s.roi=roi;invalidateConversion(s);status("Drawing area selected. Convert again to apply.");}
    state.cropping=null;$("canvaswrap").classList.remove("calibrating");
    $("crop").textContent="Select drawing area";drawVectors();updateStats();return;
  }
  if(!s.width||!s.height){status("Convert the sheet before calibrating its scale.");return;}
  const x=nx*s.width,y=ny*s.height;
  state.calibration.points.push([x,y]);
  if(state.calibration.points.length===1){$("calibrate").textContent="Click point 2 on drawing";return;}
  const [a,b]=state.calibration.points,pixels=Math.hypot(a[0]-b[0],a[1]-b[1]);
  if(pixels<2){status("Points too close; try calibration again.");}
  else{s.scale=state.calibration.known/pixels;s.calibrated=true;applySheetSettings();
    status("Calibrated "+s.name+": "+s.scale.toPrecision(6)+" "+s.units+" per pixel.");updateStats();}
  state.calibration=null;$("canvaswrap").classList.remove("calibrating");
  $("calibrate").textContent="Select 2 points";
});
updateList();
