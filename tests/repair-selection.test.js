import test from 'node:test';
import assert from 'node:assert/strict';
import {setupRepairUI} from '../src/repair-ui.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.width=300;this.height=300;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(name,value){this[name]=value;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 fire(name='click'){if(!this.disabled)this.listeners[name]?.();}
}
const paths=()=>[[[0,0],[30,0]],[[0,0],[30,0]],[[0,100],[30,100]],[[0,100],[30,100]],[[0,200],[30,200]],[[32,200],[60,200]]];
function harness(input=paths()){
 const elements=new Map(),messages=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 get('repairFilter').value='all';get('repairTolerance').value='3';
 globalThis.document={getElementById:get,createElement:tag=>new Element(tag),querySelectorAll:()=>[]};
 let sheet={paths:input,status:'done',width:300,height:300};
 const ui=setupRepairUI({getSheet:()=>sheet,viewport:{centerOn:()=>{}},status:m=>messages.push(m),redraw:()=>{},showOverlay:()=>{}});
 get('repairScan').fire();
 const rows=()=>get('repairList').children.filter(e=>e.className?.startsWith('repair-choice'));
 const toggle=index=>{const c=rows()[index].children[0];c.checked=!c.checked;c.fire('change');};
 const tool=name=>get('repairList').children[0].children.find(e=>e.textContent===name);
 return {ui,get,rows,toggle,tool,messages,get sheet(){return sheet;},switchSheet:()=>{sheet={paths:paths(),status:'done',width:300,height:300};ui.onSheetChanged();}};
}
test('Checkbox multi-selection applies only checked repairs as one undoable batch',()=>{
 const h=harness(),before=structuredClone(h.sheet.paths);
 assert.equal(h.rows().length,3);assert.equal(h.get('repairApply').disabled,true);
 h.toggle(0);h.toggle(1);assert.equal(h.ui.selection.length,2);
 assert.equal(h.get('repairApply').textContent,'Apply selected (2)');
 h.get('repairApplyDrawer').fire();
 assert.equal(h.sheet.paths.length,4);assert.equal(h.sheet.repairSession.accepted.length,2);
 assert.equal(h.sheet.repairSession.undo.length,1);assert.equal(h.ui.selection.length,0);
 assert.deepEqual(h.sheet.paths.slice(-2),before.slice(-2));
 h.get('repairUndo').fire();assert.deepEqual(h.sheet.paths,before);
 h.get('repairRedo').fire();assert.equal(h.sheet.paths.length,4);
});
test('Visible selection respects filter and keeps checked repairs across filter changes',()=>{
 const h=harness();h.get('repairFilter').value='duplicate';h.get('repairFilter').fire('change');
 h.tool('Select visible').fire();assert.equal(h.ui.selection.length,2);
 h.get('repairFilter').value='join';h.get('repairFilter').fire('change');
 assert.equal(h.ui.selection.length,2);h.tool('Select visible').fire();assert.equal(h.ui.selection.length,3);
 h.toggle(0);assert.equal(h.ui.selection.length,2);
 h.tool('Clear selection').fire();assert.equal(h.ui.selection.length,0);assert.equal(h.get('repairApply').disabled,true);
});
test('Overlapping selected repairs are skipped with a truthful batch result',()=>{
 const h=harness([[[0,0],[30,0]],[[0,0],[30,0]],[[0,0],[30,0]]]);
 h.tool('Select visible').fire();assert.equal(h.ui.selection.length,3);
 h.get('repairApply').fire();assert.equal(h.sheet.repairSession.accepted.length,1);
 assert.match(h.messages.at(-1),/2 overlapping or stale suggestion\(s\) skipped/);
 assert.equal(h.sheet.repairSession.undo.length,1);
});
test('Selection clears on rescans and sheet changes to avoid applying unrelated repairs',()=>{
 const h=harness();h.toggle(0);h.get('repairScan').fire();assert.equal(h.ui.selection.length,0);
 h.toggle(0);h.switchSheet();assert.equal(h.ui.selection.length,0);assert.equal(h.get('repairApply').disabled,true);
});
test('Overlay previews every checked repair',()=>{
 const h=harness();h.toggle(0);h.toggle(1);let pathsDrawn=0;
 const ctx={save(){},restore(){},beginPath(){},moveTo(){pathsDrawn++;},lineTo(){},stroke(){},arc(){},setLineDash(){}};
 h.ui.drawOverlay(ctx,h.sheet,1,1);
 assert.equal(pathsDrawn,6); // Two source lines plus one replacement for each repair.
});
