import {detectPrintedDimensions,evaluateDimension,summarizeDimensionQA,
  dimensionCsv,parseDimensionLabel} from "./dimensions.js";

/**
 * Browser-local dimension review workflow. No network calls, no HTML from OCR
 * content and no automatic claim of engineer-approved dimensions.
 */
export function setupDimensionUI({getSheet,viewport,status,redraw,download,showOverlay}){
  const $=id=>document.getElementById(id);
  const drawer=$("dimensionDrawer");
  const state={selectedId:null,picking:null,active:false};
  const settings=()=>({
    relativeTolerance:Math.max(0,Math.min(25,Number($("dimTolerancePercent").value)||0)),
    absoluteTolerance:Math.max(0,Number($("dimToleranceAbsolute").value)||0)
  });
  const options=sheet=>({...settings(),scale:sheet.scale,
    calibrated:sheet.calibrated,units:sheet.units});
  const current=()=>getSheet();
  const getSelected=()=>{
    const sheet=current();
    return (sheet?.dimensions||[]).find(d=>d.id===state.selectedId)||null;
  };
  const evaluated=(d,sheet)=>evaluateDimension(d,options(sheet));
  const statusLabel={
    match:"Within tol.",mismatch:"Mismatch",unmatched:"Not measured",
    uncalibrated:"Uncalibrated","needs-units":"Set units",unreadable:"Check text",
    ignored:"Ignored"
  };
  const n=v=>v==null||!Number.isFinite(v)?"—":Number(v).toLocaleString(undefined,{maximumFractionDigits:4});
  const numberCard=(value,label,extra="")=>{
    const item=document.createElement("div");item.className="dimension-summary-item "+extra;
    const strong=document.createElement("strong");strong.textContent=String(value);
    const span=document.createElement("span");span.textContent=label;
    item.append(strong,span);return item;
  };
  function render(){
    const sheet=current(),dims=sheet?.dimensions||[];
    const exists=sheet?.status==="done";
    $("dimDownloadCSV").disabled=!exists||!dims.length;
    $("dimPick").disabled=!exists||!getSelected()||state.picking!==null;
    $("dimReset").disabled=!exists||!getSelected()?.manualEndpoints;
    $("dimPickDrawer").disabled=!exists||!getSelected()||state.picking!==null;
    $("dimConfirm").disabled=!exists||!getSelected()||state.picking!==null;
    $("dimIgnore").disabled=!exists||!getSelected();
    if(!sheet||!exists){
      $("dimensionSummary").textContent="Convert a drawing before reviewing measurements.";
      $("dimensionList").replaceChildren();
      $("dimensionDetail").hidden=true;return;
    }
    const counts=summarizeDimensionQA(dims,options(sheet));
    const summary=$("dimensionSummary");summary.replaceChildren(
      numberCard(counts.total,"Notes"),
      numberCard(counts.match,"Within tol.","match"),
      numberCard(counts.mismatch,"Mismatches","issue"),
      numberCard(counts.unresolved,"Unresolved","issue"),
      numberCard(counts.reviewed,"Reviewed"),
      numberCard(counts.ignored,"Ignored")
    );
    const list=$("dimensionList");list.replaceChildren();
    if(!dims.length){
      const p=document.createElement("div");p.className="dimension-result-empty";
      p.textContent="No linear dimension notes found. For raster scans, enable OCR in Convert and reconvert, or add a printed measurement manually.";
      list.append(p);$("dimensionDetail").hidden=true;return;
    }
    for(let i=0;i<dims.length;i++){
      const d=dims[i],v=evaluated(d,sheet);
      const row=document.createElement("button");row.type="button";
      row.className="dimension-result-row"+(state.selectedId===d.id?" active":"");
      row.setAttribute("aria-pressed",String(state.selectedId===d.id));
      const no=document.createElement("span");no.className="dimension-result-num";
      no.textContent=String(i+1).padStart(2,"0");
      const content=document.createElement("span");content.className="dimension-result-content";
      const title=document.createElement("strong");title.textContent=d.label;
      const secondary=document.createElement("small");
      secondary.textContent=v.measured!==null?
        n(v.measured)+" "+sheet.units+" measured · "+v.method:
        d.manualSource?"Manual note · choose endpoints":d.autoEndpoints?
        "Candidate measured line · "+v.status:"Source text · choose endpoints";
      content.append(title,secondary);
      const tag=document.createElement("span");tag.className="dimension-result-status "+v.status;
      tag.textContent=(v.reviewed?"✓ ":"")+statusLabel[v.status];
      row.append(no,content,tag);
      row.addEventListener("click",()=>{
        state.selectedId=d.id;
        const px=sheet.width?d.textX*(Number($("imageCanvas").width)/sheet.width):0;
        const py=sheet.height?d.textY*(Number($("imageCanvas").height)/sheet.height):0;
        if(Number.isFinite(px)&&Number.isFinite(py))viewport.centerOn(px,py);
        render();redraw();
      });
      list.append(row);
    }
    const d=getSelected(),detail=$("dimensionDetail");
    detail.hidden=!d;
    if(!d)return;
    const v=evaluated(d,sheet);
    $("dimSelectedId").textContent=d.id;
    $("dimEditLabel").value=d.label;
    const metrics=$("dimDetailMetrics");metrics.replaceChildren();
    function metric(title,value){
      const div=document.createElement("div"),span=document.createElement("span"),
        strong=document.createElement("strong");
      span.textContent=title;strong.textContent=value;
      div.append(span,strong);metrics.append(div);
    }
    metric("Printed",v.expected===null?"—":n(v.expected)+" "+sheet.units);
    metric("Measured",v.measured===null?"—":n(v.measured)+" "+sheet.units);
    metric("Difference",v.delta===null?"—":n(v.delta)+" "+sheet.units);
    metric("Allowed",v.allowed===null?"—":"±"+n(v.allowed)+" "+sheet.units);
    $("dimConfirm").textContent=v.reviewed?"Review confirmed":"Confirm review";
    $("dimIgnore").textContent=d.ignored?"Restore note":"Ignore note";
    $("dimDetailMessage").textContent=d.ignored?
      "Ignored notes remain in the QA report and are excluded from checked results.":
      v.status==="mismatch"?
      "Mismatch remains flagged even after you confirm that you reviewed it. Check scale, OCR and endpoints.":
      v.status==="match"?
      "Within tolerance is preliminary until reviewed. Confirming records human inspection, not engineering approval.":
      v.status==="uncalibrated"?
      "Calibrate the sheet using a separate trusted dimension before comparing measurements.":
      v.status==="needs-units"?
      "Choose feet, inches, meters, millimeters or centimeters under Review & scale.":
      v.status==="unreadable"?
      "Correct the OCR label to a valid linear measurement, then pick endpoints.":
      "No reliable line association. Pick two real dimension endpoints on the drawing.";
  }
  function scan(sheet,{preserveManual=true,useCurrentGeometry=false}={}){
    if(!sheet||sheet.status!=="done")return;
    const manual=preserveManual?(sheet.dimensions||[]).filter(d=>d.manualSource):[];
    const before=(sheet.dimensions||[]).filter(d=>!d.manualSource);
    const detected=detectPrintedDimensions(sheet.texts,useCurrentGeometry?sheet.paths:
      (sheet.sourcePaths?.length?sheet.sourcePaths:sheet.paths));
    for(const d of detected){
      const matching=before.find(b=>b.originalLabel===d.originalLabel&&
        Math.abs(b.textX-d.textX)<2&&Math.abs(b.textY-d.textY)<2);
      if(matching){
        d.label=matching.label;d.manualEndpoints=matching.manualEndpoints;
        d.reviewed=matching.reviewed;d.ignored=matching.ignored;
      }
    }
    // Synthetic manual IDs are distinct from OCR IDs to avoid selection loss.
    sheet.dimensions=[...detected,...manual];
    sheet.dimensionDetection={sourceTextCount:sheet.texts.length,
      detected:detected.length,automaticallyAssociated:detected.filter(d=>d.autoEndpoints).length,
      manualNotes:manual.length,limitReached:detected.length===500};
    if(!sheet.dimensions.some(d=>d.id===state.selectedId))
      state.selectedId=sheet.dimensions[0]?.id||null;
    render();redraw();
  }
  function open(){
    state.active=true;drawer.hidden=false;showOverlay?.();
    if(current()?.status==="done"&&!current()?.dimensions)scan(current());
    render();redraw();
  }
  function close(){
    drawer.hidden=true;state.active=false;
    redraw();
  }
  function startPick(){
    const sheet=current(),d=getSelected();
    if(!sheet||sheet.status!=="done"||!d||state.picking)return;
    state.picking={sheet,id:d.id,points:[]};
    drawer.hidden=true;
    viewport.setTool("dimension");
    $("dimPick").textContent="Choose point A";
    status("Dimension QA: click the first measured endpoint. Scroll to zoom; hold Space and drag to pan.");
    redraw();
  }
  function finishPick(){
    const pick=state.picking;state.picking=null;
    $("dimPick").textContent="Pick endpoints";
    viewport.setTool("pan");
    if(state.active)drawer.hidden=false;
    if(pick){
      const d=(pick.sheet.dimensions||[]).find(item=>item.id===pick.id);
      if(d&&pick.points.length===2){
        d.manualEndpoints=pick.points.map(p=>p.slice());
        d.reviewed=false;
        status("Dimension endpoints recorded. Compare printed and measured values, then confirm review.");
      }
    }
    render();redraw();
  }
  function handlePick({nx,ny,tool}){
    if(tool!=="dimension"||!state.picking)return false;
    const sheet=current(),pick=state.picking;
    if(pick.sheet!==sheet||!sheet?.width||!sheet.height){finishPick();return true;}
    pick.points.push([nx*sheet.width,ny*sheet.height]);
    if(pick.points.length===1){
      $("dimPick").textContent="Choose point B";
      viewport.setHint("First endpoint saved. Pan or zoom to the other endpoint; click again to finish.");
      redraw();
    }else finishPick();
    return true;
  }
  function cancelPick(){
    if(!state.picking)return;
    state.picking=null;
    $("dimPick").textContent="Pick endpoints";
    if(state.active)drawer.hidden=false;
    render();redraw();
  }
  function reviewResult(){
    const d=getSelected();if(!d)return;
    const v=evaluated(d,current());
    if(d.ignored||["unmatched","uncalibrated","needs-units","unreadable"].includes(v.status)){
      status("Resolve the dimension endpoints, units and calibration before confirming.");return;
    }
    d.reviewed=!d.reviewed;render();redraw();
    status(d.reviewed?"Dimension review recorded. "+(v.status==="mismatch"?"Mismatch still requires CAD resolution.":"Within-tolerance result is recorded as reviewed."):"Dimension marked as awaiting review.");
  }
  function setLabel(){
    const d=getSelected();if(!d)return;
    const value=$("dimEditLabel").value.trim();
    if(!value){status("Enter the printed dimension label.");return;}
    d.label=value.slice(0,48);d.reviewed=false;render();redraw();
    const parsed=parseDimensionLabel(d.label,{defaultUnits:current()?.units});
    status(parsed?"Updated label. Recheck the comparison.":"Label not recognized as a linear dimension. Correct it or ignore.");
  }
  function toggleIgnored(){
    const d=getSelected();if(!d)return;
    d.ignored=!d.ignored;d.reviewed=false;render();redraw();
  }
  function manualAdd(){
    const sheet=current();if(!sheet||sheet.status!=="done"){status("Convert a sheet before adding a dimension.");return;}
    const label=$("dimNewLabel").value.trim();
    if(!parseDimensionLabel(label,{defaultUnits:sheet.units})){
      status("Enter a valid linear dimension (for example: 12'-6\", 1200 mm, or 10.5).");return;
    }
    const count=(sheet.dimensionManualCounter||0)+1;sheet.dimensionManualCounter=count;
    const entry={id:"manual-"+count,label,originalLabel:label,
      textX:sheet.width/2,textY:sheet.height/2,bbox:null,height:12,
      autoEndpoints:null,manualEndpoints:null,confidence:0,association:null,
      reviewed:false,ignored:false,manualSource:true};
    sheet.dimensions=sheet.dimensions||[];
    sheet.dimensions.push(entry);
    state.selectedId=entry.id;$("dimNewLabel").value="";
    state.active=true;drawer.hidden=false;render();redraw();startPick();
  }
  function resetManual(){
    const d=getSelected();if(!d?.manualEndpoints)return;
    d.manualEndpoints=null;d.reviewed=false;render();redraw();
    status("Manual endpoints cleared. The candidate association (if any) remains provisional.");
  }
  function onScaleChanged(){
    const sheet=current();if(!sheet)return;
    for(const d of sheet.dimensions||[])d.reviewed=false;
    render();redraw();
  }
  function onSheetChanged(){
    cancelPick();
    const sheet=current();
    state.selectedId=sheet?.dimensions?.[0]?.id||null;
    if(state.active&&sheet?.status==="done"&&!sheet.dimensions)scan(sheet);
    render();
  }
  function stats(sheet){
    return summarizeDimensionQA(sheet?.dimensions||[],options(sheet));
  }
  function report(sheet){
    return dimensionCsv(sheet?.dimensions||[],{sheetName:sheet.name,...options(sheet)});
  }
  function details(sheet){
    return (sheet?.dimensions||[]).map(d=>{
      const v=evaluateDimension(d,options(sheet));
      return {id:d.id,label:d.label,status:v.status,reviewed:v.reviewed,
        method:v.method,confidence:d.confidence,ignored:d.ignored,
        expected:v.expected,measured:v.measured,delta:v.delta,allowed:v.allowed,
        endpoints:d.manualEndpoints||d.autoEndpoints||null};
    });
  }
  function drawOverlay(ctx,sheet,sx,sy){
    if(!sheet||(!state.active&&!state.picking))return;
    const dims=sheet.dimensions||[];
    ctx.save();ctx.lineWidth=1.7;ctx.font="bold 10px Arial,sans-serif";
    const count=Math.min(350,dims.length);
    for(let i=0;i<count;i++){
      const d=dims[i],v=evaluateDimension(d,options(sheet));
      if(d.ignored)continue;
      const selected=d.id===state.selectedId;
      const x=d.textX*sx,y=(d.textY-(d.height||10)*.4)*sy;
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      ctx.strokeStyle=v.status==="mismatch"?"#e99849":v.status==="match"?"#2bb59e":"#dfba63";
      ctx.fillStyle=selected?"#102e3a":"#203b4580";
      ctx.beginPath();ctx.arc(x,y,selected?7:4,0,2*Math.PI);ctx.fill();ctx.stroke();
      if(selected){
        ctx.fillStyle="#fff";ctx.fillText(String(i+1),x+10,y-8);
        const points=d.manualEndpoints||d.autoEndpoints;
        if(points?.length===2){
          ctx.strokeStyle=v.status==="mismatch"?"#ff9c4f":"#50d1c0";
          ctx.setLineDash([7,4]);ctx.lineWidth=2;ctx.beginPath();
          ctx.moveTo(points[0][0]*sx,points[0][1]*sy);
          ctx.lineTo(points[1][0]*sx,points[1][1]*sy);ctx.stroke();
          ctx.setLineDash([]);
          for(const p of points){
            ctx.beginPath();ctx.arc(p[0]*sx,p[1]*sy,5,0,Math.PI*2);ctx.stroke();
          }
        }
      }
    }
    if(state.picking?.sheet===sheet&&state.picking.points.length){
      const point=state.picking.points[0];
      ctx.strokeStyle="#ffcf65";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(point[0]*sx,point[1]*sy,7,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
  $("scanDimensions").addEventListener("click",()=>{
    const sheet=current();
    if(!sheet||sheet.status!=="done"){status("Convert a drawing before searching for dimensions.");return;}
    scan(sheet);open();
    status((sheet.dimensions||[]).length+" potential dimension notes found. Confirm associations and mismatches in the review drawer.");
  });
  $("dimToggleDrawer").addEventListener("click",()=>drawer.hidden?open():close());
  $("dimCloseDrawer").addEventListener("click",close);
  $("dimPick").addEventListener("click",startPick);
  $("dimPickDrawer").addEventListener("click",startPick);
  $("dimReset").addEventListener("click",resetManual);
  $("dimConfirm").addEventListener("click",reviewResult);
  $("dimIgnore").addEventListener("click",toggleIgnored);
  $("dimEditLabel").addEventListener("change",setLabel);
  $("dimEditLabel").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();setLabel();}});
  $("dimAddLabel").addEventListener("click",manualAdd);
  $("dimNewLabel").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();manualAdd();}});
  for(const id of ["dimTolerancePercent","dimToleranceAbsolute"]){
    $(id).addEventListener("change",()=>{
      const raw=Number($(id).value);
      if(!Number.isFinite(raw)||raw<0){$(id).value=id==="dimTolerancePercent"?"1":"0.05";status("Tolerance must be nonnegative.");}
      const sheet=current();
      for(const d of sheet?.dimensions||[])d.reviewed=false;
      render();redraw();status("Tolerance changed. All previously reviewed dimension checks require confirmation again.");
    });
  }
  $("dimDownloadCSV").addEventListener("click",()=>{
    const sheet=current();if(!sheet||sheet.status!=="done"||!sheet.dimensions?.length)return;
    const filename=sheet.name.replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"_").slice(0,70);
    download(new Blob([report(sheet)],{type:"text/csv;charset=utf-8"}),(filename||"drawing")+"-dimensions-QA.csv");
  });
  document.querySelectorAll(".ribbon-tab").forEach(tab=>tab.addEventListener("click",()=>{
    if(tab.dataset.ribbon==="dimensions")open();
    else if(state.active&&!state.picking)close();
  }));
  return {scan,onSheetChanged,onScaleChanged,handlePick,cancelPick,drawOverlay,
    stats,report,details,render,
    reset(){state.active=false;state.selectedId=null;state.picking=null;drawer.hidden=true;render();},
    get active(){return state.active;}};
}
