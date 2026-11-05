import {drawingTemplate} from './dxf-template.js';
const pair=(code,value)=>code+'\n'+value+'\n';
function tags(content){
 const lines=content.trimEnd().split('\n');
 if(lines.length%2)throw Error('Incomplete DXF group pair');
 return Array.from({length:lines.length/2},(_,i)=>[Number(lines[i*2]),lines[i*2+1]]);
}
function records(content){
 const result=[];
 for(const tag of tags(content)){
  if(tag[0]===0)result.push([]);
  if(result.length)result.at(-1).push(tag);
 }
 return result;
}
const value=(record,code)=>record?.find(t=>t[0]===code)?.[1];
const serialize=items=>items.map(r=>r.map(t=>pair(...t)).join('')).join('');
function sections(items){
 const result=new Map();let section;
 for(const record of items){
  if(record[0][1]==='SECTION'){section=value(record,2);result.set(section,[]);}
  else if(record[0][1]==='ENDSEC')section=null;
  else if(section)result.get(section).push(record);
 }
 return result;
}
export function completeDrawing(partial,insunits,{textHeight}={}){
 const source=sections(records(partial)),base=records(drawingTemplate);
 const reserved=base.flat().filter(t=>t[0]===5||t[0]===105).map(t=>parseInt(t[1],16));
 let next=Math.max(...reserved)+1;
 const handle=()=>String((next++).toString(16).toUpperCase());
 const model=base.find(r=>r[0][1]==='BLOCK_RECORD'&&value(r,2)==='*Model_Space');
 const modelHandle=value(model,5);
 const additions=new Map();let table;
 for(const record of source.get('TABLES')){
  if(record[0][1]==='TABLE'){table=value(record,2);additions.set(table,[]);}
  else if(record[0][1]==='ENDTAB')table=null;
  else if(table)additions.get(table).push(record);
 }
 const result=[];
 for(let i=0;i<base.length;i++){
  const record=base[i],type=record[0][1];
  if(type==='TABLE'&&additions.has(value(record,2))){
   const existing=[];let j=i+1;
   while(base[j][0][1]!=='ENDTAB')existing.push(base[j++]);
   const names=new Set(existing.map(r=>value(r,2).toUpperCase()));
   const extra=additions.get(value(record,2)).filter(r=>{const name=value(r,2).toUpperCase();if(names.has(name))return false;names.add(name);return true;});
   const owner=value(record,5);
   const defaultLayer=existing.find(r=>r[0][1]==='LAYER'&&value(r,2)==='0');
   const entries=extra.map(r=>{
    const fields=r.slice(1);
    // R2000 custom layers need the same lineweight and plot-style linkage as layer 0.
    // Reuse the scaffold's valid reference; never copy handles from a user's drawing.
    if(r[0][1]==='LAYER')for(const code of [370,390]){
     if(!fields.some(t=>t[0]===code)){
      const fallback=defaultLayer?.find(t=>t[0]===code);
      if(!fallback)throw Error('Default DXF layer is missing field '+code);
      fields.push(fallback.slice());
     }
    }
    return [r[0],[5,handle()],[330,owner],...fields];
   });
   const header=record.map(t=>t[0]===70?[70,String(existing.length+entries.length)]:t);
   result.push(header,...existing,...entries,base[j]);i=j;
  }else{
   result.push(record);
   if(type==='SECTION'&&value(record,2)==='ENTITIES'){
    for(const entity of source.get('ENTITIES'))result.push([entity[0],[5,handle()],[330,modelHandle],...entity.slice(1)]);
   }
  }
 }
 if(textHeight!==undefined){
  const style=result.find(r=>r[0][1]==='STYLE'&&value(r,2)==='SIMPLEX');
  const dimension=result.find(r=>r[0][1]==='DIMSTYLE'&&value(r,2)==='Standard');
  const headerIndex=result.findIndex(r=>r[0][1]==='TABLE'&&value(r,2)==='DIMSTYLE');
  if(style&&dimension&&headerIndex>=0){
   const dimensionStyle=dimension.map(t=>t.slice());
   for(const [code,data] of [[105,handle()],[2,'SIMPLEX'],[140,String(textHeight)],[340,value(style,5)]]){
    const tag=dimensionStyle.find(t=>t[0]===code);if(tag)tag[1]=data;else dimensionStyle.push([code,data]);
   }
   let end=headerIndex+1;while(result[end][0][1]!=='ENDTAB')end++;
   result.splice(end,0,dimensionStyle);
   const count=result[headerIndex].find(t=>t[0]===70);count[1]=String(Number(count[1])+1);
  }
 }
 let content=serialize(result);
 if(textHeight!==undefined){
  content=content.replace(/9\n\$TEXTSTYLE\n7\n[^\n]+\n/,pair(9,'$TEXTSTYLE')+pair(7,'SIMPLEX'));
  content=content.replace(/9\n\$TEXTSIZE\n40\n[^\n]+\n/,pair(9,'$TEXTSIZE')+pair(40,textHeight));
 }
 if(textHeight!==undefined)content=content.replace(/9\n\$DIMSTYLE\n2\n[^\n]+\n/,pair(9,'$DIMSTYLE')+pair(2,'SIMPLEX'));
 content=content.replace(/9\n\$INSUNITS\n70\n[^\n]+\n/,pair(9,'$INSUNITS')+pair(70,insunits));
 content=content.replace(/9\n\$HANDSEED\n5\n[^\n]+\n/,pair(9,'$HANDSEED')+pair(5,next.toString(16).toUpperCase()));
 return content;
}
// Inspect raw output: readers can synthesize absent tables, hiding missing structure.
export function validateDrawingStructure(content){
 const items=records(content),parts=sections(items);
 for(const section of ['HEADER','CLASSES','TABLES','BLOCKS','ENTITIES','OBJECTS'])
  if(!parts.has(section))throw Error('DXF missing required section '+section);
 const tableRecords=parts.get('TABLES'),tables=new Map();let current;
 for(const r of tableRecords){
  if(r[0][1]==='TABLE'){
   if(r[1]?.[0]!==2)throw Error('DXF TABLE must begin with table name (code 2), before handle (code 5)');
   current=value(r,2);tables.set(current,[]);
  }else if(r[0][1]==='ENDTAB')current=null;
  else if(current)tables.get(current).push(r);
 }
 const required={VPORT:[],LTYPE:['ByBlock','ByLayer','Continuous'],LAYER:['0'],STYLE:['Standard'],
  VIEW:[],UCS:[],APPID:['ACAD'],DIMSTYLE:['Standard'],BLOCK_RECORD:['*Model_Space','*Paper_Space']};
 for(const [name,entries] of Object.entries(required)){
  if(!tables.has(name))throw Error('DXF missing required table '+name);
  const names=new Set(tables.get(name).map(r=>value(r,2)?.toUpperCase()));
  for(const entry of entries)if(!names.has(entry.toUpperCase()))throw Error('DXF missing '+name+' entry '+entry);
 }
 const handles=new Set();
 for(const r of items){
  // HEADER's code 5 is HANDSEED, not an object handle.
  if(r[0][1]==='SECTION')continue;
  const h=value(r,5)||value(r,105);
  if(h){if(handles.has(h))throw Error('Duplicate DXF handle '+h);handles.add(h);}
 }
 for(const r of items)for(const [code,target] of r)
  if([330,340,350,360,390].includes(code)&&target!=='0'&&!handles.has(target))throw Error('Unresolved DXF handle '+target);
 const objects=new Map(parts.get('OBJECTS').map(r=>[value(r,5),r]));
 const styles=parts.get('OBJECTS').find(r=>r[0][1]==='ACDBDICTIONARYWDFLT'&&
  r.some(t=>t[0]===3&&t[1]==='Normal'));
 const styleHandles=new Set(styles?.filter(t=>t[0]===350).map(t=>t[1]));
 for(const layer of tables.get('LAYER')){
  const plotStyle=value(layer,390);
  if(!plotStyle)throw Error('DXF LAYER missing PlotStyleName (code 390)');
  if(objects.get(plotStyle)?.[0][1]!=='ACDBPLACEHOLDER'||!styleHandles.has(plotStyle))
   throw Error('DXF LAYER PlotStyleName does not resolve to a registered plot style');
  if(value(layer,370)===undefined)throw Error('DXF LAYER missing lineweight (code 370)');
 }
 // HEADER variables are attached to its SECTION record.
 const head=items.find(r=>r[0][1]==='SECTION'&&value(r,2)==='HEADER');
 const seedIndex=head.findIndex(t=>t[0]===9&&t[1]==='$HANDSEED');
 const seed=parseInt(head[seedIndex+1]?.[1],16);
 if(!Number.isFinite(seed)||seed<=[...handles].reduce((max,h)=>Math.max(max,parseInt(h,16)),0))throw Error('Invalid DXF HANDSEED');
 const blocks=new Set(parts.get('BLOCKS').filter(r=>r[0][1]==='BLOCK').map(r=>value(r,2)?.toUpperCase()));
 for(const name of ['*MODEL_SPACE','*PAPER_SPACE'])if(!blocks.has(name))throw Error('DXF missing space block '+name);
 const dictionaries=parts.get('OBJECTS').filter(r=>r[0][1]==='DICTIONARY');
 if(!dictionaries.length||!dictionaries[0].some(t=>t[0]===3&&t[1]==='ACAD_GROUP'))throw Error('DXF missing root ACAD_GROUP dictionary');
}
