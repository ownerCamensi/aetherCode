/**
 * panel-resizer.js — Resizable Panels (≥1024px only)
 *
 * WHY screen-width gating:
 *   On mobile, panels are stacked / overlaid. Trying to resize them
 *   with touch would fight with scroll gestures and make the UI unusable.
 *   1024px is the breakpoint where the editor becomes a true split layout.
 *
 * HOW it works:
 *   We inject thin invisible "handle" divs between panels.
 *   On mousedown/touchstart on a handle, we capture pointer movement
 *   and convert delta-Y or delta-X into new CSS flex sizes.
 *   We use flex-basis (pixels) rather than percentages so that the
 *   layout math stays simple and predictable.
 *
 * Panels managed:
 *   - Sidebar width      (drag handle on right edge of sidebar)
 *   - Preview width      (drag handle on left edge of preview panel)
 *   - Bottom panel height (already has #panel-resizer — we enhance it)
 */

var PanelResizer = (function() {

  var MIN_SIDEBAR  = 160;
  var MAX_SIDEBAR  = 500;
  var MIN_PREVIEW  = 200;
  var MAX_PREVIEW  = 600; // hard cap — prevents preview from dominating editor
  var MIN_BOTTOM   = 80;
  var MAX_BOTTOM_RATIO = 0.75;

  // Saved layout key
  var LAYOUT_KEY = 'codex:layout';

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!_isLargeScreen()) return; // Disable entirely on small screens

    _injectSidebarHandle();
    _injectPreviewHandle();
    _enhanceBottomHandle();
    _restoreLayout();

    // Re-check on window resize — remove handles if screen shrinks
    window.addEventListener('resize', function() {
      if (!_isLargeScreen()) {
        _removeAllHandles();
        _resetLayout();
      } else {
        // Re-init if handles were removed
        if (!document.getElementById('handle-sidebar')) {
          _injectSidebarHandle();
          _injectPreviewHandle();
          _restoreLayout();
        }
      }
    });
  }

  function _isLargeScreen() { return window.innerWidth >= 1024; }

  // ─── Sidebar Handle ────────────────────────────────────────────────────────

  function _injectSidebarHandle() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar || document.getElementById('handle-sidebar')) return;

    var handle       = document.createElement('div');
    handle.id        = 'handle-sidebar';
    handle.className = 'resize-handle resize-handle-x';
    handle.title     = 'Drag to resize sidebar';
    // Insert AFTER sidebar in the DOM (it sits on the right edge)
    sidebar.parentNode.insertBefore(handle, sidebar.nextSibling);

    _bindX(handle, function(deltaX) {
      var sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      var current = sidebar.offsetWidth;
      var newW    = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, current + deltaX));
      sidebar.style.width      = newW + 'px';
      sidebar.style.transition = 'none'; // Disable CSS transition while dragging
      document.documentElement.style.setProperty('--sidebar-w', newW + 'px');
      if (Editor && Editor.resize) Editor.resize();
      _saveLayout();
    }, function() {
      // On release: re-enable transition
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.transition = '';
    });
  }

  // ─── Preview Handle ────────────────────────────────────────────────────────

  function _injectPreviewHandle() {
    var preview = document.getElementById('preview-panel');
    if (!preview || document.getElementById('handle-preview')) return;

    var handle       = document.createElement('div');
    handle.id        = 'handle-preview';
    handle.className = 'resize-handle resize-handle-x';
    handle.title     = 'Drag to resize preview';
    preview.parentNode.insertBefore(handle, preview);

    _bindX(handle, function(deltaX) {
      var preview = document.getElementById('preview-panel');
      if (!preview || preview.classList.contains('hidden')) return;
      var current = preview.offsetWidth;
      var newW    = Math.max(MIN_PREVIEW, Math.min(MAX_PREVIEW, current - deltaX));
      preview.style.maxWidth  = newW + 'px';
      preview.style.flex      = 'none';
      preview.style.transition= 'none';
      if (Editor && Editor.resize) Editor.resize();
      _saveLayout();
    }, function() {
      var preview = document.getElementById('preview-panel');
      if (preview) preview.style.transition = '';
    });
  }

  // ─── Bottom Panel Handle ────────────────────────────────────────────────────

  /**
   * WHY "enhance" instead of replace:
   * PanelSystem already added #panel-resizer but it only changes height.
   * We replace its listeners here to add layout-save and smoother clamping.
   */
  function _enhanceBottomHandle() {
    var resizer = document.getElementById('panel-resizer');
    if (!resizer || resizer.dataset.enhanced) return;
    resizer.dataset.enhanced = '1';

    // Remove PanelSystem's listeners by cloning the node
    var newResizer = resizer.cloneNode(true);
    resizer.parentNode.replaceChild(newResizer, resizer);

    var _startY = 0;
    var _startH = 0;
    var _active = false;

    function start(clientY) {
      var panel = document.getElementById('panel-area');
      if (!panel) return;
      _active = true;
      _startY = clientY;
      _startH = panel.offsetHeight;
      document.body.style.userSelect    = 'none';
      document.body.style.cursor        = 'ns-resize';
    }

    function move(clientY) {
      if (!_active) return;
      var panel  = document.getElementById('panel-area');
      if (!panel) return;
      var diff   = _startY - clientY;
      var newH   = Math.max(MIN_BOTTOM, Math.min(_startH + diff, window.innerHeight * MAX_BOTTOM_RATIO));
      panel.style.height = newH + 'px';
      if (Editor && Editor.resize) Editor.resize();
    }

    function stop() {
      if (!_active) return;
      _active = false;
      document.body.style.userSelect = '';
      document.body.style.cursor     = '';
      _saveLayout();
    }

    newResizer.addEventListener('mousedown',  function(e) { start(e.clientY); });
    newResizer.addEventListener('touchstart', function(e) { start(e.touches[0].clientY); }, { passive:true });
    document.addEventListener('mousemove',    function(e) { move(e.clientY); });
    document.addEventListener('touchmove',    function(e) { if(_active) { e.preventDefault(); move(e.touches[0].clientY); } }, { passive:false });
    document.addEventListener('mouseup',      stop);
    document.addEventListener('touchend',     stop);
  }

  // ─── Generic X-axis drag binder ───────────────────────────────────────────

  function _bindX(handle, onMove, onRelease) {
    var _active  = false;
    var _lastX   = 0;

    handle.addEventListener('mousedown', function(e) {
      _active = true;
      _lastX  = e.clientX;
      document.body.style.userSelect = 'none';
      document.body.style.cursor     = 'col-resize';
      e.preventDefault();
    });

    handle.addEventListener('touchstart', function(e) {
      _active = true;
      _lastX  = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('mousemove', function(e) {
      if (!_active) return;
      var delta = e.clientX - _lastX;
      _lastX    = e.clientX;
      onMove(delta);
    });

    document.addEventListener('touchmove', function(e) {
      if (!_active) return;
      e.preventDefault();
      var delta = e.touches[0].clientX - _lastX;
      _lastX    = e.touches[0].clientX;
      onMove(delta);
    }, { passive: false });

    function release() {
      if (!_active) return;
      _active = false;
      document.body.style.userSelect = '';
      document.body.style.cursor     = '';
      if (onRelease) onRelease();
    }

    document.addEventListener('mouseup',  release);
    document.addEventListener('touchend', release);
  }

  // ─── Layout Persistence ────────────────────────────────────────────────────

  function _saveLayout() {
    try {
      var sidebar  = document.getElementById('sidebar');
      var preview  = document.getElementById('preview-panel');
      var panel    = document.getElementById('panel-area');
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({
        sidebarW:  sidebar  ? sidebar.offsetWidth  : null,
        previewW:  preview  ? preview.offsetWidth  : null,
        bottomH:   panel    ? panel.offsetHeight   : null,
      }));
    } catch(e) {}
  }

  function _restoreLayout() {
    try {
      var saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
      if (!saved) return;
      if (saved.sidebarW) {
        var sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
          var w = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, saved.sidebarW));
          sidebar.style.width = w + 'px';
          document.documentElement.style.setProperty('--sidebar-w', w + 'px');
        }
      }
      if (saved.previewW) {
        var preview = document.getElementById('preview-panel');
        if (preview && !preview.classList.contains('hidden')) {
          preview.style.maxWidth = saved.previewW + 'px';
          preview.style.flex     = 'none';
        }
      }
      if (saved.bottomH) {
        var panel = document.getElementById('panel-area');
        if (panel && !panel.classList.contains('hidden')) {
          panel.style.height = saved.bottomH + 'px';
        }
      }
    } catch(e) {}
  }

  function _removeAllHandles() {
    ['handle-sidebar','handle-preview'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function _resetLayout() {
    var sidebar = document.getElementById('sidebar');
    var preview = document.getElementById('preview-panel');
    if (sidebar) { sidebar.style.width = ''; sidebar.style.transition = ''; }
    if (preview) { preview.style.maxWidth = ''; preview.style.flex = ''; }
  }

  return { init: init };

})();
