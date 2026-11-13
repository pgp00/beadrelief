import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test('draft ownership, paged PDFs and canvas release in real Chrome', {timeout:600000}, async()=>{
 const port=44000+process.pid%1000, url=`http://127.0.0.1:${port}/`;
 const server=spawn(process.execPath,['scripts/dev-server.cjs',String(port)],{stdio:'ignore'});
 let browser;
 try {
  for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(()=>localStorage.setItem('perler-beads-generator:language','zh'));const a=await context.newPage(),b=await context.newPage();
  console.log('ownership start');await a.goto(url);await a.getByText('已保存',{exact:true}).waitFor();await b.goto(url);await b.getByText('另一标签页正在保存；此页修改不会自动保存。',{exact:true}).waitFor();
  await b.getByLabel('画布宽度',{exact:true}).fill('29');
  await b.getByRole('button',{name:'应用',exact:true}).focus();await b.getByRole('button',{name:'应用',exact:true}).press('Enter');
  await b.waitForTimeout(500);
  assert.equal(await b.evaluate(async()=>(await (await import('/src/project.js')).loadDraft()).width),32);
  const backup=b.waitForEvent('download');
  await b.getByRole('button',{name:'导出项目备份',exact:true}).click();
  assert.ok((await backup).suggestedFilename().endsWith('.json'));
  b.once('dialog',dialog=>dialog.dismiss());await b.reload({waitUntil:'commit',timeout:2000}).catch(()=>{});
  assert.equal(await b.getByLabel('画布宽度',{exact:true}).inputValue(),'29');
  b.once('dialog',dialog=>dialog.accept());

  assert.equal(await b.evaluate(async()=>{const s=await import('/src/draftSession.js');return (await s.acquireDraftWriter()).status;}),'busy');
  console.log('closing owner');await a.close();for(let attempt=0;attempt<100;attempt++){if(await b.evaluate(async()=>!(await navigator.locks.query()).held.some(l=>l.name==='beadrelief:draft-writer')))break;await b.waitForTimeout(50);}assert.equal(await b.evaluate(async()=>(await navigator.locks.query()).held.some(l=>l.name==='beadrelief:draft-writer')),false);await b.reload();await b.getByText('已保存',{exact:true}).waitFor();
  console.log('ownership passed');
  await b.getByRole('button',{name:'导出图纸',exact:true}).click();
  await b.getByLabel('导出格式',{exact:true}).selectOption('pdf');
  await b.getByLabel('PDF 页面',{exact:true}).selectOption('a4');
  assert.equal(await b.getByLabel('PDF 页面',{exact:true}).inputValue(),'a4');
  await b.getByLabel('PDF 页面',{exact:true}).press('Escape');
  await context.close();
  const page=await browser.newPage();
  await page.route(url,r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto(url);
  await mkdir('generated/qa/draft-pdf',{recursive:true});
  const runs=process.env.PDF_MEMORY_BENCH ? [1,8,64,1,8,64,1,8,64,1,8,64] : [1];
  let trial=0;
  for(const layers of runs) {
   console.log('render',layers);const result=await page.evaluate(async({layers})=>{
    const {createProject}=await import('/src/project.js');const {completePalette}=await import('/src/palette.js');const {downloadPrintPdf}=await import('/src/exporters.js');
    const p=createProject(180,180,'PDF QA');p.layers=Array.from({length:layers},(_,i)=>({...p.layers[0],id:`l${i}`,cells:Array.from({length:32400},(_,j)=>completePalette[(j+i)%291].id)}));p.cells=p.layers[0].cells;
    const create=document.createElement.bind(document), live=[];let max=0,maxPixels=0;const documents=[];let firstBlob;
    const originalURL=URL.createObjectURL;URL.createObjectURL=blob=>{documents.push(blob.size);if(layers===1)firstBlob=blob;return originalURL(blob);};
    document.createElement=function(tag,...args){const el=create(tag,...args);if(tag==='canvas'){live.push(el);const encode=el.toBlob.bind(el);el.toBlob=(...args)=>{max=Math.max(max,live.filter(c=>c.width&&c.height).length);maxPixels=Math.max(maxPixels,el.width*el.height);return encode(...args);};}return el;};
    const start=performance.now();await downloadPrintPdf(p,{pdfLayout:'a4',showColorCodes:true,showGuideLines:true,language:'zh',projectName:p.name});
    document.createElement=create;URL.createObjectURL=originalURL;
    const asDataUrl = blob => new Promise(resolve => {const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
    return {layers,ms:performance.now()-start,max,maxPixels,remaining:live.filter(c=>c.width&&c.height).length,sizes:documents,pdf:layers===1?await asDataUrl(firstBlob):null};
   },{layers});
   assert.equal(result.max,1);assert.equal(result.remaining,0);assert.equal(result.sizes.length,layers);assert.ok(result.maxPixels<4000000);
   if(result.pdf){const bytes=Buffer.from(result.pdf.split(',')[1],'base64');assert.match(new TextDecoder().decode(bytes),/\/Count 55\b/);await writeFile('generated/qa/draft-pdf/a4-180.pdf',bytes);delete result.pdf;}
   await writeFile(`generated/qa/draft-pdf/metrics-${layers}-${trial++}.json`,JSON.stringify(result,null,2));
  }
  for(const size of [29,58]) for(const paper of ['a4','letter']){
   const out=await page.evaluate(async({size,paper})=>{const {createProject}=await import('/src/project.js');const {downloadPrintPdf}=await import('/src/exporters.js');const p=createProject(size,size,'Small');p.layers[0].cells.fill(p.amsColors[0].id);p.cells=p.layers[0].cells;let blob;const old=URL.createObjectURL;URL.createObjectURL=b=>{blob=b;return old(b);};await downloadPrintPdf(p,{pdfLayout:paper,showColorCodes:true,showGuideLines:true,language:'en'});URL.createObjectURL=old;return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});},{size,paper});
   const bytes=Buffer.from(out.split(',')[1],'base64');assert.ok(new TextDecoder().decode(bytes).includes(`/Count ${size===29?3:6}`));await writeFile(`generated/qa/draft-pdf/${paper}-${size}.pdf`,bytes);
  }
 } finally {await browser?.close();server.kill();}
});
