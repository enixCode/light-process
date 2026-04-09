export const MANIFEST_JSON = JSON.stringify({
  name: 'Light Process',
  short_name: 'LightProc',
  start_url: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#2563eb',
  description: 'Workflow engine dashboard',
  icons: [],
});

export const SERVICE_WORKER_JS = `self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request)));`;

export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2563eb">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>&#9889;</text></svg>">
<title>Light Process</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}

:root{
  --bg:#ffffff;
  --bg-secondary:#f9fafb;
  --bg-tertiary:#f3f4f6;
  --bg-hover:#f3f4f6;
  --bg-active:#eff6ff;
  --text-primary:#111827;
  --text-secondary:#6b7280;
  --text-tertiary:#9ca3af;
  --border:#e5e7eb;
  --border-strong:#d1d5db;
  --primary:#2563eb;
  --primary-hover:#1d4ed8;
  --primary-light:#dbeafe;
  --primary-text:#1e40af;
  --node-fill:#ffffff;
  --node-stroke:#d1d5db;
  --node-entry-stroke:#2563eb;
  --node-entry-bg:#eff6ff;
  --node-hover-stroke:#2563eb;
  --edge-color:#9ca3af;
  --edge-cond:#d97706;
  --edge-back:#dc2626;
  --badge-bg:#fef3c7;
  --badge-text:#92400e;
  --badge-border:#fde68a;
  --success:#059669;
  --font-sans:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;
  --shadow-sm:0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:0 4px 6px -1px rgba(0,0,0,0.07),0 2px 4px -2px rgba(0,0,0,0.05);
}

@media(prefers-color-scheme:dark){
  :root{
    --bg:#0a0a0f;
    --bg-secondary:#111118;
    --bg-tertiary:#1a1a24;
    --bg-hover:#1a1a24;
    --bg-active:#172554;
    --text-primary:#f3f4f6;
    --text-secondary:#9ca3af;
    --text-tertiary:#6b7280;
    --border:#1f2937;
    --border-strong:#374151;
    --primary:#3b82f6;
    --primary-hover:#60a5fa;
    --primary-light:#1e3a5f;
    --primary-text:#93c5fd;
    --node-fill:#111118;
    --node-stroke:#374151;
    --node-entry-stroke:#3b82f6;
    --node-entry-bg:#172554;
    --node-hover-stroke:#3b82f6;
    --edge-color:#4b5563;
    --edge-cond:#f59e0b;
    --edge-back:#ef4444;
    --badge-bg:#451a03;
    --badge-text:#fcd34d;
    --badge-border:#78350f;
    --success:#34d399;
    --shadow-sm:0 1px 2px rgba(0,0,0,0.3);
    --shadow-md:0 4px 6px -1px rgba(0,0,0,0.4),0 2px 4px -2px rgba(0,0,0,0.3);
  }
}

html,body{height:100%;background:var(--bg);color:var(--text-primary);font:14px/1.5 var(--font-sans);overflow:hidden;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{display:flex;flex-direction:column}

::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--text-tertiary)}

/* ---- HEADER ---- */
header{
  padding:0 16px;height:48px;
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:12px;flex-shrink:0;
  background:var(--bg);
}
.logo{
  font:600 14px/1 var(--font-sans);color:var(--text-primary);
  display:flex;align-items:center;gap:8px;
  letter-spacing:-0.01em;
}
.logo-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:24px;height:24px;background:var(--primary);border-radius:6px;
  font-size:12px;color:#fff;
}
.version{
  font:400 11px var(--font-mono);color:var(--text-tertiary);
  background:var(--bg-tertiary);padding:2px 8px;border-radius:10px;
}
.header-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.status-indicator{
  display:flex;align-items:center;gap:6px;
  font:500 12px var(--font-sans);color:var(--text-secondary);
}
.status-dot{
  width:6px;height:6px;border-radius:50%;background:var(--success);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
}

