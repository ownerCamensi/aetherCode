/**
 * code-analytics.js — LOC, file types, time tracking, complexity
 */
var CodeAnalytics = (function() {

  var SESSION_KEY  = 'codex:analytics-sessions';
  var _sessionStart = Date.now();
  var _sessionFile  = null;
  var _sessions     = [];
  var _panelEl      = null;

  function init() {
    _loadSessions();

    EventBus.on(Events.FILE_SWITCHED, function(data) {
      _recordTime();
      _sessionFile  = data && data.file ? data.file.name : null;
      _sessionStart = Date.now();
    });

    PanelSystem.register({
      id: 'analytics', title: 'Analytics',
      icon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 0h1v16H0zm14.5 14a.5.5 0 0 1 0 1H2a.5.5 0 0 1 0-1h12.5zM2 13.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0V14H3v.5a.5.5 0 0 1-1 0v-1zm7-3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V11H10v3.5a.5.5 0 0 1-1 0v-4zm-7-2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V9H3v5.5a.5.5 0 0 1-1 0v-6z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'analytics-open', label:'Analytics: View Code Analytics', category:'View', action: function(){ PanelSystem.show('analytics'); } });
    }
  }

  function _render(container) {
    _panelEl = container;
    _recordTime();
    var stats = _computeStats();

    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%;overflow-y:auto">',
        '<div style="padding:10px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0;display:flex;justify-content:space-between;align-items:center">',
          '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">Code Analytics</span>',
          '<button id="analytics-refresh" class="icon-btn" title="Refresh">↻</button>',
        '</div>',

        // Overview cards
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px">',
          _card('📄', 'Total Files',     stats.totalFiles),
          _card('📝', 'Total Lines',     stats.totalLines.toLocaleString()),
          _card('💻', 'Code Lines',      stats.codeLines.toLocaleString()),
          _card('💬', 'Comment Lines',   stats.commentLines.toLocaleString()),
          _card('⬜', 'Blank Lines',     stats.blankLines.toLocaleString()),
          _card('⏱️', 'Session Time',    _fmtTime(stats.sessionTime)),
          _card('📅', 'Total Time Today', _fmtTime(stats.totalTime)),
          _card('🔤', 'Avg File Size',   stats.avgLines + ' lines'),
        '</div>',

        // File types breakdown
        '<div style="padding:0 12px 12px">',
          '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">File Types</div>',
          Object.keys(stats.byType).sort(function(a,b){return stats.byType[b]-stats.byType[a];}).map(function(ext) {
            var count = stats.byType[ext];
            var pct   = Math.round(count / stats.totalFiles * 100);
            return '<div style="margin-bottom:6px">' +
              '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
                '<span style="color:var(--text)">.' + ext + '</span>' +
                '<span style="color:var(--text-dim)">' + count + ' files (' + pct + '%)</span>' +
              '</div>' +
              '<div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px">' +
                '<div style="height:100%;width:' + pct + '%;background:var(--accent);border-radius:2px;transition:width .4s"></div>' +
              '</div>' +
            '</div>';
          }).join('') || '<div style="color:var(--text-dim);font-size:11px">No files yet</div>',
        '</div>',

        // Top files by LOC
        '<div style="padding:0 12px 12px">',
          '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">Largest Files</div>',
          stats.topFiles.map(function(f) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #1a1a1a">' +
              '<span style="font-size:11px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + f.name + '</span>' +
              '<span style="font-size:11px;color:var(--text-dim);flex-shrink:0">' + f.lines + ' lines</span>' +
            '</div>';
          }).join(''),
        '</div>',

        // Time per file
        '<div style="padding:0 12px 16px">',
          '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">Time Spent</div>',
          Object.keys(stats.timeByFile).slice(0,8).map(function(fn) {
            return '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px solid #1a1a1a">' +
              '<span style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' + fn + '</span>' +
              '<span style="color:var(--text-dim);flex-shrink:0;margin-left:8px">' + _fmtTime(stats.timeByFile[fn]) + '</span>' +
            '</div>';
          }).join('') || '<div style="color:var(--text-dim);font-size:11px">No data yet — start coding!</div>',
        '</div>',
      '</div>',
    ].join('');

    container.querySelector('#analytics-refresh').addEventListener('click', function() { _render(container); });
  }

  function _card(icon, label, value) {
    return '<div style="background:rgba(255,255,255,.04);border:1px solid #1a1a1a;border-radius:6px;padding:10px 12px">' +
      '<div style="font-size:16px;margin-bottom:4px">' + icon + '</div>' +
      '<div style="font-size:18px;font-weight:700;color:var(--text-bright)">' + value + '</div>' +
      '<div style="font-size:10px;color:var(--text-dim);margin-top:2px">' + label + '</div>' +
    '</div>';
  }

  function _computeStats() {
    var totalFiles=0, totalLines=0, codeLines=0, commentLines=0, blankLines=0;
    var byType={}, topFiles=[], timeByFile={};

    _sessions.forEach(function(s) {
      timeByFile[s.file] = (timeByFile[s.file]||0) + s.duration;
    });

    AppState.files.forEach(function(file) {
      if (file.name==='.gitkeep'||file.isImage) return;
      totalFiles++;
      var ext   = file.name.split('.').pop().toLowerCase();
      byType[ext] = (byType[ext]||0)+1;
      var lines = (file.content||'').split('\n');
      var lcount = lines.length;
      var ccount = 0, bcount = 0;
      lines.forEach(function(l) {
        var t = l.trim();
        if (!t) bcount++;
        else if (t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')) ccount++;
      });
      totalLines   += lcount;
      blankLines   += bcount;
      commentLines += ccount;
      codeLines    += lcount - bcount - ccount;
      topFiles.push({ name: file.name, lines: lcount });
    });

    topFiles.sort(function(a,b){return b.lines-a.lines;});

    var sessionTime = Math.floor((Date.now() - _sessionStart) / 1000);
    var totalTime   = _sessions.reduce(function(s,x){return s+x.duration;},0) + sessionTime;

    return {
      totalFiles, totalLines, codeLines, commentLines, blankLines, byType,
      topFiles: topFiles.slice(0,5),
      avgLines: totalFiles ? Math.round(totalLines/totalFiles) : 0,
      sessionTime, totalTime, timeByFile,
    };
  }

  function _recordTime() {
    if (!_sessionFile) return;
    var dur = Math.floor((Date.now() - _sessionStart) / 1000);
    if (dur < 2) return;
    _sessions.push({ file: _sessionFile, duration: dur, ts: Date.now() });
    // Keep last 200 sessions
    if (_sessions.length > 200) _sessions = _sessions.slice(-200);
    _saveSessions();
  }

  function _fmtTime(s) {
    if (s < 60)   return s + 's';
    if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's';
    return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
  }

  function _loadSessions() { try { _sessions = JSON.parse(localStorage.getItem(SESSION_KEY)||'[]'); } catch(e) { _sessions=[]; } }
  function _saveSessions() { try { localStorage.setItem(SESSION_KEY, JSON.stringify(_sessions)); } catch(e) {} }

  return { init };
})();
