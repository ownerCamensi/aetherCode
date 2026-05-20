/**
 * shadow-picker.js — Shadcn/Tailwind style CSS box-shadow generator
 */
var ShadowPicker = (function() {

  var _panelEl = null;
  var _shadows = [{ inset:false, x:0, y:4, blur:6, spread:-1, r:0, g:0, b:0, a:0.1 }];

  function init() {
    PanelSystem.register({
      id:'shadow-picker', title:'Shadow',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 8 8A8.009 8.009 0 0 0 8 0zM5.03 4.01a5 5 0 1 1-1.02 1.02A5.01 5.01 0 0 1 5.03 4.01z"/></svg>',
      render: _render,
      onShow: function(el){ _panelEl=el; },
    });
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'shadow-picker-open', label:'Tools: Open Shadow Generator', category:'View', action: function(){ PanelSystem.show('shadow-picker'); } });
    }
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:10px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0;display:flex;align-items:center;justify-content:space-between">',
          '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">Shadow Generator</span>',
          '<button id="sp-add-shadow" class="btn-sm" style="font-size:11px;padding:3px 10px">+ Add Layer</button>',
        '</div>',
        '<div style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:12px">',
          // Preview box
          '<div style="display:flex;justify-content:center;align-items:center;padding:20px;background:#111;border-radius:8px;min-height:100px">',
            '<div id="sp-preview-box" style="width:80px;height:80px;background:#fff;border-radius:8px;transition:box-shadow .2s"></div>',
          '</div>',
          // Shadow layers
          '<div id="sp-layers"></div>',
          // Output
          '<div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden">',
            '<div style="padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em">Output</div>',
            '<div style="padding:8px 10px;display:flex;align-items:flex-start;gap:8px">',
              '<pre id="sp-output" style="flex:1;margin:0;font-size:11px;color:#9cdcfe;font-family:var(--font-code);white-space:pre-wrap;word-break:break-all"></pre>',
              '<button id="sp-copy" class="ai-copy-btn">Copy</button>',
            '</div>',
          '</div>',
          // Tailwind output
          '<div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden">',
            '<div style="padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em">Tailwind (closest)</div>',
            '<div style="padding:8px 10px"><code id="sp-tailwind" style="font-size:11px;color:#ffd700;font-family:var(--font-code)"></code></div>',
          '</div>',
        '</div>',
      '</div>',
    ].join('');

    container.querySelector('#sp-add-shadow').addEventListener('click', function() {
      _shadows.push({ inset:false, x:0, y:8, blur:16, spread:-2, r:0, g:0, b:0, a:0.15 });
      _renderLayers(container);
      _update(container);
    });

    _renderLayers(container);
    _update(container);
  }

  function _renderLayers(container) {
    var el = container.querySelector('#sp-layers');
    if (!el) return;
    el.innerHTML = _shadows.map(function(s, i) {
      return '<div class="sp-layer" data-idx="'+i+'">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
          '<span style="font-size:11px;font-weight:600;color:var(--text-dim)">Layer '+(i+1)+'</span>'+
          '<div style="display:flex;gap:6px">'+
            '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim);cursor:pointer">'+
              '<input type="checkbox" class="sp-inset" data-idx="'+i+'"'+(s.inset?' checked':'')+' style="accent-color:var(--accent)"> Inset</label>'+
            (_shadows.length>1?'<button class="sp-remove" data-idx="'+i+'" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:14px;line-height:1">×</button>':'')+
          '</div>'+
        '</div>'+
        _slider('sp-x-'+i, 'X Offset', s.x, -50, 50, 'px')+
        _slider('sp-y-'+i, 'Y Offset', s.y, -50, 50, 'px')+
        _slider('sp-blur-'+i, 'Blur', s.blur, 0, 80, 'px')+
        _slider('sp-spread-'+i, 'Spread', s.spread, -30, 30, 'px')+
        _slider('sp-a-'+i, 'Opacity', Math.round(s.a*100), 0, 100, '%')+
        '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">'+
          '<label style="font-size:11px;color:var(--text-dim);width:50px">Color</label>'+
          '<input type="color" class="sp-color" data-idx="'+i+'" value="'+_rgbToHex(s.r,s.g,s.b)+'" style="width:36px;height:26px;border:1px solid var(--border);border-radius:3px;background:none;cursor:pointer;padding:2px">'+
          '<span style="font-size:11px;color:var(--text-dim)">'+_rgbToHex(s.r,s.g,s.b)+'</span>'+
        '</div>'+
      '</div>';
    }).join('');

    // Bind sliders
    _shadows.forEach(function(s, i) {
      _bindSlider(container, 'sp-x-'+i,      function(v){ s.x=v; });
      _bindSlider(container, 'sp-y-'+i,      function(v){ s.y=v; });
      _bindSlider(container, 'sp-blur-'+i,   function(v){ s.blur=v; });
      _bindSlider(container, 'sp-spread-'+i, function(v){ s.spread=v; });
      _bindSlider(container, 'sp-a-'+i,      function(v){ s.a=v/100; });
    });

    container.querySelectorAll('.sp-inset').forEach(function(cb) {
      cb.addEventListener('change', function() { _shadows[parseInt(cb.dataset.idx)].inset=cb.checked; _update(container); });
    });

    container.querySelectorAll('.sp-color').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var idx=parseInt(inp.dataset.idx), hex=inp.value;
        var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
        _shadows[idx].r=r;_shadows[idx].g=g;_shadows[idx].b=b;
        _update(container);
      });
    });

    container.querySelectorAll('.sp-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _shadows.splice(parseInt(btn.dataset.idx),1);
        _renderLayers(container);_update(container);
      });
    });

    var copyBtn = container.querySelector('#sp-copy');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      var out = container.querySelector('#sp-output');
      if (out&&navigator.clipboard) navigator.clipboard.writeText(out.textContent).then(function(){ copyBtn.textContent='✓';setTimeout(function(){copyBtn.textContent='Copy';},1500); });
    });
  }

  function _bindSlider(container, id, setter) {
    var sl = container.querySelector('#'+id);
    if (!sl) return;
    sl.addEventListener('input', function() { setter(parseFloat(sl.value)); _update(container); });
  }

  function _slider(id, label, val, min, max, unit) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+
      '<label style="font-size:11px;color:var(--text-dim);width:50px">'+label+'</label>'+
      '<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" value="'+val+'" style="flex:1;accent-color:var(--accent)">'+
      '<span style="font-size:11px;color:var(--text-dim);width:36px;text-align:right">'+val+unit+'</span>'+
    '</div>';
  }

  function _update(container) {
    var css = _shadows.map(function(s) {
      return (s.inset?'inset ':'')+s.x+'px '+s.y+'px '+s.blur+'px '+s.spread+'px rgba('+s.r+','+s.g+','+s.b+','+s.a.toFixed(2)+')';
    }).join(',\n    ');
    var full = 'box-shadow: '+css+';';

    var outEl = container.querySelector('#sp-output');
    if (outEl) outEl.textContent = full;

    var box = container.querySelector('#sp-preview-box');
    if (box) box.style.boxShadow = _shadows.map(function(s){
      return (s.inset?'inset ':'')+s.x+'px '+s.y+'px '+s.blur+'px '+s.spread+'px rgba('+s.r+','+s.g+','+s.b+','+s.a+')';
    }).join(',');

    // Tailwind approximation
    var tw = container.querySelector('#sp-tailwind');
    if (tw) {
      var s0 = _shadows[0];
      var map = [
        {tw:'shadow-sm',    y:1,blur:2},
        {tw:'shadow',       y:1,blur:3},
        {tw:'shadow-md',    y:4,blur:6},
        {tw:'shadow-lg',    y:10,blur:15},
        {tw:'shadow-xl',    y:20,blur:25},
        {tw:'shadow-2xl',   y:25,blur:50},
      ];
      var best='shadow-md';
      var minD=999;
      map.forEach(function(m){var d=Math.abs(m.y-s0.y)+Math.abs(m.blur-s0.blur);if(d<minD){minD=d;best=m.tw;}});
      tw.textContent = 'className="'+best+'"';
    }
  }

  function _rgbToHex(r,g,b) { return '#'+[r,g,b].map(function(v){return('0'+(v||0).toString(16)).slice(-2);}).join(''); }

  return { init };
})();