/* ---- LAYOUT ---- */
main{display:flex;flex:1;overflow:hidden}

#sidebar{
  width:100%;background:var(--bg-secondary);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
}
#detail{display:none;flex:1;flex-direction:column;background:var(--bg);min-width:0}

@media(min-width:768px){
  #sidebar{width:280px;flex-shrink:0}
  #detail{display:flex}
}
@media(max-width:767px){
  body.detail-open #sidebar{display:none}
  body.detail-open #detail{display:flex;width:100%}
}

/* ---- SIDEBAR ---- */
.sidebar-header{
  padding:12px 16px 8px;
  font:600 11px/1 var(--font-sans);color:var(--text-tertiary);
  letter-spacing:0.05em;text-transform:uppercase;
}
.sidebar-list{flex:1;overflow-y:auto;padding:4px 8px}

.wf-card{
  padding:10px 12px;margin:1px 0;border-radius:6px;cursor:pointer;
  border:1px solid transparent;
  transition:background .12s,border-color .12s;
}
.wf-card:hover{background:var(--bg-hover);border-color:var(--border)}
.wf-card.active{background:var(--bg-active);border-color:var(--primary)}
.wf-card .wf-name{font:500 13px/1.3 var(--font-sans);color:var(--text-primary)}
.wf-card.active .wf-name{color:var(--primary)}
.wf-card .wf-meta{
  font:400 12px var(--font-sans);color:var(--text-tertiary);margin-top:4px;
  display:flex;gap:8px;align-items:center;
}
.wf-badge{
  font:500 10px var(--font-sans);padding:1px 6px;
  background:var(--badge-bg);color:var(--badge-text);
  border:1px solid var(--badge-border);border-radius:10px;
}

/* ---- DETAIL PANEL ---- */
.detail-top{
  padding:16px 20px 14px;border-bottom:1px solid var(--border);flex-shrink:0;
  background:var(--bg);
}
.back-btn{
  display:none;background:none;border:none;color:var(--text-secondary);
  font:400 13px var(--font-sans);cursor:pointer;padding:0;margin-bottom:8px;
  transition:color .12s;
}
.back-btn:hover{color:var(--primary)}
@media(max-width:767px){.back-btn{display:flex;align-items:center;gap:4px}}

.detail-title{font:600 18px/1.3 var(--font-sans);color:var(--text-primary);letter-spacing:-0.02em}
.detail-info{
  margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 16px;
  font:400 13px var(--font-sans);color:var(--text-secondary);
}
.detail-info .info-label{color:var(--text-tertiary);margin-right:2px}
.detail-info .info-val{font-family:var(--font-mono);font-size:12px}

.detail-body{flex:1;overflow:auto;padding:20px;width:100%;min-width:0}

/* ---- DAG ---- */
.dag-container{
  position:relative;background:var(--bg-secondary);
  border:1px solid var(--border);border-radius:8px;
  overflow-x:auto;padding:16px;
}
#dag{width:100%;min-height:180px;display:block}
#dag .n-box{
  fill:var(--node-fill);stroke:var(--node-stroke);stroke-width:1.5;rx:6;cursor:pointer;
  transition:stroke .15s;
}
#dag .n-box:hover{stroke:var(--node-hover-stroke)}
#dag .n-box.entry{stroke:var(--node-entry-stroke);fill:var(--node-entry-bg)}
#dag .n-label{fill:var(--text-primary);font:500 11px var(--font-sans);pointer-events:none}
#dag .n-sub{fill:var(--text-secondary);font:400 10px var(--font-mono);pointer-events:none}
#dag .n-type{fill:var(--text-tertiary);font:500 9px var(--font-sans);pointer-events:none;letter-spacing:0.04em;text-transform:uppercase}
#dag .edge{fill:none;stroke:var(--edge-color);stroke-width:1.5}
#dag .edge.cond{stroke:var(--edge-cond);stroke-dasharray:6 3}
#dag .edge.back{stroke:var(--edge-back);stroke-dasharray:4 4}
#dag .arrow-head{fill:var(--edge-color)}
#dag .arrow-head.cond{fill:var(--edge-cond)}
#dag .arrow-head.back{fill:var(--edge-back)}

