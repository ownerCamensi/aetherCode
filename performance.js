/**
 * performance.js — 60fps optimization engine
 * Ultra / Balanced / Low-end modes like video game settings
 */
var Performance = (function() {

  var STORAGE_KEY = 'codex:perf-mode';
  var _mode = 'balanced'; // ultra | balanced | low

  var MODES = {
    ultra: {
      label: '🚀 Ultra',
      desc:  'Full animations, particles, blur, shadows. Best experience.',
      css: {
        '--transition-speed': '.18s',
        '--blur-amount':      'blur(12px)',
        '--shadow-strength':  '0 8px 32px rgba(0,0,0,.6)',
      },
      animations: true,
      particles:  true,
      blur:       true,
      sounds:     true,
    },
    balanced: {
      label: '⚡ Balanced',
      desc:  'Smooth but efficient. Good for mid-range devices.',
      css: {
        '--transition-speed': '.12s',
        '--blur-amount':      'blur(6px)',
        '--shadow-strength':  '0 4px 16px rgba(0,0,0,.5)',
      },
      animations: true,
      particles:  false,
      blur:       true,
      sounds:     false,
    },
    low: {
      label: '🔋 Low-end',
      desc:  'No animations, no blur, no particles. Max performance. NeoVim-style colors.',
      css: {
        '--transition-speed': '0s',
        '--blur-amount':      'none',
        '--shadow-strength':  'none',
      },
      animations: false,
      particles:  false,
      blur:       false,
      sounds:     false,
    },
  };

  function init() {
    try { _mode = localStorage.getItem(STORAGE_KEY) || 'balanced'; } catch(e) {}
    if (!MODES[_mode]) _mode = 'balanced';
    _apply();
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'perf-ultra',   label:'Performance: Ultra Mode',   category:'App', action: function(){ setMode('ultra'); } });
      CommandPalette.register({ id:'perf-balanced',label:'Performance: Balanced Mode', category:'App', action: function(){ setMode('balanced'); } });
      CommandPalette.register({ id:'perf-low',     label:'Performance: Low-end Mode',  category:'App', action: function(){ setMode('low'); } });
    }
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    _mode = mode;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch(e) {}
    _apply();
    if (UI) UI.toast('Performance: ' + MODES[mode].label, 'info');
    // Re-render settings if open
    EventBus.emit('perf:changed', { mode: mode });
  }

  function getMode() { return _mode; }
  function getModes() { return MODES; }

  function _apply() {
    var m = MODES[_mode];
    var root = document.documentElement;

    // Apply CSS vars
    Object.keys(m.css).forEach(function(k) {
      root.style.setProperty(k, m.css[k]);
    });

    // Body class
    document.body.classList.remove('perf-ultra', 'perf-balanced', 'perf-low');
    document.body.classList.add('perf-' + _mode);

    // Disable/enable animations globally
    if (!m.animations) {
      _injectStyle('perf-no-anim',
        '*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }'
      );
    } else {
      _removeStyle('perf-no-anim');
    }

    // Disable blur
    if (!m.blur) {
      _injectStyle('perf-no-blur',
        '.sidebar-backdrop, #mob-drawer-overlay, .modal-overlay-inner { backdrop-filter: none !important; }'
      );
    } else {
      _removeStyle('perf-no-blur');
    }

    // Kill power-mode particles if low
    if (!m.particles && typeof PowerMode !== 'undefined' && PowerMode.isEnabled()) {
      PowerMode.toggle();
    }

    // Low-end: apply NeoVim-style simple palette
    if (_mode === 'low') {
      _injectStyle('perf-nvim-colors', [
        ':root {',
        '  --bg:          #1a1a1a;',
        '  --bg2:         #222222;',
        '  --sidebar-bg:  #1a1a1a;',
        '  --border:      #333333;',
        '  --text:        #cccccc;',
        '  --text-bright: #ffffff;',
        '  --text-dim:    #666666;',
        '  --accent:      #5f87ff;',
        '  --success:     #87af5f;',
        '  --danger:      #ff5f5f;',
        '  --warning:     #d7af5f;',
        '}',
        '.mob-nav-btn.active { color:#5f87ff; }',
        '.mob-nav-btn.active::before { background:#5f87ff; }',
        '#mob-topbar { background:#1a1a1a; border-bottom:1px solid #333; }',
        '#mob-nav { background:#1a1a1a; border-top:1px solid #333; }',
      ].join('\n'));
    } else {
      _removeStyle('perf-nvim-colors');
    }
  }

  function _injectStyle(id, css) {
    var el = document.getElementById('perf-style-' + id);
    if (!el) { el = document.createElement('style'); el.id = 'perf-style-' + id; document.head.appendChild(el); }
    el.textContent = css;
  }
  function _removeStyle(id) {
    var el = document.getElementById('perf-style-' + id);
    if (el) el.remove();
  }

  // requestAnimationFrame throttle helper — use 30fps cap on low-end
  function raf(fn) {
    if (_mode === 'low') { setTimeout(fn, 33); return; }
    requestAnimationFrame(fn);
  }

  return { init, setMode, getMode, getModes, raf };
})();
