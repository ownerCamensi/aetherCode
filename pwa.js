/**
 * pwa.js v2 — Service Worker registration + PWA install
 * Fixed: registers SW immediately, caches Ace after load, handles standalone mode
 */
var PWA = (function() {

  var _swReg = null;

  function init() {
    if (!('serviceWorker' in navigator)) return;

    // Register SW on first load
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(function(reg) {
        _swReg = reg;

        // Check for updates every 60 seconds
        setInterval(function() { reg.update(); }, 60000);

        // Show update banner when new SW is waiting
        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              _showUpdateBanner(reg);
            }
          });
        });

        // After Ace loads, cache its theme files in the CDN cache
        setTimeout(_cacheAceAssets, 4000);
      })
      .catch(function(e) {
        console.warn('[PWA] SW registration failed:', e.message);
      });

    // Reload page when SW takes control (after update)
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });

    // Handle PWA shortcut actions (e.g. ?action=ai opens AI panel)
    _handleShortcutActions();

    // Install prompt
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      _showInstallTip(e);
    });

    // Log standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      console.log('[PWA] Running in standalone mode');
      document.body.classList.add('pwa-standalone');
    }
  }

  function _cacheAceAssets() {
    if (!_swReg || !navigator.serviceWorker.controller) return;
    var aceBase = 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.0/';
    var aceFiles = [
      'ace.min.js', 'mode-javascript.min.js', 'mode-typescript.min.js',
      'mode-html.min.js', 'mode-css.min.js', 'mode-python.min.js',
      'mode-json.min.js', 'mode-markdown.min.js', 'mode-jsx.min.js',
      'theme-monokai.min.js', 'theme-twilight.min.js', 'theme-github.min.js',
      'theme-dracula.min.js', 'theme-tomorrow_night.min.js',
      'ext-language_tools.min.js', 'ext-searchbox.min.js',
    ];
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_URLS',
      urls: aceFiles.map(function(f) { return aceBase + f; })
    });
  }

  function _showUpdateBanner(reg) {
    var existing = document.getElementById('pwa-update-banner');
    if (existing) return;
    var banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.style.cssText = 'position:fixed;bottom:70px;left:12px;right:12px;z-index:9999;background:#1c2128;border:1px solid rgba(110,64,201,.5);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.6);font-family:system-ui,sans-serif';
    banner.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" style="width:18px;height:18px;flex-shrink:0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
      '<span style="flex:1;font-size:12px;color:#e6edf3">CodeX update ready!</span>' +
      '<button id="pwa-update-btn" style="background:#6e40c9;border:none;color:#fff;border-radius:5px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:600">Update</button>' +
      '<button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:0;line-height:1">×</button>';
    document.body.appendChild(banner);

    banner.querySelector('#pwa-update-btn').addEventListener('click', function() {
      if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
    });
    banner.querySelector('#pwa-dismiss-btn').addEventListener('click', function() {
      banner.remove();
    });
  }

  function _showInstallTip(promptEvent) {
    // Only show if not already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (document.getElementById('pwa-install-tip')) return;

    var tip = document.createElement('div');
    tip.id = 'pwa-install-tip';
    tip.style.cssText = 'position:fixed;bottom:70px;left:12px;right:12px;z-index:9000;background:#1c2128;border:1px solid rgba(63,185,80,.4);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.5);font-family:system-ui,sans-serif';
    tip.innerHTML =
      '<span style="font-size:20px">📱</span>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:#e6edf3">Add to Home Screen</div><div style="font-size:10px;color:#8b949e">Works offline, no browser needed</div></div>' +
      '<button id="pwa-install-btn" style="background:#3fb950;border:none;color:#fff;border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap">Install</button>' +
      '<button id="pwa-install-dismiss" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:18px;cursor:pointer;padding:0;line-height:1">×</button>';
    document.body.appendChild(tip);

    tip.querySelector('#pwa-install-btn').addEventListener('click', function() {
      promptEvent.prompt();
      promptEvent.userChoice.then(function() { tip.remove(); });
    });
    tip.querySelector('#pwa-install-dismiss').addEventListener('click', function() {
      tip.remove();
    });

    // Auto-dismiss after 10s
    setTimeout(function() { if (tip.parentNode) tip.remove(); }, 10000);
  }

  function _handleShortcutActions() {
    var params = new URLSearchParams(window.location.search);
    var action = params.get('action');
    if (!action) return;
    EventBus.on(Events.APP_READY, function() {
      setTimeout(function() {
        if (action === 'ai')  PanelSystem.show('ai');
        if (action === 'new') {
          var f = createFileObject('untitled.js', '');
          AppState.files.push(f);
          AppState.activeFileId = f.id;
          if (Editor) Editor.loadFile(f);
          saveToStorage();
        }
      }, 500);
    });
  }

  // Force cache refresh — call after major updates
  function clearCache() {
    caches.keys().then(function(keys) {
      keys.forEach(function(k) { caches.delete(k); });
    });
    if (UI) UI.toast('Cache cleared — reload to update', 'info');
  }

  return { init, clearCache };
})();
