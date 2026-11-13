import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateGrid,patternBounds,pdfPaperSize} from '../generated/dist/src/pdfLayout.js';
import {createImagePdf} from '../generated/dist/src/pdfWriter.js';
for(const [width,height,count] of [[29,29,1],[58,58,4],[180,180,49],[30,29,2],[1,180,7]]) test(`PDF covers ${width}x${height} exactly once`,()=>{
 const tiles=paginateGrid({x:0,y:0,width,height});assert.equal(tiles.length,count);const seen=new Set();
 for(const t of tiles) for(let y=t.y;y<t.y+t.height;y++) for(let x=t.x;x<t.x+t.width;x++){const k=`${x},${y}`;assert.ok(!seen.has(k));seen.add(k);}
 assert.equal(seen.size,width*height);
});
test('cropped bounds preserve canvas coordinates',()=>{const cells=Array(58*58).fill(null);cells[11*58+7]='A1';cells[39*58+35]='A1';assert.deepEqual(patternBounds(cells,58,58),{x:7,y:11,width:29,height:29});assert.equal(patternBounds(Array(4).fill(null),2,2),null);assert.throws(()=>paginateGrid({x:0,y:0,width:181,height:1}));assert.equal(pdfPaperSize('letter').widthPt,612);});
test('multi-page PDF xref addresses every object',async()=>{
 for(const count of [1,2,55]){const blob=createImagePdf(Array.from({length:count},()=>({jpeg:Uint8Array.of(255,216,255,217),pixelWidth:1,pixelHeight:1,widthPt:612,heightPt:792})));const bytes=new Uint8Array(await blob.arrayBuffer());const text=new TextDecoder().decode(bytes);assert.ok(text.includes(`/Count ${count}`));const start=Number(/startxref\n(\d+)/.exec(text)[1]);const xref=new TextDecoder().decode(bytes.slice(start)).split('\n');assert.equal(xref[0],'xref');for(let id=1;id<3+count*3;id++){const offset=Number(xref[id+2].slice(0,10));assert.equal(new TextDecoder().decode(bytes.slice(offset,offset+String(id).length+6)),`${id} 0 obj`);}}
 assert.throws(()=>createImagePdf([]));
});
