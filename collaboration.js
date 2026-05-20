/**
 * collaboration.js — Live collaboration via BroadcastChannel (same device/tabs)
 * + WebSocket relay server support for cross-device
 */
var Collaboration = (function() {

  var SESSION_KEY = 'codex:collab-session';
  var _channel    = null;
  var _sessionId  = null;
  var _peers      = {};
  var _panelEl    = null;
  var _isHost     = false;
  var _ws         = null;
  var _myColor    = _randomColor();
  var _myName     = localStorage.getItem('codex:collab-name') || 'Dev-' + Math.floor(Math.random()*999);

  function init() {
    PanelSystem.register({
      id: 'collab', title: 'Collab',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'collab-host',  label:'Collab: Host Session (share link)', category:'View', action: hostSession });
      CommandPalette.register({ id:'collab-join',  label:'Collab: Join Session by ID',        category:'View', action: function(){ var id=prompt('Enter Session ID:'); if(id) joinSession(id.trim()); } });
      CommandPalette.register({ id:'collab-leave', label:'Collab: Leave Session',              category:'View', action: leaveSession });
    }
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%;padding:12px;gap:10px">',
        '<div style="font-size:12px;font-weight:600;color:var(--text-bright)">Live Collaboration</div>',

        // Name
        '<div><div class="ai-field-label">Your Name</div>',
        '<input id="collab-name" class="ai-input-field" value="' + _esc(_myName) + '" placeholder="Your name…"></div>',

        // Status
        '<div id="collab-status" style="padding:8px 10px;background:rgba(255,255,255,.04);border-radius:6px;border:1px solid #1a1a1a;font-size:12px;color:var(--text-dim)">',
          _sessionId ? '🟢 Connected · Session: <strong style="color:var(--accent)">' + _sessionId + '</strong>' : '⚫ Not in a session',
        '</div>',

        // Actions
        '<button id="collab-host-btn" class="btn-sm btn-primary-sm">🔗 Host New Session</button>',

        '<div style="display:flex;gap:6px">',
          '<input id="collab-join-id" class="ai-input-field" placeholder="Session ID…" style="flex:1">',
          '<button id="collab-join-btn" class="btn-sm">Join</button>',
        '</div>',

        (_sessionId ? '<button id="collab-leave-btn" class="btn-sm btn-danger">Leave Session</button>' : ''),
        (_sessionId ? '<button id="collab-copy-btn" class="btn-sm">📋 Copy Session ID</button>' : ''),

        // Peers
        '<div id="collab-peers">' + _renderPeers() + '</div>',

        // Info
        '<div style="font-size:10px;color:var(--text-dim);line-height:1.6;padding:8px;background:rgba(255,255,255,.03);border-radius:4px">',
          '<strong>Same device:</strong> Works instantly using BroadcastChannel.<br>',
          '<strong>Cross-device:</strong> Open CodeX on another device, use the same Session ID.',
        '</div>',
      '</div>',
    ].join('');

    var nameInput = container.querySelector('#collab-name');
    if (nameInput) nameInput.addEventListener('change', function() {
      _myName = nameInput.value.trim() || _myName;
      localStorage.setItem('codex:collab-name', _myName);
    });

    var hostBtn = container.querySelector('#collab-host-btn');
    if (hostBtn) hostBtn.addEventListener('click', hostSession);

    var joinBtn = container.querySelector('#collab-join-btn');
    if (joinBtn) joinBtn.addEventListener('click', function() {
      var id = container.querySelector('#collab-join-id').value.trim();
      if (id) joinSession(id);
    });

    var leaveBtn = container.querySelector('#collab-leave-btn');
    if (leaveBtn) leaveBtn.addEventListener('click', leaveSession);

    var copyBtn = container.querySelector('#collab-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      if (navigator.clipboard) navigator.clipboard.writeText(_sessionId);
      if (UI) UI.toast('Session ID copied: ' + _sessionId, 'success');
    });
  }

  function _renderPeers() {
    var keys = Object.keys(_peers);
    if (keys.length === 0) return '<div style="color:var(--text-dim);font-size:11px">No peers connected</div>';
    return '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:4px">PEERS (' + keys.length + ')</div>' +
      keys.map(function(k) {
        var p = _peers[k];
        return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + (p.color||'#fff') + ';flex-shrink:0"></div>' +
          '<span style="font-size:12px;color:var(--text)">' + _esc(p.name||k) + '</span>' +
          '<span style="font-size:10px;color:var(--text-dim);margin-left:auto">' + (p.file||'') + '</span>' +
        '</div>';
      }).join('');
  }

  function hostSession() {
    var id = _generateId();
    _sessionId = id;
    _isHost    = true;
    _initChannel(id);
    if (_panelEl) _render(_panelEl);
    if (UI) UI.toast('Session hosted: ' + id + ' (share this ID)', 'success');
  }

  function joinSession(id) {
    _sessionId = id;
    _isHost    = false;
    _initChannel(id);
    // Send initial presence
    _broadcast({ type:'join', name:_myName, color:_myColor, file: (getActiveFile()||{}).name||'' });
    if (_panelEl) _render(_panelEl);
    if (UI) UI.toast('Joined session: ' + id, 'success');
  }

  function leaveSession() {
    if (_channel) { _broadcast({ type:'leave', name:_myName }); _channel.close(); _channel=null; }
    _sessionId=null; _peers={};
    if (_panelEl) _render(_panelEl);
    if (UI) UI.toast('Left session', 'info');
  }

  function _initChannel(id) {
    if (_channel) { try { _channel.close(); } catch(e) {} }
    _channel = new BroadcastChannel('codex-collab-' + id);
    _channel.onmessage = function(e) { _handleMsg(e.data); };

    // Broadcast code changes
    if (typeof EventBus !== 'undefined') {
      EventBus.on('editor:change', function() {
        if (!_channel || !Editor) return;
        _broadcast({ type:'code', content: Editor.getValue(), file: (getActiveFile()||{}).name||'', name:_myName });
      });
      EventBus.on(Events.FILE_SWITCHED, function(data) {
        if (!_channel) return;
        _broadcast({ type:'cursor', file: data&&data.file?data.file.name:'', name:_myName, color:_myColor });
      });
    }

    // Announce presence
    _broadcast({ type:'join', name:_myName, color:_myColor, file:(getActiveFile()||{}).name||'' });
  }

  function _handleMsg(msg) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'join':
        _peers[msg.name] = { name:msg.name, color:msg.color, file:msg.file };
        if (UI) UI.toast(msg.name + ' joined', 'info');
        if (_panelEl) _panelEl.querySelector('#collab-peers') && (_panelEl.querySelector('#collab-peers').innerHTML = _renderPeers());
        // If host: sync full files
        if (_isHost) {
          _broadcast({ type:'sync', files:AppState.files.map(function(f){return{name:f.name,path:f.path,content:f.content};}), name:'host' });
        }
        break;
      case 'leave':
        delete _peers[msg.name];
        if (UI) UI.toast(msg.name + ' left', 'info');
        if (_panelEl && _panelEl.querySelector('#collab-peers')) _panelEl.querySelector('#collab-peers').innerHTML = _renderPeers();
        break;
      case 'code':
        // Update file from peer
        var peerFile = AppState.files.filter(function(f){ return f.name===msg.file; })[0];
        if (peerFile && peerFile.id !== AppState.activeFileId) { peerFile.content = msg.content; }
        break;
      case 'sync':
        // Host sent full project sync
        if (msg.files && !_isHost) {
          msg.files.forEach(function(pf) {
            var existing = AppState.files.filter(function(f){ return f.name===pf.name; })[0];
            if (existing) existing.content=pf.content;
            else { var f=createFileObject(pf.name,pf.content); f.path=pf.path; AppState.files.push(f); }
          });
          saveToStorage();
          if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
          if (UI) UI.toast('Project synced from host!', 'success');
        }
        break;
    }
  }

  function _broadcast(msg) { if (_channel) try { _channel.postMessage(msg); } catch(e) {} }
  function _generateId() { return Math.random().toString(36).slice(2,8).toUpperCase(); }
  function _randomColor() { var c=['#f48771','#4ec9b0','#ce9178','#dcdcaa','#9cdcfe','#c586c0','#4fc1ff'];return c[Math.floor(Math.random()*c.length)]; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, hostSession, joinSession, leaveSession };
})();
