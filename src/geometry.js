// Pixel-space centerline tracing. Experimental: not engineering-validated.
const offsets = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
export function otsuThreshold(rgba) {
  const hist = new Uint32Array(256); let total=0,sum=0;
  for(let i=0;i<rgba.length;i+=4){const v=Math.round(.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2]);hist[v]++;total++;sum+=v;}
  let mass=0,sub=0,best=-1,value=170;
  for(let t=0;t<256;t++){mass+=hist[t];sub+=t*hist[t];if(!mass||mass===total)continue;
    const diff=sub/mass-(sum-sub)/(total-mass),variance=mass*(total-mass)*diff*diff;
    if(variance>best){best=variance;value=t;}
  }
  return value;
}
// Local-mean adaptive threshold for faded drawings and uneven scan backgrounds.
export function adaptiveBinarize(rgba,width,height,{radius=20,offset=10,masks=[]}={}){
  if(rgba.length!==width*height*4)throw Error("Pixel size mismatch");
  const grayscale=new Uint8Array(width*height),stride=width+1;
  const integral=new Float64Array((width+1)*(height+1));
  for(let y=0;y<height;y++){
    let row=0;
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4,g=Math.round(.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2]);
      grayscale[y*width+x]=g;row+=g;
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  const pixels=new Uint8Array(width*height);let dark=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const x0=Math.max(0,x-radius),y0=Math.max(0,y-radius);
    const x1=Math.min(width,x+radius+1),y1=Math.min(height,y+radius+1);
    const sum=integral[y1*stride+x1]-integral[y0*stride+x1]-
      integral[y1*stride+x0]+integral[y0*stride+x0];
    const mean=sum/((x1-x0)*(y1-y0)),p=y*width+x;
    pixels[p]=grayscale[p]<(mean-offset)&&rgba[p*4+3]>16?1:0;
    dark+=pixels[p];
  }
  if(dark>pixels.length*.62)for(let i=0;i<pixels.length;i++)pixels[i]^=1;
  for(const box of masks){
    const x0=Math.max(0,Math.floor(box.x0-2)),y0=Math.max(0,Math.floor(box.y0-2));
    const x1=Math.min(width,Math.ceil(box.x1+2)),y1=Math.min(height,Math.ceil(box.y1+2));
    for(let y=y0;y<y1;y++)pixels.fill(0,y*width+x0,y*width+x1);
  }
  return {pixels,threshold:"adaptive"};
}
export function removeSpeckles(pixels,width,height,minComponent=0){
  if(minComponent<=1)return pixels;
  const visited=new Uint8Array(pixels.length),stack=[];
  const neighbors=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for(let seed=0;seed<pixels.length;seed++){
    if(!pixels[seed]||visited[seed])continue;
    visited[seed]=1;stack.length=0;stack.push(seed);
    const component=[];
    while(stack.length){
      const index=stack.pop(),x=index%width,y=Math.floor(index/width);
      component.push(index);
      for(const [dx,dy] of neighbors){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const ni=ny*width+nx;
        if(ni===index||!pixels[ni]||visited[ni])continue;
        visited[ni]=1;stack.push(ni);
      }
    }
    if(component.length<minComponent)for(const index of component)pixels[index]=0;
  }
  return pixels;
}
export function binarize(rgba,width,height,threshold=null,masks=[]) {
  if(rgba.length!==width*height*4)throw Error("Pixel size mismatch");
  const t=threshold==null?Math.min(230,otsuThreshold(rgba)+10):+threshold;
  const pixels=new Uint8Array(width*height);let dark=0;
  for(let p=0,i=0;p<pixels.length;p++,i+=4){
    const grey=.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2];
    pixels[p]=grey<t&&rgba[i+3]>16?1:0;dark+=pixels[p];
  }
  if(dark>pixels.length*.62) for(let i=0;i<pixels.length;i++)pixels[i]^=1;
  for(const box of masks){
    const x1=Math.max(0,Math.floor(box.x0-2)),y1=Math.max(0,Math.floor(box.y0-2));
    const x2=Math.min(width,Math.ceil(box.x1+2)),y2=Math.min(height,Math.ceil(box.y1+2));
    for(let y=y1;y<y2;y++)pixels.fill(0,y*width+x1,y*width+x2);
  }
  return {pixels,threshold:t};
}
export function thinZhangSuen(input,width,height,maxIterations=24){
  const pixels=input.slice(),remove=new Uint8Array(pixels.length);let changed=false,iteration=0;
  do{
    changed=false;
    for(let phase=0;phase<2;phase++){
      remove.fill(0);
      for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
        const i=y*width+x;if(!pixels[i])continue;
        const n=[pixels[i-width],pixels[i-width+1],pixels[i+1],pixels[i+width+1],pixels[i+width],pixels[i+width-1],pixels[i-1],pixels[i-width-1]];
        const sum=n[0]+n[1]+n[2]+n[3]+n[4]+n[5]+n[6]+n[7];if(sum<2||sum>6)continue;
        let transitions=0;for(let j=0;j<8;j++)if(!n[j]&&n[(j+1)%8])transitions++;
        if(transitions!==1)continue;
        const valid=phase===0?(!n[0]||!n[2]||!n[4])&&(!n[2]||!n[4]||!n[6]):
          (!n[0]||!n[2]||!n[6])&&(!n[0]||!n[4]||!n[6]);
        if(valid)remove[i]=1;
      }
      for(let i=0;i<remove.length;i++)if(remove[i]){pixels[i]=0;changed=true;}
    }
    iteration++;
  }while(changed&&iteration<maxIterations);
  return {pixels,iterations:iteration,converged:!changed};
}
function neighbors(p,w,h,i){
  const x=i%w,y=Math.floor(i/w),out=[];
  for(let d=0;d<8;d++){
    const [dx,dy]=offsets[d],nx=x+dx,ny=y+dy;
    if(nx<0||nx>=w||ny<0||ny>=h)continue;
    const target=ny*w+nx;if(!p[target])continue;
    if(dx&&dy&&(p[y*w+nx]||p[ny*w+x]))continue;
    out.push([target,d]);
  }
  return out;
}
function distanceToSegment(p,a,b){
  const x=b[0]-a[0],y=b[1]-a[1],d=x*x+y*y;
  if(!d)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/d));
  return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);
}
export function simplifyPath(path,epsilon=1.6){
  if(path.length<=2)return path;
  const mark=new Uint8Array(path.length);mark[0]=mark[path.length-1]=1;
  const stack=[[0,path.length-1]];
  while(stack.length){
    const [start,end]=stack.pop();let index=-1,furthest=epsilon;
    for(let i=start+1;i<end;i++){const d=distanceToSegment(path[i],path[start],path[end]);if(d>furthest){index=i;furthest=d;}}
    if(index!==-1){mark[index]=1;stack.push([start,index],[index,end]);}
  }
  return path.filter((_,i)=>mark[i]);
}
export function traceSkeleton(p,width,height,{minLength=17,epsilon=1.6,maxPaths=25000}={}){
  const visited=new Uint8Array(p.length),paths=[];let truncated=false;
  const available=(i,d)=>(visited[i]&(1<<d))===0;
  function follow(start,next,dir){
    let prev=start,current=next,d=dir,length=0;
    const path=[[start%width,Math.floor(start/width)]];
    for(let safety=0;safety<p.length;safety++){
      length+=Math.hypot(current%width-prev%width,Math.floor(current/width)-Math.floor(prev/width));
      visited[prev]|=1<<d;visited[current]|=1<<((d+4)%8);
      path.push([current%width,Math.floor(current/width)]);
      const possible=neighbors(p,width,height,current).filter(([j])=>j!==prev);
      if(possible.length!==1||!available(current,possible[0][1]))break;
      prev=current;current=possible[0][0];d=possible[0][1];
    }
    if(length>=minLength)paths.push(simplifyPath(path,epsilon));
  }
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<p.length;i++){
      if(!p[i])continue;const n=neighbors(p,width,height,i);
      if(pass===0&&n.length===2)continue;
      for(const [j,d]of n){
        if(!available(i,d))continue;follow(i,j,d);
        if(paths.length>=maxPaths){truncated=true;break;}
      }
      if(truncated)break;
    }
    if(truncated)break;
  }
  return {paths,truncated};
}
export function vectorize({rgba,width,height,threshold=null,minLength=17,epsilon=1.6,masks=[],maxPaths=12000,minComponent=0}){
  const input=threshold==="adaptive"?adaptiveBinarize(rgba,width,height,{masks}):binarize(rgba,width,height,threshold,masks);
  removeSpeckles(input.pixels,width,height,minComponent);
  const result=thinZhangSuen(input.pixels,width,height);
  const traced=traceSkeleton(result.pixels,width,height,{minLength,epsilon,maxPaths});
  return {paths:traced.paths,truncated:traced.truncated,usedThreshold:input.threshold,
    thinningIterations:result.iterations,thinningConverged:result.converged};
}