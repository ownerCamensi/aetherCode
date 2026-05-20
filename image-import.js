/**
 * image-import.js — Import images with optimization modal
 */
var ImageImport = (function() {
  function init() {
    var btn = document.getElementById('btn-import-image');
    if (btn) btn.addEventListener('click', openPicker);
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'import-image', label:'File: Import Image (base64)', category:'File',
        icon: Icons.getUI('image'), action: openPicker });
    }
  }

  function openPicker() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,.svg';
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
    if (!overlay || !modal) return;
    var isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    modal.style.width = 'min(480px,96vw)';
    modal.innerHTML = [
      '<div class="modal-header"><span class="modal-title">Import Image — ' + _esc(file.name) + '</span>',
      '<button id="modal-close-btn" class="modal-close">' + Icons.getUI('close') + '</button></div>',
      '<div class="modal-body" style="padding:16px">',
      '<div style="text-align:center;margin-bottom:12px"><img id="img-prev" src="' + originalDataUrl + '" style="max-width:100%;max-height:140px;border-radius:4px;border:1px solid var(--border);background:#111;transition:filter .2s"></div>',
      isSvg ? '' : [
        '<div style="margin-bottom:12px"><div class="img-sect-label">Quality</div>',
        '<div class="img-quality-grid" id="quality-grid">',
        '<button class="iq-btn" data-size="200"><div class="iq-label">Low</div><div class="iq-sub">200px</div></button>',
        '<button class="iq-btn" data-size="400"><div class="iq-label">Medium</div><div class="iq-sub">400px</div></button>',
        '<button class="iq-btn active" data-size="0"><div class="iq-label">High</div><div class="iq-sub">Original</div></button>',
        '<button class="iq-btn" data-size="1028"><div class="iq-label">Ultra</div><div class="iq-sub">Grid 1028</div></button>',
        '</div></div>',
        '<div style="margin-bottom:12px"><div class="img-sect-label">Color Adjustments</div>',
        _slider('brightness','Brightness',0,200,100),
        _slider('contrast',  'Contrast',  0,200,100),
        _slider('saturation','Saturation',0,200,100),
        _slider('sepia',     'Sepia',     0,100,0),
        '</div>',
      ].join(''),
      '<div style="margin-bottom:4px"><div class="img-sect-label">Filename</div>',
      '<input id="img-filename" value="' + _esc(file.name) + '" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:13px;padding:6px 10px"></div>',
      '<div style="font-size:10px;color:var(--text-dim);margin-top:4px">Stored as base64 in your project.</div>',
      '</div>',
      '<div class="modal-footer"><button id="modal-cancel" class="btn-sm">Cancel</button>',
      '<button id="modal-confirm" class="btn-sm btn-primary-sm">Import</button></div>',
    ].join('');
    overlay.classList.remove('hidden');

    var selectedSize = 0;
    var grid = modal.querySelector('#quality-grid');
    if (grid) grid.querySelectorAll('.iq-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        grid.querySelectorAll('.iq-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedSize = parseInt(btn.dataset.size);
        _applyFilters();
      });
    });

    ['brightness','contrast','saturation','sepia'].forEach(function(p) {
      var s = modal.querySelector('#sl-' + p);
      var v = modal.querySelector('#val-' + p);
      if (s) s.addEventListener('input', function() { if (v) v.textContent = s.value + '%'; _applyFilters(); });
    });

    function _applyFilters() {
      var prev = modal.querySelector('#img-prev'); if (!prev) return;
      var b = _slVal('brightness'), c = _slVal('contrast'), s = _slVal('saturation'), se = _slVal('sepia');
      prev.style.filter = 'brightness('+b+'%) contrast('+c+'%) saturate('+s+'%) sepia('+se+'%)';
    }
    function _slVal(p) { var el = modal.querySelector('#sl-'+p); return el ? el.value : 100; }

    modal.querySelector('#modal-confirm').onclick = function() {
      var fn = (modal.querySelector('#img-filename').value || file.name).trim();
      var filters = {
        brightness: _slVal('brightness'), contrast: _slVal('contrast'),
        saturation: _slVal('saturation'), sepia: _slVal('sepia'),
      };
      overlay.classList.add('hidden');
      _processAndSave(file, originalDataUrl, fn, selectedSize, filters);
    };
    modal.querySelector('#modal-cancel').onclick     = function() { overlay.classList.add('hidden'); };
    modal.querySelector('#modal-close-btn').onclick  = function() { overlay.classList.add('hidden'); };
  }

  function _slider(id, label, min, max, def) {
    return '<div class="img-slider-row"><label>' + label + '</label>' +
           '<input type="range" id="sl-' + id + '" min="' + min + '" max="' + max + '" value="' + def + '">' +
           '<span id="val-' + id + '">' + def + '%</span></div>';
  }

  function _processAndSave(file, originalDataUrl, filename, maxSize, filters) {
    var isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (isSvg || maxSize === 0) { _createFile(filename, originalDataUrl); return; }

    var img = new Image();
    img.onload = function() {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (maxSize > 0 && (w > maxSize || h > maxSize)) {
        var r = Math.min(maxSize/w, maxSize/h); w = Math.round(w*r); h = Math.round(h*r);
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.filter = 'brightness('+filters.brightness+'%) contrast('+filters.contrast+'%) saturate('+filters.saturation+'%) sepia('+filters.sepia+'%)';
      ctx.drawImage(img, 0, 0, w, h);
      var ext = file.name.split('.').pop().toLowerCase();
      var mime = (ext==='jpg'||ext==='jpeg') ? 'image/jpeg' : 'image/png';
      var q = maxSize===200 ? 0.5 : maxSize===400 ? 0.72 : 0.9;
      _createFile(filename, canvas.toDataURL(mime, q));
    };
    img.src = originalDataUrl;
  }

  function _createFile(filename, dataUrl) {
    var f = createFileObject(filename, dataUrl);
    f.isImage = true; f.path = filename;
    AppState.files.push(f);
    AppState.activeFileId = f.id;
    saveToStorage();
    EventBus.emit(Events.FILE_CREATED, { file: f });
    if (UI) UI.toast('Image imported: ' + filename, 'success');
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  return { init, openPicker };
})();
