// Subtract a PDF white knockout polygon from earlier visible linework.
const box=p=>({x0:Math.min(...p.map(q=>q[0])),x1:Math.max(...p.map(q=>q[0])),y0:Math.min(...p.map(q=>q[1])),y1:Math.max(...p.map(q=>q[1]))});
export function subtractPolygon(path,polygon){
 const a=box(path),b=box(polygon);
 if(a.x1<b.x0||a.x0>b.x1||a.y1<b.y0||a.y0>b.y1)return [path];
 const inside=p=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }return yes;};
 const result=[];let current=[],changed=false;
 const finish=()=>{if(current.length>1)result.push(current);current=[];};
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1];
  for(let j=1;j<polygon.length;j++){
   const c=polygon[j-1],d=polygon[j],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
   if(Math.abs(den)<1e-10)continue;
   const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
   if(t>1e-9&&t<1-1e-9&&u>=0&&u<=1)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  const point=t=>[a[0]+dx*t,a[1]+dy*t];
  for(let k=1;k<cuts.length;k++){
   if(cuts[k]-cuts[k-1]<1e-9)continue;
   if(inside(point((cuts[k]+cuts[k-1])/2))){changed=true;finish();}
   else{const start=point(cuts[k-1]),end=point(cuts[k]);if(!current.length)current.push(start);current.push(end);}
  }
 }
 finish();return changed?result:[path];
}
