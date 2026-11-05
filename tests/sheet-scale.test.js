import test from 'node:test';
import assert from 'node:assert/strict';
import {setSheetPlotScale,askSheetPlotScales} from '../src/sheet-scale.js';
import {annotationHeight} from '../src/dxf.js';
import {readFileSync} from 'node:fs';
test('Each sheet has independent printed scale without changing calibration',()=>{
 const a={scale:.25,calibrated:true},b={scale:.75,calibrated:true};
 setSheetPlotScale(a,240,'feet');setSheetPlotScale(b,100,'millimeters');
 assert.equal(annotationHeight(a.units,a.textHeightInches,a.annotationScale),2);
 assert.equal(annotationHeight(b.units,b.textHeightInches,b.annotationScale),254);
 assert.equal(a.scale,.25);assert.equal(b.scale,.75);assert.equal(a.calibrated,true);
 assert.throws(()=>setSheetPlotScale(a,0,'feet'),/positive/);
 assert.throws(()=>setSheetPlotScale(a,100,'unitless'),/units/);
});
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.value='';}
 append(...items){this.children.push(...items);}
 addEventListener(type,fn){this.events[type]=fn;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 remove(){}
 reportValidity(){return true;}
 fire(type){this.events[type]?.({preventDefault(){}});}
}
test('Import question advances sheet by sheet and leaves skipped sheets unconfigured',async()=>{
 const dialogs=[];globalThis.document={createElement:tag=>new Element(tag),body:{append:dialog=>dialogs.push(dialog)}};
 const sheets=[{name:'A',units:'unitless',annotationScale:null},{name:'B',units:'unitless',annotationScale:null}];
 const done=askSheetPlotScales(sheets);assert.equal(dialogs.length,1);
 const form=dialogs[0].children[0],scaleLabel=form.children[3],unitLabel=form.children[5];
 scaleLabel.children[0].value='240';unitLabel.children[0].value='feet';form.fire('submit');
 await Promise.resolve();assert.equal(dialogs.length,2);assert.equal(sheets[0].annotationScale,240);
 const actions=dialogs[1].children[0].children[6];actions.children[0].fire('click');await done;
 assert.equal(sheets[1].annotationScale,null);assert.equal(sheets[0].annotationScale,240);
});
test('All interfaces offer per-sheet scale setup and export blocks missing answers',()=>{
 for(const page of ['index.html','classic/index.html','studio-preview/index.html']){
  const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');assert.match(html,/id="setSheetScale"/);
 }
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/askSheetPlotScales\(state.sheets.slice\(firstNewSheet\)\)/);
 assert.match(app,/if\(s.annotationScale===null\)throw Error/);
});
