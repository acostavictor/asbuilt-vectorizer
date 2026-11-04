$("clearCrop").addEventListener("click",()=>{
  const s=state.sheets[state.selected];if(!s)return;
  s.roi=null;state.cropping=null;
  $("crop").textContent="Select drawing area";viewport.setTool("pan");
  invalidateConversion(s);drawVectors();updateStats();status("Drawing area cleared. Reconvert for full-sheet output.");
});
function cancelSelection(){
  state.calibration=null;state.cropping=null;
  $("calibrate").textContent="Pick two points";$("crop").textContent="Select drawing area";
  drawVectors();
}
function handleViewportPick({nx,ny,tool}){
  const s=state.sheets[state.selected];if(!s)return;
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
