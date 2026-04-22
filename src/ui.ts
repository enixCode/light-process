export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Light Process</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e5e7eb;background:#0b1020;min-height:100vh}
.wrap{max-width:1100px;margin:0 auto;padding:24px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #1f2937}
h1{font-size:18px;font-weight:600;color:#fbbf24}
h1::before{content:"\\26A1 "}
h2{font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin:20px 0 10px}
.token-box{display:flex;gap:8px;align-items:center}
.token-box input{background:#1f2937;border:1px solid #374151;color:#e5e7eb;padding:6px 10px;border-radius:4px;font-family:inherit;font-size:12px;width:240px}
.token-box input:focus{outline:none;border-color:#fbbf24}
button{background:#fbbf24;color:#0b1020;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600}
button:hover{background:#f59e0b}
button:disabled{background:#4b5563;color:#9ca3af;cursor:not-allowed}
button.ghost{background:transparent;color:#9ca3af;border:1px solid #374151}
button.ghost:hover{background:#1f2937;color:#e5e7eb}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.card{background:#111827;border:1px solid #1f2937;border-radius:6px;padding:14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1f2937;gap:10px}
.row:last-child{border-bottom:none}
.row .id{color:#9ca3af;font-size:11px}
.row .name{font-weight:500}
.row .meta{color:#6b7280;font-size:11px}
.pill{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
.pill.running{background:#1e3a8a;color:#93c5fd}
.pill.running::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#93c5fd;margin-right:6px;animation:pulse 1.2s infinite}
.pill.success{background:#064e3b;color:#6ee7b7}
.pill.failed{background:#7f1d1d;color:#fca5a5}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.input-area{display:none;margin-top:10px}
.input-area textarea{width:100%;background:#0b1020;border:1px solid #374151;color:#e5e7eb;padding:8px;border-radius:4px;font-family:inherit;font-size:12px;min-height:80px;resize:vertical}
.input-area textarea:focus{outline:none;border-color:#fbbf24}
.input-area .actions{display:flex;gap:8px;margin-top:8px}
.empty{color:#6b7280;font-style:italic;padding:20px 0;text-align:center}
.detail{background:#0b1020;border:1px solid #1f2937;border-radius:6px;padding:14px;margin-top:16px;display:none}
.detail h3{font-size:13px;margin-bottom:10px;color:#fbbf24}
.detail pre{background:#000;color:#6ee7b7;padding:10px;border-radius:4px;font-size:11px;overflow:auto;max-height:300px}
.detail .close{float:right;color:#9ca3af;cursor:pointer;font-size:20px;line-height:1;border:none;background:none}
.node-row{display:flex;gap:10px;padding:6px 0;font-size:12px;border-bottom:1px dashed #1f2937}
.node-row:last-child{border-bottom:none}
.node-row .ni{width:24px;color:#6b7280}
.node-row .nn{flex:1}
.node-row .nd{color:#9ca3af}
.error-msg{background:#7f1d1d;color:#fca5a5;padding:10px;border-radius:4px;font-size:12px;margin-top:10px}
.hidden{display:none}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Light Process</h1>
    <div class="token-box" id="tokenBox">
      <input type="password" id="token" placeholder="Bearer token" autocomplete="off">
      <button id="saveToken" class="ghost">Save</button>
    </div>
  </header>

  <div class="grid">
    <div>
      <h2>Workflows</h2>
      <div id="workflows" class="card"><div class="empty">Loading...</div></div>
    </div>
    <div>
      <h2>Runs <span id="runsCount" class="meta" style="color:#6b7280;font-size:11px;font-weight:400;margin-left:6px"></span></h2>
      <div id="runs" class="card"><div class="empty">Loading...</div></div>
    </div>
  </div>

  <div id="detail" class="detail">
    <button class="close" id="closeDetail">&times;</button>
    <h3 id="detailTitle">Run detail</h3>
    <div id="detailBody"></div>
  </div>
</div>

<script>
const AUTH_REQUIRED = __AUTH_REQUIRED__;
let token = localStorage.getItem('lp-token') || '';
let currentDetail = null;
let pollTimer = null;

if (token) document.getElementById('token').value = token;
if (!AUTH_REQUIRED) document.getElementById('tokenBox').style.display = 'none';

document.getElementById('saveToken').onclick = () => {
  token = document.getElementById('token').value.trim();
  localStorage.setItem('lp-token', token);
  refresh();
};

document.getElementById('closeDetail').onclick = () => {
  currentDetail = null;
  document.getElementById('detail').style.display = 'none';
};

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: headers() });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

function fmtDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function loadWorkflows() {
  const el = document.getElementById('workflows');
  try {
    const list = await api('/api/workflows');
    if (list.length === 0) {
      el.innerHTML = '<div class="empty">No workflows registered</div>';
      return;
    }
    el.innerHTML = list.map((wf) => \`
      <div class="row">
        <div>
          <div class="name">\${esc(wf.name)}</div>
          <div class="meta">\${esc(wf.id)} - \${wf.nodeCount} node\${wf.nodeCount !== 1 ? 's' : ''}, \${wf.linkCount} link\${wf.linkCount !== 1 ? 's' : ''}</div>
        </div>
        <button data-run="\${esc(wf.id)}">Run</button>
      </div>
      <div class="input-area" id="input-\${esc(wf.id)}">
        <textarea placeholder='{"key":"value"}'>{}</textarea>
        <div class="actions">
          <button data-submit="\${esc(wf.id)}">Submit</button>
          <button class="ghost" data-cancel="\${esc(wf.id)}">Cancel</button>
        </div>
      </div>
    \`).join('');
    el.querySelectorAll('[data-run]').forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-run');
        const area = document.getElementById('input-' + id);
        area.style.display = area.style.display === 'block' ? 'none' : 'block';
      };
    });
    el.querySelectorAll('[data-cancel]').forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute('data-cancel');
        document.getElementById('input-' + id).style.display = 'none';
      };
    });
    el.querySelectorAll('[data-submit]').forEach((b) => {
      b.onclick = async () => {
        const id = b.getAttribute('data-submit');
        const area = document.getElementById('input-' + id);
        const txt = area.querySelector('textarea').value.trim() || '{}';
        let input;
        try { input = JSON.parse(txt); } catch { alert('Invalid JSON'); return; }
        if (typeof input !== 'object' || Array.isArray(input) || input === null) {
          alert('Input must be a JSON object'); return;
        }
        b.disabled = true;
        try {
          await api('/api/workflows/' + encodeURIComponent(id) + '/run', {
            method: 'POST',
            body: JSON.stringify(input),
          });
        } catch (err) {
          alert('Run failed: ' + err.message);
        } finally {
          b.disabled = false;
          area.style.display = 'none';
          refresh();
        }
      };
    });
  } catch (err) {
    el.innerHTML = '<div class="empty">Error: ' + esc(err.message) + '</div>';
  }
}

async function loadRuns() {
  const el = document.getElementById('runs');
  try {
    const list = await api('/api/runs?limit=50');
    document.getElementById('runsCount').textContent = list.length ? '(' + list.length + ')' : '';
    if (list.length === 0) {
      el.innerHTML = '<div class="empty">No runs yet. Click a workflow to start one.</div>';
      return;
    }
    el.innerHTML = list.map((r) => \`
      <div class="row" data-run-id="\${esc(r.id)}" style="cursor:pointer">
        <div>
          <div class="name">\${esc(r.workflowName)}</div>
          <div class="meta">\${fmtTime(r.startedAt)} - \${fmtDuration(r.durationMs != null ? r.durationMs : (Date.now() - r.startedAt))}\${r.currentNode ? ' - ' + esc(r.currentNode) : ''}</div>
        </div>
        <span class="pill \${r.status}">\${r.status}</span>
      </div>
    \`).join('');
    el.querySelectorAll('[data-run-id]').forEach((row) => {
      row.onclick = () => showDetail(row.getAttribute('data-run-id'));
    });
    if (currentDetail) showDetail(currentDetail);
  } catch (err) {
    el.innerHTML = '<div class="empty">Error: ' + esc(err.message) + '</div>';
  }
}

async function showDetail(runId) {
  currentDetail = runId;
  try {
    const r = await api('/api/runs/' + encodeURIComponent(runId));
    const d = document.getElementById('detail');
    d.style.display = 'block';
    document.getElementById('detailTitle').textContent = r.workflowName + ' - ' + r.status;
    const nodesHtml = r.nodes.length ? r.nodes.map((n, i) => \`
      <div class="node-row">
        <div class="ni">\${i + 1}</div>
        <div class="nn">\${esc(n.name)} <span class="pill \${n.status}" style="margin-left:8px">\${n.status}</span></div>
        <div class="nd">\${fmtDuration(n.durationMs)}</div>
      </div>
    \`).join('') : '<div class="empty">No nodes executed yet</div>';
    const errHtml = r.error ? '<div class="error-msg">' + esc(r.error) + '</div>' : '';
    const outHtml = r.output ? '<h3 style="margin-top:14px">Output</h3><pre>' + esc(JSON.stringify(r.output, null, 2)) + '</pre>' : '';
    const inHtml = '<h3 style="margin-top:14px">Input</h3><pre>' + esc(JSON.stringify(r.input, null, 2)) + '</pre>';
    document.getElementById('detailBody').innerHTML = \`
      <div class="meta" style="margin-bottom:10px">\${esc(r.id)} - started \${fmtTime(r.startedAt)} - \${fmtDuration(r.durationMs != null ? r.durationMs : (Date.now() - r.startedAt))}</div>
      \${nodesHtml}
      \${errHtml}
      \${inHtml}
      \${outHtml}
    \`;
  } catch (err) {
    // run may have been evicted, just close
    currentDetail = null;
    document.getElementById('detail').style.display = 'none';
  }
}

function schedule(hasRunning) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(refresh, hasRunning ? 2000 : 10000);
}

async function refresh() {
  await Promise.all([loadWorkflows(), loadRuns()]);
  try {
    const list = await api('/api/runs?status=running&limit=1');
    schedule(list.length > 0);
  } catch {
    schedule(false);
  }
}

refresh();
</script>
</body>
</html>`;
