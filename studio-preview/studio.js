/* StageShow-informed progressive disclosure. This layer reorganizes the
   presentation only; the original local PDF/geometry/DXF engine is untouched. */
(function(){
  "use strict";
  const el=id=>document.getElementById(id);
  function advancedPanel(name,groupIndices,title){
    const pane=el("panel-"+name);
    if(!pane)return;
    const groups=[...pane.children].filter(item=>item.classList.contains("ribbon-group"));
    const selected=groupIndices.map(i=>groups[i]).filter(Boolean);
    if(!selected.length)return;
    const details=document.createElement("details");
    details.className="studio-advanced";
    details.setAttribute("aria-label",title);
    const summary=document.createElement("summary");
    summary.textContent=title+" ";
    const caret=document.createElement("span");
    caret.className="studio-caret";caret.textContent="⌄";caret.setAttribute("aria-hidden","true");
    summary.append(caret);
    const content=document.createElement("div");
    content.className="studio-advanced-content";
    content.setAttribute("aria-label",title+" controls");
    for(const group of selected)content.append(group);
    details.append(summary,content);
    pane.append(details);
    return details;
  }

  // The first row shows what operators actually do, not every tuning control.
  // Inputs keep their IDs and values so app.js continues to work unchanged.
  const advanced=[
    advancedPanel("convert",[1,2,4],"Advanced conversion"),
    advancedPanel("review",[1,2],"Hatch editor")
  ].filter(Boolean);

  for(const details of advanced){
    details.addEventListener("toggle",()=>{
      if(details.open)for(const other of advanced)if(other!==details)other.open=false;
    });
  }
  document.addEventListener("click",event=>{
    if(event.target.closest(".studio-advanced"))return;
    for(const details of advanced)details.open=false;
  });
  document.querySelectorAll(".ribbon-tab").forEach(tab=>
    tab.addEventListener("click",()=>advanced.forEach(item=>item.open=false))
  );
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&advanced.some(item=>item.open)){
      for(const item of advanced)item.open=false;
      // Allow the original app's Escape handler to cancel drawing tools as well.
    }
  });

  const input=el("files");
  const importButton=el("studioImport");
  if(importButton&&input)importButton.addEventListener("click",()=>input.click());

  const quickExport=el("studioExport");
  const mainExport=el("exportSelected");
  if(quickExport&&mainExport){
    const sync=()=>{
      quickExport.disabled=mainExport.disabled;
      quickExport.title=mainExport.disabled?
        "Convert and select a sheet before exporting":
        "Download selected drawing as DXF";
    };
    quickExport.addEventListener("click",()=>{
      if(!mainExport.disabled)mainExport.click();
    });
    new MutationObserver(sync).observe(mainExport,{attributes:true,attributeFilter:["disabled"]});
    sync();
  }

  // Expose the active navigation state to assistive technology without copying
  // or changing any app-side conversion or selection state.
  const tabs=document.querySelectorAll(".ribbon-tab");
  tabs.forEach(tab=>tab.addEventListener("click",()=>{
    for(const item of tabs)item.tabIndex=item===tab?0:-1;
  }));
})();
