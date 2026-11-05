import {buildDxf,filenameBase} from "./dxf.js";
import {recognizeLineTypes,effectiveLineType} from "./linetype.js";
import {straightenPaths} from "./straightening.js";
import {detectHatches} from "./hatch.js";
import {recognizeCircles} from "./circles.js";
import {repairNearClosedContours,validatePolygon,applyManualHatches} from "./hatch-repair.js";
import {createDrawingViewport} from "./viewport.js";
import {planTiles,normalizeRoi,clipToTileAndRoi,isEditorWatermark,looksLikeEditorUrl,overlaps,dedupeText} from "./tile-engine.js";

const $=id=>document.getElementById(id);
const state={sheets:[],selected:-1,busy:false,view:"overlay",calibration:null,pdfjs:null,ocrWorker:null,worker:null,
  token:0,workerId:0,pending:new Map(),cropping:null,hatchEditing:null};
const MAX_SHEETS=50,MAX_RENDER_PIXELS=3200000;
const viewport=createDrawingViewport({
  wrapper:$("canvaswrap"),stage:$("stage"),readout:$("zoomReadout"),
  crosshair:$("crosshair"),hint:$("viewHint"),onPick:handleViewportPick,onCancel:cancelSelection
});
const presets={
  generic:["VEC-POLYLINES","ANNO-TEXT"],civil:["C-UNCLASSIFIED","C-ANNO"],
  architecture:["A-UNCLASSIFIED","A-ANNO"],structure:["S-UNCLASSIFIED","S-ANNO"],
  mep:["M-UNCLASSIFIED","M-ANNO"]
};
const escapeName=name=>String(name).replace(/\.[^.]+$/,"");
function status(message){$("jobStatus").textContent=message;}
function busy(value){
  state.busy=value;
  if(value&&state.hatchEditing){cancelHatchDrawing();viewport.setTool("pan");}
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
  if(!state.sheets.length){const empty=document.createElement("span");empty.className="no-sheets";
    empty.textContent="No files loaded. Use Add drawings in the Home ribbon.";host.append(empty);refreshButtons();return;}
  for(let i=0;i<state.sheets.length;i++){
    const s=state.sheets[i],btn=document.createElement("button");btn.type="button";
    btn.className="sheet"+(i===state.selected?" active":"");
    const left=document.createElement("span");left.className="sheetname";left.textContent=s.name;left.title=s.name;
    const meta=document.createElement("span");meta.className="sheetmeta";meta.textContent=s.type==="pdf"?"PDF":"IMAGE";
    const pill=document.createElement("span");pill.className="chip "+(s.status==="done"?"done":s.status==="error"?"error":s.status==="running"?"running":"");
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
  return {file,name,type,status:"pending",paths:[],sourcePaths:[],circles:[],circleStats:null,contourStats:null,
    manualHatchSpecs:[],manualHatchResults:[],hatches:[],hatchStats:null,straightStats:null,styledPaths:[],patternStats:null,lineTypeOverride:"auto",texts:[],width:0,height:0,
    scale:1,calibrated:false,units:"unitless",roi:null,processingDpi:null,tilesProcessed:0,watermarkDetected:false,geometryLayer:presets[$("preset").value][0],
    textLayer:presets[$("preset").value][1],hatchLayer:"HATCH-REVIEW",warning:"",...extra};
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
      const options={threshold:$("threshold").value==="auto"?null:($("threshold").value==="adaptive"?"adaptive":Number($("threshold").value)),
        minLength:$("detectLinetypes").checked?Math.min($("lineTypeSensitivity").value==="sensitive"?5:8,Math.max(4,Number($("minLength").value)||17)):Math.max(4,Number($("minLength").value)||17),
        epsilon:Math.max(.2,Number($("epsilon").value)||1.6),maxPaths:12000,
        minComponent:Math.max(0,Number($("speckles").value)||0),masks};
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
    // Circle fitting takes priority: a complete round feature must be a CAD
    // CIRCLE, not a straightened collection of LINE entities.
    status("Fitting precise circles from scanned geometry...");
    const circular=recognizeCircles(paths,{enabled:$("recognizeCircles").checked});
    status("Straightening reliable linework...");
    const corrected=$("straightenLines").checked?straightenPaths(circular.paths,{
      maxDeviation:2.5,maxRelativeDeviation:.035,orthogonal:$("snapOrthogonal").checked
    }):{paths:circular.paths,stats:{straightened:0,preserved:circular.paths.length}};
    const repaired=repairNearClosedContours(corrected.paths,{
      enabled:$("repairContours").checked,maxGap:5
    });
    s.sourcePaths=repaired.paths;s.circles=circular.circles;
    s.circleStats=circular.stats;s.contourStats=repaired.stats;s.straightStats=corrected.stats;
    s.manualHatchSpecs=[];s.manualHatchResults=[];
    s.autoHatchEnabled=$("detectHatches").checked;
    s.autoLinetypeEnabled=$("detectLinetypes").checked;
    s.autoLinetypeSensitivity=$("lineTypeSensitivity").value;
    status("Recovering hatch patterns and line styles...");
    rebuildSheetGeometry(s);
    s.texts=dedupeText(texts);s.width=source.width;s.height=source.height;
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
function rebuildSheetGeometry(sheet){
  if(!Array.isArray(sheet.sourcePaths))return;
  // Manual repairs are applied to source linework; the remaining regions can
  // still be classified automatically. Never re-rasterize the PDF here.
  const manual=applyManualHatches(sheet.sourcePaths,sheet.manualHatchSpecs||[]);
  const auto=detectHatches(manual.paths,{
    enabled:sheet.autoHatchEnabled!==false,
    excludedRegions:(sheet.manualHatchSpecs||[]).map(item=>item.boundary)
  });
  const styles=recognizeLineTypes(auto.paths,{
    enabled:sheet.autoLinetypeEnabled!==false,
    sensitivity:sheet.autoLinetypeSensitivity||"balanced"
  });
  sheet.paths=styles.solidPaths;
  sheet.styledPaths=styles.styledPaths;
  sheet.patternStats=styles.stats;
  sheet.manualHatchResults=manual.results;
  sheet.hatches=[...manual.hatches,...auto.hatches];
  sheet.hatchStats={...auto.stats,manualHatches:manual.hatches.length,
    manualRemovedStrokes:manual.results.reduce((sum,r)=>sum+(r.removed||0),0)};
}
function applySheetSettings(){
  const sheet=state.sheets[state.selected];if(!sheet)return;
  $("scale").value=sheet.scale;$("units").value=sheet.units;
  $("geometryLayer").value=sheet.geometryLayer;$("textLayer").value=sheet.textLayer;
  $("hatchLayer").value=sheet.hatchLayer;
  $("lineTypeOverride").value=sheet.lineTypeOverride||"auto";
}
async function selectSheet(i,force=false){
  if(i<0||i>=state.sheets.length)return;
  state.selected=i;state.calibration=null;state.cropping=null;state.hatchEditing=null;
  $("drawHatch").textContent="Draw hatch boundary";$("finishHatch").disabled=true;$("undoHatchVertex").disabled=true;
  $("calibrate").textContent="Pick two points";$("crop").textContent="Select drawing area";
  cancelHatchDrawing();
  const s=state.sheets[i];applySheetSettings();updateList();$("previewTitle").textContent=s.name;
  viewport.setTool("pan");
  const token=++state.token;
  if(!force&&s.previewToken===token)return;
  try{
    const {canvas}=await renderSheet(s);if(token!==state.token)return;
    const original=$("imageCanvas"),vectors=$("vectorCanvas");
    original.width=vectors.width=canvas.width;original.height=vectors.height=canvas.height;
    original.getContext("2d").drawImage(canvas,0,0);
    if(!s.width||!s.height){s.width=canvas.width;s.height=canvas.height;}
    $("stage").hidden=false;$("empty").hidden=true;
    viewport.setDrawing(canvas.width,canvas.height);
    drawVectors();updateStats();
  }catch(e){if(token===state.token)status("Preview error: "+(e?.message||e));}
}
function updateStats(){
  const s=state.sheets[state.selected];if(!s)return;
  $("previewStats").textContent=(s.paths.length||0)+" vectors · "+(s.texts.length||0)+" text entities · "+s.status+
    (s.tilesProcessed?" · "+s.tilesProcessed+" tiles":"")+
    (s.processingDpi?" · "+s.processingDpi+" DPI":"")+
    (s.styledPaths?.length?" · "+s.styledPaths.length+" reconstructed dash runs":"")+
    (s.circles?.length?" · "+s.circles.length+" CAD circles":"")+
    (s.warning?" · "+s.warning:"");
  $("geometryStats").textContent=s.status==="done"?
    ((s.circles?.length||0)+" circles · "+
     (s.straightStats?.straightened||0)+" lines straightened · "+
     (s.hatches?.length||0)+" native hatches · "+
     ((s.hatchStats?.removedStrokes||0)+(s.hatchStats?.manualRemovedStrokes||0))+" hatch strokes replaced"+
     (s.contourStats?.repaired?" · "+s.contourStats.repaired+" border gaps closed":"")+
     (s.hatchStats?.skippedNoBoundary?" · no closed hatch boundaries found":"")):
    "Convert a drawing to review straightening and hatch recognition.";
  $("removeLastHatch").disabled=state.busy||!s.manualHatchSpecs?.length;
  $("hatchRepairHint").textContent=s.status==="done"?
    ((s.manualHatchSpecs?.length||0)+" manual hatch boundaries. Select Review & scale → Draw hatch boundary to repair a missed region."):
    "Convert this sheet before drawing a manual hatch boundary.";
  const styleCounts={DASHED:0,HIDDEN:0};
  for(const item of s.styledPaths||[])styleCounts[effectiveLineType(item,s.lineTypeOverride)]++;
  $("linetypeStats").textContent=s.status==="done"?
    styleCounts.DASHED+" DASHED · "+styleCounts.HIDDEN+" HIDDEN"+
    (s.patternStats?.segmentsConsumed?" · "+s.patternStats.segmentsConsumed+" source strokes combined":""):
    "Convert a drawing to analyze its line patterns.";
  const stateText=s.status==="done"?"Converted":s.status==="error"?"Error":s.status==="running"?"Processing":"Not converted";
  $("inspectorState").textContent=stateText;
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
  const sheet=state.sheets[state.selected],canvas=$("vectorCanvas");
  if(!sheet||!canvas.width)return;
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const sx=sheet.width>0?canvas.width/sheet.width:1;
  const sy=sheet.height>0?canvas.height/sheet.height:1;
  const vectorOnly=state.view==="vector";
  ctx.save();
  ctx.scale(sx,sy);ctx.lineCap="round";ctx.lineJoin="round";
  // Same polygon(s), angles, spacing and circle fits as the DXF writer.
  for(const hatch of sheet.hatches||[]){
    const boundary=hatch.boundary;
    if(!boundary?.length)continue;
    ctx.save();
    ctx.beginPath();ctx.moveTo(boundary[0][0],boundary[0][1]);
    for(let i=1;i<boundary.length;i++)ctx.lineTo(boundary[i][0],boundary[i][1]);
    ctx.closePath();
    if(hatch.solid){
      ctx.fillStyle=vectorOnly?"#168e93":"rgba(29,163,160,0.30)";
      ctx.fill();
    }else{
      ctx.clip();
      const patterns=Array.isArray(hatch.patterns)&&hatch.patterns.length?
        hatch.patterns:[{angleDegrees:hatch.angleDegrees,spacingPx:hatch.spacingPx,
          origin:hatch.origin||boundary[0]}];
      ctx.strokeStyle=vectorOnly?"#34c4ab":"#188f84";ctx.lineWidth=1.1/sx;
      for(const pattern of patterns){
        if(!Number.isFinite(pattern.spacingPx)||pattern.spacingPx<=0)continue;
        const angle=pattern.angleDegrees*Math.PI/180,u=[Math.cos(angle),Math.sin(angle)];
        const n=[-u[1],u[0]],o=pattern.origin||boundary[0];
        const rel=boundary.map(p=>[p[0]-o[0],p[1]-o[1]]);
        const along=rel.map(p=>p[0]*u[0]+p[1]*u[1]);
        const normal=rel.map(p=>p[0]*n[0]+p[1]*n[1]);
        const lo=Math.min(...along)-6,hi=Math.max(...along)+6;
        const from=Math.floor(Math.min(...normal)/pattern.spacingPx)-1;
        const to=Math.ceil(Math.max(...normal)/pattern.spacingPx)+1;
        for(let k=from;k<=to&&k<from+1500;k++){
          const offset=k*pattern.spacingPx;
          ctx.beginPath();
          ctx.moveTo(o[0]+u[0]*lo+n[0]*offset,o[1]+u[1]*lo+n[1]*offset);
          ctx.lineTo(o[0]+u[0]*hi+n[0]*offset,o[1]+u[1]*hi+n[1]*offset);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    ctx.save();ctx.strokeStyle=hatch.manual?"#ffbd5b":"#23a68c";ctx.lineWidth=1.5/sx;
    ctx.beginPath();ctx.moveTo(boundary[0][0],boundary[0][1]);
    for(let i=1;i<boundary.length;i++)ctx.lineTo(boundary[i][0],boundary[i][1]);
    ctx.closePath();ctx.stroke();ctx.restore();
  }
  ctx.save();ctx.strokeStyle=vectorOnly?"#86f2fb":"#0957d2";ctx.lineWidth=1.4/sx;
  for(const circle of sheet.circles||[]){
    if(!Number.isFinite(circle.radius)||circle.radius<=0)continue;
    ctx.beginPath();ctx.arc(circle.center[0],circle.center[1],circle.radius,0,Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
  // Same centerline path data passed to buildDxf(), not a synthetic preview.
  ctx.strokeStyle=vectorOnly?"#5fe8dc":"#105cdd";
  ctx.lineWidth=1.2/sx;
  for(const path of sheet.paths){
    if(path.length<2)continue;
    ctx.beginPath();ctx.moveTo(path[0][0],path[0][1]);
    for(let j=1;j<path.length;j++)ctx.lineTo(path[j][0],path[j][1]);
    ctx.stroke();
  }
  // Use the same reconstructed entities and line patterns as the DXF exporter.
  // Styles are represented by actual canvas dashes, rather than straight solids.
  for(const item of sheet.styledPaths||[]){
    const type=effectiveLineType(item,sheet.lineTypeOverride);
    if(type!=="DASHED"&&type!=="HIDDEN")continue;
    ctx.setLineDash([Math.max(2,item.dashPx||12),Math.max(2,item.gapPx||7)]);
    ctx.strokeStyle=type==="HIDDEN"?(vectorOnly?"#e3bb76":"#b17d27"):
      (vectorOnly?"#38d0f2":"#07689e");
    const points=item.points;if(!points?.length)continue;
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let k=1;k<points.length;k++)ctx.lineTo(points[k][0],points[k][1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle=vectorOnly?"#ffd38b":"#ca870e";
  ctx.strokeStyle=vectorOnly?"#e8bb5e":"#d68a21";
  for(const item of sheet.texts){
    if(!item.value?.trim())continue;
    const textHeight=Math.max(7,Math.min(120,item.height||11));
    ctx.font=textHeight+"px Arial, sans-serif";
    ctx.save();ctx.translate(item.x,item.y);
    if(item.rotation)ctx.rotate(-(item.rotation*Math.PI/180));
    ctx.fillText(item.value.slice(0,200),0,0);
    ctx.restore();
    if(!vectorOnly&&item.bbox){
      const b=item.bbox;ctx.lineWidth=.5/sx;
      ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);
    }
  }
  ctx.restore();
  if(sheet.roi){
    ctx.save();ctx.strokeStyle="#ffb940";ctx.lineWidth=2;ctx.setLineDash([8,5]);
    ctx.strokeRect(sheet.roi.x0*canvas.width,sheet.roi.y0*canvas.height,
      (sheet.roi.x1-sheet.roi.x0)*canvas.width,(sheet.roi.y1-sheet.roi.y0)*canvas.height);
    ctx.restore();
  }
  const marker=(nx,ny,number)=>{
    const x=nx*canvas.width,y=ny*canvas.height;
    ctx.save();ctx.strokeStyle="#ffbb43";ctx.fillStyle="#0d2936";ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-11,y);ctx.lineTo(x+11,y);ctx.moveTo(x,y-11);ctx.lineTo(x,y+11);ctx.stroke();
    ctx.font="bold 13px Arial";ctx.fillStyle="#ffdc87";ctx.fillText(String(number),x+11,y-10);ctx.restore();
  };
  if(state.hatchEditing?.points?.length&&sheet.width&&sheet.height){
    const pts=state.hatchEditing.points;
    ctx.save();ctx.strokeStyle="#ffb24a";ctx.lineWidth=2;ctx.setLineDash([6,4]);
    ctx.beginPath();ctx.moveTo(pts[0][0]*sx,pts[0][1]*sy);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0]*sx,pts[i][1]*sy);
    ctx.stroke();ctx.restore();
    for(let i=0;i<pts.length;i++)marker(pts[i][0]/sheet.width,pts[i][1]/sheet.height,i+1);
  }
  if(state.cropping?.points?.length)for(let i=0;i<state.cropping.points.length;i++){
    const [nx,ny]=state.cropping.points[i];marker(nx,ny,i+1);
  }
  if(state.calibration?.points?.length&&sheet.width&&sheet.height){
    for(let i=0;i<state.calibration.points.length;i++){
      const [x,y]=state.calibration.points[i];marker(x/sheet.width,y/sheet.height,i+1);
    }
  }
  $("imageCanvas").style.opacity=vectorOnly?"1":state.view==="overlay"?"0.51":"1";
  $("imageCanvas").style.display=vectorOnly?"none":"block";
  canvas.style.display=state.view==="original"?"none":"block";
  $("stage").classList.toggle("vector-only",vectorOnly);
}
function setView(view){
  state.view=view;document.querySelectorAll("#viewTabs button").forEach(b=>{
    const active=b.dataset.view===view;b.classList.toggle("active",active);
    b.setAttribute("aria-pressed",String(active));
  });drawVectors();
  const sheet=state.sheets[state.selected];
  if(view==="vector"&&sheet?.status!=="done")viewport.setHint("No converted vectors yet. Use Home → Convert sheet, then select Vectors only.");
}
function makeDxf(s){
  if(s.status!=="done")throw Error("Sheet must be converted first");
  return buildDxf({width:s.width,height:s.height,paths:s.paths,circles:s.circles||[],
    hatches:s.hatches||[],hatchLayer:s.hatchLayer||"HATCH-REVIEW",styledPaths:s.styledPaths||[],
    lineTypeOverride:s.lineTypeOverride||"auto",texts:s.texts,
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
        linetypes:output.lineTypeCounts,linetypePatterns:output.linePatterns,
        patternRecognition:s.patternStats||null,linetypeOverride:s.lineTypeOverride,
        hatches:output.hatchCount,solidHatches:output.solidHatchCount,
        crossHatches:output.crossHatchCount,circles:output.circleCount,
        circleRecognition:s.circleStats||null,boundaryRepair:s.contourStats||null,
        manualHatchResults:s.manualHatchResults||[],hatchLayer:output.hatchLayer,
        hatchRecognition:s.hatchStats||null,straightening:s.straightStats||null,
        drawingArea:s.roi,watermarkDetected:s.watermarkDetected,
        warning:s.warning||"Manual QA required"});
    }
    zip.file("QA-manifest.json",JSON.stringify({
      product:"VecBuilt",status:"experimental",generatedAt:new Date().toISOString(),
      warning:"This is unverified centerline tracing. Drawings are not engineering-certified or georeferenced.",
      drawings:manifest},null,2));
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    download(blob,"vecbuilt-dxf-batch.zip");
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
drop.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("files").click();}});
drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag");ingest([...e.dataTransfer.files]);});
$("processSelected").addEventListener("click",()=>processIndices([state.selected]));
$("processAll").addEventListener("click",()=>processIndices(state.sheets.map((_,i)=>i)));
$("exportSelected").addEventListener("click",exportSelected);
$("exportZip").addEventListener("click",exportZip);
$("clear").addEventListener("click",()=>{
  if(state.busy)return;state.sheets=[];state.selected=-1;state.token++;state.calibration=null;
  $("stage").hidden=true;$("empty").hidden=false;$("previewTitle").textContent="No drawing selected";
  cancelHatchDrawing();
  viewport.reset();$("inspectorState").textContent="No sheet";
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
syncValue("hatchLayer","hatchLayer",v=>!!v.trim());
$("lineTypeOverride").addEventListener("change",()=>{
  const sheet=state.sheets[state.selected];if(!sheet)return;
  sheet.lineTypeOverride=$("lineTypeOverride").value;
  updateStats();drawVectors();
  status("Line style override set to "+sheet.lineTypeOverride+". Review the DXF preview before export.");
});
for(const id of ["detectLinetypes","lineTypeSensitivity","straightenLines","snapOrthogonal","detectHatches","recognizeCircles","repairContours"]){
  $(id).addEventListener("change",()=>{
    if(state.sheets[state.selected]?.status==="done")status("Line detection setting changed. Convert the selected sheet again to apply.");
  });
}

syncValue("units","units");
syncValue("scale","scale",v=>Number.isFinite(Number(v))&&Number(v)>0);
$("calibrate").addEventListener("click",()=>{
  const s=state.sheets[state.selected],known=Number($("distance").value);
  if(!s){status("Choose a sheet before calibrating.");return;}
  if($("stage").hidden||!s.width){status("Load the drawing preview first.");return;}
  if(!Number.isFinite(known)||known<=0){status("Enter a positive known distance before selecting points.");return;}
  state.cropping=null;state.calibration={points:[],known};
  setView("overlay");viewport.setTool("calibrate");$("calibrate").textContent="Pick first point";
  status("Calibration: zoom into the first endpoint, then click the exact point. Hold Space to pan.");
});
function cancelHatchDrawing(){
  state.hatchEditing=null;
  $("drawHatch").textContent="Draw hatch boundary";
  $("undoHatchVertex").disabled=true;$("finishHatch").disabled=true;
}
function finishManualHatch(){
  const sheet=state.sheets[state.selected],editing=state.hatchEditing;
  if(!sheet||sheet.status!=="done"||!editing)return;
  const points=editing.points;
  const invalid=validatePolygon(points);
  if(invalid){status(invalid+" Use Undo point or Esc to cancel.");return;}
  const spec={boundary:points.map(p=>p.slice()),
    pattern:$("manualHatchPattern").value,
    angleDegrees:Number($("manualHatchAngle").value),
    spacingPx:Number($("manualHatchSpacing").value),
    removeMatchingStrokes:$("removeHatchStrokes").checked};
  const attempt=applyManualHatches(sheet.sourcePaths,[...(sheet.manualHatchSpecs||[]),spec]);
  const latest=attempt.results.at(-1);
  if(!latest?.ok){
    status(latest?.error||"Unable to create this hatch region. Check the pattern setting.");
    return;
  }
  sheet.manualHatchSpecs.push(spec);
  rebuildSheetGeometry(sheet);
  cancelHatchDrawing();viewport.setTool("pan");
  drawVectors();updateStats();
  status("Added native CAD "+spec.pattern+" hatch. "+
    (latest.removed||0)+" source strokes replaced. Review the boundary and export.");
}
$("drawHatch").addEventListener("click",()=>{
  const sheet=state.sheets[state.selected];
  if(!sheet||sheet.status!=="done"){status("Convert a drawing first, then select its hatch region.");return;}
  if(state.hatchEditing){cancelHatchDrawing();viewport.setTool("pan");drawVectors();return;}
  state.calibration=null;state.cropping=null;
  setView("overlay");
  state.hatchEditing={points:[]};
  viewport.setTool("hatch");
  $("drawHatch").textContent="Cancel drawing";
  $("finishHatch").disabled=true;$("undoHatchVertex").disabled=true;
  status("Click each corner of the hatch boundary. Hold Space to pan and scroll to zoom.");
});
$("undoHatchVertex").addEventListener("click",()=>{
  if(!state.hatchEditing)return;
  state.hatchEditing.points.pop();
  const count=state.hatchEditing.points.length;
  $("finishHatch").disabled=count<3;$("undoHatchVertex").disabled=count===0;
  drawVectors();
  status(count+" hatch boundary points selected.");
});
$("finishHatch").addEventListener("click",finishManualHatch);
$("removeLastHatch").addEventListener("click",()=>{
  const sheet=state.sheets[state.selected];
  if(!sheet?.manualHatchSpecs?.length)return;
  sheet.manualHatchSpecs.pop();rebuildSheetGeometry(sheet);
  drawVectors();updateStats();
  status("Reverted the most recent manual hatch without reconverting the PDF.");
});
window.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||!state.hatchEditing)return;
  const target=e.target;
  if(target instanceof HTMLElement&&(["INPUT","SELECT","TEXTAREA"].includes(target.tagName)||target.isContentEditable))return;
  e.preventDefault();finishManualHatch();
});
function invalidateConversion(s){
  if(s.status==="done"||s.status==="error"){
    s.status="pending";s.paths=[];s.sourcePaths=[];s.circles=[];s.circleStats=null;s.contourStats=null;
    s.manualHatchSpecs=[];s.manualHatchResults=[];s.hatches=[];s.hatchStats=null;s.straightStats=null;
    s.styledPaths=[];s.patternStats=null;s.texts=[];
    s.warning="Drawing area changed; reconvert this sheet.";
    s.tilesProcessed=0;s.processingDpi=null;updateList();
  }
}
$("crop").addEventListener("click",()=>{
  const s=state.sheets[state.selected];if(!s)return;
  state.calibration=null;state.cropping={points:[]};
  setView("overlay");viewport.setTool("crop");
  $("calibrate").textContent="Pick two points";$("crop").textContent="Pick first corner";
  status("Drawing area: click one corner, then zoom or pan as needed and click the opposite corner.");
});
$("clearCrop").addEventListener("click",()=>{
  const s=state.sheets[state.selected];if(!s)return;
  s.roi=null;state.cropping=null;
  $("crop").textContent="Select drawing area";viewport.setTool("pan");
  invalidateConversion(s);drawVectors();updateStats();status("Drawing area cleared. Reconvert for full-sheet output.");
});
function cancelSelection(){
  state.calibration=null;state.cropping=null;cancelHatchDrawing();
  $("calibrate").textContent="Pick two points";$("crop").textContent="Select drawing area";
  drawVectors();
}
function handleViewportPick({nx,ny,tool}){
  const s=state.sheets[state.selected];if(!s)return;
  if(tool==="hatch"&&state.hatchEditing){
    state.hatchEditing.points.push([nx*s.width,ny*s.height]);
    const count=state.hatchEditing.points.length;
    $("undoHatchVertex").disabled=false;
    $("finishHatch").disabled=count<3;
    viewport.setHint("Boundary vertices: "+count+
      ". Click more corners, then press Finish hatch or Enter. Space + drag pans.");
    drawVectors();return;
  }
  if(tool==="crop"&&state.cropping){
    state.cropping.points.push([nx,ny]);
    if(state.cropping.points.length===1){
      $("crop").textContent="Pick second corner";viewport.setHint("First corner saved. Pan with Space + drag or zoom with the wheel; click the opposite corner.");drawVectors();return;
    }
    const [a,b]=state.cropping.points,roi={
      x0:Math.min(a[0],b[0]),y0:Math.min(a[1],b[1]),x1:Math.max(a[0],b[0]),y1:Math.max(a[1],b[1])
    };
    if((roi.x1-roi.x0)<.01||(roi.y1-roi.y0)<.01){
      status("Drawing area is too small. Select two points farther apart.");
      state.cropping={points:[]};$("crop").textContent="Pick first corner";return;
    }
    s.roi=roi;invalidateConversion(s);state.cropping=null;
    viewport.setTool("pan");$("crop").textContent="Select drawing area";
    drawVectors();updateStats();status("Drawing area selected. Reconvert this sheet to apply the new area.");
    return;
  }
  if(tool==="calibrate"&&state.calibration){
    const x=nx*s.width,y=ny*s.height;
    state.calibration.points.push([x,y]);
    if(state.calibration.points.length===1){
      $("calibrate").textContent="Pick second point";
      viewport.setHint("First point set. Zoom and pan to the second endpoint, then click. Esc cancels.");
      drawVectors();
      return;
    }
    const [a,b]=state.calibration.points,pixels=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(pixels<2){
      status("Calibration points are too close. Choose a longer known-distance segment.");
      state.calibration={points:[],known:state.calibration.known};
      $("calibrate").textContent="Pick first point";drawVectors();return;
    }
    s.scale=state.calibration.known/pixels;s.calibrated=true;
    applySheetSettings();
    const distance=state.calibration.known;
    state.calibration=null;viewport.setTool("pan");$("calibrate").textContent="Pick two points";
    status("Calibration applied: "+distance+" "+s.units+" across "+pixels.toFixed(1)+" source pixels. Verify another dimension.");
    updateStats();drawVectors();
  }
}
document.querySelectorAll(".ribbon-tab").forEach(button=>{
  button.addEventListener("click",()=>{
    const name=button.dataset.ribbon;
    document.querySelectorAll(".ribbon-tab").forEach(tab=>tab.setAttribute("aria-selected",String(tab===button)));
    document.querySelectorAll(".ribbon-pane").forEach(panel=>panel.classList.toggle("active",panel.id==="panel-"+name));
  });
});
$("toggleInspector").addEventListener("click",()=>{
  const aside=$("inspector"),collapsed=aside.classList.toggle("collapsed");
  $("toggleInspector").textContent=collapsed?"Show properties":"Hide properties";
  $("toggleInspector").setAttribute("aria-pressed",String(!collapsed));
});
$("closeInspector").addEventListener("click",()=>$("toggleInspector").click());
$("toggleSheets").addEventListener("click",()=>{
  const element=$("sheetBar"),hidden=element.hidden;
  element.hidden=!hidden;
  $("toggleSheets").setAttribute("aria-pressed",String(hidden));
});
$("zoomIn").addEventListener("click",()=>viewport.zoom(1.25));
$("zoomOut").addEventListener("click",()=>viewport.zoom(1/1.25));
$("zoomFit").addEventListener("click",()=>viewport.fit());
$("homeFit").addEventListener("click",()=>viewport.fit());
$("zoomActual").addEventListener("click",()=>viewport.actual());
$("toolPan").addEventListener("click",()=>{viewport.setTool("pan");cancelSelection();});

updateList();
