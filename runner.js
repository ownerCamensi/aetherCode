/**
 * runner.js v2 — Preview engine with:
 * - Full CDN support (Font Awesome, Google Fonts, Boxicons, any CDN)
 * - Virtual asset resolution (./img.png, /images/img.png → base64)
 * - External <script> and <link> tags load normally (no sandbox blocking)
 * - Inline CSS/JS from other project files
 */
var Runner = (function() {

  var _iframe = null;
  var _panel  = null;

  var _hotReload     = false;
  var _hotTimer      = null;
  var _HOT_KEY       = 'codex:hot-reload';

  function init() {
    _hotReload = localStorage.getItem(_HOT_KEY) === 'true';

    // Hot-reload: re-run preview on every editor change (debounced)
    EventBus.on('editor:change', function() {
      if (!_hotReload || !AppState.previewOpen) return;
      clearTimeout(_hotTimer);
      _hotTimer = setTimeout(function() { run(); }, 900);
    });

    _iframe = document.getElementById('preview-iframe');
    _panel  = document.getElementById('preview-panel');

    // Loosen sandbox to allow CDN scripts
    if (_iframe) {
      _iframe.setAttribute('sandbox',
        'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-top-navigation-by-user-activation'
      );
    }

    var btnRun     = document.getElementById('btn-run');
    var btnStop    = document.getElementById('btn-stop');
    var btnRefresh = document.getElementById('btn-refresh');
    var btnClose   = document.getElementById('btn-close-preview');

    if (btnRun)     btnRun.addEventListener('click',     run);
    if (btnStop)    btnStop.addEventListener('click',    close);
    if (btnRefresh) btnRefresh.addEventListener('click', run);
    if (btnClose)   btnClose.addEventListener('click',   close);

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'run-preview', label:'Run: Run Preview', category:'Run', action: run });
    }
  }

  // ─── Run ─────────────────────────────────────────────────────────────────
  function run() {
    var file = getActiveFile();
    if (!file) { if(UI)UI.toast('No active file to run','warn'); return; }
    var ext  = (file.name.split('.').pop()||'').toLowerCase();
    var content = (Editor && Editor.getValue) ? Editor.getValue() : file.content;
    var html = _buildHTML(file.name, ext, content);
    _load(html);
    _show();
    if (UI) UI.toast('▶ Running '+file.name, 'info');
  }

  function runContent(html) {
    _load(html);
    _show();
  }

  // ─── Build HTML ───────────────────────────────────────────────────────────
  function _buildHTML(filename, ext, content) {
    if (ext === 'html') {
      return _resolveHTML(content, filename);
    }
    if (ext === 'md' || ext === 'markdown') {
      return _markdownPage(content);
    }
    if (ext === 'css') {
      return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'+content+'</style></head><body><div style="padding:20px;font-family:system-ui;color:#333"><p style="color:#888;font-size:13px">CSS preview — add HTML to see full page.</p></div></body></html>';
    }
    if (ext === 'js' || ext === 'ts') {
      return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>'+
        '<script>\nwindow.onerror=function(m,s,l,c,e){document.body.innerHTML=\'<pre style="color:red;padding:12px">Error: \'+m+\' (line \'+l+\')</pre>\';return true;};\n'+
        content+'\n<\/script></body></html>';
    }
    if (['png','jpg','jpeg','gif','webp','svg','ico'].indexOf(ext)!==-1) {
      var src = content.startsWith('data:') ? content : '';
      return '<!DOCTYPE html><html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh"><img src="'+src+'" style="max-width:100%;max-height:100vh"></body></html>';
    }
    // Default: wrap in page
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;padding:16px;}</style></head><body>'+
      '<pre style="white-space:pre-wrap;font-family:inherit">'+_esc(content)+'</pre></body></html>';
  }

  // ─── Resolve HTML: inline CSS/JS from project, resolve asset URLs ─────────
  function _resolveHTML(html, baseFile) {
    var basePath = baseFile ? (baseFile.path||baseFile).split('/').slice(0,-1).join('/') : '';

    // Inline linked CSS files from project
    html = html.replace(/<link\s[^>]*rel=["']stylesheet["'][^>]*>/gi, function(tag) {
      var hm = tag.match(/href=["']([^"']+)["']/);
      if (!hm) return tag;
      var href = hm[1];
      if (href.startsWith('http')||href.startsWith('//')||href.startsWith('//')) return tag; // CDN — keep as-is
      var resolved = _resolveAssetPath(basePath, href);
      var file = _findFile(resolved||href);
      if (file && file.content) return '<style>\n/* '+href+' */\n'+file.content+'\n</style>';
      return tag;
    });

    // Inline linked JS files from project
    html = html.replace(/<script\s[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, function(tag, src) {
      if (src.startsWith('http')||src.startsWith('//')) return tag; // CDN — keep as-is
      var resolved = _resolveAssetPath(basePath, src);
      var file = _findFile(resolved||src);
      if (file && file.content) return '<script>\n/* '+src+' */\n'+file.content+'\n<\/script>';
      return tag;
    });

    // Replace asset paths (img src, CSS url, etc.) with base64 data URIs
    html = html.replace(/(<img[^>]*\ssrc=["'])([^"']+)(["'])/gi, function(m, pre, src, post) {
      if (src.startsWith('http')||src.startsWith('//')||src.startsWith('data:')) return m;
      var resolved = _resolveAssetPath(basePath, src);
      var file = _findFile(resolved||src);
      if (file && file.isImage && file.content && file.content.startsWith('data:')) return pre+file.content+post;
      return m;
    });

    // Inject console capture for output panel
    var consoleScript = '<script>\n'+
      '(function(){\n'+
      'var _log=console.log,_warn=console.warn,_error=console.error;\n'+
      'function _send(l,a){try{window.parent.postMessage({type:"console",level:l,msg:Array.from(a).map(function(x){return typeof x==="object"?JSON.stringify(x,null,2):String(x);}).join(" ")},"*");}catch(e){}}\n'+
      'console.log=function(){_log.apply(console,arguments);_send("log",arguments);};\n'+
      'console.warn=function(){_warn.apply(console,arguments);_send("warn",arguments);};\n'+
      'console.error=function(){_error.apply(console,arguments);_send("error",arguments);};\n'+
      'window.onerror=function(m,s,l,c,e){_send("error",[m+" (line "+l+")"]);};\n'+
      '})();\n'+
      '<\/script>';

    html = html.replace(/<head>/i, '<head>'+consoleScript);
    if (html.indexOf('<head>') === -1) html = consoleScript + html;

    return html;
  }

  function _resolveAssetPath(basePath, assetPath) {
    if (!assetPath) return null;
    if (assetPath.startsWith('/')) return assetPath.slice(1);
    if (!basePath) return assetPath;
    var parts = (basePath+'/'+assetPath).split('/');
    var out = [];
    parts.forEach(function(p){ if(p==='.')return; if(p==='..')out.pop(); else if(p)out.push(p); });
    return out.join('/');
  }

  function _findFile(path) {
    if (!path) return null;
    var norm = path.replace(/^\/+/,'');
    return AppState.files.filter(function(f){
      var fp = (f.path||f.name).replace(/^\/+/,'');
      return fp===norm || f.name===norm || fp.endsWith('/'+norm) || norm.endsWith(f.name);
    })[0] || null;
  }

  function _markdownPage(md) {
    // Simple markdown to HTML for preview
    var html = md
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^### (.+)$/gm,'<h3>$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/```[\w]*\n?([\s\S]*?)```/g,'<pre><code>$1</code></pre>')
      .replace(/^[-*] (.+)$/gm,'<li>$1</li>').replace(/\n\n/g,'<br><br>');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,sans-serif;padding:24px;max-width:800px;margin:0 auto;line-height:1.7}code{background:#f0f0f0;padding:2px 5px;border-radius:3px}pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto}h1,h2,h3{color:#333}</style></head><body>'+html+'</body></html>';
  }

  // ─── Load into iframe ─────────────────────────────────────────────────────
  function _load(html) {
    if (!_iframe) _iframe = document.getElementById('preview-iframe');
    if (!_iframe) return;
    var old = _iframe.getAttribute('data-blob-url');
    if (old) URL.revokeObjectURL(old);
    var blob = new Blob([html], { type:'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    _iframe.setAttribute('data-blob-url', url);
    _iframe.src = url;
    // Forward console messages to output panel
    window.addEventListener('message', _handleConsoleMsg);
  }

  function _handleConsoleMsg(e) {
    if (!e.data || e.data.type !== 'console') return;
    EventBus.emit('output:log', { level: e.data.level||'log', message: e.data.msg });
  }

  // ─── Show / Hide ──────────────────────────────────────────────────────────
  function _show() {
    AppState.previewOpen = true;
    if (!_panel) _panel = document.getElementById('preview-panel');
    if (_panel) _panel.classList.remove('hidden');
    var r=document.getElementById('btn-run'),s=document.getElementById('btn-stop');
    if(r)r.style.display='none';if(s)s.style.display='flex';
    setTimeout(function(){ if(Editor&&Editor.resize)Editor.resize(); },60);
  }

  function close() {
    AppState.previewOpen = false;
    if (!_panel) _panel = document.getElementById('preview-panel');
    if (_panel) _panel.classList.add('hidden');
    if (_iframe) _iframe.src='about:blank';
    var r=document.getElementById('btn-run'),s=document.getElementById('btn-stop');
    if(r)r.style.display='flex';if(s)s.style.display='none';
    setTimeout(function(){ if(Editor&&Editor.resize)Editor.resize(); },60);
  }

  function toggleHotReload() {
    _hotReload = !_hotReload;
    localStorage.setItem(_HOT_KEY, String(_hotReload));
    if (UI) UI.toast('Hot-reload ' + (_hotReload ? '🔥 ON — preview updates as you type' : 'OFF'), _hotReload ? 'success' : 'info');
    return _hotReload;
  }

  function isHotReload() { return _hotReload; }

  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, run, runContent, close, toggleHotReload, isHotReload };
})();
