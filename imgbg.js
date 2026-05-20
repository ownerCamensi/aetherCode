/**
 * imgbg.js — Image Background theme system
 * Import an image, adjust it, use it as editor background.
 * Stores as base64 in localStorage.
 */
var ImgBG = (function() {

  var STORAGE_KEY = 'codex:imgbg';
  var _current    = null;

  function init() {
    _load();
    if (_current) _apply(_current);

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'imgbg-open', label:'Theme: Set Image Background', category:'Theme', action: openPicker });
      CommandPalette.register({ id:'imgbg-clear', label:'Theme: Remove Image Background', category:'Theme', action: clear });
    }
  }

  function openPicker() {
    var input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function() {
      var file = input.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) { _showModal(file, e.target.result); };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function _showModal(file, originalDataUrl) {
    var overlay = document.getElementById('modal-overlay');
    var modal   = document.getElementById('modal');
    if (!overlay || !modal) { _applyImgBg(originalDataUrl, {}); return; }

    modal.style.width = 'min(520px,96vw)';
    modal.innerHTML = [
      '<div class="modal-header"><span class="modal-title">🖼️ Image Background</span>',
      '<button id="modal-close-btn" class="modal-close">' + Icons.getUI('close') + '</button></div>',
      '<div class="modal-body" style="padding:16px">',
        '<div style="text-align:center;margin-bottom:14px">',
          '<div id="imgbg-preview-wrap" style="border:1px solid var(--border);border-radius:6px;overflow:hidden;height:140px;background:#000;position:relative;">',
            '<img id="imgbg-prev" src="' + originalDataUrl + '" style="width:100%;height:100%;object-fit:cover;transition:filter .2s">',
          '</div>',
        '</div>',
        '<div class="img-sect-label">Quality / Size</div>',
        '<div class="img-quality-grid" id="imgbg-quality-grid">',
          '<button class="iq-btn" data-q="0.3"><div class="iq-label">Low</div><div class="iq-sub">Fast load</div></button>',
          '<button class="iq-btn active" data-q="0.65"><div class="iq-label">Medium</div><div class="iq-sub">Balanced</div></button>',
          '<button class="iq-btn" data-q="0.85"><div class="iq-label">High</div><div class="iq-sub">Sharp</div></button>',
          '<button class="iq-btn" data-q="1"><div class="iq-label">Original</div><div class="iq-sub">Full size</div></button>',
        '</div>',
        '<div class="img-sect-label" style="margin-top:12px">Adjustments</div>',
        _slider('imgbg-brightness', 'Brightness', 0, 200, 100),
        _slider('imgbg-contrast',   'Contrast',   0, 200, 100),
        _slider('imgbg-saturation', 'Saturation', 0, 200, 100),
        _slider('imgbg-blur',       'Blur (px)',   0, 20,  0),
        _slider('imgbg-opacity',    'Opacity (%)', 5, 100, 40),
        '<div class="img-sect-label" style="margin-top:12px">Editor Overlay Style</div>',
        '<div style="display:flex;gap:8px;flex-wrap:wrap">',
          '<button class="iq-btn active" data-overlay="dark" style="flex:1;min-width:80px"><div class="iq-label">Dark</div><div class="iq-sub">Dark overlay</div></button>',
          '<button class="iq-btn"        data-overlay="light" style="flex:1;min-width:80px"><div class="iq-label">Light</div><div class="iq-sub">Light overlay</div></button>',
          '<button class="iq-btn"        data-overlay="none" style="flex:1;min-width:80px"><div class="iq-label">None</div><div class="iq-sub">Raw image</div></button>',
        '</div>',
      '</div>',
      '<div class="modal-footer">',
        '<button id="modal-cancel" class="btn-sm">Cancel</button>',
        '<button id="imgbg-clear-btn" class="btn-sm btn-danger">Remove BG</button>',
        '<button id="modal-confirm" class="btn-sm btn-primary-sm">Set as Background</button>',
      '</div>',
    ].join('');

    overlay.classList.remove('hidden');

    var quality  = 0.65;
    var overlayMode = 'dark';
    var filters = { brightness: 100, contrast: 100, saturation: 100, blur: 0, opacity: 40 };

    function _applyPreview() {
      var prev = modal.querySelector('#imgbg-prev');
      if (!prev) return;
      prev.style.filter = 'brightness(' + filters.brightness + '%) contrast(' + filters.contrast + '%) saturate(' + filters.saturation + '%) blur(' + filters.blur + 'px)';
      prev.style.opacity = filters.opacity / 100;
    }

    // Quality grid
    var qgrid = modal.querySelector('#imgbg-quality-grid');
    if (qgrid) qgrid.querySelectorAll('.iq-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        qgrid.querySelectorAll('.iq-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active'); quality = parseFloat(btn.dataset.q);
      });
    });

    // Overlay buttons
    modal.querySelectorAll('[data-overlay]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modal.querySelectorAll('[data-overlay]').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active'); overlayMode = btn.dataset.overlay;
      });
    });

    // Sliders
    Object.keys(filters).forEach(function(k) {
      var sl = modal.querySelector('#imgbg-' + k);
      var vl = modal.querySelector('#val-imgbg-' + k);
      if (sl) sl.addEventListener('input', function() {
        filters[k] = parseFloat(sl.value);
        if (vl) vl.textContent = sl.value + (k === 'blur' ? 'px' : '%');
        _applyPreview();
      });
    });

    _applyPreview();

    modal.querySelector('#modal-confirm').onclick = function() {
      overlay.classList.add('hidden');
      _processAndStore(file, originalDataUrl, quality, filters, overlayMode);
    };
    modal.querySelector('#imgbg-clear-btn').onclick = function() { overlay.classList.add('hidden'); clear(); };
    modal.querySelector('#modal-cancel').onclick     = function() { overlay.classList.add('hidden'); };
    modal.querySelector('#modal-close-btn').onclick  = function() { overlay.classList.add('hidden'); };
  }

  function _slider(id, label, min, max, def) {
    return '<div class="img-slider-row"><label>' + label + '</label>' +
           '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + def + '">' +
           '<span id="val-' + id + '">' + def + (id==='imgbg-blur'?'px':'%') + '</span></div>';
  }

  function _processAndStore(file, originalDataUrl, quality, filters, overlayMode) {
    if (UI) UI.toast('Processing image…', 'info');

    var img = new Image();
    img.onload = function() {
      var canvas   = document.createElement('canvas');
      var maxDim   = quality < 0.5 ? 800 : quality < 0.8 ? 1280 : 1920;
      var ratio    = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      var ctx = canvas.getContext('2d');
      ctx.filter = 'brightness(' + filters.brightness + '%) contrast(' + filters.contrast + '%) saturate(' + filters.saturation + '%) blur(' + filters.blur + 'px)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      _current = { dataUrl: dataUrl, filters: filters, overlayMode: overlayMode, name: file.name };
      _save();
      _apply(_current);
      if (UI) UI.toast('Image background set!', 'success');
    };
    img.src = originalDataUrl;
  }

  function _apply(cfg) {
    _removeExisting();
    var style  = document.createElement('style');
    style.id   = 'imgbg-style';
    var opacity = (cfg.filters.opacity || 40) / 100;
    var overlays = {
      dark:  'rgba(15,15,20,.75)',
      light: 'rgba(255,255,255,.6)',
      none:  'transparent',
    };
    var overlay = overlays[cfg.overlayMode] || overlays.dark;
    style.textContent = [
      '#ace-editor::before {',
        'content:"";',
        'position:absolute;inset:0;z-index:0;',
        'background-image: url(' + JSON.stringify(cfg.dataUrl) + ');',
        'background-size: cover;',
        'background-position: center;',
        'opacity: ' + opacity + ';',
        'pointer-events: none;',
      '}',
      '#ace-editor { position: relative; }',
      '#ace-editor .ace_scroller { background: ' + overlay + ' !important; }',
      '#ace-editor .ace_content { position: relative; z-index: 1; }',
      '#ace-editor .ace_gutter { background: ' + overlay + ' !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function _removeExisting() {
    var el = document.getElementById('imgbg-style');
    if (el) el.remove();
  }

  function clear() {
    _current = null;
    _removeExisting();
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    if (UI) UI.toast('Image background removed.', 'info');
  }

  function _save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_current)); } catch(e) { console.warn('[ImgBG] Storage full or failed:', e); } }
  function _load() { try { _current = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); } catch(e) { _current = null; } }

  return { init, openPicker, clear };
})();
