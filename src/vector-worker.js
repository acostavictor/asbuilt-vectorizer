import {vectorize} from "./geometry.js";
self.onmessage=({data})=>{
  const {id,width,height,pixels,options}=data;
  try{
    const result=vectorize({rgba:new Uint8ClampedArray(pixels),width,height,...options});
    self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:e?.message||String(e)});}
};