/* ---- NODE INFO ---- */
.node-info{
  margin-top:16px;border:1px solid var(--border);border-radius:8px;
  overflow:hidden;animation:fade-in .2s ease both;
}
@keyframes fade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.node-info-header{
  padding:10px 14px;background:var(--bg-secondary);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:8px;
}
.node-info-header h3{font:600 13px var(--font-sans);color:var(--text-primary)}
.node-info-header .type-badge{
  font:500 10px var(--font-sans);padding:2px 8px;
  background:var(--primary-light);color:var(--primary-text);
  border-radius:10px;text-transform:uppercase;letter-spacing:0.02em;
}
.node-info-body{padding:4px 14px}
.info-row{
  display:flex;padding:8px 0;border-bottom:1px solid var(--bg-tertiary);
  font:400 13px var(--font-sans);
}
.info-row:last-child{border-bottom:none}
.info-row .k{color:var(--text-tertiary);min-width:100px;flex-shrink:0;font-weight:500;font-size:12px}
.info-row .v{color:var(--text-primary);word-break:break-all;font-family:var(--font-mono);font-size:12px}
.info-row .v.none{color:var(--text-tertiary)}

/* ---- EMPTY STATES ---- */
.empty-state{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:48px 24px;color:var(--text-tertiary);text-align:center;
  min-height:200px;
}
.empty-icon{
  width:48px;height:48px;margin-bottom:16px;border-radius:12px;
  background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;
  color:var(--text-tertiary);font-size:20px;
}
.empty-state p{max-width:280px;line-height:1.6;font-size:13px}
.empty-state code{
  font-family:var(--font-mono);font-size:12px;
  background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;
  color:var(--text-primary);
}

/* ---- FOOTER ---- */
footer{
  padding:0 16px;height:32px;border-top:1px solid var(--border);flex-shrink:0;
  display:flex;align-items:center;justify-content:space-between;
  font:400 11px var(--font-sans);color:var(--text-tertiary);background:var(--bg-secondary);
}
footer .roadmap-items{display:flex;gap:16px}
footer .roadmap-items span{
  padding:2px 8px;border-radius:10px;
  background:var(--bg-tertiary);font-size:10px;color:var(--text-tertiary);
}
</style>
</head>
<body>

<header>
  <div class="logo">
    <span class="logo-icon">&#9889;</span>
    Light Process
  </div>
  <span class="version">__VERSION__</span>
  <span class="version" id="commit-badge" style="display:none">__COMMIT__</span>
  <div class="header-right">
    <span class="status-indicator"><span class="status-dot"></span>Online</span>
  </div>
</header>

<main>
  <div id="sidebar">
    <div class="sidebar-header">Workflows</div>
    <div class="sidebar-list" id="workflow-list"></div>
  </div>
  <div id="detail">
    <div class="detail-top" id="detail-top"></div>
    <div class="detail-body" id="detail-body">
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
        </div>
        <p>Select a workflow from the sidebar to inspect its DAG structure and node configuration</p>
      </div>
    </div>
  </div>
</main>

<footer>
  <span>Light Process Dashboard</span>
  <div class="roadmap-items">
    <span>history</span>
    <span>live-run</span>
    <span>streaming</span>
  </div>
</footer>

<script>
const $ = s => document.querySelector(s);
let workflows = [];
let current = null;
let selectedNode = null;

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
async function api(url){const r=await fetch(url);return r.json()}

