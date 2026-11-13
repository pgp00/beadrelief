import type { BeadProject } from './types.js';
import type { PrintExportOptions } from './exporters.js';
import type { PdfTile } from './pdfLayout.js';
import { getColor } from './palette.js';

type Usage = Array<{ color: NonNullable<ReturnType<typeof getColor>>; count: number }>;
export function renderPdfPage(project: BeadProject, options: PrintExportOptions, size: {widthPt:number; heightPt:number}, page: number, total: number, legends: number, tiles: PdfTile[], usage: Usage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  try {
    canvas.width = Math.ceil(size.widthPt * 200 / 72); canvas.height = Math.ceil(size.heightPt * 200 / 72);
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas unavailable');
    c.scale(200/72, 200/72); c.fillStyle = 'white'; c.fillRect(0,0,size.widthPt,size.heightPt);
    const zh = options.language !== 'en';
    const label = (text: string, x: number, y: number, font = 9, maxWidth = size.widthPt - 72) => {
      c.fillStyle = '#111827'; c.font = `${font}px Arial, "Microsoft YaHei", sans-serif`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      while (c.measureText(text).width > maxWidth && text.length > 1) text = text.slice(0,-2) + '…';
      c.fillText(text,x,y);
    };
    label(options.projectName || project.name,36,49,14);
    label(options.layerName || (zh ? '合成画布' : 'Composed canvas'),36,67);
    if (options.authorName) label(options.authorName,36,83,9);
    label(`${page+1} / ${total}  ·  BeadRelief`,36,size.heightPt-28);
    const codeFor = (id: string) => { const color = getColor(id)!; c.font = 'bold 7px Arial'; return c.measureText(color.primaryCode).width <= 15 ? color.primaryCode : `[${usage.findIndex(r => r.color.id === id) + 1}]`; };
    const grid = (tile: PdfTile, left: number, top: number, cell: number, codes: boolean) => {
      for (let y = tile.y; y < tile.y+tile.height; y++) for (let x = tile.x; x < tile.x+tile.width; x++) {
        const color = getColor(project.cells[y*project.width+x]); const px = left+(x-tile.x)*cell, py = top+(y-tile.y)*cell;
        c.fillStyle = color?.hex ?? '#ffffff'; c.fillRect(px,py,cell,cell);
        if (codes) {
          c.strokeStyle = '#cbd5e1'; c.lineWidth = .3; c.strokeRect(px,py,cell,cell);
          if (options.showColorCodes && color) {
            const code = codeFor(color.id);
            c.font = 'bold 7px Arial';
            c.fillStyle = color.rgb.reduce((sum,v,i)=>sum+v*[.299,.587,.114][i],0) < 130 ? 'white' : '#111827';
            c.textAlign='center'; c.textBaseline='middle'; c.fillText(code,px+cell/2,py+cell/2);
          }
        }
      }
      if (codes && options.showGuideLines) {
        c.strokeStyle='#475569'; c.lineWidth=.8;
        for(let x=tile.x;x<=tile.x+tile.width;x++) if(x%5===0) {c.beginPath();c.moveTo(left+(x-tile.x)*cell,top);c.lineTo(left+(x-tile.x)*cell,top+tile.height*cell);c.stroke();}
        for(let y=tile.y;y<=tile.y+tile.height;y++) if(y%5===0) {c.beginPath();c.moveTo(left,top+(y-tile.y)*cell);c.lineTo(left+tile.width*cell,top+(y-tile.y)*cell);c.stroke();}
      }
    };
    if (page === 0) {
      label(zh?'总览 · 原画布':'Overview · original canvas',36,110,14);
      label(`${project.width} × ${project.height} · ${usage.reduce((s,r)=>s+r.count,0)} ${zh?'颗':'beads'}`,36,129);
      const scale=Math.min((size.widthPt-96)/project.width,(size.heightPt-240)/project.height);
      grid({x:0,y:0,width:project.width,height:project.height,tileRow:0,tileColumn:0},48,150,scale,false);
      for(let i=0;i<tiles.length;i++) {
        const t=tiles[i];c.strokeStyle='#334155';c.lineWidth=.6;c.strokeRect(48+t.x*scale,150+t.y*scale,t.width*scale,t.height*scale);
        c.fillStyle = 'white'; c.fillRect(49+t.x*scale,151+t.y*scale,16,13);
        label(String(2+legends+i),50+t.x*scale,162+t.y*scale,9,50);
      }
      label(zh?'分块数字为详情页码；用于阅读，不是 1:1 模板。':'Tile numbers are PDF pages. Reading chart; not a 1:1 template.',36,size.heightPt-52,9);
    } else if(page<=legends) {
      label(zh?'色号用量（本份图纸）':'Color usage (this document)',36,110,14);
      label(`${zh?'总量':'Total'}: ${usage.reduce((s,r)=>s+r.count,0)}`,36,129);
      const colWidth=(size.widthPt-72)/3;
      for(let col=0;col<3;col++) label(zh?'色号 / 数量':'Code / Count',36+col*colWidth,153);
      usage.slice((page-1)*60,page*60).forEach((r,i)=>{
        const x=36+Math.floor(i/20)*colWidth,y=171+(i%20)*24;
        c.fillStyle=r.color.hex;c.fillRect(x,y-10,15,15);c.strokeStyle='#94a3b8';c.strokeRect(x,y-10,15,15);
        label(`${codeFor(r.color.id) === r.color.primaryCode ? r.color.primaryCode : codeFor(r.color.id)+" "+r.color.primaryCode}  /  ${r.count}`,x+22,y+1,9,colWidth-25);
      });
      if(!usage.length) label(zh?'空图案，数量为 0。':'Empty pattern; count is 0.',36,180);
    } else {
      const t=tiles[page-1-legends];
      label(`${zh?'行':'Rows'} ${t.y+1}–${t.y+t.height} · ${zh?'列':'Columns'} ${t.x+1}–${t.x+t.width}`,36,108);
      label(`${zh?'分块行 / 列':'Tile row / column'} ${t.tileRow+1} / ${t.tileColumn+1}`,36,124);
      grid(t,52,150,16,true);
      for(let x=0;x<t.width;x++) {c.font='7px Arial';c.textAlign='center';c.textBaseline='alphabetic';c.fillStyle='#111827';c.fillText(String(t.x+x+1),60+x*16,145);c.fillText(String(t.x+x+1),60+x*16,162+t.height*16);}
      for(let y=0;y<t.height;y++){label(String(t.y+y+1),36,160+y*16,7,15);label(String(t.y+y+1),55+t.width*16,160+y*16,7,20);}
      const neighbor=(dy:number,dx:number)=>{const i=tiles.findIndex(v=>v.tileRow===t.tileRow+dy&&v.tileColumn===t.tileColumn+dx);return i<0?'-':String(i+2+legends);};
      label(`${zh?'上 / 下 / 左 / 右':'Up / Down / Left / Right'}: ${neighbor(-1,0)} / ${neighbor(1,0)} / ${neighbor(0,-1)} / ${neighbor(0,1)}`,36,size.heightPt-52);
    }
    return canvas;
  } catch(error) { canvas.width=canvas.height=0; throw error; }
}
