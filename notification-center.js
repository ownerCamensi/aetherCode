/**
 * notification-center.js — Persistent notification panel
 * Unlike toasts (auto-dismiss), notifications stay until dismissed.
 * Plugins and internal systems can push notifications here.
 * Uses PanelSystem to register a bottom panel tab.
 */
var NotificationCenter = (function() {

  var _notifications = []; // { id, title, message, type, time, read, actions }
  var _unreadCount   = 0;
  var _panelEl       = null;
  var _STORAGE_KEY   = 'codex:notifications';

  function init() {
    _load();
    if (typeof PanelSystem !== 'undefined') {
      PanelSystem.register({
        id: 'notifications', title: 'Notifications',
        icon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.921L8 1.918z"/></svg>',
        render: _render,
        onShow: function(el) { _panelEl = el; _markAllRead(); _updateBadge(); },
        onHide: function()   { _panelEl = null; },
      });
    }

    // Listen for any module pushing a notification
    EventBus.on('notification:push', function(data) { show(data); });
    // Forward toasts with type 'error' as persistent notifications
    EventBus.on('notification:error', function(data) {
      show({ title: 'Error', message: data.message, type: 'error' });
    });
  }

  function show(cfg) {
    var n = {
      id:      'n_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
      title:   cfg.title   || 'Notification',
      message: cfg.message || '',
      type:    cfg.type    || 'info',   // info | success | warning | error
      time:    Date.now(),
      read:    false,
      actions: cfg.actions || [],       // [{ label, onClick }]
    };
    _notifications.unshift(n); // newest first
    if (_notifications.length > 100) _notifications.pop(); // cap at 100
    _unreadCount++;
    _save();
    _updateBadge();
    _updatePanel();
    // Also show a brief toast
    if (UI && UI.toast) UI.toast(n.message || n.title, n.type);
    return n.id;
  }

  function dismiss(id) {
    _notifications = _notifications.filter(function(n) { return n.id !== id; });
    _save(); _updatePanel();
  }

  function clearAll() {
    _notifications = []; _unreadCount = 0;
    _save(); _updatePanel(); _updateBadge();
  }

  function _markAllRead() {
    _notifications.forEach(function(n) { n.read = true; });
    _unreadCount = 0; _save();
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = _buildHTML();
    _bindEvents(container);
  }

  function _buildHTML() {
    var colors = { info:'#9cdcfe', success:'#3fb950', warning:'#cca700', error:'#f48771' };
    var icons  = { info:'ℹ', success:'✓', warning:'⚠', error:'⛔' };

    var items = _notifications.length === 0
      ? '<div style="color:#555;text-align:center;padding:24px;font-size:12px;">No notifications</div>'
      : _notifications.map(function(n) {
          var c = colors[n.type] || colors.info;
          var i = icons[n.type]  || icons.info;
          var ago = _timeAgo(n.time);
          var actions = n.actions.map(function(a) {
            return '<button class="nc-action-btn" data-nid="' + n.id + '" data-alabel="' + _esc(a.label) + '">' + _esc(a.label) + '</button>';
          }).join('');
          return '<div class="nc-item' + (n.read ? '' : ' nc-unread') + '" data-id="' + n.id + '">' +
                 '<div class="nc-icon" style="color:' + c + '">' + i + '</div>' +
                 '<div class="nc-body">' +
                 '<div class="nc-title">' + _esc(n.title) + '<span class="nc-time">' + ago + '</span></div>' +
                 '<div class="nc-msg">' + _esc(n.message) + '</div>' +
                 (actions ? '<div class="nc-actions">' + actions + '</div>' : '') +
                 '</div>' +
                 '<button class="nc-dismiss" data-id="' + n.id + '" title="Dismiss">×</button>' +
                 '</div>';
        }).join('');

    return '<div class="nc-panel">' +
           '<div class="nc-toolbar">' +
           '<span class="nc-count">' + _notifications.length + ' notification' + (_notifications.length !== 1 ? 's' : '') + '</span>' +
           '<button class="nc-clear-btn" id="nc-clear-all">Clear All</button>' +
           '</div>' +
           '<div class="nc-list" id="nc-list">' + items + '</div>' +
           '</div>';
  }

  function _bindEvents(container) {
    var clearBtn = container.querySelector('#nc-clear-all');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    container.querySelectorAll('.nc-dismiss').forEach(function(btn) {
      btn.addEventListener('click', function() { dismiss(btn.dataset.id); });
    });
    container.querySelectorAll('.nc-action-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var n = _notifications.filter(function(x) { return x.id === btn.dataset.nid; })[0];
        if (n) {
          var a = n.actions.filter(function(x) { return x.label === btn.dataset.alabel; })[0];
          if (a && a.onClick) a.onClick();
        }
      });
    });
  }

  function _updatePanel() {
    if (!_panelEl) return;
    _panelEl.innerHTML = _buildHTML();
    _bindEvents(_panelEl);
  }

  function _updateBadge() {
    // Show unread dot on panel tab
    var tab = document.querySelector('.panel-tab[data-id="notifications"]');
    if (!tab) return;
    var dot = tab.querySelector('.nc-badge');
    if (_unreadCount > 0) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'nc-badge';
        tab.appendChild(dot);
      }
      dot.textContent = _unreadCount > 9 ? '9+' : String(_unreadCount);
    } else if (dot) { dot.remove(); }
  }

  function _save() {
    try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(_notifications.slice(0, 50))); } catch(e) {}
  }

  function _load() {
    try {
      var saved = JSON.parse(localStorage.getItem(_STORAGE_KEY) || '[]');
      _notifications = Array.isArray(saved) ? saved : [];
      _unreadCount   = _notifications.filter(function(n) { return !n.read; }).length;
    } catch(e) { _notifications = []; }
  }

  function _timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s/60)   + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init: init, show: show, dismiss: dismiss, clearAll: clearAll };
})();
