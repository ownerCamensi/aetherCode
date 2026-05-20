/**
 * power-mode.js — Typing effects: fire particles + screen shake + combos
 */
var PowerMode = (function() {

  var STORAGE_KEY = 'codex:power-mode';
  var _enabled    = false;
  var _combo      = 0;
  var _comboTimer = null;
  var _canvas     = null;
  var _ctx        = null;
  var _particles  = [];
  var _raf        = null;

  function init() {
    _enabled = localStorage.getItem(STORAGE_KEY) === 'true';
    _createCanvas();

    if (typeof EventBus !== 'undefined') {
      EventBus.on('editor:change', function() {
        if (!_enabled) return;
        _combo++;
        clearTimeout(_comboTimer);
        _comboTimer = setTimeout(function() { _combo = 0; _updateComboDisplay(); }, 2000);
        _updateComboDisplay();
        _spawnParticles();
        if (_combo > 0 && _combo % 20 === 0) _shake();
      });
    }
  }

  function _createCanvas() {
    _canvas = document.createElement('canvas');
    _canvas.id = 'power-canvas';
    _canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9990;';
    document.body.appendChild(_canvas);
    _resize();
    window.addEventListener('resize', _resize);
    _ctx = _canvas.getContext('2d');
  }

  function _resize() { if(_canvas){ _canvas.width=window.innerWidth; _canvas.height=window.innerHeight; } }

  function _spawnParticles() {
    if (!Editor || !Editor._ace) return;
    var ace  = Editor._ace;
    var pos  = ace.getCursorPosition();
    var rect = ace.renderer.container.getBoundingClientRect();
    var coords = ace.renderer.textToScreenCoordinates(pos.row, pos.column);
    var x = coords.pageX, y = coords.pageY;

    // Number of particles scales with combo
    var count = Math.min(6 + Math.floor(_combo / 5), 20);
    var colors = ['#ff6b6b','#ffd700','#ff4500','#ff8c00','#ff69b4','#00bfff','#7fff00'];

    for (var i = 0; i < count; i++) {
      _particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 2.5) * 6,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    if (!_raf) _loop();
  }

  function _loop() {
    if (!_ctx || _particles.length === 0) { _raf = null; return; }
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    _particles = _particles.filter(function(p) {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.3; // gravity
      p.vx   *= 0.98;
      p.life -= p.decay;

      if (p.life <= 0) return false;

      _ctx.save();
      _ctx.globalAlpha = p.life;
      _ctx.fillStyle   = p.color;
      _ctx.shadowBlur  = 10;
      _ctx.shadowColor = p.color;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.restore();
      return true;
    });

    _raf = requestAnimationFrame(_loop);
  }

  function _shake() {
    var editor = document.getElementById('editor-area') || document.getElementById('ace-editor');
    if (!editor) return;
    var intensity = Math.min(_combo / 100, 1) * 6;
    editor.style.animation = 'none';
    editor.style.transform = 'translate(' + (Math.random()-0.5)*intensity + 'px,' + (Math.random()-0.5)*intensity + 'px)';
    setTimeout(function() { editor.style.transform = ''; }, 80);
  }

  function _updateComboDisplay() {
    var el = document.getElementById('power-combo');
    if (!el) return;
    if (_combo <= 0) { el.style.opacity = '0'; return; }
    el.textContent = '🔥 ' + _combo + (
      _combo >= 100 ? ' GODLIKE' :
      _combo >= 50  ? ' INSANE!' :
      _combo >= 30  ? ' ON FIRE!' :
      _combo >= 15  ? ' COMBO!' : ''
    );
    el.style.opacity = '1';
    el.style.color   = _combo >= 50 ? '#ffd700' : _combo >= 20 ? '#ff6b6b' : '#ff8c00';
  }

  function toggle() {
    _enabled = !_enabled;
    localStorage.setItem(STORAGE_KEY, String(_enabled));
    var el = document.getElementById('power-combo');
    if (!_enabled) { _combo=0; if(el)el.style.opacity='0'; }
    if (UI) UI.toast('Power Mode ' + (_enabled?'🔥 ON':'OFF'), _enabled?'success':'info');
    return _enabled;
  }

  function isEnabled() { return _enabled; }

  return { init, toggle, isEnabled };
})();
