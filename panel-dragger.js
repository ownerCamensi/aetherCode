/**
 * panel-dragger.js — Draggable / Swappable Panels (800–1023px and ≥1024px)
 *
 * WHY this is separate from panel-resizer.js:
 *   Resizing changes panel SIZE. Dragging changes panel POSITION (swap).
 *   They're independent concerns — you might want one without the other.
 *
 * HOW it works:
 *   Each panel that can be moved has a "drag grip" element added to its
 *   header. When the user drags the grip, we:
 *     1. Create a semi-transparent "ghost" clone of the panel.
 *     2. Show "drop zones" where the panel can land.
 *     3. On drop, swap the two panels' DOM positions.
 *     4. Call Editor.resize() so Ace recalculates its viewport.
 *
 * Panels that can swap:
 *   - Sidebar ↔ (stays left, but can be hidden/shown via drag-off screen)
 *   - Editor panel ↔ Preview panel (swap left/right)
 *   - Bottom panel ↔ (can be moved to top or stay at bottom)
 *
 * Screen width gating:
 *   800–1023px: panels swap but can't resize (phone landscape / small tablet)
 *   ≥1024px:    full drag + resize
 *   <800px:     no drag at all
 */

var PanelDragger = (function() {

  var MIN_DRAG_SCREEN = 800; // px — below this, no dragging at all

  // Which panels are currently in which slot
  // Slots: 'left' (editor), 'right' (preview), 'bottom'
  var _layout = { left: 'editor', right: 'preview', bottom: 'panel' };

  var _dragging     = null; // { panelId, ghost, origRect }
  var _dropTargets  = [];
  var _animFrame    = null;

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (window.innerWidth < MIN_DRAG_SCREEN) return;

    _addGrip('editor-panel',  'Editor');
    _addGrip('preview-panel', 'Preview');
    _addGrip('panel-area',    'Panel');

    _loadLayout();

    window.addEventListener('resize', function() {
      if (window.innerWidth < MIN_DRAG_SCREEN) _removeAllGrips();
    });
  }

  // ─── Drag Grip ─────────────────────────────────────────────────────────────

  /**
   * WHY a grip instead of the whole header:
   * Making the entire panel header draggable would block clicks on buttons
   * inside it (like tab-close or plugin search). A small grip icon in the
   * corner keeps drag clearly separate from other interactions.
   */
  function _addGrip(panelId, label) {
    var panel = document.getElementById(panelId);
    if (!panel || panel.querySelector('.drag-grip')) return;

    var grip         = document.createElement('div');
    grip.className   = 'drag-grip';
    grip.title       = 'Drag to move ' + label + ' panel';
    grip.dataset.panel = panelId;
    grip.innerHTML   = '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="11" cy="12" r="1"/></svg>';

    // Position grip in top-right corner of panel
    panel.style.position = panel.style.position || 'relative';
    grip.style.cssText   = 'position:absolute;top:4px;right:4px;z-index:100;width:20px;height:20px;cursor:grab;display:flex;align-items:center;justify-content:center;color:var(--text-dim);border-radius:3px;opacity:0;transition:opacity .15s;';

    panel.appendChild(grip);

    // Show grip on panel hover
    panel.addEventListener('mouseenter', function() { grip.style.opacity = '1'; });
    panel.addEventListener('mouseleave', function() { if (!_dragging) grip.style.opacity = '0'; });

    // Desktop drag
    grip.addEventListener('mousedown', function(e) {
      e.preventDefault();
      _startDrag(panelId, e.clientX, e.clientY);
    });

    // Touch drag
    grip.addEventListener('touchstart', function(e) {
      e.preventDefault();
      _startDrag(panelId, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
  }

  function _removeAllGrips() {
    document.querySelectorAll('.drag-grip').forEach(function(g) { g.remove(); });
  }

  // ─── Drag Start ────────────────────────────────────────────────────────────

  function _startDrag(panelId, clientX, clientY) {
    var panel = document.getElementById(panelId);
    if (!panel) return;

    var rect = panel.getBoundingClientRect();

    // Create ghost — semi-transparent clone that follows the cursor
    var ghost         = document.createElement('div');
    ghost.className   = 'panel-drag-ghost';
    ghost.style.cssText =
      'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
      'width:' + rect.width + 'px;height:' + Math.min(rect.height, 200) + 'px;' +
      'background:rgba(0,122,204,.15);border:2px solid var(--accent);' +
      'border-radius:4px;pointer-events:none;z-index:9000;' +
      'backdrop-filter:blur(2px);transition:none;';

    var label = document.createElement('div');
    label.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--accent);font-size:13px;font-weight:600;white-space:nowrap;';
    label.textContent   = '⣿ Moving ' + _panelLabel(panelId);
    ghost.appendChild(label);
    document.body.appendChild(ghost);

    _dragging = {
      panelId:  panelId,
      ghost:    ghost,
      startX:   clientX,
      startY:   clientY,
      offsetX:  clientX - rect.left,
      offsetY:  clientY - rect.top,
    };

    _showDropZones(panelId);
    document.body.style.userSelect = 'none';

    // Bind move & release globally
    document.addEventListener('mousemove', _onMove);
    document.addEventListener('touchmove',  _onTouchMove, { passive: false });
    document.addEventListener('mouseup',    _onRelease);
    document.addEventListener('touchend',   _onRelease);
  }

  // ─── Drag Move ─────────────────────────────────────────────────────────────

  function _onMove(e) { _moveGhost(e.clientX, e.clientY); }

  function _onTouchMove(e) {
    e.preventDefault();
    _moveGhost(e.touches[0].clientX, e.touches[0].clientY);
  }

  function _moveGhost(x, y) {
    if (!_dragging) return;
    cancelAnimationFrame(_animFrame);
    _animFrame = requestAnimationFrame(function() {
      if (!_dragging) return;
      var g = _dragging.ghost;
      g.style.left = (x - _dragging.offsetX) + 'px';
      g.style.top  = (y - _dragging.offsetY) + 'px';

      // Highlight the drop zone we're hovering over
      _dropTargets.forEach(function(zone) {
        var rect     = zone.el.getBoundingClientRect();
        var hovering = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        zone.el.classList.toggle('drop-zone-active', hovering);
      });
    });
  }

  // ─── Drag Release ──────────────────────────────────────────────────────────

  function _onRelease(e) {
    if (!_dragging) return;

    var x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    var y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    // Find the drop target we released over
    var target = null;
    _dropTargets.forEach(function(zone) {
      var rect = zone.el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        target = zone;
      }
    });

    if (target && target.panelId !== _dragging.panelId) {
      _swapPanels(_dragging.panelId, target.panelId);
    }

    // Cleanup
    _dragging.ghost.remove();
    _dragging = null;
    _hideDropZones();
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove',  _onMove);
    document.removeEventListener('touchmove',  _onTouchMove);
    document.removeEventListener('mouseup',    _onRelease);
    document.removeEventListener('touchend',   _onRelease);

    if (Editor && Editor.resize) Editor.resize();
  }

  // ─── Drop Zones ────────────────────────────────────────────────────────────

  function _showDropZones(excludePanelId) {
    var panelIds = ['editor-panel', 'preview-panel', 'panel-area'];
    _dropTargets = [];

    panelIds.forEach(function(id) {
      if (id === excludePanelId) return;
      var panel = document.getElementById(id);
      if (!panel || panel.classList.contains('hidden')) return;

      var zone         = document.createElement('div');
      zone.className   = 'drop-zone';
      var rect         = panel.getBoundingClientRect();
      zone.style.cssText =
        'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
        'width:' + rect.width + 'px;height:' + rect.height + 'px;' +
        'border:2px dashed rgba(0,122,204,.4);border-radius:4px;z-index:8999;' +
        'pointer-events:all;background:rgba(0,122,204,.05);transition:background .15s,border-color .15s;';

      var label         = document.createElement('div');
      label.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(0,122,204,.6);font-size:12px;font-weight:500;pointer-events:none;';
      label.textContent  = 'Drop here';
      zone.appendChild(label);

      document.body.appendChild(zone);
      _dropTargets.push({ panelId: id, el: zone });
    });
  }

  function _hideDropZones() {
    _dropTargets.forEach(function(zone) { zone.el.remove(); });
    _dropTargets = [];
  }

  // ─── Swap Panels ───────────────────────────────────────────────────────────

  /**
   * WHY DOM-based swap:
   * We swap the actual DOM nodes rather than just changing CSS.
   * This keeps all event listeners and child state (like Ace) intact.
   * The trick: save both panels' next siblings, then re-insert in swapped positions.
   */
  function _swapPanels(idA, idB) {
    var panelA = document.getElementById(idA);
    var panelB = document.getElementById(idB);
    if (!panelA || !panelB) return;

    // Animate before swap
    [panelA, panelB].forEach(function(p) {
      p.style.transition = 'opacity .2s';
      p.style.opacity    = '0.4';
    });

    setTimeout(function() {
      // Save positions
      var parentA  = panelA.parentNode;
      var parentB  = panelB.parentNode;
      var afterA   = panelA.nextSibling;
      var afterB   = panelB.nextSibling;

      if (parentA === parentB) {
        // Same container — simple swap
        if (afterA === panelB) {
          parentA.insertBefore(panelB, panelA);
        } else if (afterB === panelA) {
          parentB.insertBefore(panelA, panelB);
        } else {
          var placeholder = document.createElement('div');
          parentA.insertBefore(placeholder, panelA);
          parentB.insertBefore(panelA, afterB);
          parentA.insertBefore(panelB, placeholder);
          placeholder.remove();
        }
      }
      // Different containers — not supported in this layout

      // Restore opacity
      [panelA, panelB].forEach(function(p) {
        p.style.opacity    = '1';
        p.style.transition = '';
      });

      _saveLayout();
      if (Editor && Editor.resize) setTimeout(function() { Editor.resize(); }, 50);
    }, 150);
  }

  // ─── Layout Persistence ────────────────────────────────────────────────────

  function _saveLayout() {
    // Just record panel order in workspace
    var workspace = document.getElementById('workspace');
    if (!workspace) return;
    try {
      var order = Array.from(workspace.children).map(function(el) { return el.id; });
      var saved = JSON.parse(localStorage.getItem('codex:layout') || '{}');
      saved.panelOrder = order;
      localStorage.setItem('codex:layout', JSON.stringify(saved));
    } catch(e) {}
  }

  function _loadLayout() {
    try {
      var saved = JSON.parse(localStorage.getItem('codex:layout'));
      if (!saved || !Array.isArray(saved.panelOrder)) return;
      var workspace = document.getElementById('workspace');
      if (!workspace) return;
      saved.panelOrder.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.parentNode === workspace) workspace.appendChild(el);
      });
    } catch(e) {}
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────

  function _panelLabel(id) {
    var labels = { 'editor-panel':'Editor', 'preview-panel':'Preview', 'panel-area':'Bottom Panel' };
    return labels[id] || id;
  }

  return { init: init };

})();