async function loadList(){
  workflows=await api('/api/workflows');
  const el=$('#workflow-list');
  if(!workflows.length){
    el.innerHTML='<div class="empty-state"><div class="empty-icon"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p>No workflows loaded.<br>Run <code>light serve</code> to get started.</p></div>';
    return;
  }
  el.innerHTML=workflows.map(wf=>
    '<div class="wf-card" data-id="'+wf.id+'">'
    +'<div class="wf-name">'+esc(wf.name)+'</div>'
    +'<div class="wf-meta">'
    +'<span>'+wf.nodeCount+' nodes</span>'
    +'<span>'+wf.linkCount+' links</span>'
    +(wf.entryNodes.length?'<span class="wf-badge">'+wf.entryNodes.length+' entry</span>':'')
    +'</div></div>'
  ).join('');
  el.querySelectorAll('.wf-card').forEach(c=>{
    c.addEventListener('click',()=>openWorkflow(c.dataset.id));
  });
  if(workflows.length===1)openWorkflow(workflows[0].id);
}

async function openWorkflow(id){
  current=await api('/api/workflows/'+id);
  selectedNode=null;
  document.body.classList.add('detail-open');
  document.querySelectorAll('.wf-card').forEach(c=>c.classList.toggle('active',c.dataset.id===id));
  renderDetail();
}

function closeDetail(){
  document.body.classList.remove('detail-open');
  current=null;selectedNode=null;
  document.querySelectorAll('.wf-card').forEach(c=>c.classList.remove('active'));
}

function renderDetail(){
  if(!current)return;
  const top=$('#detail-top');
  top.innerHTML=
    '<button class="back-btn" onclick="closeDetail()"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg> Workflows</button>'
    +'<div class="detail-title">'+esc(current.name)+'</div>'
    +'<div class="detail-info">'
    +'<span><span class="info-label">ID</span> <span class="info-val">'+esc(current.id)+'</span></span>'
    +'<span><span class="info-label">Network</span> <span class="info-val">'+(current.network||'default')+'</span></span>'
    +'<span><span class="info-label">Nodes</span> <span class="info-val">'+current.nodes.length+'</span></span>'
    +'<span><span class="info-label">Links</span> <span class="info-val">'+current.links.length+'</span></span>'
    +'</div>';
  const body=$('#detail-body');
  body.innerHTML='<div class="dag-container"><svg id="dag"></svg></div><div id="node-info"></div>';
  renderDAG();
}

