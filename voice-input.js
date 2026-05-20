/**
 * voice-input.js — Web Speech API for AI voice prompts
 */
var VoiceInput = (function() {
  var _recognition = null;
  var _listening   = false;
  var _btn         = null;

  function init() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _recognition = new SR();
    _recognition.continuous    = false;
    _recognition.interimResults = true;
    _recognition.lang           = 'en-US';

    _recognition.onresult = function(e) {
      var transcript = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      var input = document.getElementById('ai-input');
      if (input) input.value = transcript;
      if (e.results[e.results.length-1].isFinal) _stopListening();
    };
    _recognition.onend   = function() { _stopListening(); };
    _recognition.onerror = function(e) { _stopListening(); if (UI) UI.toast('Voice: ' + e.error, 'error'); };

    // Add voice button next to AI send button
    EventBus.on(Events.APP_READY, function() {
      setTimeout(_addVoiceBtn, 800);
    });
  }

  function _addVoiceBtn() {
    var sendBtn = document.getElementById('ai-send');
    if (!sendBtn || document.getElementById('ai-voice-btn')) return;
    _btn = document.createElement('button');
    _btn.id = 'ai-voice-btn';
    _btn.title = 'Voice input (click to speak)';
    _btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    _btn.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text-dim);width:34px;height:34px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s';
    _btn.addEventListener('click', toggle);
    sendBtn.parentNode.insertBefore(_btn, sendBtn);
  }

  function toggle() {
    if (_listening) _stopListening(); else _startListening();
  }

  function _startListening() {
    if (!_recognition) return;
    _listening = true;
    if (_btn) { _btn.style.background='rgba(244,135,113,.2)'; _btn.style.color='var(--danger)'; _btn.style.borderColor='var(--danger)'; }
    if (UI) UI.toast('🎙️ Listening… speak your prompt', 'info');
    try { _recognition.start(); } catch(e) {}
  }

  function _stopListening() {
    _listening = false;
    if (_btn) { _btn.style.background=''; _btn.style.color=''; _btn.style.borderColor=''; }
    try { _recognition.stop(); } catch(e) {}
  }

  return { init, toggle };
})();
