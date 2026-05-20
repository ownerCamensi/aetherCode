/**
 * color-picker.js — Custom color wheel UI with hue/sat/brightness/opacity
 * Supports hex, rgb, rgba, oklch output. Attach anywhere.
 */
var ColorPicker = (function() {

  var _canvas, _ctx, _alphaCanvas, _alphaCtx;
  var _hue = 0, _sat = 1, _bri = 0.5, _alpha = 1;
  var _onChange = null;
  var _container = null;
  var _dragging = null;

  function open(opts) {
    // opts: { target (element to position near), color (initial), onChange }
    opts = opts || {};
    _onChange = opts.onChange || function(){};

    // Parse initial color
    if (opts.color) _parseColor(opts.color);

    // Remove existing
    var existing = document.getElementById('codex-color-picker');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.id = 'codex-color-picker';
    el.className = 'cp-popup';
    el.innerHTML = [
      '<div class="cp-header">',
        '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">🎨 Color Picker</span>',
        '<button id="cp-close" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:16px;line-height:1">×</button>',
      '</div>',
      '<div class="cp-wheel-wrap">',
        '<canvas id="cp-wheel" width="180" height="180"></canvas>',
        '<div id="cp-wheel-cursor" class="cp-cursor"></div>',
      '</div>',
      '<div class="cp-controls">',
        '<div class="cp-row"><label>Hue</label><input type="range" id="cp-hue" min="0" max="360" value="0"><span id="cp-hue-val">0°</span></div>',
        '<div class="cp-row"><label>Sat</label><input type="range" id="cp-sat" min="0" max="100" value="100"><span id="cp-sat-val">100%</span></div>',
        '<div class="cp-row"><label>Bri</label><input type="range" id="cp-bri" min="0" max="100" value="50"><span id="cp-bri-val">50%</span></div>',
        '<div class="cp-row"><label>Alpha</label><input type="range" id="cp-alpha" min="0" max="100" value="100"><span id="cp-alpha-val">100%</span></div>',
      '</div>',
      '<div class="cp-preview-row">',
        '<div id="cp-preview-swatch" class="cp-swatch"></div>',
        '<div class="cp-formats">',
          '<button class="cp-fmt-btn active" data-fmt="hex">HEX</button>',
          '<button class="cp-fmt-btn" data-fmt="rgb">RGB</button>',
          '<button class="cp-fmt-btn" data-fmt="rgba">RGBA</button>',
          '<button class="cp-fmt-btn" data-fmt="oklch">OKLCH</button>',
        '</div>',
      '</div>',
      '<div class="cp-output-row">',
        '<input id="cp-output" class="cp-output-input" readonly>',
        '<button id="cp-copy" class="cp-copy-btn">Copy</button>',
      '</div>',
    ].join('');

    document.body.appendChild(el);
    _container = el;

    // Position near target
    if (opts.target) {
      var rect = opts.target.getBoundingClientRect();
      el.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
      el.style.top  = (rect.bottom + 4) + 'px';
    } else {
      el.style.left = '50%';
      el.style.top  = '50%';
      el.style.transform = 'translate(-50%, -50%)';
    }

    _canvas = el.querySelector('#cp-wheel');
    _ctx    = _canvas.getContext('2d');
    _drawWheel();
    _bindControls(el);
    _update(el);

    el.querySelector('#cp-close').addEventListener('click', close);

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', _outsideClick);
    }, 10);
  }

  function close() {
    var el = document.getElementById('codex-color-picker');
    if (el) el.remove();
    document.removeEventListener('click', _outsideClick);
    _container = null;
  }

  function _outsideClick(e) {
    var el = document.getElementById('codex-color-picker');
    if (el && !el.contains(e.target)) close();
  }

  function _drawWheel() {
    if (!_ctx) return;
    var cx = 90, cy = 90, r = 88;
    _ctx.clearRect(0, 0, 180, 180);

    // Draw hue ring
    for (var a = 0; a < 360; a++) {
      var start = (a - 1) * Math.PI / 180;
      var end   = (a + 1) * Math.PI / 180;
      _ctx.beginPath();
      _ctx.moveTo(cx, cy);
      _ctx.arc(cx, cy, r, start, end);
      _ctx.fillStyle = 'hsl('+a+',100%,50%)';
      _ctx.fill();
    }

    // White radial gradient (saturation)
    var wg = _ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    wg.addColorStop(0, 'rgba(255,255,255,1)');
    wg.addColorStop(1, 'rgba(255,255,255,0)');
    _ctx.beginPath();
    _ctx.arc(cx, cy, r, 0, Math.PI*2);
    _ctx.fillStyle = wg;
    _ctx.fill();

    // Black radial gradient (brightness)
    var bg = _ctx.createRadialGradient(cx, cy, r*0.5, cx, cy, r);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,'+(1-_bri)+')');
    _ctx.beginPath();
    _ctx.arc(cx, cy, r, 0, Math.PI*2);
    _ctx.fillStyle = bg;
    _ctx.fill();

    _updateCursor();
  }

  function _updateCursor() {
    if (!_container) return;
    var cursor = _container.querySelector('#cp-wheel-cursor');
    if (!cursor) return;
    var cx = 90, cy = 90, r = 88 * _sat;
    var rad = (_hue - 90) * Math.PI / 180;
    var x = cx + r * Math.cos(rad);
    var y = cy + r * Math.sin(rad);
    cursor.style.left = x + 'px';
    cursor.style.top  = y + 'px';
    cursor.style.background = 'hsl('+_hue+','+Math.round(_sat*100)+'%,50%)';
  }

  function _bindControls(el) {
    // Wheel interaction
    var wheelWrap = el.querySelector('.cp-wheel-wrap');
    if (wheelWrap) {
      wheelWrap.addEventListener('mousedown', _startWheelDrag);
      wheelWrap.addEventListener('touchstart', function(e){ _startWheelDrag(e.touches[0]); }, {passive:true});
    }

    // Sliders
    ['hue','sat','bri','alpha'].forEach(function(k) {
      var sl = el.querySelector('#cp-'+k);
      if (sl) sl.addEventListener('input', function() {
        var v = parseInt(sl.value) / 100;
        if (k === 'hue') _hue = parseFloat(sl.value);
        else if (k === 'sat') _sat = v;
        else if (k === 'bri') _bri = v;
        else if (k === 'alpha') _alpha = v;
        _drawWheel();
        _update(el);
      });
    });

    // Format buttons
    var _fmt = 'hex';
    el.querySelectorAll('.cp-fmt-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        el.querySelectorAll('.cp-fmt-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        _fmt = btn.dataset.fmt;
        _updateOutput(el, _fmt);
      });
    });

    // Copy
    var copyBtn = el.querySelector('#cp-copy');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      var out = el.querySelector('#cp-output');
      if (out && navigator.clipboard) {
        navigator.clipboard.writeText(out.value).then(function() {
          copyBtn.textContent = '✓'; setTimeout(function(){ copyBtn.textContent='Copy'; }, 1500);
        });
      }
    });

    el._fmt = _fmt;
  }

  function _startWheelDrag(e) {
    _dragging = 'wheel';
    _wheelMove(e);
    var mm = function(e2){ _wheelMove(e2.touches?e2.touches[0]:e2); };
    var mu = function(){ _dragging=null; document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); document.removeEventListener('touchmove',mm); document.removeEventListener('touchend',mu); };
    document.addEventListener('mousemove',mm);
    document.addEventListener('mouseup',mu);
    document.addEventListener('touchmove',mm,{passive:true});
    document.addEventListener('touchend',mu);
  }

  function _wheelMove(e) {
    if (!_canvas) return;
    var rect = _canvas.getBoundingClientRect();
    var cx = rect.left + 90, cy = rect.top + 90;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var dist = Math.sqrt(dx*dx + dy*dy);
    _hue = ((Math.atan2(dy,dx) * 180 / Math.PI) + 90 + 360) % 360;
    _sat = Math.min(dist / 88, 1);
    _drawWheel();
    var c = _container;
    if (c) {
      var hs = c.querySelector('#cp-hue'); if(hs) hs.value = Math.round(_hue);
      var ss = c.querySelector('#cp-sat'); if(ss) ss.value = Math.round(_sat*100);
      _update(c);
    }
  }

  function _update(el) {
    if (!el) return;
    var hv = el.querySelector('#cp-hue-val');   if(hv) hv.textContent   = Math.round(_hue)+'°';
    var sv = el.querySelector('#cp-sat-val');   if(sv) sv.textContent   = Math.round(_sat*100)+'%';
    var bv = el.querySelector('#cp-bri-val');   if(bv) bv.textContent   = Math.round(_bri*100)+'%';
    var av = el.querySelector('#cp-alpha-val'); if(av) av.textContent   = Math.round(_alpha*100)+'%';
    var hs = el.querySelector('#cp-hue');       if(hs) hs.value         = Math.round(_hue);
    var ss = el.querySelector('#cp-sat');       if(ss) ss.value         = Math.round(_sat*100);
    var bs = el.querySelector('#cp-bri');       if(bs) bs.value         = Math.round(_bri*100);
    var as = el.querySelector('#cp-alpha');     if(as) as.value         = Math.round(_alpha*100);
    var swatch = el.querySelector('#cp-preview-swatch');
    var rgb = _toRgb();
    if (swatch) swatch.style.background = 'rgba('+rgb.r+','+rgb.g+','+rgb.b+','+_alpha+')';
    var fmt = el._fmt || 'hex';
    _updateOutput(el, fmt);
    _onChange(_getColor(fmt));
  }

  function _updateOutput(el, fmt) {
    var out = el.querySelector('#cp-output');
    if (out) out.value = _getColor(fmt);
  }

  function _toRgb() {
    // HSB → RGB
    var h=_hue/360, s=_sat, v=_bri;
    var r,g,b;
    if(s===0){r=g=b=v;}else{
      var i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
      switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
    }
    return {r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};
  }

  function _getColor(fmt) {
    var rgb = _toRgb();
    if (fmt==='hex') {
      return '#'+[rgb.r,rgb.g,rgb.b].map(function(v){return('0'+v.toString(16)).slice(-2);}).join('');
    }
    if (fmt==='rgb')  return 'rgb('+rgb.r+', '+rgb.g+', '+rgb.b+')';
    if (fmt==='rgba') return 'rgba('+rgb.r+', '+rgb.g+', '+rgb.b+', '+_alpha.toFixed(2)+')';
    if (fmt==='oklch') {
      // Approximate conversion
      var l = (0.2126*(rgb.r/255)+0.7152*(rgb.g/255)+0.0722*(rgb.b/255));
      var c = _sat * 0.3;
      var h = _hue;
      return 'oklch('+l.toFixed(3)+' '+c.toFixed(3)+' '+Math.round(h)+')';
    }
    return '#000000';
  }

  function _parseColor(color) {
    // Basic hex parsing
    var m = color.match(/^#?([0-9a-f]{6})/i);
    if (m) {
      var r=parseInt(m[1].slice(0,2),16)/255, g=parseInt(m[1].slice(2,4),16)/255, b=parseInt(m[1].slice(4,6),16)/255;
      var max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
      _bri=max;_sat=max===0?0:d/max;
      if(d===0)_hue=0;
      else if(max===r)_hue=60*((g-b)/d%6);
      else if(max===g)_hue=60*((b-r)/d+2);
      else _hue=60*((r-g)/d+4);
      _hue=(_hue+360)%360;
    }
  }

  return { open, close };
})();