function renderDAG(){
  const svg=$('#dag');
  const nodes=current.nodes;
  const links=current.links;
  if(!nodes.length){svg.innerHTML='<text x="16" y="24" fill="var(--text-tertiary)" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">Empty workflow</text>';return;}

  const incoming={},outgoing={};
  nodes.forEach(n=>{incoming[n.id]=[];outgoing[n.id]=[]});
  links.forEach(l=>{
    if(l.maxIterations!=null)return;
    if(outgoing[l.from])outgoing[l.from].push(l.to);
    if(incoming[l.to])incoming[l.to].push(l.from);
  });

  const entrySet=new Set(nodes.filter(n=>incoming[n.id].length===0).map(n=>n.id));

  const layer={};
  const q=Array.from(entrySet);
  q.forEach(id=>layer[id]=0);
  let qi=0;
  while(qi<q.length){
    const nid=q[qi++];
    for(const tid of outgoing[nid]){
      const nl=(layer[nid]||0)+1;
      if(layer[tid]===undefined||nl>layer[tid])layer[tid]=nl;
      if(!q.includes(tid))q.push(tid);
    }
  }
  nodes.forEach(n=>{if(layer[n.id]===undefined)layer[n.id]=0});

  const layers={};
  nodes.forEach(n=>{const l=layer[n.id];if(!layers[l])layers[l]=[];layers[l].push(n)});

  const NW=176,NH=60,PX=56,PY=28;
  const maxL=Math.max(...Object.keys(layers).map(Number));
  const maxN=Math.max(...Object.values(layers).map(l=>l.length));
  const W=(maxL+1)*(NW+PX)+PX;
  const H=maxN*(NH+PY)+PY;

  const pos={};
  for(let l=0;l<=maxL;l++){
    const arr=layers[l]||[];
    const total=arr.length*NH+(arr.length-1)*PY;
    const sy=(H-total)/2;
    arr.forEach((n,i)=>{pos[n.id]={x:PX+l*(NW+PX),y:sy+i*(NH+PY)}});
  }

  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.style.height=Math.max(H,180)+'px';

  let h='<defs>';
  h+='<marker id="a" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" class="arrow-head"/></marker>';
  h+='<marker id="ac" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" class="arrow-head cond"/></marker>';
  h+='<marker id="ab" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" class="arrow-head back"/></marker>';
  h+='</defs>';

  // Edges
  links.forEach(l=>{
    const f=pos[l.from],t=pos[l.to];
    if(!f||!t)return;
    const isB=l.maxIterations!=null;
    const isC=l.hasCondition;
    const cls=isB?'back':isC?'cond':'';
    const mk=isB?'ab':isC?'ac':'a';
    const x1=f.x+NW,y1=f.y+NH/2,x2=t.x,y2=t.y+NH/2;
    if(isB&&x2<=x1){
      const my=Math.min(f.y,t.y)-40;
      h+='<path class="edge '+cls+'" d="M'+x1+' '+y1+' C'+(x1+40)+' '+my+' '+(x2-40)+' '+my+' '+x2+' '+y2+'" marker-end="url(#'+mk+')"/>';
    }else{
      const dx=x2-x1;
      h+='<path class="edge '+cls+'" d="M'+x1+' '+y1+' C'+(x1+dx*.4)+' '+y1+' '+(x2-dx*.4)+' '+y2+' '+x2+' '+y2+'" marker-end="url(#'+mk+')"/>';
    }
  });

  // Nodes
  nodes.forEach(n=>{
    const p=pos[n.id];if(!p)return;
    const isEntry=entrySet.has(n.id);
    h+='<g class="dag-node" onclick="selectNode(\\''+n.id+'\\')" style="cursor:pointer">';
    h+='<rect class="n-box'+(isEntry?' entry':'')+'" x="'+p.x+'" y="'+p.y+'" width="'+NW+'" height="'+NH+'"/>';
    const nm=n.name.length>20?n.name.slice(0,18)+'..':n.name;
    h+='<text class="n-label" x="'+(p.x+12)+'" y="'+(p.y+22)+'">'+esc(nm)+'</text>';
    h+='<text class="n-sub" x="'+(p.x+12)+'" y="'+(p.y+36)+'">'+esc(n.image||'no image')+'</text>';
    h+='<text class="n-type" x="'+(p.x+12)+'" y="'+(p.y+50)+'">'+n.type.toUpperCase()+'</text>';
    h+='</g>';
  });

  svg.innerHTML=h;
}

window.selectNode=function(id){
  const n=current.nodes.find(x=>x.id===id);
  if(!n)return;
  selectedNode=id;
  const el=$('#node-info');
  el.innerHTML=
    '<div class="node-info">'
    +'<div class="node-info-header">'
    +'<h3>'+esc(n.name)+'</h3>'
    +'<span class="type-badge">'+n.type+'</span>'
    +'</div>'
    +'<div class="node-info-body">'
    +ir('ID',n.id)
    +ir('Image',n.image)
    +ir('Entrypoint',n.entrypoint)
    +ir('Files',n.fileCount+' file(s)')
    +ir('Timeout',n.timeout?n.timeout+'ms':null)
    +ir('Inputs',n.hasInputs?'Schema defined':null)
    +ir('Outputs',n.hasOutputs?'Schema defined':null)
    +'</div></div>';
};

function ir(k,v){
  return '<div class="info-row"><span class="k">'+k+'</span><span class="v'+(v?'':' none')+'">'+(v?esc(String(v)):'-')+'</span></div>';
}

loadList();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
</script>
</body>
</html>`;
