/**
 * plugin-manager.js v3 — Remote marketplace + local installed plugins
 * Tabs: Marketplace (fetches from backend) | Installed (local)
 * Click plugin card → opens detail page on marketplace site
 * Install → fetches code from API → runs plugin immediately
 */
var PluginManager = (function() {

  var STORAGE_KEY   = 'codex:plugins-v2';
  var ENABLED_KEY   = 'codex:plugins-enabled';
  var MKT_URL_KEY   = 'codex:marketplace-url';
  var _panelEl      = null;
  var _plugins      = [];   // user-installed / created plugins
  var _enabled      = {};
  var _remotePlugins = [];  // fetched from backend
  var _activeTab    = 'marketplace'; // 'marketplace' | 'installed' | 'create'
  var _activePlugin = null; // for edit mode
  var _loading      = false;
  var _editMode     = false;

  // Default marketplace URL — user can change in settings
  function _getMktUrl() {
    return (localStorage.getItem(MKT_URL_KEY) || 'https://codex-marketplace.up.railway.app').replace(/\/+$/, '');
  }

  // Built-in plugins (always available offline)
  var BUILTIN_PLUGINS = [
    { id:'word-count',   builtin:true, installed:true, title:'Word Count',      author:'CodeX', version:'1.0.0', description:'Shows word and character count in status bar.', category:'Editor', icon:'📝',
      code:'(function(CodeX){\n  function update(){\n    var f=CodeX.getActiveFile();if(!f)return;\n    var w=(f.content||"").trim().split(/\\s+/).filter(Boolean).length;\n    var l=(f.content||"").split("\\n").length;\n    CodeX.addStatusBarItem({id:"wc",text:"📝 "+w+"w "+l+"L"});\n  }\n  CodeX.on("editor:change",update);\n  CodeX.on(Events&&Events.FILE_SWITCHED||"file:switched",update);\n  update();\n})(window.PluginAPI||{});' },
    { id:'auto-bracket', builtin:true, installed:true, title:'Auto Bracket',    author:'CodeX', version:'1.0.0', description:'Auto-closes brackets and quotes.', category:'Editor', icon:'🔗',
      code:'(function(CodeX){\n  if(window.Editor&&Editor._ace)Editor._ace.setOption("behavioursEnabled",true);\n})(window.PluginAPI||{});' },
    { id:'todo-tracker', builtin:true, installed:true, title:'TODO Tracker',    author:'CodeX', version:'1.0.0', description:'Lists all TODO/FIXME/HACK comments across project. Use Command Palette → "TODO: Scan All Files"', category:'Code', icon:'✅',
      code:'(function(CodeX){\n  CodeX.addCommand({id:"todo-scan",label:"TODO: Scan All Files",category:"Code",action:function(){\n    var items=[];\n    var files=CodeX.getAllFiles?CodeX.getAllFiles():(typeof AppState!=="undefined"?AppState.files:[]);\n    files.forEach(function(f){(f.content||"").split("\\n").forEach(function(line,i){if(/TODO|FIXME|HACK|NOTE/.test(line))items.push(f.name+":"+(i+1)+" "+line.trim());});});\n    if(!items.length){CodeX.showToast("No TODO comments found!","info");return;}\n    CodeX.showToast(items.slice(0,8).join("\\n")+(items.length>8?"\\n…+"+(items.length-8)+" more":""),"warn");\n  }});\n  CodeX.showToast("✅ TODO Tracker ready — Ctrl+P → TODO","info");\n})(window.PluginAPI||{});' },
    { id:'file-icons',   builtin:true, installed:true, title:'File Icons',      author:'CodeX', version:'1.0.0', description:'Colorful file type icons in file tree.', category:'UI', icon:'🎨',
      code:'(function(CodeX){})(window.PluginAPI||{});' },
    { id:'line-highlight',builtin:true,installed:true, title:'Line Highlighter',author:'CodeX', version:'1.0.0', description:'Highlights current active line.', category:'Editor', icon:'🎯',
      code:'(function(CodeX){\n  if(window.Editor&&Editor._ace)Editor._ace.setHighlightActiveLine(true);\n})(window.PluginAPI||{});' },
    { id:'bracket-color',builtin:true, installed:true, title:'Bracket Colors',  author:'CodeX', version:'1.0.0', description:'Colors matching bracket pairs.', category:'Editor', icon:'🌈',
      code:'(function(CodeX){\n  if(window.Editor&&Editor._ace)Editor._ace.setOption("bracketHighlighting",true);\n})(window.PluginAPI||{});' },
  ];

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    _load(); _loadEnabled();
    _runAllEnabled();

    PanelSystem.register({
      id:'plugins', title:'Plugins',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>',
      render: _render,
      onShow: function(el){ _panelEl=el; _activeTab='marketplace'; _editMode=false; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({id:'plugins-marketplace', label:'Plugins: Open Marketplace',   category:'Plugins', action:function(){ PanelSystem.show('plugins'); }});
      CommandPalette.register({id:'plugins-installed',   label:'Plugins: View Installed',     category:'Plugins', action:function(){ PanelSystem.show('plugins'); _activeTab='installed'; if(_panelEl)_render(_panelEl); }});
      CommandPalette.register({id:'plugins-create',      label:'Plugins: Create New Plugin',  category:'Plugins', action:function(){ PanelSystem.show('plugins'); _activeTab='create'; _editMode=true; _activePlugin=null; if(_panelEl)_render(_panelEl); }});
      CommandPalette.register({id:'plugins-set-url',     label:'Plugins: Set Marketplace URL',category:'Plugins', action:_promptMarketplaceUrl});
    }
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  function _render(container) {
    _panelEl = container;
    if (_editMode) { _renderCreate(container); return; }

    var installedAll = _getAllInstalled();
    var installedCount = installedAll.length;

    container.innerHTML =
      '<div class="pm-panel">' +

        // Tab bar
        '<div class="pm-tabs">' +
          '<button class="pm-tab'+(_activeTab==='marketplace'?' active':'')+'" data-tab="marketplace">🌐 Marketplace</button>' +
          '<button class="pm-tab'+(_activeTab==='installed'?' active':'')+'" data-tab="installed">📦 Installed <span class="pm-tab-count">'+installedCount+'</span></button>' +
          '<button class="pm-tab pm-tab-create" data-tab="create">+ Create</button>' +
        '</div>' +

        // Content
        '<div id="pm-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column">' +
        '</div>' +

      '</div>';

    container.querySelectorAll('.pm-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (btn.dataset.tab === 'create') { _activePlugin=null; _editMode=true; _render(container); return; }
        _activeTab = btn.dataset.tab;
        _render(container);
      });
    });

    var content = container.querySelector('#pm-content');
    if (_activeTab === 'marketplace') _renderMarketplace(content, container);
    else _renderInstalled(content, container);
  }

  // ─── Marketplace tab — fetches from backend ────────────────────────────────
  function _renderMarketplace(content, container) {
    var mktUrl = _getMktUrl();

    content.innerHTML =
      '<div style="padding:8px 10px;border-bottom:1px solid #1a1a1a;display:flex;gap:6px;align-items:center;flex-shrink:0">' +
        '<input id="pm-search" class="pm-search" placeholder="🔍 Search marketplace…">' +
        '<button class="pm-settings-btn" id="pm-url-btn" title="Change marketplace URL">⚙</button>' +
      '</div>' +
      '<div id="pm-remote-list" style="flex:1;overflow-y:auto;padding:8px">' +
        '<div class="pm-loading"><div class="pm-spinner"></div><div style="font-size:12px;color:var(--text-dim);margin-top:8px">Fetching from marketplace…</div></div>' +
      '</div>' +
      '<div style="padding:6px 10px;border-top:1px solid #1a1a1a;font-size:10px;color:var(--text-dim);flex-shrink:0">' +
        '🌐 <a href="'+mktUrl+'" target="_blank" style="color:var(--accent2)">'+mktUrl.replace('https://','')+'</a>' +
      '</div>';

    content.querySelector('#pm-url-btn').addEventListener('click', function() {
      _promptMarketplaceUrl(function(){ _render(container); });
    });

    var searchInput = content.querySelector('#pm-search');
    var _st;
    if (searchInput) searchInput.addEventListener('input', function() {
      clearTimeout(_st);
      _st = setTimeout(function() { _filterRemote(searchInput.value, container); }, 250);
    });

    _fetchRemote(container);
  }

  function _fetchRemote(container) {
    var mktUrl = _getMktUrl();
    var listEl = container.querySelector('#pm-remote-list');

    fetch(mktUrl + '/api/plugins')
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        _remotePlugins = data.plugins || [];
        _renderRemoteCards(listEl, _remotePlugins, container);
      })
      .catch(function(e) {
        if (listEl) listEl.innerHTML =
          '<div style="padding:24px;text-align:center">' +
            '<div style="font-size:28px;margin-bottom:10px">🔌</div>' +
            '<div style="font-size:13px;color:var(--text);margin-bottom:6px">Marketplace offline</div>' +
            '<div style="font-size:11px;color:var(--text-dim);margin-bottom:14px">Cannot reach '+_getMktUrl()+'<br>'+e.message+'</div>' +
            '<button class="btn-sm" id="pm-retry-btn">↻ Retry</button>' +
            '<div style="margin-top:10px;font-size:11px;color:var(--text-dim)">Showing local built-ins below</div>' +
          '</div>' +
          '<div id="pm-local-fallback" style="padding:8px"></div>';
        var retryBtn = container.querySelector('#pm-retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', function(){ _render(container); });
        // Show built-ins as fallback
        var fallback = container.querySelector('#pm-local-fallback');
        if (fallback) _renderRemoteCards(fallback, BUILTIN_PLUGINS.map(function(p){ return Object.assign({},p,{fromBuiltin:true}); }), container);
      });
  }

  function _filterRemote(q, container) {
    var listEl = container.querySelector('#pm-remote-list');
    if (!listEl) return;
    var filtered = q
      ? _remotePlugins.filter(function(p) {
          var s = ((p.title||'')+(p.description||'')+(p.author||'')+(p.tags||[]).join(' ')).toLowerCase();
          return s.indexOf(q.toLowerCase()) !== -1;
        })
      : _remotePlugins;
    _renderRemoteCards(listEl, filtered, container);
  }

  function _renderRemoteCards(listEl, plugins, container) {
    if (!listEl) return;
    if (!plugins.length) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--text-dim)">No plugins found</div>';
      return;
    }

    listEl.innerHTML = plugins.map(function(p) {
      var isInstalled = !!(_enabled[p.id] !== false && (_plugins.find(function(x){return x.id===p.id;}) || BUILTIN_PLUGINS.find(function(x){return x.id===p.id;})));
      var stars = p.rating ? (p.rating).toFixed(1) + '⭐' : '';
      var installs = p.installs ? (p.installs).toLocaleString() + ' installs' : '';

      return '<div class="pm-remote-card" data-id="'+p.id+'">' +
        '<div class="pm-rc-top">' +
          '<span class="pm-rc-icon">'+(p.icon||'🧩')+'</span>' +
          '<div class="pm-rc-info">' +
            '<div class="pm-rc-title">'+_esc(p.title)+'</div>' +
            '<div class="pm-rc-meta">'+_esc(p.author||'')+(p.version?' · v'+_esc(p.version):'')+'</div>' +
          '</div>' +
          (isInstalled ? '<span class="pm-installed-badge">✓ Installed</span>' : '') +
        '</div>' +
        '<div class="pm-rc-desc">'+_esc(p.description||'')+'</div>' +
        (stars||installs ? '<div class="pm-rc-stats">'+(stars?'<span>'+stars+'</span>':'')+(installs?'<span style="color:var(--text-dim)">↓ '+installs+'</span>':'')+'</div>' : '') +
        '<div class="pm-rc-actions">' +
          '<button class="pm-detail-btn" data-id="'+p.id+'">View Details ↗</button>' +
          (isInstalled
            ? '<button class="pm-uninstall-btn" data-id="'+p.id+'" style="color:var(--danger)">Uninstall</button>'
            : '<button class="pm-install-remote-btn btn-sm btn-primary-sm" data-id="'+p.id+'" data-title="'+_esc(p.title)+'">Install</button>'
          ) +
        '</div>' +
      '</div>';
    }).join('');

    // Bind card actions
    listEl.querySelectorAll('.pm-detail-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.open(_getMktUrl() + '/plugin-detail.html?id=' + btn.dataset.id, '_blank');
      });
    });

    listEl.querySelectorAll('.pm-remote-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        window.open(_getMktUrl() + '/plugin-detail.html?id=' + card.dataset.id, '_blank');
      });
    });

    listEl.querySelectorAll('.pm-install-remote-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        _installFromRemote(btn.dataset.id, btn.dataset.title, container, btn);
      });
    });

    listEl.querySelectorAll('.pm-uninstall-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        remove(btn.dataset.id);
        _render(container);
      });
    });
  }

  // ─── Install from remote marketplace ──────────────────────────────────────
  function _installFromRemote(id, title, container, btn) {
    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    var mktUrl = _getMktUrl();

    fetch(mktUrl + '/api/plugins/' + id + '/install')
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(plugin) {
        installObject(plugin);
        if (btn) { btn.textContent = '✓ Installed'; btn.style.background='rgba(63,185,80,.2)'; btn.style.color='var(--success)'; btn.disabled=true; }
        // Re-render after short delay to update installed badge
        setTimeout(function(){ if(container) _render(container); }, 600);
      })
      .catch(function(e) {
        if (btn) { btn.textContent = 'Retry'; btn.disabled = false; }
        if (UI) UI.toast('Install failed: ' + e.message, 'error');
      });
  }

  // ─── Installed tab ────────────────────────────────────────────────────────
  function _renderInstalled(content, container) {
    var all = _getAllInstalled();

    content.innerHTML =
      '<div style="padding:8px 10px;border-bottom:1px solid #1a1a1a;flex-shrink:0;display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-size:11px;color:var(--text-dim)">'+all.length+' plugins installed</span>' +
        '<button class="btn-sm btn-primary-sm" id="pm-go-create" style="font-size:10px;padding:3px 10px">+ Create Plugin</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px">' +
        (all.length === 0
          ? '<div style="padding:24px;text-align:center;font-size:12px;color:var(--text-dim)">No plugins installed.<br>Go to Marketplace to install some!</div>'
          : all.map(function(p) {
              var on = _enabled[p.id] !== false;
              return '<div class="pm-inst-row">' +
                '<span class="pm-inst-icon">'+(p.icon||'🧩')+'</span>' +
                '<div class="pm-inst-info">' +
                  '<div class="pm-inst-title">'+_esc(p.title)+'</div>' +
                  '<div class="pm-inst-meta">'+(p.builtin?'Built-in':'Custom')+' · v'+(p.version||'1.0.0')+'</div>' +
                '</div>' +
                '<div style="display:flex;gap:5px;align-items:center">' +
                  (!p.builtin ? '<button class="pm-edit-btn" data-id="'+p.id+'" style="font-size:10px">Edit</button>' : '') +
                  '<button class="pm-toggle-row'+( on?' pm-toggle-on':'')+'" data-id="'+p.id+'" title="'+(on?'Disable':'Enable')+'">'+( on?'ON':'OFF')+'</button>' +
                '</div>' +
              '</div>';
            }).join('')
        ) +
      '</div>';

    var createBtn = content.querySelector('#pm-go-create');
    if (createBtn) createBtn.addEventListener('click', function(){ _activePlugin=null; _editMode=true; _render(container); });

    content.querySelectorAll('.pm-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var p = _getPlugin(btn.dataset.id); if(p){ _activePlugin=p; _editMode=true; _render(container); }
      });
    });

    content.querySelectorAll('.pm-toggle-row').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id;
        _enabled[id] = !(_enabled[id] !== false);
        _saveEnabled();
        if (_enabled[id]) {
          var p = _getPlugin(id); if(p) _runPlugin(p);
          if (UI) UI.toast('Plugin enabled: ' + id, 'success');
        } else {
          if (UI) UI.toast('Plugin disabled — reload to fully stop', 'info');
        }
        _render(container);
      });
    });
  }

  // ─── Create / Edit plugin ─────────────────────────────────────────────────
  function _renderCreate(container) {
    var p = _activePlugin;
    var isNew = !p;

    container.innerHTML =
      '<div class="pm-panel">' +
        '<div class="pm-header-row">' +
          '<button class="pm-back" id="pm-back">← Back</button>' +
          '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">'+(isNew?'Create Plugin':'Edit: '+_esc(p?p.title:''))+'</span>' +
        '</div>' +
        '<div style="padding:10px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px">' +
          '<div style="display:flex;gap:8px">' +
            '<div style="flex:1"><div class="ai-field-label">Name</div><input id="pm-f-title" class="ai-input-field" value="'+_esc(p?p.title:'')+'" placeholder="My Plugin"></div>' +
            '<div style="width:60px"><div class="ai-field-label">Icon</div><input id="pm-f-icon" class="ai-input-field" value="'+(p?p.icon||'🧩':'🧩')+'" maxlength="4"></div>' +
          '</div>' +
          '<div><div class="ai-field-label">Description</div><input id="pm-f-desc" class="ai-input-field" value="'+_esc(p?p.description:'')+'" placeholder="What it does…"></div>' +
          '<div style="display:flex;gap:8px">' +
            '<div style="flex:1"><div class="ai-field-label">Category</div>' +
              '<select id="pm-f-cat" class="ai-select"><option>Editor</option><option>UI</option><option>Code</option><option>AI</option><option>Other</option></select>' +
            '</div>' +
            '<div style="flex:1"><div class="ai-field-label">Version</div><input id="pm-f-ver" class="ai-input-field" value="'+(p?p.version||'1.0.0':'1.0.0')+'"></div>' +
          '</div>' +
          '<div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
              '<div class="ai-field-label">JavaScript Code</div>' +
              '<div style="display:flex;gap:5px">' +
                '<button class="btn-sm" id="pm-load-tpl" style="font-size:10px;padding:2px 8px">Template</button>' +
                '<button class="btn-sm" id="pm-test-run" style="font-size:10px;padding:2px 8px">▶ Test</button>' +
              '</div>' +
            '</div>' +
            '<textarea id="pm-f-code" class="pm-code-editor" spellcheck="false">'+_esc(p?p.code||'':_defaultTemplate())+'</textarea>' +
          '</div>' +
          '<div style="background:#0d1117;border:1px solid #30363d;border-radius:5px;padding:8px;font-size:10px;color:#8b949e;font-family:var(--font-code);line-height:1.9">' +
            '<strong style="color:#e6edf3">API:</strong> CodeX.getActiveFile() · CodeX.setFileContent(txt) · CodeX.getAllFiles()<br>' +
            'CodeX.addCommand({label,action}) · CodeX.addStatusBarItem({text,onClick})<br>' +
            'CodeX.showToast("msg","success|error|info") · CodeX.on("editor:change",fn)' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn-sm" id="pm-cancel-create">Cancel</button>' +
            '<button class="btn-sm btn-primary-sm" id="pm-save-plugin" style="flex:1">💾 Save Plugin</button>' +
          '</div>' +
          '<div id="pm-create-err" class="hidden" style="font-size:11px;color:var(--danger)"></div>' +
        '</div>' +
      '</div>';

    // Set category select
    var catSel = container.querySelector('#pm-f-cat');
    if (catSel && p && p.category) catSel.value = p.category;

    container.querySelector('#pm-back').addEventListener('click', function(){ _editMode=false; _activePlugin=null; _render(container); });
    container.querySelector('#pm-cancel-create').addEventListener('click', function(){ _editMode=false; _activePlugin=null; _render(container); });

    container.querySelector('#pm-load-tpl').addEventListener('click', function(){
      container.querySelector('#pm-f-code').value = _defaultTemplate();
    });

    container.querySelector('#pm-test-run').addEventListener('click', function(){
      var code = container.querySelector('#pm-f-code').value;
      try {
        _runPlugin({ id:'test', code:code, title:'Test' });
        if (UI) UI.toast('✅ Plugin ran without errors', 'success');
      } catch(e) { if (UI) UI.toast('❌ Error: '+e.message, 'error'); }
    });

    container.querySelector('#pm-save-plugin').addEventListener('click', function(){
      var title = (container.querySelector('#pm-f-title').value||'').trim();
      var code  = (container.querySelector('#pm-f-code').value||'').trim();
      var errEl = container.querySelector('#pm-create-err');
      if (!title) { errEl.textContent='Name required'; errEl.classList.remove('hidden'); return; }
      if (!code)  { errEl.textContent='Code required';  errEl.classList.remove('hidden'); return; }
      errEl.classList.add('hidden');

      var plugin = p ? Object.assign({}, p) : { id:'user-'+Date.now(), builtin:false, installed:true };
      plugin.title       = title;
      plugin.icon        = (container.querySelector('#pm-f-icon').value||'🧩');
      plugin.description = (container.querySelector('#pm-f-desc').value||'').trim();
      plugin.category    = container.querySelector('#pm-f-cat').value || 'Other';
      plugin.version     = (container.querySelector('#pm-f-ver').value||'1.0.0').trim();
      plugin.code        = code;
      plugin.author      = 'You';
      plugin.installed   = true;
      plugin.builtin     = false;

      _plugins = _plugins.filter(function(x){ return x.id !== plugin.id; });
      _plugins.push(plugin);
      _enabled[plugin.id] = true;
      _save(); _saveEnabled();
      _runPlugin(plugin);

      _editMode=false; _activePlugin=null; _activeTab='installed';
      _render(container);
      if (UI) UI.toast('✅ '+plugin.title+' saved!', 'success');
    });
  }

  // ─── Plugin runner — full CodeX API ───────────────────────────────────────
  function _runPlugin(p) {
    if (!p || !p.code) return;

    var CodeX = {
      Events: typeof Events !== 'undefined' ? Events : {},
      on:  function(e,cb)  { try{ EventBus.on(e,cb); }catch(ex){} },
      off: function(e,cb)  { try{ if(EventBus.off) EventBus.off(e,cb); }catch(ex){} },
      emit:function(e,d)   { try{ EventBus.emit(e,d); }catch(ex){} },

      getActiveFile: function() {
        try { return typeof getActiveFile!=='undefined' ? getActiveFile() : (AppState.files.find(function(f){return f.id===AppState.activeFileId;})||null); }
        catch(ex){ return null; }
      },
      getAllFiles:    function() { try{ return AppState.files.slice(); }catch(ex){ return []; } },
      setFileContent:function(txt) {
        try { if(Editor&&Editor._ace){ Editor._ace.setValue(txt,-1); var af=getActiveFile(); if(af)af.content=txt; } }catch(ex){}
      },
      openFile: function(name) {
        try { var f=AppState.files.find(function(x){return x.name===name;}); if(f&&Editor) Editor.loadFile(f); }catch(ex){}
      },
      insertText:     function(t){ try{ if(Editor&&Editor._ace) Editor._ace.insert(t); }catch(ex){} },
      getEditorValue: function()  { try{ return Editor&&Editor._ace?Editor._ace.getValue():''; }catch(ex){ return ''; } },

      showToast: function(msg,type){ try{ if(UI&&UI.toast) UI.toast(msg,type||'info'); }catch(ex){ console.log('[Plugin toast]',msg); } },

      addPanel: function(cfg){ try{ if(typeof PanelSystem!=='undefined') PanelSystem.register(cfg); }catch(ex){} },
      showPanel:function(id) { try{ if(typeof PanelSystem!=='undefined') PanelSystem.show(id); }catch(ex){} },

      addCommand: function(cmd){
        try{
          if(typeof CommandPalette!=='undefined') CommandPalette.register({
            id: cmd.id||('plugin-cmd-'+Date.now()),
            label: cmd.label||cmd.name||'Plugin Command',
            category: cmd.category||'Plugins',
            action: cmd.action||cmd.run||function(){}
          });
        }catch(ex){ console.warn('[Plugin addCommand]',ex); }
      },

      addStatusBarItem: function(cfg){
        try{
          if(!cfg) return;
          var bar = document.getElementById('status-bar'); if(!bar) return;
          var id  = 'status-plugin-'+(cfg.id||('p'+Date.now()));
          var el  = document.getElementById(id);
          if(!el){
            el=document.createElement('span');
            el.id=id; el.className='status-item';
            el.style.cursor=cfg.onClick?'pointer':'default';
            if(cfg.onClick) el.addEventListener('click',cfg.onClick);
            var anchor=bar.querySelector('.status-plugin-anchor');
            if(anchor) bar.insertBefore(el,anchor); else bar.appendChild(el);
          }
          el.textContent=cfg.text||'';
          el.title=cfg.tooltip||'';
        }catch(ex){ console.warn('[Plugin statusBar]',ex); }
      },

      storage:{
        get:    function(k){ try{ return JSON.parse(localStorage.getItem('codex:plugin:'+p.id+':'+k)); }catch(ex){ return null; } },
        set:    function(k,v){ try{ localStorage.setItem('codex:plugin:'+p.id+':'+k,JSON.stringify(v)); }catch(ex){} },
        remove: function(k){ localStorage.removeItem('codex:plugin:'+p.id+':'+k); },
      },

      AppState: typeof AppState!=='undefined' ? AppState : {},
      Editor:   typeof Editor!=='undefined'   ? Editor   : {},
      UI:       typeof UI!=='undefined'       ? UI       : {},
    };

    try {
      var fn = new Function(
        'CodeX','AppState','Editor','EventBus','Events',
        'PanelSystem','UI','CommandPalette','FolderTree',
        'TabManager','saveToStorage','createFileObject','getActiveFile',
        p.code
      );
      fn(
        CodeX, AppState, Editor, EventBus, Events,
        PanelSystem, UI, CommandPalette, FolderTree,
        TabManager, saveToStorage, createFileObject,
        typeof getActiveFile!=='undefined' ? getActiveFile : function(){ return null; }
      );
    } catch(e) {
      console.warn('[Plugin:'+p.id+'] Error:', e.message);
      if (UI) UI.toast('Plugin "'+p.title+'" error: '+e.message, 'error');
    }
  }

  // ─── Run all enabled on boot ───────────────────────────────────────────────
  function _runAllEnabled() {
    _getAllInstalled().forEach(function(p) {
      if (_enabled[p.id] !== false) {
        try { _runPlugin(p); } catch(e) {}
      }
    });
  }

  // ─── Marketplace URL prompt ────────────────────────────────────────────────
  function _promptMarketplaceUrl(cb) {
    var cur = _getMktUrl();
    var url = window.prompt('Marketplace API URL:\n(Your Railway/Render backend URL)', cur);
    if (url && url.trim()) {
      localStorage.setItem(MKT_URL_KEY, url.trim().replace(/\/+$/,''));
      if (UI) UI.toast('Marketplace URL updated!', 'success');
      if (cb) cb();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _getAllInstalled() {
    var userIds = _plugins.map(function(p){ return p.id; });
    var builtins = BUILTIN_PLUGINS.filter(function(p){ return userIds.indexOf(p.id)===-1; });
    return builtins.concat(_plugins);
  }

  function _getPlugin(id) {
    return _getAllInstalled().find(function(p){ return p.id===id; }) || null;
  }

  function _defaultTemplate() {
    return '(function(CodeX) {\n\n  // Runs every time CodeX Editor loads this plugin\n\n  CodeX.addCommand({\n    label: "My Plugin: Hello",\n    category: "Plugins",\n    action: function() {\n      var file = CodeX.getActiveFile();\n      CodeX.showToast(file ? "Active: " + file.name : "No file open", "info");\n    }\n  });\n\n  CodeX.addStatusBarItem({\n    id: "my-plugin",\n    text: "⚡ My Plugin",\n    onClick: function() {\n      CodeX.showToast("Plugin clicked!", "success");\n    }\n  });\n\n  CodeX.on("editor:change", function() {\n    // fires on every keystroke\n  });\n\n})(window.PluginAPI || {});';
  }

  // ─── Public install API (called from ?installPlugin= URL param) ────────────
  function installObject(p) {
    if (!p || !p.id) return;
    _plugins = _plugins.filter(function(x){ return x.id!==p.id; });
    _plugins.push(Object.assign({ installed:true, builtin:false }, p));
    _enabled[p.id] = true;
    _save(); _saveEnabled();
    _runPlugin(p);
    if (UI) UI.toast('✅ '+( p.title||'Plugin')+' installed!', 'success');
    if (_panelEl) { _activeTab='installed'; _render(_panelEl); }
  }

  function installScript(code,id){ installObject({id:id||'user-'+Date.now(),title:'Installed Plugin',code:code,installed:true,builtin:false,category:'Other',icon:'🧩'}); }
  function installFromJSON(json) { try{ var p=typeof json==='string'?JSON.parse(json):json; installObject(p); }catch(e){ if(UI)UI.toast('Invalid plugin JSON','error'); } }
  function installHTMLPanel(html,title){ installObject({id:'html-'+Date.now(),title:title||'HTML Panel',html:html,installed:true,builtin:false,category:'UI',icon:'🌐',code:''}); }
  function installFromFilePicker(){ var i=document.createElement('input');i.type='file';i.accept='.js,.json';i.onchange=function(){var f=i.files[0];if(!f)return;var r=new FileReader();r.onload=function(e){var code=e.target.result;if(f.name.endsWith('.json'))installFromJSON(code);else installScript(code,f.name.replace(/\.[^.]+$/,''));};r.readAsText(f);};i.click(); }
  function remove(id){ _plugins=_plugins.filter(function(p){return p.id!==id;});delete _enabled[id];_save();_saveEnabled();if(UI)UI.toast('Plugin removed','info'); }
  function applyAll(){ _runAllEnabled(); }
  function getFileIconSVG(){ return null; }
  function getFileIconSvg(){ return null; }
  function getBuiltinPlugins(){ return BUILTIN_PLUGINS; }
  function getTemplate(type){ return _defaultTemplate(); }

  function _load()        { try{ _plugins=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); }catch(e){ _plugins=[]; } }
  function _save()        { try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(_plugins)); }catch(e){} }
  function _loadEnabled() { try{ _enabled=JSON.parse(localStorage.getItem(ENABLED_KEY)||'{}'); }catch(e){ _enabled={}; } }
  function _saveEnabled() { try{ localStorage.setItem(ENABLED_KEY,JSON.stringify(_enabled)); }catch(e){} }
  function _esc(s)        { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, applyAll, installObject, installScript, installFromJSON,
           installHTMLPanel, installFromFilePicker, remove,
           getFileIconSVG, getFileIconSvg, getBuiltinPlugins, getTemplate };
})();
