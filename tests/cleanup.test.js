import test from "node:test";
import assert from "node:assert/strict";
import {adaptiveBinarize,removeSpeckles,vectorize} from "../src/geometry.js";

function makeScan(w,h,background=240){
  const rgba=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<rgba.length;i+=4){
    rgba[i]=rgba[i+1]=rgba[i+2]=background;rgba[i+3]=255;
  }
  return rgba;
}
test("Adaptive threshold recognizes faint line on gray paper",()=>{
  const w=80,h=60,image=makeScan(w,h,230);
  for(let x=10;x<70;x++){
    const i=(30*w+x)*4;image[i]=image[i+1]=image[i+2]=175;
  }
  const mask=adaptiveBinarize(image,w,h).pixels;
  assert.equal(mask[30*w+20],1);
  assert.equal(mask[10*w+20],0);
  const conversion=vectorize({rgba:image,width:w,height:h,threshold:"adaptive",minLength:15});
  assert.ok(conversion.paths.length>0);
});
test("Optional speckle removal removes isolated pixels but not line segments",()=>{
  const w=40,h=30,p=new Uint8Array(w*h);
  p[2*w+2]=1;p[2*w+3]=1;
  for(let x=10;x<30;x++)p[20*w+x]=1;
  removeSpeckles(p,w,h,3);
  assert.equal(p[2*w+2],0);
  assert.equal(p[2*w+3],0);
  assert.equal(p[20*w+12],1);
});
test("Moore-neighbor filtering preserves diagonal chains",()=>{
  const w=20,h=20,p=new Uint8Array(w*h);
  for(let k=3;k<=8;k++)p[k*w+k]=1;
  removeSpeckles(p,w,h,5);
  assert.equal(p[3*w+3],1);
  assert.equal(p[8*w+8],1);
});
