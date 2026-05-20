/**
 * image-viewer.js — Preview PNG/JPG/SVG/GIF/WebP files in a panel
 * When user opens an image file, shows it in the bottom panel
 * instead of the text editor (which would show garbage binary).
 */
var ImageViewer = (function() {

  var IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','svg','ico','bmp'];
  var _panelEl = null;
  var _currentFile = null;

  function init() {
    PanelSystem.register({
      id:'image-viewer', title:'Image',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/><path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; _updateImage(); },
    });

    // Auto-show when an image file is opened
    EventBus.on(Events.FILE_SWITCHED, function(data) {
      if (data && data.file && _isImage(data.file.name)) {
        _currentFile = data.file;
        PanelSystem.show('image-viewer');
      }
    });

    // Intercept file open — hide Ace for image files
    EventBus.on(Events.FILE_CREATED, function(data) {
      if (data && data.file && _isImage(data.file.name)) {
        _currentFile = data.file;
      }
    });
  }

  function _render(container) {
    _panelEl = container;
    _updateImage();
  }

  function _updateImage() {
    if (!_panelEl) return;
    var file = _currentFile || getActiveFile();

    if (!file || !_isImage(file.name)) {
      _panelEl.innerHTML = '<div class="iv-empty">Open an image file (PNG, JPG, SVG, GIF, WebP) to preview it here.</div>';
      return;
    }

    var src = file.content;
    // If content looks like a data URL already, use it directly
    if (!src.startsWith('data:') && !src.startsWith('http')) {
      // Try to construct a data URL from base64 content
      var ext  = _ext(file.name);
      var mime = _mime(ext);
      src = 'data:' + mime + ';base64,' + btoa(unescape(encodeURIComponent(src)));
    }

    _panelEl.innerHTML = [
      '<div class="iv-panel">',
        '<div class="iv-toolbar">',
          '<span class="iv-filename">' + _esc(file.name) + '</span>',
          '<div class="iv-controls">',
            '<button class="iv-btn" id="iv-zoom-in"  title="Zoom In">+</button>',
            '<span class="iv-zoom-label" id="iv-zoom-label">100%</span>',
            '<button class="iv-btn" id="iv-zoom-out" title="Zoom Out">−</button>',
            '<button class="iv-btn" id="iv-zoom-fit" title="Fit">⊡</button>',
            '<button class="iv-btn" id="iv-zoom-1"   title="Actual size">1:1</button>',
          '</div>',
        '</div>',
        '<div class="iv-canvas" id="iv-canvas">',
          '<img id="iv-img" src="' + _escAttr(src) + '" alt="' + _esc(file.name) + '" draggable="false">',
        '</div>',
        '<div class="iv-status" id="iv-status">Loading…</div>',
      '</div>',
    ].join('');

    var img      = _panelEl.querySelector('#iv-img');
    var canvas   = _panelEl.querySelector('#iv-canvas');
    var label    = _panelEl.querySelector('#iv-zoom-label');
    var statusEl = _panelEl.querySelector('#iv-status');
    var scale    = 1;

    img.onload = function() {
      if (statusEl) statusEl.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px';
      _fitImage();
    };
    img.onerror = function() {
      if (statusEl) statusEl.textContent = 'Cannot preview this image (binary data not accessible from localStorage).';
      if (img) img.style.display = 'none';
    };

    function _setScale(s) {
      scale = Math.max(0.1, Math.min(8, s));
      img.style.transform = 'scale(' + scale + ')';
      img.style.transformOrigin = 'top left';
      if (label) label.textContent = Math.round(scale * 100) + '%';
    }

    function _fitImage() {
      if (!canvas || !img.naturalWidth) return;
      var sw = canvas.clientWidth  / img.naturalWidth;
      var sh = canvas.clientHeight / img.naturalHeight;
      _setScale(Math.min(sw, sh, 1));
    }

    _panelEl.querySelector('#iv-zoom-in')  && _panelEl.querySelector('#iv-zoom-in').addEventListener('click',  function() { _setScale(scale * 1.2); });
    _panelEl.querySelector('#iv-zoom-out') && _panelEl.querySelector('#iv-zoom-out').addEventListener('click', function() { _setScale(scale / 1.2); });
    _panelEl.querySelector('#iv-zoom-fit') && _panelEl.querySelector('#iv-zoom-fit').addEventListener('click', _fitImage);
    _panelEl.querySelector('#iv-zoom-1')   && _panelEl.querySelector('#iv-zoom-1').addEventListener('click',   function() { _setScale(1); });
  }

  function _isImage(name) { return IMAGE_EXTS.indexOf(_ext(name)) !== -1; }
  function _ext(name) { var p=(name||'').split('.'); return p.length>1?p[p.length-1].toLowerCase():''; }
  function _mime(ext) { var m={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',bmp:'image/bmp'}; return m[ext]||'image/png'; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }

  return { init: init };
})();
