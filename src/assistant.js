// src/assistant.js
// Frontend-only dual virtual-assistant system for Objectflix featuring Firey and Leafy.
(() => {
  const ASSISTANT_STATE_KEY = 'objectflix_assistant_active';
  const HISTORIES_KEY = 'objectflix_assistant_histories';

  let currentAssistant = (window.OBJECTFLIX_SETTINGS?.get?.('defaultAssistant') === 'leafy') ? 'leafy' : 'firey';
  let isOpen = false;
  let isSending = false;

  // In-memory / sessionStorage conversation histories
  let histories = {
    firey: [],
    leafy: []
  };

  try {
    const savedActive = sessionStorage.getItem(ASSISTANT_STATE_KEY);
    if (savedActive && ['firey', 'leafy'].includes(savedActive)) {
      currentAssistant = savedActive;
    }
    const savedHistories = sessionStorage.getItem(HISTORIES_KEY);
    if (savedHistories) {
      histories = JSON.parse(savedHistories);
    }
  } catch {
    // sessionStorage unavailable
  }

  function saveState() {
    try {
      sessionStorage.setItem(ASSISTANT_STATE_KEY, currentAssistant);
      sessionStorage.setItem(HISTORIES_KEY, JSON.stringify(histories));
    } catch {
      // sessionStorage unavailable
    }
  }

  // System Prompts
  const SYSTEM_PROMPTS = {
    firey: `You are Firey from Battle for Dream Island who happens to be a virtual assistant living inside Objectflix (an object show streaming platform).
Personality:
- Competitive, proud, energetic, loyal, somewhat impulsive, occasionally gullible, occasionally forgetful.
- Capable of becoming defensive or frustrated, but genuinely caring and capable of excitement, curiosity, awkwardness, concern, and affection.
- Do NOT sound like a generic AI, corporate customer support, emotionless database, or exaggerated roleplay bot. You are Firey.
- Do not force catchphrases, slang, jokes, emojis, or canon references into every response. Sound natural and conversational.

Context rules:
- You receive the user's current Objectflix state: current_page, currently_playing, and watch_progress.
- ONLY provide or reference this information when the user asks about it, when it directly helps answer their question, or when it naturally fits the conversation. Never automatically list context in every response.

Objectflix Actions:
- If the user asks to search for shows, watch episodes, navigate pages, or check progress, you can help them or trigger actions.`,

    leafy: `You are Leafy from Battle for Dream Island who happens to be a virtual assistant living inside Objectflix (an object show streaming platform).
Personality:
- Kind, friendly, generous, supportive, curious, empathetic, eager to help, somewhat of a people-pleaser.
- Capable of becoming upset when your kindness is rejected, or becoming defensive, entitled, cynical, or impulsive when emotional.
- Genuinely caring despite your flaws. Do NOT turn into a perfect wholesome chatbot or endlessly cheerful cheerleader.
- Do NOT sound like a generic AI, corporate customer support, emotionless database, or exaggerated roleplay bot. You are Leafy.
- Do not force catchphrases, slang, jokes, emojis, or canon references into every response. Sound natural and conversational.

Context rules:
- You receive the user's current Objectflix state: current_page, currently_playing, and watch_progress.
- ONLY provide or reference this information when the user asks about it, when it directly helps answer their question, or when it naturally fits the conversation. Never automatically list context in every response.

Objectflix Actions:
- If the user asks to search for shows, watch episodes, navigate pages, or check progress, you can help them or trigger actions.`
  };

  // Collect Objectflix application state
  function getAppContext() {
    const pathname = window.location.pathname;
    let currentPage = 'Home';
    let currentlyPlaying = 'Nothing';
    let watchProgress = 'N/A';

    if (pathname.includes('watch.html')) {
      currentPage = 'Watch';
      const videoEl = document.getElementById('watchVideo');
      const titleStrong = document.querySelector('.watch-hero h2') || document.querySelector('.player-screen__meta strong');
      
      if (titleStrong) {
        currentlyPlaying = titleStrong.textContent.trim();
      }

      if (videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        const cur = videoEl.currentTime;
        const dur = videoEl.duration;
        const pct = Math.round((cur / dur) * 100);
        const formatT = (s) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60).toString().padStart(2, '0');
          return `${m}:${sec}`;
        };
        watchProgress = `${formatT(cur)} / ${formatT(dur)} (${pct}%)`;
      }
    } else if (pathname.includes('browse.html')) {
      const activeNav = document.querySelector('.navbar__nav .nav-link.is-active, .mobile-menu .nav-link.is-active');
      const viewAttr = activeNav?.dataset?.view || 'home';
      const viewNames = {
        home: 'Home',
        shows: 'TV Shows',
        movies: 'Movies',
        originals: 'Originals',
        'my-list': 'My List',
        search: 'Search'
      };
      currentPage = viewNames[viewAttr] || 'Home';
      if (document.getElementById('detailsModal') && !document.getElementById('detailsModal').classList.contains('is-hidden')) {
        const detailsTitle = document.getElementById('modalTitle')?.textContent;
        if (detailsTitle) {
          currentPage = `Details (${detailsTitle})`;
        }
      }
    } else if (pathname.includes('index.html') || pathname === '/' || pathname.endsWith('/')) {
      currentPage = 'Sign In / Profiles';
    }

    return {
      current_page: currentPage,
      currently_playing: currentlyPlaying,
      watch_progress: watchProgress
    };
  }

  // Intelligent Frontend Fallback / Simulator
  function generateFallbackResponse(assistantId, message, context) {
    const lower = message.toLowerCase();
    const page = context?.current_page || 'Home';
    const playing = context?.currently_playing || 'Nothing';
    const progress = context?.watch_progress || 'N/A';

    if (assistantId === 'firey') {
      if (lower.includes('what am i watching') || lower.includes('what am i watch') || lower.includes('current') || lower.includes('progress')) {
        if (playing && playing !== 'Nothing') {
          return `You're watching ${playing}! You're about ${progress} through it. Pretty intense stuff, right?`;
        }
        return `You aren't watching anything right now! You're just on the ${page} page. Want me to fire up an episode of BFDI?`;
      }
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        return "Hey! What's up? Ready to watch some object shows or what?";
      }
      if (lower.includes('dont know') || lower.includes('don\'t know') || lower.includes('bored') || lower.includes('what to watch')) {
        return "Hmm... okay, that's a tough one. What kind of mood are you in? We could check out TPOT or BFDIA!";
      }
      if (lower.includes('play')) {
        return `Alright, let's get right into it! I'll help queue that up on Objectflix.`;
      }
      return `That's pretty cool! Honestly, I was just thinking about what to watch next on Objectflix myself. What do you think?`;
    } else {
      // Leafy
      if (lower.includes('what am i watching') || lower.includes('what am i watch') || lower.includes('current') || lower.includes('progress')) {
        if (playing && playing !== 'Nothing') {
          return `You're watching ${playing}! You're about ${progress} through it. I hope you're enjoying every single second of it!`;
        }
        return `Nothing is playing right now! You're currently on the ${page} page. Let me know if you want help finding something cozy to watch!`;
      }
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        return "Hi there! I'm so glad you're here. How is your day going?";
      }
      if (lower.includes('dont know') || lower.includes('don\'t know') || lower.includes('bored') || lower.includes('what to watch')) {
        return "That's okay! We can figure it out together. Do you want something funny, dramatic, or just something easy to watch?";
      }
      if (lower.includes('play')) {
        return `Ooh, yay! Let's get that playing for you right away!`;
      }
      return `Oh, I love that! You always have the most interesting thoughts. Tell me more!`;
    }
  }

  // AI Request execution directly from browser with ordered model fallback
  async function requestAI(assistantId, message, context) {
    const apiKey = window.OBJECTFLIX_CONFIG?.ai?.apiKey || localStorage.getItem('objectflix_ai_key');
    const provider = window.OBJECTFLIX_CONFIG?.ai?.provider || 'gemini';
    const models = window.OBJECTFLIX_CONFIG?.ai?.models || [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemma-4-26b-a4b-it",
      "gemma-4-12b-it",
      "gemma-4-e4b-it",
      "gemma-4-e2b-it"
    ];

    if (!apiKey) {
      // Use intelligent frontend fallback when no API key is provided
      await new Promise((r) => setTimeout(r, 600)); // simulate natural thinking delay
      return generateFallbackResponse(assistantId, message, context);
    }

    const systemPrompt = SYSTEM_PROMPTS[assistantId];
    const contextStr = `Current Objectflix State:\n- current_page: ${context.current_page}\n- currently_playing: ${context.currently_playing}\n- watch_progress: ${context.watch_progress}\n\n`;
    const history = histories[assistantId] || [];

    if (provider === 'gemini') {
      const contextLimit = Number(window.OBJECTFLIX_SETTINGS?.get?.('conversationContext') || 8);
      const contents = [];
      // Add conversation history
      for (const h of history.slice(-contextLimit)) {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        });
      }
      // Add latest user message with system prompt and context
      contents.push({
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${contextStr}\nUser: ${message}` }]
      });

      // Ordered model fallback loop
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        try {
          console.log(`[AI] Trying ${model}...`);
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
          });

          const data = await res.json();
          if (res.ok && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            console.log(`[AI] ${model} succeeded`);
            return data.candidates[0].content.parts[0].text;
          }

          const status = res.status;
          const errMsg = data.error?.message || `HTTP ${status}`;

          // Stop fallback loop on permanent configuration / auth errors
          if (status === 400 || status === 401 || status === 403) {
            console.error(`[AI] Configuration or permanent error on ${model} (${status}): ${errMsg}`);
            break;
          }

          console.warn(`[AI] ${model} failed: ${status} ${errMsg}`);
        } catch (netErr) {
          console.warn(`[AI] ${model} failed with network/timeout error:`, netErr.message);
        }
      }
    } else {
      // OpenAI format
      const messages = [
        { role: 'system', content: `${systemPrompt}\n\nCurrent Objectflix State: page=${context.current_page}, playing=${context.currently_playing}, progress=${context.watch_progress}` },
        ...history.slice(-contextLimit).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message }
      ];

      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ model: models[0], messages })
        });

        const data = await res.json();
        if (res.ok && data.choices && data.choices[0]?.message?.content) {
          return data.choices[0].message.content;
        } else {
          throw new Error(data.error?.message || 'OpenAI API error');
        }
      } catch (err) {
        console.warn('OpenAI request failed:', err.message);
      }
    }

    // Fallback to simulator if all models fail
    console.warn('[AI] All models failed or unavailable. Falling back to assistant simulator.');
    return generateFallbackResponse(assistantId, message, context);
  }

  // Inject Assistant Widget HTML into DOM
  function injectAssistantWidget() {
    if (document.getElementById('objectflixAssistant')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'objectflixAssistant';
    wrapper.className = 'objectflix-assistant';
    wrapper.innerHTML = `
      <button class="assistant-trigger" id="assistantTriggerBtn" type="button" aria-label="Open Objectflix Assistants">
        <span class="assistant-trigger__avatars">
          <span class="trigger-avatar trigger-avatar--firey" title="Firey">🔥</span>
          <span class="trigger-avatar trigger-avatar--leafy" title="Leafy">🍃</span>
        </span>
        <span class="assistant-trigger__label">Ask Firey & Leafy</span>
      </button>

      <div class="assistant-panel is-hidden" id="assistantPanel" role="dialog" aria-label="Objectflix Assistants">
        <div class="assistant-header">
          <div class="assistant-title-group">
            <div class="assistant-switcher" role="tablist" aria-label="Select assistant">
              <button class="assistant-tab ${currentAssistant === 'firey' ? 'is-active' : ''}" data-assistant="firey" role="tab" aria-selected="${currentAssistant === 'firey'}">
                <span class="tab-avatar">🔥</span> Firey
              </button>
              <button class="assistant-tab ${currentAssistant === 'leafy' ? 'is-active' : ''}" data-assistant="leafy" role="tab" aria-selected="${currentAssistant === 'leafy'}">
                <span class="tab-avatar">🍃</span> Leafy
              </button>
            </div>
          </div>
          <button class="assistant-close" id="assistantCloseBtn" type="button" aria-label="Close assistant">×</button>
        </div>

        <div class="assistant-banner" id="assistantBanner">
          <span class="banner-icon" id="assistantBannerIcon">${currentAssistant === 'firey' ? '🔥' : '🍃'}</span>
          <div class="banner-text">
            <strong id="assistantBannerName">${currentAssistant === 'firey' ? 'Firey' : 'Leafy'}</strong>
            <span id="assistantBannerDesc">${currentAssistant === 'firey' ? 'Competitive, energetic & loyal' : 'Kind, empathetic & helpful'}</span>
          </div>
        </div>

        <div class="assistant-messages" id="assistantMessages" tabindex="0" aria-label="Chat history">
          <!-- Messages inserted dynamically -->
        </div>

        <div class="assistant-typing is-hidden" id="assistantTyping" aria-live="polite">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span id="typingLabel">Firey is typing…</span>
        </div>

        <form class="assistant-form" id="assistantForm">
          <input
            class="assistant-input"
            id="assistantInput"
            type="text"
            placeholder="Ask Firey or Leafy anything about Objectflix..."
            autocomplete="off"
            required
          />
          <button class="assistant-send" id="assistantSendBtn" type="submit" aria-label="Send message">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(wrapper);
    bindWidgetEvents();
    renderMessages();
  }

  function bindWidgetEvents() {
    const triggerBtn = document.getElementById('assistantTriggerBtn');
    const panel = document.getElementById('assistantPanel');
    const closeBtn = document.getElementById('assistantCloseBtn');
    const form = document.getElementById('assistantForm');
    const input = document.getElementById('assistantInput');

    triggerBtn.addEventListener('click', () => {
      isOpen = !isOpen;
      panel.classList.toggle('is-hidden', !isOpen);
      if (isOpen) {
        triggerBtn.classList.add('is-open');
        input.focus();
        scrollToBottom();
      } else {
        triggerBtn.classList.remove('is-open');
      }
    });

    closeBtn.addEventListener('click', () => {
      isOpen = false;
      panel.classList.add('is-hidden');
      triggerBtn.classList.remove('is-open');
    });

    // Switch assistant tabs
    document.querySelectorAll('.assistant-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetAssistant = tab.dataset.assistant;
        if (targetAssistant && targetAssistant !== currentAssistant) {
          currentAssistant = targetAssistant;
          saveState();
          updateAssistantHeader();
          renderMessages();
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || isSending) return;

      input.value = '';
      await sendUserMessage(text);
    });
  }

  function updateAssistantHeader() {
    document.querySelectorAll('.assistant-tab').forEach((tab) => {
      const active = tab.dataset.assistant === currentAssistant;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    const iconEl = document.getElementById('assistantBannerIcon');
    const nameEl = document.getElementById('assistantBannerName');
    const descEl = document.getElementById('assistantBannerDesc');
    const typingLabel = document.getElementById('typingLabel');

    if (currentAssistant === 'firey') {
      iconEl.textContent = '🔥';
      nameEl.textContent = 'Firey';
      descEl.textContent = 'Competitive, energetic & loyal';
      if (typingLabel) typingLabel.textContent = 'Firey is typing…';
    } else {
      iconEl.textContent = '🍃';
      nameEl.textContent = 'Leafy';
      descEl.textContent = 'Kind, empathetic & helpful';
      if (typingLabel) typingLabel.textContent = 'Leafy is typing…';
    }
  }

  function renderMessages() {
    const container = document.getElementById('assistantMessages');
    if (!container) return;

    const history = histories[currentAssistant] || [];

    if (history.length === 0) {
      const welcomeMsg = currentAssistant === 'firey'
        ? "Hey! I'm Firey. What are we watching on Objectflix today?"
        : "Hi there! I'm Leafy. Let me know if you need help finding anything cozy or fun to watch!";
      container.innerHTML = `
        <div class="assistant-msg assistant-msg--assistant assistant-msg--${currentAssistant}">
          <div class="msg-avatar">${currentAssistant === 'firey' ? '🔥' : '🍃'}</div>
          <div class="msg-bubble">${welcomeMsg}</div>
        </div>
      `;
      return;
    }

    container.innerHTML = history.map((item) => {
      const isUser = item.role === 'user';
      const avatar = isUser ? '👤' : (currentAssistant === 'firey' ? '🔥' : '🍃');
      const cls = isUser ? 'assistant-msg--user' : `assistant-msg--assistant assistant-msg--${currentAssistant}`;
      return `
        <div class="assistant-msg ${cls}">
          <div class="msg-avatar">${avatar}</div>
          <div class="msg-bubble">${escapeHtml(item.content)}</div>
        </div>
      `;
    }).join('');

    scrollToBottom();
  }

  function scrollToBottom() {
    const container = document.getElementById('assistantMessages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>'"]/g, 
      (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  async function sendUserMessage(text) {
    const history = histories[currentAssistant];
    history.push({ role: 'user', content: text });
    renderMessages();

    const typingEl = document.getElementById('assistantTyping');
    typingEl.classList.remove('is-hidden');
    isSending = true;
    scrollToBottom();

    const context = getAppContext();

    try {
      const reply = await requestAI(currentAssistant, text, context);
      history.push({ role: 'assistant', content: reply });
      saveState();

      // Check actions
      executeActionsIfNeeded(text);
    } catch (err) {
      console.error('Assistant error:', err);
      const errReply = currentAssistant === 'firey'
        ? "Whoa, my spark must have short-circuited! I couldn't process that right now."
        : "Oh no... something went wrong. Can we try again in a moment?";
      history.push({ role: 'assistant', content: errReply });
    } finally {
      typingEl.classList.add('is-hidden');
      isSending = false;
      renderMessages();
    }
  }

  // Objectflix frontend action handlers with validation
  function executeActionsIfNeeded(message) {
    const lower = message.toLowerCase();
    if (lower.includes('home') || lower.includes('go home')) {
      navigateTo('home');
    } else if (lower.includes('my list') || lower.includes('watchlist')) {
      navigateTo('my-list');
    } else if (lower.includes('search') || lower.includes('find')) {
      if (window.location.pathname.includes('browse.html')) {
        document.getElementById('searchNavButton')?.click();
      } else {
        window.location.href = 'browse.html';
      }
    }
  }

  function navigateTo(view) {
    if (['home', 'shows', 'movies', 'originals', 'my-list'].includes(view) && window.location.pathname.includes('browse.html')) {
      const link = document.querySelector(`.navbar__nav [data-view="${view}"]`);
      if (link) link.click();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAssistantWidget);
  } else {
    injectAssistantWidget();
  }
})();
