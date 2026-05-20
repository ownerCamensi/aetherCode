/**
 * css-tools-panel.js — Right-side panel for CSS files
 * Shows: Color Picker + Shadow Generator when editing .css files
 */
var CSSToolsPanel = (function() {

  var _visible    = false;
  var _panelEl    = null;
  var _tab        = 'color'; // 'color' | 'shadow'

  function init() {
    EventBus.on(Events.FILE_SWITCHED, function(data) {
      var ext = data && data.file ? data.file.name.split('.').pop().toLowerCase() : '';
      var isCss = ['css','scss','sass','less'].indexOf(ext) !== -1;
      _togglePanel(isCss);
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'css-tools', label:'CSS Tools: Toggle Color/Shadow Panel', category:'View', action: function(){ _togglePanel(!_visible); } });
    }
  }

  function _togglePanel(show) {
    _visible = show;
    var existing = document.getElementById('css-tools-sidebar');
    if (!show) { if (existing) existing.remove(); _panelEl = null; return; }
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'css-tools-sidebar';
      existing.className = 'css-tools-sidebar';
      var editorArea = document.getElementById('editor-area') || document.querySelector('.editor-pane');
      if (editorArea) editorArea.appendChild(existing);
    }
    _panelEl = existing;
    _render();
    if (Editor && Editor.resize) Editor.resize();
  }

  function _render() {
    if (!_panelEl) return;
    _panelEl.innerHTML =
      '<div class="css-tools-inner">' +
        '<div class="css-tools-tabs">' +
          '<button class="css-tools-tab' + (_tab === 'color' ? ' active' : '') + '" data-tab="color">🎨 Color</button>' +
          '<button class="css-tools-tab' + (_tab === 'shadow' ? ' active' : '') + '" data-tab="shadow">🌫 Shadow</button>' +
          '<button class="css-tools-close" id="css-tools-close-btn">×</button>' +
        '</div>' +
        '<div class="css-tools-body" id="css-tools-body">' +
        '</div>' +
      '</div>';

    _panelEl.querySelectorAll('.css-tools-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { _tab = btn.dataset.tab; _render(); });
    });
    _panelEl.querySelector('#css-tools-close-btn').addEventListener('click', function() { _togglePanel(false); });

    var body = _panelEl.querySelector('#css-tools-body');
    if (_tab === 'color') _renderColorPicker(body);
    else _renderShadow(body);
  }

  function _renderColorPicker(container) {
    var _h = 0, _s = 1, _b = 0.5, _a = 1;
    var _fmt = 'hex';

    container.innerHTML =
      '<div style="padding:8px">' +
        // Canvas wheel
        '<canvas id="css-cp-wheel" width="160" height="160" style="border-radius:50%;cursor:crosshair;display:block;margin:0 auto 8px"></canvas>' +
        '<div style="position:relative;height:16px;margin-bottom:8px">' +
          '<div id="css-cp-cursor" style="position:absolute;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5);transform:translate(-50%,-50%);pointer-events:none;top:50%;left:50%"></div>' +
        '</div>' +
        // Sliders
        ['Hue:360', 'Sat:100', 'Bri:100', 'Alpha:100'].map(function(pair) {
          var parts = pair.split(':'); var label = parts[0]; var max = parts[1];
          var id = 'css-cp-' + label.toLowerCase();
          var val = label === 'Hue' ? 0 : label === 'Sat' ? 100 : label === 'Bri' ? 50 : 100;
          return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">' +
            '<label style="font-size:10px;color:var(--text-dim);width:30px">' + label + '</label>' +
            '<input type="range" id="' + id + '" min="0" max="' + max + '" value="' + val + '" style="flex:1;accent-color:var(--accent)">' +
            '<span id="' + id + '-val" style="font-size:10px;color:var(--text-dim);width:28px;text-align:right">' + val + '</span>' +
          '</div>';
        }).join('') +
        // Swatch + format
        '<div style="display:flex;align-items:center;gap:6px;margin:8px 0">' +
          '<div id="css-cp-swatch" style="width:32px;height:32px;border-radius:5px;border:1px solid var(--border);flex-shrink:0"></div>' +
          '<div style="display:flex;gap:3px;flex-wrap:wrap">' +
            ['hex','rgb','rgba','oklch'].map(function(f) {
              return '<button class="css-cp-fmt' + (f === 'hex' ? ' active' : '') + '" data-fmt="' + f + '" style="font-size:9px;padding:2px 5px;border-radius:3px;cursor:pointer;background:none;border:1px solid var(--border);color:var(--text-dim)">' + f.toUpperCase() + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        // Output
        '<div style="display:flex;gap:5px">' +
          '<input id="css-cp-out" readonly style="flex:1;font-size:11px;font-family:var(--font-code);background:#0d1117;border:1px solid var(--border);border-radius:3px;color:var(--accent);padding:4px 7px">' +
          '<button id="css-cp-copy" style="background:var(--accent);border:none;color:#fff;border-radius:3px;padding:4px 10px;font-size:10px;cursor:pointer">Copy</button>' +
          '<button id="css-cp-insert" style="background:rgba(255,255,255,.08);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:4px 8px;font-size:10px;cursor:pointer">Insert</button>' +
        '</div>' +
      '</div>';

    var canvas = container.querySelector('#css-cp-wheel');
    var ctx    = canvas.getContext('2d');
    var swatch = container.querySelector('#css-cp-swatch');
    var outEl  = container.querySelector('#css-cp-out');

    function drawWheel() {
      var cx = 80, cy = 80, r = 78;
      ctx.clearRect(0,0,160,160);
      for (var a = 0; a < 360; a++) {
        var start = (a-1)*Math.PI/180, end = (a+1)*Math.PI/180;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end);
        ctx.fillStyle = 'hsl('+a+',100%,50%)'; ctx.fill();
      }
      var wg = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      wg.addColorStop(0,'rgba(255,255,255,1)'); wg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=wg; ctx.fill();
      var bg = ctx.createRadialGradient(cx,cy,r*0.4,cx,cy,r);
      bg.addColorStop(0,'rgba(0,0,0,0)'); bg.addColorStop(1,'rgba(0,0,0,'+(1-_b)+')');
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=bg; ctx.fill();
    }

    function toRgb() {
      var h=_h/360,s=_s,v=_b,r,g,b;
      if(s===0){r=g=b=v;}else{var i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}}
      return {r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};
    }

    function getColor() {
      var rgb=toRgb();
      if(_fmt==='hex')return '#'+[rgb.r,rgb.g,rgb.b].map(function(v){return('0'+v.toString(16)).slice(-2);}).join('');
      if(_fmt==='rgb')return 'rgb('+rgb.r+','+rgb.g+','+rgb.b+')';
      if(_fmt==='rgba')return 'rgba('+rgb.r+','+rgb.g+','+rgb.b+','+_a.toFixed(2)+')';
      if(_fmt==='oklch'){var l=(0.2126*(rgb.r/255)+0.7152*(rgb.g/255)+0.0722*(rgb.b/255));return 'oklch('+l.toFixed(3)+' '+(_s*0.3).toFixed(3)+' '+Math.round(_h)+')';}
      return '#000';
    }

    function update() {
      var rgb=toRgb();
      var color='rgba('+rgb.r+','+rgb.g+','+rgb.b+','+_a+')';
      if(swatch)swatch.style.background=color;
      if(outEl)outEl.value=getColor();
      // Update slider label values
      ['hue','sat','bri','alpha'].forEach(function(k,i){
        var vals=[Math.round(_h),Math.round(_s*100),Math.round(_b*100),Math.round(_a*100)];
        var el=container.querySelector('#css-cp-'+k+'-val'); if(el)el.textContent=vals[i];
      });
      drawWheel();
    }

    // Wheel click/drag
    canvas.addEventListener('mousedown', function onDown(e) {
      function onMove(e2) {
        var rect=canvas.getBoundingClientRect();
        var dx=e2.clientX-(rect.left+80), dy=e2.clientY-(rect.top+80);
        var dist=Math.min(Math.sqrt(dx*dx+dy*dy),78);
        _h=((Math.atan2(dy,dx)*180/Math.PI)+90+360)%360;
        _s=dist/78;
        var hSlider=container.querySelector('#css-cp-hue'); if(hSlider){hSlider.value=Math.round(_h);}
        var sSlider=container.querySelector('#css-cp-sat'); if(sSlider){sSlider.value=Math.round(_s*100);}
        update();
      }
      onMove(e);
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',function(){document.removeEventListener('mousemove',onMove);},{once:true});
    });

    // Sliders
    [['hue',function(v){_h=v;}],['sat',function(v){_s=v/100;}],['bri',function(v){_b=v/100;}],['alpha',function(v){_a=v/100;}]].forEach(function(pair){
      var sl=container.querySelector('#css-cp-'+pair[0]);
      if(sl)sl.addEventListener('input',function(){pair[1](parseFloat(sl.value));update();});
    });

    // Format buttons
    container.querySelectorAll('.css-cp-fmt').forEach(function(btn){
      btn.addEventListener('click',function(){
        container.querySelectorAll('.css-cp-fmt').forEach(function(b){b.classList.remove('active');b.style.background='none';b.style.color='var(--text-dim)';});
        btn.classList.add('active'); btn.style.background='var(--accent)'; btn.style.color='#fff';
        _fmt=btn.dataset.fmt; update();
      });
    });

    var copyBtn=container.querySelector('#css-cp-copy');
    if(copyBtn)copyBtn.addEventListener('click',function(){if(navigator.clipboard)navigator.clipboard.writeText(getColor()).then(function(){copyBtn.textContent='✓';setTimeout(function(){copyBtn.textContent='Copy';},1500);});});

    var insertBtn=container.querySelector('#css-cp-insert');
    if(insertBtn)insertBtn.addEventListener('click',function(){if(Editor&&Editor._ace)Editor._ace.insert(getColor());});

    drawWheel(); update();
  }

  function _renderShadow(container) {
    var _shadows = [{ inset:false,x:0,y:4,blur:8,spread:0,r:0,g:0,b:0,a:0.2 }];

    function _sCss() {
      return _shadows.map(function(s){return(s.inset?'inset ':'')+s.x+'px '+s.y+'px '+s.blur+'px '+s.spread+'px rgba('+s.r+','+s.g+','+s.b+','+s.a.toFixed(2)+')';}).join(', ');
    }
    function _full() { return 'box-shadow: ' + _sCss() + ';'; }
    function _rgbToHex(r,g,b){return '#'+[r,g,b].map(function(v){return('0'+(v||0).toString(16)).slice(-2);}).join('');}

    function renderLayers() {
      var layersEl = container.querySelector('#css-sh-layers');
      if (!layersEl) return;
      layersEl.innerHTML = _shadows.map(function(s,i){
        return '<div class="css-sh-layer">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:10px;font-weight:700;color:var(--text-dim)">Layer '+(i+1)+'</span>' +
            '<div style="display:flex;gap:6px;align-items:center">' +
              '<label style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-dim);cursor:pointer"><input type="checkbox" class="css-sh-inset" data-idx="'+i+'"'+(s.inset?' checked':'')+' style="accent-color:var(--accent)"> inset</label>' +
              (_shadows.length>1?'<button class="css-sh-rem" data-idx="'+i+'" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:14px;line-height:1">×</button>':'') +
            '</div>' +
          '</div>' +
          [['X',s.x,-50,50,'px'],['Y',s.y,-50,50,'px'],['Blur',s.blur,0,80,'px'],['Spread',s.spread,-30,30,'px'],['Opacity',Math.round(s.a*100),0,100,'%']].map(function(row){
            var id='css-sh-'+row[0].toLowerCase()+'-'+i;
            return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">'+
              '<label style="font-size:10px;color:var(--text-dim);width:40px">'+row[0]+'</label>'+
              '<input type="range" id="'+id+'" min="'+row[2]+'" max="'+row[3]+'" value="'+row[1]+'" style="flex:1;accent-color:var(--accent)">'+
              '<span style="font-size:10px;color:var(--text-dim);width:30px;text-align:right">'+row[1]+row[4]+'</span>'+
            '</div>';
          }).join('') +
          '<div style="display:flex;align-items:center;gap:5px">' +
            '<label style="font-size:10px;color:var(--text-dim);width:40px">Color</label>' +
            '<input type="color" class="css-sh-color" data-idx="'+i+'" value="'+_rgbToHex(s.r,s.g,s.b)+'" style="width:32px;height:22px;border:1px solid var(--border);background:none;border-radius:3px;cursor:pointer;padding:1px">' +
          '</div>' +
        '</div>';
      }).join('');

      // Bind sliders
      _shadows.forEach(function(s,i){
        var bind=function(key,prop,scale){var sl=layersEl.querySelector('#css-sh-'+key+'-'+i);if(sl)sl.addEventListener('input',function(){s[prop]=parseFloat(sl.value)*(scale||1);updateOutput();});};
        bind('x','x'); bind('y','y'); bind('blur','blur'); bind('spread','spread');
        var opSl=layersEl.querySelector('#css-sh-opacity-'+i);
        if(opSl)opSl.addEventListener('input',function(){s.a=parseFloat(opSl.value)/100;updateOutput();});
      });
      layersEl.querySelectorAll('.css-sh-inset').forEach(function(cb){cb.addEventListener('change',function(){_shadows[parseInt(cb.dataset.idx)].inset=cb.checked;updateOutput();});});
      layersEl.querySelectorAll('.css-sh-color').forEach(function(inp){inp.addEventListener('input',function(){var idx=parseInt(inp.dataset.idx),h=inp.value;_shadows[idx].r=parseInt(h.slice(1,3),16);_shadows[idx].g=parseInt(h.slice(3,5),16);_shadows[idx].b=parseInt(h.slice(5,7),16);updateOutput();});});
      layersEl.querySelectorAll('.css-sh-rem').forEach(function(btn){btn.addEventListener('click',function(){_shadows.splice(parseInt(btn.dataset.idx),1);renderLayers();updateOutput();});});
    }

    function updateOutput() {
      var out=container.querySelector('#css-sh-out'); if(out) out.textContent=_full();
      var prev=container.querySelector('#css-sh-preview'); if(prev) prev.style.boxShadow=_sCss();
    }

    container.innerHTML =
      '<div style="padding:8px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;height:100%">' +
        '<div style="display:flex;justify-content:center;align-items:center;padding:16px;background:#0d1117;border-radius:6px"><div id="css-sh-preview" style="width:60px;height:60px;background:#fff;border-radius:6px;transition:box-shadow .2s"></div></div>' +
        '<div id="css-sh-layers"></div>' +
        '<button id="css-sh-add" class="btn-sm" style="font-size:11px">+ Add Shadow Layer</button>' +
        '<div style="background:#0d1117;border:1px solid #30363d;border-radius:5px;padding:8px">' +
          '<pre id="css-sh-out" style="margin:0;font-size:10px;color:#9cdcfe;font-family:var(--font-code);white-space:pre-wrap;word-break:break-all"></pre>' +
          '<div style="display:flex;gap:5px;margin-top:6px">' +
            '<button id="css-sh-copy" class="ai-copy-btn" style="font-size:10px">Copy</button>' +
            '<button id="css-sh-insert" style="background:rgba(255,255,255,.08);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:3px 8px;font-size:10px;cursor:pointer">Insert</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    container.querySelector('#css-sh-add').addEventListener('click',function(){_shadows.push({inset:false,x:0,y:8,blur:16,spread:-2,r:0,g:0,b:0,a:0.15});renderLayers();updateOutput();});
    var copyBtn=container.querySelector('#css-sh-copy');
    if(copyBtn)copyBtn.addEventListener('click',function(){var out=container.querySelector('#css-sh-out');if(out&&navigator.clipboard)navigator.clipboard.writeText(out.textContent).then(function(){copyBtn.textContent='✓';setTimeout(function(){copyBtn.textContent='Copy';},1500);});});
    var insertBtn=container.querySelector('#css-sh-insert');
    if(insertBtn)insertBtn.addEventListener('click',function(){var out=container.querySelector('#css-sh-out');if(out&&Editor&&Editor._ace)Editor._ace.insert(out.textContent);});

    renderLayers(); updateOutput();
  }

  return { init };
})();
