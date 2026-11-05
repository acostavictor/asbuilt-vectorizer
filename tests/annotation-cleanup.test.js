import test from 'node:test';
import assert from 'node:assert/strict';
import {detectPrintedDimensions} from '../src/dimensions.js';
import {excludeDimensions} from '../src/annotation-cleanup.js';
const text={value:'200 mm',x:140,y:95,height:12,bbox:{x0:140,y0:83,x1:160,y1:95}};
const witnesses=[[[50,75],[50,125]],[[250,75],[250,125]]];
test('Dimension removal keeps model geometry and unrelated notes',()=>{
 const paths=[[[0,0],[10,10]],[[50,100],[250,100]],...witnesses];
 const texts=[text,{...text,value:'SLOPE 2%',x:20}];
 const dims=detectPrintedDimensions(texts,paths);assert.equal(dims.length,1);
 assert.deepEqual(dims[0].sourcePathIndices,[1,2,3]);
 const result=excludeDimensions(paths,[],texts,dims);
 assert.deepEqual(result.paths,[paths[0]]);assert.equal(result.stats.matched,1);assert.equal(result.texts[0].value,'SLOPE 2%');
 assert.equal(paths.length,4);
});
test('Label-interrupted dimensions match both baseline halves and witnesses',()=>{
 const paths=[[[50,100],[135,100]],[[165,100],[250,100]],...witnesses];
 const dims=detectPrintedDimensions([text],paths);assert.deepEqual(dims[0].autoEndpoints,[[50,100],[250,100]]);
 assert.equal(new Set(dims[0].sourcePathIndices).size,4);
 assert.equal(excludeDimensions(paths,[],[text],dims).paths.length,0);
});
test('Unmatched numeric notes and unrelated circles are retained',()=>{
 const paths=[[[50,100],[250,100]]],circles=[{center:[500,500],radius:20}];
 const dims=detectPrintedDimensions([text],paths);assert.equal(dims[0].autoEndpoints,null);
 const out=excludeDimensions(paths,circles,[text],dims);assert.deepEqual(out.paths,paths);assert.deepEqual(out.texts,[text]);assert.deepEqual(out.circles,circles);
});
