export function setSheetPlotScale(sheet,ratio,units){
 const scale=Number(ratio);
 if(!Number.isFinite(scale)||scale<=0)throw Error('Enter a positive plot scale.');
 if(!['feet','inches','millimeters','centimeters','meters'].includes(units))throw Error('Choose CAD drawing units.');
 sheet.annotationScale=scale;sheet.textHeightInches=.1;sheet.units=units;
 // Plot scale determines printed text size, never pixel-to-model calibration.
}
export async function askSheetPlotScales(sheets){
 for(let i=0;i<sheets.length;i++){
  const sheet=sheets[i];
  await new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='sheet-scale-dialog';
   const form=document.createElement('form');form.method='dialog';
   const heading=document.createElement('h2');heading.textContent='What is this sheet’s plot scale?';
   const title=document.createElement('p');title.textContent=(i+1)+' of '+sheets.length+' · '+sheet.name;
   const note=document.createElement('p');note.textContent='Text and dimension labels will print at 0.10″ in Simplex. Calibrate the drawing geometry separately.';
   const label=document.createElement('label');label.textContent='Printed drawing scale';
   const select=document.createElement('select');select.required=true;
   const choices=[['','Choose a scale'],['1','1:1 (full size)'],['48','¼″ = 1′-0″ (1:48)'],['96','⅛″ = 1′-0″ (1:96)'],['120','1″ = 10′ (1:120)'],['240','1″ = 20′ (1:240)'],['360','1″ = 30′ (1:360)'],['600','1″ = 50′ (1:600)'],['100','1:100'],['50','1:50'],['custom','Other — enter 1:n below']];
   for(const [value,text] of choices){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
   const customLabel=document.createElement('label');customLabel.textContent='Custom scale 1 : n';
   const custom=document.createElement('input');custom.type='number';custom.min='0.000001';custom.step='any';custom.disabled=true;customLabel.append(custom);
   select.addEventListener('change',()=>{custom.disabled=select.value!=='custom';custom.required=!custom.disabled;});
   if(sheet.annotationScale){select.value=choices.some(c=>c[0]===String(sheet.annotationScale))?String(sheet.annotationScale):'custom';if(select.value==='custom'){custom.disabled=false;custom.required=true;custom.value=sheet.annotationScale;}}
   label.append(select);
   const unitLabel=document.createElement('label');unitLabel.textContent='CAD drawing units';const units=document.createElement('select');
   for(const name of ['feet','inches','millimeters','centimeters','meters']){const option=document.createElement('option');option.value=name;option.textContent=name;units.append(option);}
   units.value=sheet.units==='unitless'?'feet':sheet.units;unitLabel.append(units);
   const actions=document.createElement('div');actions.className='sheet-scale-actions';
   const later=document.createElement('button');later.type='button';later.textContent='Set later';
   const save=document.createElement('button');save.type='submit';save.textContent='Save sheet scale';
   actions.append(later,save);form.append(heading,title,note,label,customLabel,unitLabel,actions);dialog.append(form);document.body.append(dialog);
   let closed=false;
   const finish=()=>{if(closed)return;closed=true;dialog.close();dialog.remove();resolve();};
   form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;setSheetPlotScale(sheet,select.value==='custom'?custom.value:select.value,units.value);finish();});
   later.addEventListener('click',finish);dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});dialog.showModal();
  });
 }
}
