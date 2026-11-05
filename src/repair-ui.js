import {analyzeRepairs,applyRepairs,repairStats} from "./repair.js";

/** Stateful review controller for v0.8, with per-sheet reversible path edits. */
export function setupRepairUI({getSheet,viewport,status,redraw,showOverlay,onGeometryChanged,refreshStats}){
  const $=id=>document.getElementById(id),drawer=$("repairDrawer");
  let active=false,selectedId=null;
  const selectedIds=new Set();
  const results=sheet=>sheet?.repairSession||null;
  const session=sheet=>{
    if(!sheet.repairSession)sheet.repairSession={
      scan:null,accepted:[],dismissed:new Set(),undo:[],redo:[],selected:null
    };
    return sheet.repairSession;
  };
  const verifiedTolerance=()=>{
    const value=Number($("repairTolerance").value);
    if(!Number.isFinite(value)||value<.2||value>25){
      $("repairTolerance").value="3";status("Repair gap must be between 0.2 and 25 source pixels.");
      return 3;
    }
    return value;
  };
  const available=sheet=>{
    const s=results(sheet);
    return s?.scan?.proposals.filter(p=>!s.dismissed.has(p.id))||[];
  };
  const chosen=()=>{
    const sheet=getSheet();
    return available(sheet).find(p=>p.id===selectedId)||null;
  };
  const selectedProposals=()=>available(getSheet()).filter(p=>selectedIds.has(p.id));
  function render(){
    const sheet=getSheet(),ready=sheet?.status==="done"&&!sheet?.repairBusy;
    const data=results(sheet),issues=available(sheet),selected=chosen(),selection=selectedProposals();
    const counts={duplicate:0,join:0,corner:0,safe:0};
    for(const p of issues){counts[p.type]++;if(p.safe)counts.safe++;}
    $("repairScan").disabled=!ready;
    $("repairApply").disabled=!ready||!selection.length;
    $("repairApply").textContent="Apply selected"+(selection.length?" ("+selection.length+")":"");
    $("repairApplySafe").disabled=!ready||!counts.safe;
    $("repairUndo").disabled=!ready||!data?.undo?.length;
    $("repairRedo").disabled=!ready||!data?.redo?.length;
    $("repairApplyDrawer").disabled=!ready||!selection.length;
    $("repairApplyDrawer").textContent="Apply selected"+(selection.length?" ("+selection.length+")":"");
    $("repairSkip").disabled=!ready||!selected;
    $("repairStatus").textContent=!ready?"Convert a sheet first":
      !data?.scan?"Run Scan geometry":
      issues.length+" issues · "+counts.safe+" low-risk";
    const summary=$("repairSummary");summary.replaceChildren();
    const metric=(num,label,kind="")=>{
      const div=document.createElement("div");if(kind)div.className=kind;
      const strong=document.createElement("strong");strong.textContent=String(num);
      const span=document.createElement("span");span.textContent=label;
      div.append(strong,span);summary.append(div);
    };
    metric(issues.length,"Open issues");metric(counts.safe,"Low-risk","safe");
    metric(counts.corner,"Intersections","review");
    metric(counts.duplicate,"Duplicates");metric(counts.join,"Line gaps");
    metric(data?.accepted?.length||0,"Applied fixes");
    const list=$("repairList");list.replaceChildren();
    if(!ready||!data?.scan){
      const p=document.createElement("p");p.className="repair-empty";
      p.textContent=ready?"Select Scan geometry to look for duplicates, gaps, and possible intersection repairs.":
        "Convert your drawing before checking its geometry.";
      list.append(p);
    }else{
      const filter=$("repairFilter").value;
      const filtered=issues.filter(p=>filter==="all"||filter===p.type||
        filter==="safe"&&p.safe||filter==="review"&&!p.safe);
      const toolbar=document.createElement("div");toolbar.className="repair-selection-tools";
      const count=document.createElement("span");count.textContent=selection.length+" selected";
      count.setAttribute("aria-live","polite");toolbar.append(count);
      const all=document.createElement("button");all.type="button";all.textContent="Select visible";
      all.disabled=!filtered.length;
      all.addEventListener("click",()=>{filtered.forEach(p=>selectedIds.add(p.id));if(!chosen())selectedId=filtered[0]?.id||null;render();redraw();});
      const clear=document.createElement("button");clear.type="button";clear.textContent="Clear selection";
      clear.disabled=!selection.length;clear.addEventListener("click",()=>{selectedIds.clear();render();redraw();});
      toolbar.append(all,clear);list.append(toolbar);
      if(!filtered.length){
        const p=document.createElement("p");p.className="repair-empty";
        p.textContent="No outstanding suggestions in this category. This does not guarantee the drawing is error-free.";
        list.append(p);
      }
      const labels={duplicate:"Remove overlapping line",join:"Join disconnected lines",
        corner:"Repair corner intersection"};
      for(let i=0;i<filtered.length;i++){
        const p=filtered[i],row=document.createElement("div"),btn=document.createElement("button");
        row.className="repair-choice"+(selectedIds.has(p.id)?" selected":"");
        const checkbox=document.createElement("input");checkbox.type="checkbox";
        checkbox.checked=selectedIds.has(p.id);
        checkbox.setAttribute("aria-label","Select "+labels[p.type]+" "+p.id);
        checkbox.addEventListener("change",()=>{
          if(checkbox.checked){selectedIds.add(p.id);selectedId=p.id;}else selectedIds.delete(p.id);
          render();redraw();
        });
        btn.type="button";btn.className="repair-row"+(p.id===selectedId?" active":"");
        btn.setAttribute("aria-pressed",String(p.id===selectedId));
        const no=document.createElement("span");no.className="repair-index";no.textContent=String(i+1).padStart(2,"0");
        const main=document.createElement("span");main.className="repair-row-main";
        const name=document.createElement("strong");name.textContent=labels[p.type];
        const detail=document.createElement("small");detail.textContent=p.gapPx+" px · "+Math.round(p.confidence*100)+"% geometric confidence";
        main.append(name,detail);
        const risk=document.createElement("span");risk.className="repair-risk "+(p.safe?"safe":"review");
        risk.textContent=p.safe?"LOW-RISK":"REVIEW";
        btn.append(no,main,risk);
        btn.addEventListener("click",()=>{
          selectedId=p.id;selectedIds.add(p.id);showOverlay();active=true;drawer.hidden=false;
          const scaleX=$("imageCanvas").width/sheet.width;
          const scaleY=$("imageCanvas").height/sheet.height;
          viewport.centerOn(p.anchor[0]*scaleX,p.anchor[1]*scaleY);
          render();redraw();
        });
        row.append(checkbox,btn);list.append(row);
      }
    }
    const detail=$("repairDetail");
    detail.hidden=!selected;
    if(!selected)return;
    const labels={duplicate:"Duplicate line detected",join:"Disconnected collinear linework",
      corner:"Possible trim / extend intersection"};
    $("repairSelectedId").textContent=selected.id;
    $("repairSelectedTitle").textContent=labels[selected.type];
    $("repairSelectedReason").textContent=selected.reason;
    const metrics=$("repairSelectedMetrics");metrics.replaceChildren();
    for(const [label,value] of [["Gap / offset",selected.gapPx+" px"],
      ["Confidence",Math.round(selected.confidence*100)+"%"],
      ["Classification",selected.safe?"Low-risk":"Requires review"]]){
      const div=document.createElement("div"),caption=document.createElement("span"),strong=document.createElement("strong");
      caption.textContent=label;strong.textContent=value;div.append(caption,strong);metrics.append(div);
    }
  }
  function rescan(sheet=getSheet()){
    if(!sheet||sheet.status!=="done")return;
    const s=session(sheet),tol=verifiedTolerance();
    selectedIds.clear();selectedId=null;
    s.scan=analyzeRepairs(sheet.paths,{tolerance:tol,duplicateTolerance:Math.min(.85,tol*.35)});
    const ids=new Set(s.scan.proposals.map(x=>x.id));
    s.dismissed=new Set([...s.dismissed].filter(id=>ids.has(id)));
    if(!s.scan.proposals.some(p=>p.id===selectedId&&!s.dismissed.has(p.id)))selectedId=null;
    if(s.scan.stats.capped)status("Repair scan reached its safety cap. Review the available suggestions; other issues may remain.");
    render();redraw();
  }
  function open(){
    active=true;drawer.hidden=false;showOverlay();
    if(getSheet()?.status==="done"&&!results(getSheet())?.scan){
      status("Scanning reconstructed line endpoints for repair suggestions...");
      rescan();
    }else render();
    redraw();
  }
  function close(){
    active=false;drawer.hidden=true;redraw();
  }
  function apply(proposals){
    const sheet=getSheet();if(!sheet||sheet.status!=="done")return;
    const s=session(sheet);
    const source=sheet.paths.slice();
    const result=applyRepairs(source,proposals);
    if(!result.applied.length){status("No proposals could be applied. Rescan to refresh the geometry.");rescan(sheet);return;}
    const before=s.accepted.slice();
    sheet.paths=result.paths;
    s.accepted.push(...result.applied);
    s.undo.push({before:source,after:result.paths,acceptedBefore:before,
      acceptedAfter:s.accepted.slice(),applied:result.applied});
    if(s.undo.length>20)s.undo.shift();
    s.redo=[];s.dismissed.clear();selectedId=null;
    rescan(sheet);onGeometryChanged?.(sheet);refreshStats?.();
    const stats=repairStats(result.applied);
    const skipped=proposals.length-result.applied.length;
    status("Applied "+stats.total+" repair(s): "+stats.duplicate+" duplicates, "+stats.join+
      " joins, "+stats.corner+" intersections. "+(skipped?skipped+" overlapping or stale suggestion(s) skipped; review the refreshed list. ":"")+"Undo is available. Recheck dimensions in CAD.");
  }
  function applySelected(){const proposals=selectedProposals();if(proposals.length)apply(proposals);}
  function applySafe(){
    const sheet=getSheet();if(!sheet||sheet.status!=="done")return;
    const safe=available(sheet).filter(p=>p.safe);
    if(!safe.length)return;
    apply(safe);
  }
  function restore(entry,mode){
    const sheet=getSheet();if(!sheet||sheet.status!=="done")return;
    const s=session(sheet);
    sheet.paths=mode==="undo"?entry.before:entry.after;
    s.accepted=(mode==="undo"?entry.acceptedBefore:entry.acceptedAfter).slice();
    s.dismissed.clear();selectedId=null;rescan(sheet);onGeometryChanged?.(sheet);refreshStats?.();
    status((mode==="undo"?"Undid":"Redid")+" "+entry.applied.length+" CAD repair(s).");
  }
  function undo(){
    const sheet=getSheet(),s=sheet&&results(sheet);if(!s?.undo.length)return;
    const entry=s.undo.pop();s.redo.push(entry);restore(entry,"undo");
  }
  function redo(){
    const sheet=getSheet(),s=sheet&&results(sheet);if(!s?.redo.length)return;
    const entry=s.redo.pop();s.undo.push(entry);restore(entry,"redo");
  }
  function ignore(){
    const sheet=getSheet(),p=chosen();if(!sheet||!p)return;
    session(sheet).dismissed.add(p.id);selectedIds.delete(p.id);selectedId=selectedProposals()[0]?.id||null;render();redraw();
    status("Suggestion dismissed for this scan. It did not change the exported CAD.");
  }
  function resetSheet(sheet){
    if(!sheet)return;
    delete sheet.repairSession;
    if(getSheet()===sheet){selectedId=null;selectedIds.clear();}
    if(getSheet()===sheet){render();redraw();}
  }
  function onSheetChanged(){selectedId=null;selectedIds.clear();render();}
  function report(sheet){
    const s=results(sheet),open=available(sheet);
    const counts=s?.scan?.stats?.counts||null;
    return {
      scanned:Boolean(s?.scan),tolerancePixels:s?.scan?.stats?.tolerance??null,
      sourceAnalyzed:s?.scan?.stats?.analyzedSegments??null,
      scanCapped:Boolean(s?.scan?.stats?.capped),
      acceptedRepairs:s?.accepted||[],
      appliedCounts:repairStats(s?.accepted||[]),
      currentlySuggested:open.length,
      currentlyLowRisk:open.filter(p=>p.safe).length,
      currentSuggestionsByType:counts,
      dismissedThisScan:s?.dismissed?.size||0,
      notCertified:true
    };
  }
  function drawOverlay(ctx,sheet,sx,sy){
    if(!active||getSheet()!==sheet)return;
    const proposals=available(sheet);if(!proposals.length)return;
    ctx.save();ctx.lineWidth=1.5;
    for(const p of proposals.slice(0,300)){
      if(selectedIds.has(p.id)||p.id===selectedId)continue;
      const [x,y]=p.anchor;
      ctx.strokeStyle=p.safe?"#27bca8":"#edac4b";
      ctx.beginPath();ctx.arc(x*sx,y*sy,3,0,Math.PI*2);ctx.stroke();
    }
    const p=chosen();
    for(const p of proposals.filter(item=>selectedIds.has(item.id)||item.id===selectedId)){
      ctx.lineWidth=3;ctx.lineCap="round";
      ctx.strokeStyle="#ffbd67";
      for(const path of p.sourcePaths){
        ctx.beginPath();ctx.moveTo(path[0][0]*sx,path[0][1]*sy);
        ctx.lineTo(path[1][0]*sx,path[1][1]*sy);ctx.stroke();
      }
      ctx.strokeStyle="#42edd5";ctx.setLineDash([8,4]);ctx.lineWidth=2.5;
      for(const path of p.replacementPaths){
        ctx.beginPath();ctx.moveTo(path[0][0]*sx,path[0][1]*sy);
        ctx.lineTo(path[1][0]*sx,path[1][1]*sy);ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(p.anchor[0]*sx,p.anchor[1]*sy,8,0,Math.PI*2);
      ctx.strokeStyle="#ffd977";ctx.stroke();
    }
    ctx.restore();
  }
  $("repairScan").addEventListener("click",()=>{
    const sheet=getSheet();if(!sheet||sheet.status!=="done")return;
    status("Scanning CAD line geometry...");rescan(sheet);open();
    const n=available(sheet).length;status(n+" geometry repair suggestions found. Inspect the overlay before applying.");
  });
  $("repairShow").addEventListener("click",()=>drawer.hidden?open():close());
  $("repairClose").addEventListener("click",close);
  $("repairFilter").addEventListener("change",render);
  $("repairTolerance").addEventListener("change",()=>{
    const sheet=getSheet();if(sheet?.status==="done"){
      selectedId=null;session(sheet).dismissed.clear();rescan(sheet);
      status("Repair gap tolerance changed. Review suggestions at the new value.");
    }else verifiedTolerance();
  });
  $("repairApply").addEventListener("click",applySelected);
  $("repairApplyDrawer").addEventListener("click",applySelected);
  $("repairApplySafe").addEventListener("click",applySafe);
  $("repairSkip").addEventListener("click",ignore);
  $("repairUndo").addEventListener("click",undo);
  $("repairRedo").addEventListener("click",redo);
  document.querySelectorAll(".ribbon-tab").forEach(tab=>tab.addEventListener("click",()=>{
    if(tab.dataset.ribbon==="repair")open();
    else if(active)close();
  }));
  render();
  function reset(){
    active=false;selectedId=null;selectedIds.clear();drawer.hidden=true;
    $("repairStatus").textContent="Convert a sheet to inspect linework.";
    render();
  }
  return {render,onSheetChanged,resetSheet,reset,report,drawOverlay,
    get active(){return active;},get selected(){return chosen();},get selection(){return selectedProposals();}};
}
