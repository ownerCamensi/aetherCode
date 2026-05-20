var EventBus = (function() {
  var _l = {};
  return {
    on:   function(e, cb) { if (!_l[e]) _l[e] = []; _l[e].push(cb); return function() { EventBus.off(e, cb); }; },
    off:  function(e, cb) { if (_l[e]) _l[e] = _l[e].filter(function(f) { return f !== cb; }); },
    emit: function(e, d)  {
      (_l[e] || []).forEach(function(f) {
        try { f(d); } catch(err) {
          // Show event name + full stack so you know exactly which handler crashed
          console.error('[EventBus] Error in handler for "' + e + '":', err);
          if (err && err.stack) console.error(err.stack);
        }
      });
    },
    once: function(e, cb) { var w = function(d) { cb(d); EventBus.off(e, w); }; EventBus.on(e, w); },
  };
})();

var Events = {
  FILE_CREATED:      'file:created',
  FILE_DELETED:      'file:deleted',
  FILE_SWITCHED:     'file:switched',
  FILE_RENAMED:      'file:renamed',
  PLUGIN_INSTALLED:  'plugin:installed',
  PLUGIN_REMOVED:    'plugin:removed',
  UI_REFRESH:        'ui:refresh',
  APP_READY:         'app:ready',
  RUNNER_OPEN:       'runner:open',
  RUNNER_CLOSE:      'runner:close',
  CONSOLE_TOGGLE:    'console:toggle',
  PLUGIN_EDIT_OPEN:  'plugin-edit:open',
  PLUGIN_EDIT_CLOSE: 'plugin-edit:close',
};
