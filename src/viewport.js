// Navigable CAD-style drawing viewport. All coordinates are preview-canvas pixels.
// Pure functions are exported for automated geometry/interaction tests.
export function fitScale(viewWidth,viewHeight,drawingWidth,drawingHeight,padding=34){
  if([viewWidth,viewHeight,drawingWidth,drawingHeight].some(n=>!Number.isFinite(n)||n<=0))return 1;
  return Math.min(1.3,Math.max(.01,Math.min((viewWidth-2*padding)/drawingWidth,(viewHeight-2*padding)/drawingHeight)));
}
export function zoomAround({scale,tx,ty},newScale,anchorX,anchorY){
  if(!Number.isFinite(newScale)||newScale<=0)throw Error("Invalid zoom scale");
  const ratio=newScale/scale;
  return {scale:newScale,tx:anchorX-(anchorX-tx)*ratio,ty:anchorY-(anchorY-ty)*ratio};
}
export function screenToDrawing({scale,tx,ty},screenX,screenY){
  return [(screenX-tx)/scale,(screenY-ty)/scale];
}
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
export function createDrawingViewport({wrapper,stage,readout,crosshair,hint,onPick,onCancel}){
  const state={scale:1,tx:0,ty:0,width:0,height:0,tool:"pan",drag:null,space:false,mode:"fit"};
  function render(){
    stage.style.transform="translate3d("+state.tx+"px,"+state.ty+"px,0) scale("+state.scale+")";
    readout.textContent=Math.round(state.scale*100)+"%";
    wrapper.classList.toggle("mode-pan",state.tool==="pan");
    wrapper.classList.toggle("mode-calibrate",state.tool==="calibrate");
    wrapper.classList.toggle("mode-crop",state.tool==="crop");
    wrapper.classList.toggle("mode-hatch",state.tool==="hatch");
    wrapper.classList.toggle("mode-dimension",state.tool==="dimension");
    const pan=document.getElementById("toolPan");
    if(pan){pan.classList.toggle("active",state.tool==="pan");pan.setAttribute("aria-pressed",String(state.tool==="pan"));}
  }
  function setHint(content){hint.textContent=content;}
  function fit(){
    if(!state.width||!state.height)return;
    const width=wrapper.clientWidth,height=wrapper.clientHeight;
    state.scale=fitScale(width,height,state.width,state.height);
    state.tx=(width-state.width*state.scale)/2;
    state.ty=(height-state.height*state.scale)/2;
    state.mode="fit";render();
  }
  function setDrawing(width,height){
    state.width=width;state.height=height;
    stage.style.width=width+"px";stage.style.height=height+"px";
    stage.querySelectorAll("canvas").forEach(c=>{c.style.width="100%";c.style.height="100%";});
    fit();
  }
  function zoom(factor,anchor=null){
    if(!state.width)return;
    const anchorX=anchor?.[0]??wrapper.clientWidth/2;
    const anchorY=anchor?.[1]??wrapper.clientHeight/2;
    const target=clamp(state.scale*factor,.04,16);
    Object.assign(state,zoomAround(state,target,anchorX,anchorY));
    state.mode="custom";render();
  }
  function centerOn(x,y){
    if(!state.width||!state.height||!Number.isFinite(x)||!Number.isFinite(y))return;
    state.tx=wrapper.clientWidth/2-x*state.scale;
    state.ty=wrapper.clientHeight/2-y*state.scale;
    state.mode="custom";render();
  }
  function actual(){
    if(!state.width)return;
    Object.assign(state,zoomAround(state,1,wrapper.clientWidth/2,wrapper.clientHeight/2));
    state.mode="custom";render();
  }
  function setTool(tool){
    if(!["pan","calibrate","crop","hatch","dimension"].includes(tool))throw Error("Unknown drawing tool");
    state.tool=tool;
    state.drag=null;wrapper.classList.remove("is-panning");
    crosshair.hidden=tool==="pan";
    setHint(tool==="calibrate"?"Calibration: zoom to the endpoints, then click point 1 and point 2. Press Esc to cancel.":
      tool==="crop"?"Drawing area: click two opposite corners. Scroll to zoom; hold Space to pan.":
      tool==="hatch"?"Hatch boundary: click vertices on the drawing. Press Finish hatch after at least three points; Space + drag pans.":
      tool==="dimension"?"Dimension QA: click two measured endpoints; zoom and Space + drag as needed. Esc cancels.":
      "Pan: drag to move the drawing. Scroll to zoom. Use Review & scale to pick precise points.");
    render();
  }
  function relative(e){
    const b=wrapper.getBoundingClientRect();
    return [e.clientX-b.left,e.clientY-b.top];
  }
  function pointerDown(e){
    if(e.target.closest?.("button, input, select, .floating-tools"))return;
    if(stage.hidden||!state.width)return;
    if(e.button!==0&&e.button!==1)return;
    const xy=relative(e);
    const panning=state.tool==="pan"||state.space||e.button===1;
    state.drag={id:e.pointerId,x:xy[0],y:xy[1],tx:state.tx,ty:state.ty,panning};
    wrapper.setPointerCapture?.(e.pointerId);
    if(panning)wrapper.classList.add("is-panning");
    e.preventDefault();
  }
  function pointerMove(e){
    if(state.tool!=="pan"&&!state.space&&!stage.hidden){
      const xy=relative(e);
      crosshair.hidden=false;crosshair.style.left=xy[0]+"px";crosshair.style.top=xy[1]+"px";
    }else crosshair.hidden=true;
    if(!state.drag||state.drag.id!==e.pointerId||!state.drag.panning)return;
    const xy=relative(e);
    state.tx=state.drag.tx+xy[0]-state.drag.x;
    state.ty=state.drag.ty+xy[1]-state.drag.y;
    state.mode="custom";render();
  }
  function pointerUp(e){
    if(!state.drag||state.drag.id!==e.pointerId)return;
    const drag=state.drag;state.drag=null;
    wrapper.classList.remove("is-panning");
    if(wrapper.hasPointerCapture?.(e.pointerId))wrapper.releasePointerCapture(e.pointerId);
    if(drag.panning||!state.width||e.button!==0)return;
    const xy=relative(e);
    if(Math.hypot(xy[0]-drag.x,xy[1]-drag.y)>8)return;
    const [px,py]=screenToDrawing(state,xy[0],xy[1]);
    if(px<0||py<0||px>state.width||py>state.height)return;
    onPick?.({tool:state.tool,previewX:px,previewY:py,nx:px/state.width,ny:py/state.height,
      screenX:xy[0],screenY:xy[1]});
  }
  function pointerCancel(){state.drag=null;wrapper.classList.remove("is-panning");}
  function wheel(e){
    if(stage.hidden||!state.width)return;
    e.preventDefault();
    const anchor=relative(e),factor=Math.exp(-e.deltaY*(e.deltaMode===1?.045:.00125));
    zoom(factor,anchor);
  }
  const editable=e=>e.target instanceof HTMLElement &&
    (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)||e.target.isContentEditable);
  function keydown(e){
    if(e.key==="Escape"&&state.tool!=="pan"){
      e.preventDefault();setTool("pan");onCancel?.();return;
    }
    if(editable(e)||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==="Space"){state.space=true;e.preventDefault();return;}
    const key=e.key.toLowerCase();
    if(key==="f"){e.preventDefault();fit();}
    if(key==="p"){e.preventDefault();setTool("pan");onCancel?.();}
    if(key==="1"){e.preventDefault();actual();}
    if(key==="+"||key==="="){e.preventDefault();zoom(1.25);}
    if(key==="-"){e.preventDefault();zoom(1/1.25);}
  }
  function keyup(e){if(e.code==="Space")state.space=false;}
  wrapper.addEventListener("pointerdown",pointerDown);
  wrapper.addEventListener("pointermove",pointerMove);
  wrapper.addEventListener("pointerup",pointerUp);
  wrapper.addEventListener("pointercancel",pointerCancel);
  wrapper.addEventListener("lostpointercapture",pointerCancel);
  wrapper.addEventListener("pointerleave",()=>{if(!state.drag)crosshair.hidden=true;});
  wrapper.addEventListener("wheel",wheel,{passive:false});
  window.addEventListener("keydown",keydown);
  window.addEventListener("keyup",keyup);
  const resize=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>{
    if(state.mode==="fit")fit();else render();
  }):null;
  resize?.observe(wrapper);
  render();
  return {fit,zoom,actual,centerOn,setDrawing,setTool,setHint,readState:()=>({...state}),
    reset(){state.width=0;state.height=0;state.tool="pan";state.mode="fit";state.drag=null;render();},
    destroy(){resize?.disconnect();wrapper.removeEventListener("wheel",wheel);window.removeEventListener("keydown",keydown);window.removeEventListener("keyup",keyup);}};
}
