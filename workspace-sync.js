/**
 * workspace-sync.js — Google Drive sync for projects
 * Uses Google Drive API v3 via access token (OAuth popup)
 */
var WorkspaceSync = (function() {

  var CLIENT_ID   = ''; // user sets this in settings
  var FOLDER_NAME = 'CodeX Editor Projects';
  var _token      = null;
  var _folderId   = null;
  var _panelEl    = null;
  var CONFIG_KEY  = 'codex:drive-config';
  var _cfg        = { clientId:'', lastSync:null };

  function init() {
    try { _cfg = JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}'); } catch(e) {}
    CLIENT_ID = _cfg.clientId || '';

    PanelSystem.register({
      id: 'drive-sync', title: 'Drive',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 3l-6.6 11.4h5l6.6-11.4zm7.8 0l-3.3 5.7 3.3 5.7h6.6l-3.3-5.7zM2 16.2L5.3 22H18.7l-3.3-5.8z" fill="#4285f4"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; }
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'drive-sync',   label:'Drive: Sync Project to Google Drive', category:'File', action: syncProject });
      CommandPalette.register({ id:'drive-pull',   label:'Drive: Pull Project from Google Drive',category:'File', action: pullProject });
      CommandPalette.register({ id:'drive-open',   label:'Drive: Open Drive Sync Panel',         category:'File', action: function(){ PanelSystem.show('drive-sync'); } });
    }
  }

  function _render(container) {
    _panelEl = container;
    var hasToken    = !!_token;
    var hasClientId = !!_cfg.clientId;

    container.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;padding:14px;gap:14px">' +
        // Header
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<svg viewBox="0 0 24 24" style="width:20px;height:20px" fill="currentColor"><path d="M6.6 3l-6.6 11.4h5l6.6-11.4zm7.8 0l-3.3 5.7 3.3 5.7h6.6l-3.3-5.7zM2 16.2L5.3 22H18.7l-3.3-5.8z" fill="#4285f4"/></svg>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:var(--text-bright)">Google Drive Sync</div>' +
            '<div style="font-size:10px;color:var(--text-dim)">Save and load projects from Drive</div>' +
          '</div>' +
          '<div style="margin-left:auto">' +
            (hasToken
              ? '<span style="font-size:9px;background:rgba(63,185,80,.15);color:var(--success);padding:2px 8px;border-radius:8px">● Connected</span>'
              : '<span style="font-size:9px;background:rgba(255,255,255,.08);color:var(--text-dim);padding:2px 8px;border-radius:8px">○ Not connected</span>'
            ) +
          '</div>' +
        '</div>' +

        // Setup
        (!hasClientId ?
          '<div style="background:rgba(66,133,244,.08);border:1px solid rgba(66,133,244,.25);border-radius:8px;padding:12px">' +
            '<div style="font-size:12px;font-weight:600;color:#93c5fd;margin-bottom:8px">Setup Required</div>' +
            '<div style="font-size:11px;color:var(--text-dim);line-height:1.6;margin-bottom:8px">' +
              '1. Go to <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent)">console.cloud.google.com</a><br>' +
              '2. Create a project → Enable Drive API<br>' +
              '3. Create OAuth 2.0 credentials (Web app)<br>' +
              '4. Add your domain to authorized origins<br>' +
              '5. Paste your Client ID below' +
            '</div>' +
            '<input id="drive-client-id" class="ai-input-field" placeholder="Your Google OAuth Client ID (ends in .apps.googleusercontent.com)" value="'+(_cfg.clientId||'')+'"><br>' +
            '<button id="drive-save-client" class="btn-sm btn-primary-sm" style="margin-top:6px;width:100%">Save Client ID</button>' +
          '</div>'
        : '') +

        (hasClientId && !hasToken ?
          '<button id="drive-connect" class="btn-sm btn-primary-sm" style="padding:10px">🔐 Connect Google Account</button>'
        : '') +

        (hasToken ?
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<button id="drive-push" class="btn-sm btn-primary-sm" style="padding:10px">⬆ Push — Save to Drive</button>' +
            '<button id="drive-pull-btn" class="btn-sm" style="padding:10px">⬇ Pull — Load from Drive</button>' +
            '<button id="drive-list" class="btn-sm" style="padding:10px">📋 Browse Drive Projects</button>' +
            (_cfg.lastSync ? '<div style="font-size:10px;color:var(--text-dim);text-align:center">Last sync: '+new Date(_cfg.lastSync).toLocaleString()+'</div>' : '') +
          '</div>'
        : '') +

        '<div id="drive-status" style="font-size:11px;color:var(--text-dim)"></div>' +
        '<div id="drive-file-list" style="display:flex;flex-direction:column;gap:4px"></div>' +

        (hasClientId ?
          '<button id="drive-disconnect" class="btn-sm" style="font-size:10px;color:var(--danger)">Disconnect</button>'
        : '') +
      '</div>';

    // Bindings
    var saveClientBtn = container.querySelector('#drive-save-client');
    if (saveClientBtn) saveClientBtn.addEventListener('click', function() {
      var inp = container.querySelector('#drive-client-id');
      if (inp && inp.value.trim()) {
        _cfg.clientId = inp.value.trim(); CLIENT_ID = _cfg.clientId;
        _saveConfig(); _render(container);
        if (UI) UI.toast('Client ID saved!', 'success');
      }
    });

    var connectBtn = container.querySelector('#drive-connect');
    if (connectBtn) connectBtn.addEventListener('click', _connect);

    var pushBtn = container.querySelector('#drive-push');
    if (pushBtn) pushBtn.addEventListener('click', syncProject);

    var pullBtn = container.querySelector('#drive-pull-btn');
    if (pullBtn) pullBtn.addEventListener('click', pullProject);

    var listBtn = container.querySelector('#drive-list');
    if (listBtn) listBtn.addEventListener('click', _listProjects);

    var disconnectBtn = container.querySelector('#drive-disconnect');
    if (disconnectBtn) disconnectBtn.addEventListener('click', function() {
      _token=null; _folderId=null; _render(container);
    });
  }

  function _setStatus(msg) {
    var el = _panelEl && _panelEl.querySelector('#drive-status');
    if (el) el.textContent = msg;
  }

  function _connect() {
    if (!CLIENT_ID) { if(UI) UI.toast('Add your Google Client ID first','warn'); return; }
    var scope    = 'https://www.googleapis.com/auth/drive.file';
    var redirect = window.location.origin + window.location.pathname;
    var authUrl  = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(redirect) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent(scope);

    var popup = window.open(authUrl, 'google-auth', 'width=500,height=600');
    var checkInterval = setInterval(function() {
      try {
        var url = popup.location.href;
        if (url.indexOf('access_token') !== -1) {
          var match = url.match(/access_token=([^&]+)/);
          if (match) {
            _token = match[1];
            clearInterval(checkInterval);
            popup.close();
            _setStatus('✅ Connected!');
            if (_panelEl) _render(_panelEl);
            if (UI) UI.toast('✅ Google Drive connected!', 'success');
          }
        }
      } catch(e) {}
      if (!popup || popup.closed) clearInterval(checkInterval);
    }, 500);
  }

  function syncProject() {
    if (!_token) { PanelSystem.show('drive-sync'); return; }
    _setStatus('Pushing to Drive…');
    if (UI) UI.toast('Pushing to Google Drive…', 'info');

    // Get or create CodeX folder
    _getOrCreateFolder(function(folderId) {
      if (!folderId) { _setStatus('❌ Failed to get Drive folder'); return; }

      // Export current project as ZIP
      if (typeof ExportZip !== 'undefined') {
        ExportZip.getZipBlob(function(blob) {
          var projectName = (AppState.projectName || 'My Project').replace(/[^a-z0-9-_]/gi,'_');
          var filename = projectName + '_' + Date.now() + '.zip';
          _uploadFile(folderId, filename, blob, function(ok) {
            if (ok) {
              _cfg.lastSync = Date.now(); _saveConfig();
              _setStatus('✅ Pushed: ' + filename);
              if (UI) UI.toast('☁️ Saved to Google Drive!', 'success');
              if (_panelEl) _render(_panelEl);
            } else { _setStatus('❌ Upload failed'); }
          });
        });
      } else {
        // Fallback: save individual files as JSON
        var data = JSON.stringify({ files: AppState.files, name: AppState.projectName||'project', ts: Date.now() });
        var blob2 = new Blob([data], { type:'application/json' });
        _uploadFile(folderId, 'codex-project-' + Date.now() + '.json', blob2, function(ok) {
          if (ok) { _cfg.lastSync = Date.now(); _saveConfig(); _setStatus('✅ Synced to Drive'); if(UI)UI.toast('☁️ Saved!','success'); }
        });
      }
    });
  }

  function pullProject() {
    if (!_token) { PanelSystem.show('drive-sync'); return; }
    _listProjects();
  }

  function _getOrCreateFolder(cb) {
    // Search for existing folder
    fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent('name="'+FOLDER_NAME+'" and mimeType="application/vnd.google-apps.folder" and trashed=false') + '&fields=files(id,name)', {
      headers: { 'Authorization':'Bearer '+_token }
    }).then(function(r){ return r.json(); }).then(function(data) {
      if (data.files && data.files.length > 0) { cb(data.files[0].id); return; }
      // Create folder
      fetch('https://www.googleapis.com/drive/v3/files', {
        method:'POST', headers:{'Authorization':'Bearer '+_token,'Content-Type':'application/json'},
        body:JSON.stringify({ name:FOLDER_NAME, mimeType:'application/vnd.google-apps.folder' })
      }).then(function(r){return r.json();}).then(function(d){ cb(d.id||null); }).catch(function(){cb(null);});
    }).catch(function(){cb(null);});
  }

  function _uploadFile(folderId, filename, blob, cb) {
    var meta = JSON.stringify({ name:filename, parents:[folderId] });
    var form = new FormData();
    form.append('metadata', new Blob([meta],{type:'application/json'}));
    form.append('file', blob);
    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:'POST', headers:{'Authorization':'Bearer '+_token}, body:form
    }).then(function(r){ cb(r.ok); }).catch(function(){ cb(false); });
  }

  function _listProjects() {
    if (!_token) return;
    _setStatus('Loading Drive files…');
    _getOrCreateFolder(function(folderId) {
      if (!folderId) return;
      fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent('"'+folderId+'" in parents and trashed=false') + '&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc', {
        headers:{'Authorization':'Bearer '+_token}
      }).then(function(r){return r.json();}).then(function(data) {
        _setStatus('');
        var listEl = _panelEl && _panelEl.querySelector('#drive-file-list');
        if (!listEl) return;
        if (!data.files || data.files.length === 0) { listEl.innerHTML='<div style="font-size:11px;color:var(--text-dim)">No files in Drive yet. Push a project first.</div>'; return; }
        listEl.innerHTML = data.files.map(function(f) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,.04);border-radius:5px">' +
            '<div style="flex:1;min-width:0"><div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_esc(f.name)+'</div>' +
            '<div style="font-size:10px;color:var(--text-dim)">'+new Date(f.modifiedTime).toLocaleDateString()+'</div></div>' +
            '<button class="drive-load-btn btn-sm" data-fileid="'+f.id+'" data-filename="'+_esc(f.name)+'" style="font-size:10px;padding:2px 8px">Load</button>' +
          '</div>';
        }).join('');
        listEl.querySelectorAll('.drive-load-btn').forEach(function(btn) {
          btn.addEventListener('click', function() { _downloadAndLoad(btn.dataset.fileid, btn.dataset.filename); });
        });
      }).catch(function(){ _setStatus('❌ Failed to list files'); });
    });
  }

  function _downloadAndLoad(fileId, filename) {
    _setStatus('Downloading ' + filename + '…');
    fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      headers:{'Authorization':'Bearer '+_token}
    }).then(function(r) {
      if (filename.endsWith('.json')) return r.json().then(function(data) {
        if (data.files) {
          AppState.files = data.files;
          saveToStorage();
          if (Editor && AppState.files[0]) Editor.loadFile(AppState.files[0]);
          if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
          _setStatus('✅ Loaded: ' + filename);
          if (UI) UI.toast('☁️ Project loaded from Drive!', 'success');
        }
      });
      // ZIP files — use ExportZip to import
      return r.blob().then(function(blob) {
        if (typeof ExportZip !== 'undefined') ExportZip.importFromBlob(blob);
        _setStatus('✅ Loaded: ' + filename);
        if (UI) UI.toast('☁️ Project loaded from Drive!', 'success');
      });
    }).catch(function(){ _setStatus('❌ Download failed'); });
  }

  function _saveConfig() { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(_cfg)); } catch(e) {} }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, syncProject, pullProject };
})();
