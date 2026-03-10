(function() {
  'use strict';

  // ── CONFIG ──
  var API_URL = 'https://bot.ayusomamherbals.com/website-chat';
  var BRAND_PRIMARY = '#2E7D32';
  var BRAND_DARK = '#1B5E20';
  var BRAND_LIGHT = '#E8F5E9';
  var BRAND_ACCENT = '#FFF8E1';
  var BRAND_WARM = '#F57F17';

  // ── SENDER ID ──
  function getSenderId() {
    var id = localStorage.getItem('ayusomam_sender_id');
    if (!id) {
      id = 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
      localStorage.setItem('ayusomam_sender_id', id);
    }
    return id;
  }

  var senderId = getSenderId();
  var chatOpen = false;
  var firstOpen = true;
  var isAutoGreeting = false;
  var isWaiting = false;

  // ── INJECT STYLES ──
  var style = document.createElement('style');
  style.textContent = '\
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");\
\
#ayusomam-chat-widget * {\
  box-sizing: border-box;\
  margin: 0;\
  padding: 0;\
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
}\
\
#ayusomam-chat-btn {\
  position: fixed;\
  bottom: 24px;\
  right: 24px;\
  width: 64px;\
  height: 64px;\
  border-radius: 50%;\
  background: linear-gradient(135deg, ' + BRAND_PRIMARY + ' 0%, ' + BRAND_DARK + ' 100%);\
  border: none;\
  cursor: pointer;\
  box-shadow: 0 4px 20px rgba(46, 125, 50, 0.4), 0 2px 8px rgba(0,0,0,0.15);\
  z-index: 999999;\
  display: flex;\
  align-items: center;\
  justify-content: center;\
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;\
  animation: ayusomam-pulse 3s ease-in-out infinite;\
}\
\
#ayusomam-chat-btn:hover {\
  transform: scale(1.1);\
  box-shadow: 0 6px 28px rgba(46, 125, 50, 0.5), 0 4px 12px rgba(0,0,0,0.2);\
}\
\
#ayusomam-chat-btn.ayusomam-open {\
  animation: none;\
}\
\
@keyframes ayusomam-pulse {\
  0%, 100% { box-shadow: 0 4px 20px rgba(46, 125, 50, 0.4), 0 2px 8px rgba(0,0,0,0.15); }\
  50% { box-shadow: 0 4px 20px rgba(46, 125, 50, 0.6), 0 2px 8px rgba(0,0,0,0.15), 0 0 0 8px rgba(46, 125, 50, 0.1); }\
}\
\
#ayusomam-chat-btn svg {\
  width: 30px;\
  height: 30px;\
  fill: #fff;\
  transition: transform 0.3s ease, opacity 0.3s ease;\
}\
\
#ayusomam-chat-btn .ayusomam-close-icon {\
  position: absolute;\
  opacity: 0;\
  transform: rotate(-90deg) scale(0.5);\
}\
\
#ayusomam-chat-btn.ayusomam-open .ayusomam-chat-icon {\
  opacity: 0;\
  transform: rotate(90deg) scale(0.5);\
}\
\
#ayusomam-chat-btn.ayusomam-open .ayusomam-close-icon {\
  opacity: 1;\
  transform: rotate(0deg) scale(1);\
}\
\
#ayusomam-chat-window {\
  position: fixed;\
  bottom: 100px;\
  right: 24px;\
  width: 390px;\
  height: 560px;\
  max-height: calc(100vh - 130px);\
  border-radius: 20px;\
  background: #fff;\
  box-shadow: 0 12px 48px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1);\
  z-index: 999998;\
  display: flex;\
  flex-direction: column;\
  overflow: hidden;\
  opacity: 0;\
  transform: translateY(20px) scale(0.95);\
  pointer-events: none;\
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);\
}\
\
#ayusomam-chat-window.ayusomam-visible {\
  opacity: 1;\
  transform: translateY(0) scale(1);\
  pointer-events: auto;\
}\
\
#ayusomam-chat-header {\
  background: linear-gradient(135deg, ' + BRAND_PRIMARY + ' 0%, ' + BRAND_DARK + ' 100%);\
  padding: 18px 20px;\
  display: flex;\
  align-items: center;\
  gap: 14px;\
  flex-shrink: 0;\
}\
\
#ayusomam-chat-header-avatar {\
  width: 44px;\
  height: 44px;\
  border-radius: 50%;\
  background: rgba(255,255,255,0.2);\
  display: flex;\
  align-items: center;\
  justify-content: center;\
  font-size: 22px;\
  flex-shrink: 0;\
}\
\
#ayusomam-chat-header-info h3 {\
  color: #fff;\
  font-size: 16px;\
  font-weight: 700;\
  line-height: 1.3;\
}\
\
#ayusomam-chat-header-info p {\
  color: rgba(255,255,255,0.85);\
  font-size: 12px;\
  font-weight: 400;\
  margin-top: 2px;\
}\
\
#ayusomam-chat-header-status {\
  width: 8px;\
  height: 8px;\
  border-radius: 50%;\
  background: #69F0AE;\
  margin-left: auto;\
  flex-shrink: 0;\
  animation: ayusomam-status-pulse 2s ease-in-out infinite;\
}\
\
@keyframes ayusomam-status-pulse {\
  0%, 100% { opacity: 1; }\
  50% { opacity: 0.5; }\
}\
\
#ayusomam-chat-messages {\
  flex: 1;\
  overflow-y: auto;\
  padding: 16px 16px 8px;\
  background: linear-gradient(180deg, #FAFAFA 0%, #F5F5F5 100%);\
  scroll-behavior: smooth;\
}\
\
#ayusomam-chat-messages::-webkit-scrollbar {\
  width: 4px;\
}\
\
#ayusomam-chat-messages::-webkit-scrollbar-track {\
  background: transparent;\
}\
\
#ayusomam-chat-messages::-webkit-scrollbar-thumb {\
  background: #C8E6C9;\
  border-radius: 4px;\
}\
\
.ayusomam-msg {\
  display: flex;\
  margin-bottom: 10px;\
  animation: ayusomam-msg-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);\
}\
\
@keyframes ayusomam-msg-in {\
  from { opacity: 0; transform: translateY(10px); }\
  to { opacity: 1; transform: translateY(0); }\
}\
\
.ayusomam-msg-bot {\
  justify-content: flex-start;\
}\
\
.ayusomam-msg-user {\
  justify-content: flex-end;\
}\
\
.ayusomam-bubble {\
  max-width: 82%;\
  padding: 12px 16px;\
  font-size: 14px;\
  line-height: 1.55;\
  word-wrap: break-word;\
  white-space: pre-wrap;\
}\
\
.ayusomam-msg-bot .ayusomam-bubble {\
  background: #fff;\
  color: #333;\
  border-radius: 4px 18px 18px 18px;\
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);\
  border: 1px solid #E8F5E9;\
}\
\
.ayusomam-msg-user .ayusomam-bubble {\
  background: linear-gradient(135deg, ' + BRAND_PRIMARY + ' 0%, #388E3C 100%);\
  color: #fff;\
  border-radius: 18px 4px 18px 18px;\
  box-shadow: 0 2px 8px rgba(46, 125, 50, 0.25);\
}\
\
.ayusomam-typing {\
  display: flex;\
  align-items: center;\
  gap: 5px;\
  padding: 14px 20px;\
}\
\
.ayusomam-typing-dot {\
  width: 8px;\
  height: 8px;\
  border-radius: 50%;\
  background: #A5D6A7;\
  animation: ayusomam-dot-bounce 1.4s ease-in-out infinite;\
}\
\
.ayusomam-typing-dot:nth-child(2) { animation-delay: 0.16s; }\
.ayusomam-typing-dot:nth-child(3) { animation-delay: 0.32s; }\
\
@keyframes ayusomam-dot-bounce {\
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }\
  30% { transform: translateY(-6px); opacity: 1; }\
}\
\
#ayusomam-chat-input-area {\
  padding: 12px 16px;\
  background: #fff;\
  border-top: 1px solid #E8E8E8;\
  display: flex;\
  gap: 10px;\
  align-items: center;\
  flex-shrink: 0;\
}\
\
#ayusomam-chat-input {\
  flex: 1;\
  border: 2px solid #E0E0E0;\
  border-radius: 24px;\
  padding: 11px 18px;\
  font-size: 14px;\
  outline: none;\
  transition: border-color 0.2s ease, box-shadow 0.2s ease;\
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
  color: #333;\
}\
\
#ayusomam-chat-input::placeholder {\
  color: #999;\
}\
\
#ayusomam-chat-input:focus {\
  border-color: ' + BRAND_PRIMARY + ';\
  box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.1);\
}\
\
#ayusomam-chat-send {\
  width: 44px;\
  height: 44px;\
  border-radius: 50%;\
  background: linear-gradient(135deg, ' + BRAND_PRIMARY + ' 0%, ' + BRAND_DARK + ' 100%);\
  border: none;\
  cursor: pointer;\
  display: flex;\
  align-items: center;\
  justify-content: center;\
  flex-shrink: 0;\
  transition: transform 0.2s ease, opacity 0.2s ease;\
}\
\
#ayusomam-chat-send:hover {\
  transform: scale(1.08);\
}\
\
#ayusomam-chat-send:disabled {\
  opacity: 0.5;\
  cursor: not-allowed;\
  transform: none;\
}\
\
#ayusomam-chat-send svg {\
  width: 20px;\
  height: 20px;\
  fill: #fff;\
}\
\
#ayusomam-chat-footer {\
  text-align: center;\
  padding: 6px;\
  background: #FAFAFA;\
  border-top: 1px solid #F0F0F0;\
  flex-shrink: 0;\
}\
\
#ayusomam-chat-footer span {\
  font-size: 10px;\
  color: #999;\
  letter-spacing: 0.3px;\
}\
\
/* Mobile responsive */\
@media (max-width: 480px) {\
  #ayusomam-chat-window {\
    bottom: 0;\
    right: 0;\
    left: 0;\
    width: 100%;\
    height: 100%;\
    max-height: 100vh;\
    border-radius: 0;\
  }\
  #ayusomam-chat-btn {\
    bottom: 16px;\
    right: 16px;\
    width: 56px;\
    height: 56px;\
  }\
  #ayusomam-chat-btn svg {\
    width: 26px;\
    height: 26px;\
  }\
}\
';
  document.head.appendChild(style);

  // ── BUILD DOM ──
  var widget = document.createElement('div');
  widget.id = 'ayusomam-chat-widget';

  // Floating button
  widget.innerHTML = '\
<button id="ayusomam-chat-btn" aria-label="Chat with us">\
  <svg class="ayusomam-chat-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">\
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>\
    <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>\
  </svg>\
  <svg class="ayusomam-close-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">\
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>\
  </svg>\
</button>\
\
<div id="ayusomam-chat-window">\
  <div id="ayusomam-chat-header">\
    <div id="ayusomam-chat-header-avatar">\u{1f33f}</div>\
    <div id="ayusomam-chat-header-info">\
      <h3>Ayusomam Herbals</h3>\
      <p>Ayurvedic Sinus Specialist</p>\
    </div>\
    <div id="ayusomam-chat-header-status"></div>\
  </div>\
  <div id="ayusomam-chat-messages"></div>\
  <div id="ayusomam-chat-input-area">\
    <input id="ayusomam-chat-input" type="text" placeholder="Apna jawab yahan likhen..." autocomplete="off" />\
    <button id="ayusomam-chat-send" aria-label="Send message">\
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">\
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>\
      </svg>\
    </button>\
  </div>\
  <div id="ayusomam-chat-footer"><span>Ayusomam Herbals \u{1f33f} Ayurvedic Wellness</span></div>\
</div>';

  document.body.appendChild(widget);

  // ── REFERENCES ──
  var btn = document.getElementById('ayusomam-chat-btn');
  var chatWindow = document.getElementById('ayusomam-chat-window');
  var messagesEl = document.getElementById('ayusomam-chat-messages');
  var inputEl = document.getElementById('ayusomam-chat-input');
  var sendBtn = document.getElementById('ayusomam-chat-send');

  // ── TOGGLE CHAT ──
  btn.addEventListener('click', function() {
    chatOpen = !chatOpen;
    if (chatOpen) {
      btn.classList.add('ayusomam-open');
      chatWindow.classList.add('ayusomam-visible');
      inputEl.focus();
      if (firstOpen) {
        firstOpen = false;
        // Auto-send greeting to trigger assessment (hidden from user)
        isAutoGreeting = true;
        sendToBot('Hi');
      }
    } else {
      btn.classList.remove('ayusomam-open');
      chatWindow.classList.remove('ayusomam-visible');
    }
  });

  // ── ADD MESSAGE ──
  function addMessage(text, sender) {
    var div = document.createElement('div');
    div.className = 'ayusomam-msg ayusomam-msg-' + sender;
    var bubble = document.createElement('div');
    bubble.className = 'ayusomam-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(function() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 50);
  }

  // ── TYPING INDICATOR ──
  function showTyping() {
    var div = document.createElement('div');
    div.className = 'ayusomam-msg ayusomam-msg-bot';
    div.id = 'ayusomam-typing-indicator';
    div.innerHTML = '<div class="ayusomam-bubble ayusomam-typing">\
      <div class="ayusomam-typing-dot"></div>\
      <div class="ayusomam-typing-dot"></div>\
      <div class="ayusomam-typing-dot"></div>\
    </div>';
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function hideTyping() {
    var el = document.getElementById('ayusomam-typing-indicator');
    if (el) el.remove();
  }

  // ── SEND TO BOT ──
  function sendToBot(text) {
    if (isWaiting) return;
    if (!text || !text.trim()) return;

    // Show user message (but not the auto-greeting)
    if (!isAutoGreeting) {
      addMessage(text, 'user');
    }
    isAutoGreeting = false;

    isWaiting = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    showTyping();

    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 30000;

    xhr.onload = function() {
      hideTyping();
      isWaiting = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();

      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          var replies = data.replies || [];
          if (replies.length === 0) {
            addMessage('Kuch technical issue aa raha hai. Thodi der mein try karein.', 'bot');
            return;
          }
          // Show replies with small delay between them for natural feel
          var i = 0;
          function showNext() {
            if (i < replies.length) {
              addMessage(replies[i], 'bot');
              i++;
              if (i < replies.length) {
                setTimeout(showNext, 400);
              }
            }
          }
          showNext();
        } catch (e) {
          addMessage('Kuch technical issue aa raha hai. Thodi der mein try karein.', 'bot');
        }
      } else {
        addMessage('Server se connect nahi ho paa raha. Thodi der mein try karein.', 'bot');
      }
    };

    xhr.onerror = function() {
      hideTyping();
      isWaiting = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      addMessage('Internet connection check karein aur dobara try karein.', 'bot');
    };

    xhr.ontimeout = function() {
      hideTyping();
      isWaiting = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      addMessage('Response mein time lag raha hai. Dobara try karein.', 'bot');
    };

    xhr.send(JSON.stringify({
      senderId: senderId,
      message: text.trim()
    }));
  }

  // ── INPUT HANDLERS ──
  sendBtn.addEventListener('click', function() {
    var text = inputEl.value.trim();
    if (text) {
      inputEl.value = '';
      sendToBot(text);
    }
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var text = inputEl.value.trim();
      if (text) {
        inputEl.value = '';
        sendToBot(text);
      }
    }
  });

})();
