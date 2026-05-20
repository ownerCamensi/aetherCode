/**
 * error-intelligence.js — Error badge at top of editor
 * Red rounded badge with count → click to jump to error line
 */
var ErrorIntelligence = (function() {

  var _errors = [];

  function init() {
    // Listen to ESLint annotations
    EventBus.on('editor:change', function() {
      setTimeout(_syncFromAce, 500);
    });
    EventBus.on(Events.FILE_SWITCHED, function() {
      setTimeout(_syncFromAce, 300);
    });
  }

  function _syncFromAce() {
    if (!Editor || !Editor._ace) return;
    var annotations = Editor._ace.getSession().getAnnotations() || [];
    _errors = annotations.filter(function(a) { return a.type === 'error' || a.type === 'warning'; });
    _renderBadge();
  }

  function _renderBadge() {
    var existing = document.getElementById('err-badge-container');
    if (existing) existing.remove();

    if (_errors.length === 0) return;

    var errors   = _errors.filter(function(e) { return e.type === 'error'; });
    var warnings = _errors.filter(function(e) { return e.type === 'warning'; });

    var container = document.createElement('div');
    container.id = 'err-badge-container';
    container.className = 'err-badge-container';

    if (errors.length > 0) {
      var errBadge = document.createElement('button');
      errBadge.className = 'err-badge err-badge-error';
      errBadge.innerHTML = '<span class="err-badge-num">' + errors.length + '</span><span class="err-badge-label">error' + (errors.length > 1 ? 's' : '') + '</span>';
      errBadge.title = errors.map(function(e) { return 'Line ' + (e.row + 1) + ': ' + e.text; }).join('\n');
      errBadge.addEventListener('click', function() { _jumpToError(errors, 0); });
      container.appendChild(errBadge);
    }

    if (warnings.length > 0) {
      var warnBadge = document.createElement('button');
      warnBadge.className = 'err-badge err-badge-warn';
      warnBadge.innerHTML = '<span class="err-badge-num">' + warnings.length + '</span><span class="err-badge-label">warning' + (warnings.length > 1 ? 's' : '') + '</span>';
      warnBadge.title = warnings.map(function(e) { return 'Line ' + (e.row + 1) + ': ' + e.text; }).join('\n');
      warnBadge.addEventListener('click', function() { _jumpToNextError(warnings); });
      container.appendChild(warnBadge);
    }

    // Place inside editor area topbar
    var topbar = document.getElementById('editor-topbar') || document.getElementById('tab-bar') || document.querySelector('.tab-bar');
    if (topbar) topbar.appendChild(container);
  }

  var _errorIndex = 0;
  function _jumpToError(list, idx) {
    if (!Editor || !Editor._ace || list.length === 0) return;
    _errorIndex = idx % list.length;
    var err = list[_errorIndex];
    Editor._ace.gotoLine(err.row + 1, err.column || 0, true);
    Editor._ace.focus();

    // Show tooltip
    if (UI) UI.toast('Line ' + (err.row + 1) + ': ' + err.text, err.type === 'error' ? 'error' : 'warn');

    // Next click goes to next error
    var badge = document.querySelector('.err-badge-error, .err-badge-warn');
    if (badge) {
      badge.addEventListener('click', function handler() {
        badge.removeEventListener('click', handler);
        _jumpToError(list, _errorIndex + 1);
      }, { once: true });
    }
  }

  function _jumpToNextError(list) { _jumpToError(list, _errorIndex + 1); }

  // Called by ESLintLinter with current messages
  function setErrors(messages) {
    _errors = messages.map(function(m) {
      return { row: (m.line||1)-1, column: (m.column||1)-1, text: m.message, type: m.severity === 2 ? 'error' : 'warning' };
    });
    _renderBadge();
  }

  return { init, setErrors };
})();
