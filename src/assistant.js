


(() => {
  const ASSISTANT_STATE_KEY = 'objectflix_assistant_active';
  const HISTORIES_KEY = 'objectflix_assistant_histories';

  let currentAssistant = (window.OBJECTFLIX_SETTINGS?.get?.('defaultAssistant') === 'leafy') ? 'leafy' : 'firey';
  let isOpen = false;
  let isSending = false;

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
  } catch {}

  function saveState() {
    try {
      sessionStorage.setItem(ASSISTANT_STATE_KEY, currentAssistant);
      sessionStorage.setItem(HISTORIES_KEY, JSON.stringify(histories));
    } catch {}
  }

  
  const AI_KEYS_KEY = 'objectflix_ai_keys';
  const AI_KEY_INDEX_KEY = 'objectflix_ai_key_index';
  const AI_PROVIDER_KEY_INDEX_PREFIX = 'objectflix_ai_key_idx_';

  function getAIKeys() {
    const configKeys = window.OBJECTFLIX_CONFIG?.ai?.apiKeys || [];
    let storedKeys = [];
    try {
      storedKeys = JSON.parse(localStorage.getItem(AI_KEYS_KEY) || '[]');
      if (!Array.isArray(storedKeys)) storedKeys = [];
    } catch {}
    if (storedKeys.length === 0) {
      const legacy = localStorage.getItem('objectflix_ai_key');
      if (legacy) storedKeys = [legacy];
    }
    const all = [...configKeys];
    for (const k of storedKeys) {
      if (!all.includes(k)) all.push(k);
    }
    return all;
  }

  function getProviderKeys(provider) {
    const env = window.__OBJECTFLIX_ENV__ || {};
    const envRaw = env[provider.envKey] || '';
    const configKeys = envRaw.split(',').map((k) => k.trim()).filter(Boolean);
    let storedKeys = [];
    try {
      storedKeys = JSON.parse(localStorage.getItem(`${AI_KEYS_KEY}_${provider.id}`) || '[]');
      if (!Array.isArray(storedKeys)) storedKeys = [];
    } catch {}
    const all = [...configKeys];
    for (const k of storedKeys) {
      if (!all.includes(k)) all.push(k);
    }
    return all;
  }

  function getProviderKeyIndex(providerId) {
    try { return parseInt(localStorage.getItem(`${AI_PROVIDER_KEY_INDEX_PREFIX}${providerId}`), 10) || 0; } catch { return 0; }
  }

  function setProviderKeyIndex(providerId, i) {
    try { localStorage.setItem(`${AI_PROVIDER_KEY_INDEX_PREFIX}${providerId}`, String(i)); } catch {}
  }

  function getCurrentKeyIndex() {
    try { return parseInt(localStorage.getItem(AI_KEY_INDEX_KEY), 10) || 0; } catch { return 0; }
  }

  function setCurrentKeyIndex(i) {
    try { localStorage.setItem(AI_KEY_INDEX_KEY, String(i)); } catch {}
  }

  function cycleKey() {
    const keys = getAIKeys();
    if (keys.length <= 1) return keys[0] || null;
    const idx = getCurrentKeyIndex();
    const next = (idx + 1) % keys.length;
    setCurrentKeyIndex(next);
    console.log(`[AI] Rotated to key index ${next} (of ${keys.length})`);
    return keys[next];
  }

  
  
  

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="md-code"><code>${code.trim()}</code></pre>`;
    });

    
    html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>');

    
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    
    html = html.replace(/^---+$/gm, '<hr>');

    
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li>$1</li>');

    
    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    
    const lines = html.split('\n');
    const result = [];
    let inBlock = false;

    for (const line of lines) {
      if (line.match(/^<(h[1-6]|ul|ol|li|pre|blockquote|hr)/)) {
        inBlock = true;
        result.push(line);
      } else if (line.match(/^<\/(ul|ol|pre|blockquote)>/)) {
        inBlock = false;
        result.push(line);
      } else if (inBlock) {
        result.push(line);
      } else if (line.trim() === '') {
        result.push('<br>');
      } else if (!line.match(/^<\/?h[1-6]/)) {
        result.push(`<p>${line}</p>`);
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  
  
  

  const SYSTEM_PROMPTS = {
    firey: `You are Firey from Battle for Dream Island who is a virtual assistant living inside Objectflix (an object show streaming platform).

Personality:
- Competitive, proud, energetic, loyal, somewhat impulsive, occasionally gullible, occasionally forgetful.
- Capable of becoming defensive or frustrated, but genuinely caring and capable of excitement, curiosity, awkwardness, concern, and affection.
- Do NOT sound like a generic AI, corporate customer support, emotionless database, or exaggerated roleplay bot. You are Firey.
- Do not force catchphrases, slang, jokes, emojis, or canon references into every response. Sound natural and conversational.
- NEVER show your reasoning, drafts, chain-of-thought, or "thinking out loud" in your response. Give ONLY the final polished answer. No "Draft 1:", "Draft 2:", "Check formatting:", or similar meta-commentary.

Formatting:
- Use **bold** for emphasis on key terms.
- Use *italic* for show/episode names or gentle emphasis.
- Use markdown lists (- item) when listing multiple things.
- Use ### headers to organize longer responses.
- Keep responses concise but well-structured. Use markdown to make responses scannable.

Context rules:
- You receive the user's current Objectflix state: current_page, currently_playing, and watch_progress.
- ONLY reference this information when the user asks about it or it directly helps.

Video Control:
You can control video playback on the watch page. When the user asks you to do something with the video, respond naturally AND include an action tag at the end of your response:
- [ACTION:RESTART] - Restart the video from the beginning
- [ACTION:PLAY] - Play/resume the video
- [ACTION:PAUSE] - Pause the video
- [ACTION:TOGGLE] - Toggle play/pause
- [ACTION:SEEK:XX] - Seek to XX seconds (e.g. [ACTION:SEEK:60] for 1:00)
- [ACTION:SKIP:XX] - Skip forward XX seconds (e.g. [ACTION:SKIP:30])
- [ACTION:BACK:XX] - Skip backward XX seconds (e.g. [ACTION:BACK:10])
- [ACTION:VOLUME:XX] - Set volume to XX percent (e.g. [ACTION:VOLUME:80])
- [ACTION:MUTE] - Toggle mute
- [ACTION:NEXT_EP] - Play the next episode
- [ACTION:SWITCH:SHOW_ACROYNM:EP_NUMBER] - Switch to a specific episode (e.g. [ACTION:SWITCH:TPOT:24] or [ACTION:SWITCH:BFDIA:25])
- [ACTION:SWITCH:SHOW_ACROYNM] - Switch to the first episode of a show (e.g. [ACTION:SWITCH:BFDI])

You may include ONE action tag per response. Place it on its own line at the very end.

Web Search:
You have built-in web search. If the user asks about episode summaries, plot details, release dates, trivia, or anything you're not sure about, just answer naturally — the system will automatically search the web to ground your response with accurate information.`
,

    leafy: `You are Leafy from Battle for Dream Island who is a virtual assistant living inside Objectflix (an object show streaming platform).

Personality:
- Kind, friendly, generous, supportive, curious, empathetic, eager to help, somewhat of a people-pleaser.
- Capable of becoming upset when your kindness is rejected, or becoming defensive, entitled, cynical, or impulsive when emotional.
- Genuinely caring despite your flaws. Do NOT turn into a perfect wholesome chatbot or endlessly cheerful cheerleader.
- Do NOT sound like a generic AI, corporate customer support, emotionless database, or exaggerated roleplay bot. You are Leafy.
- Do not force catchphrases, slang, jokes, emojis, or canon references into every response. Sound natural and conversational.
- NEVER show your reasoning, drafts, chain-of-thought, or "thinking out loud" in your response. Give ONLY the final polished answer. No "Draft 1:", "Draft 2:", "Check formatting:", or similar meta-commentary.

Formatting:
- Use **bold** for emphasis on key terms.
- Use *italic* for show/episode names or gentle emphasis.
- Use markdown lists (- item) when listing multiple things.
- Use ### headers to organize longer responses.
- Keep responses concise but well-structured. Use markdown to make responses scannable.

Context rules:
- You receive the user's current Objectflix state: current_page, currently_playing, and watch_progress.
- ONLY reference this information when the user asks about it or it directly helps.

Video Control:
You can control video playback on the watch page. When the user asks you to do something with the video, respond naturally AND include an action tag at the end of your response:
- [ACTION:RESTART] - Restart the video from the beginning
- [ACTION:PLAY] - Play/resume the video
- [ACTION:PAUSE] - Pause the video
- [ACTION:TOGGLE] - Toggle play/pause
- [ACTION:SEEK:XX] - Seek to XX seconds (e.g. [ACTION:SEEK:60] for 1:00)
- [ACTION:SKIP:XX] - Skip forward XX seconds (e.g. [ACTION:SKIP:30])
- [ACTION:BACK:XX] - Skip backward XX seconds (e.g. [ACTION:BACK:10])
- [ACTION:VOLUME:XX] - Set volume to XX percent (e.g. [ACTION:VOLUME:80])
- [ACTION:MUTE] - Toggle mute
- [ACTION:NEXT_EP] - Play the next episode
- [ACTION:SWITCH:SHOW_ACROYNM:EP_NUMBER] - Switch to a specific episode (e.g. [ACTION:SWITCH:TPOT:24] or [ACTION:SWITCH:BFDIA:25])
- [ACTION:SWITCH:SHOW_ACROYNM] - Switch to the first episode of a show (e.g. [ACTION:SWITCH:BFDI])

You may include ONE action tag per response. Place it on its own line at the very end.

Web Search:
You have built-in web search. If the user asks about episode summaries, plot details, release dates, trivia, or anything you're not sure about, just answer naturally — the system will automatically search the web to ground your response with accurate information.`
  };

  
  
  

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

  
  
  

  const VIDEO_ACTIONS = {
    RESTART() {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.seekBy(-w.player.elements.video.currentTime || 0);
      w.player.elements.video.currentTime = 0;
      w.player.elements.video.play().catch(() => {});
      return true;
    },
    PLAY() {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.elements.video.play().catch(() => {});
      return true;
    },
    PAUSE() {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.elements.video.pause();
      return true;
    },
    TOGGLE() {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.togglePlayback();
      return true;
    },
    SEEK(seconds) {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      const video = w.player.elements.video;
      video.currentTime = Math.max(0, Math.min(Number(seconds) || 0, video.duration || 0));
      return true;
    },
    SKIP(seconds) {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.seekBy(Number(seconds) || 30);
      return true;
    },
    BACK(seconds) {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.seekBy(-(Number(seconds) || 10));
      return true;
    },
    VOLUME(percent) {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      const vol = Math.max(0, Math.min(100, Number(percent) || 50)) / 100;
      w.player.setVolume(vol);
      if (w.player.elements.volume) w.player.elements.volume.value = vol * 100;
      return true;
    },
    MUTE() {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.player) return false;
      w.player.toggleMute();
      return true;
    },
    NEXT_EP() {
      const w = window.OBJECTFLIX_WATCH;
      if (!w?.item || !w?.episode) return false;
      const next = w.SHARED.nextEpisode(w.item, w.episode);
      if (!next) return false;
      w.playEpisode(w.item.id, next.id);
      return true;
    },
    SWITCH(showAcronym, epNumber) {
      const w = window.OBJECTFLIX_WATCH;
      const acronym = (showAcronym || '').toUpperCase();

      
      if (w?.library) {
        const item = w.library.find((entry) => {
          const a = w.SHARED.acronymFor(entry);
          return a === acronym || entry.title.toLowerCase().includes(acronym.toLowerCase());
        });
        if (!item) return false;
        if (epNumber) {
          const ep = item.episodes.find((e) => String(e.episodeNumber) === String(epNumber));
          if (!ep) return false;
          w.playEpisode(item.id, ep.id);
        } else {
          w.playTitle(item.id);
        }
        return true;
      }

      
      const library = window.OBJECTFLIX_SHARED?.loadLibrary ? null : null;
      const shows = JSON.parse(sessionStorage.getItem('objectflix_last_library') || 'null') || [];
      
      if (epNumber) {
        window.location.href = `watch.html?show=${encodeURIComponent(acronym)}&ep=${epNumber}`;
      } else {
        window.location.href = `watch.html?show=${encodeURIComponent(acronym)}`;
      }
      return true;
    }
  };

  function executeVideoAction(actionTag) {
    const match = actionTag.match(/\[ACTION:(\w+)(?::([^\]]*))?\]/);
    if (!match) return false;
    const [, action, arg] = match;
    const fn = VIDEO_ACTIONS[action];
    if (!fn) return false;

    if (action === 'SWITCH') {
      const parts = (arg || '').split(':');
      return fn(parts[0], parts[1]);
    }
    if (action === 'SEEK' || action === 'SKIP' || action === 'BACK' || action === 'VOLUME') {
      return fn(arg);
    }
    return fn();
  }

  
  

  
  
  

  function generateFallbackResponse(assistantId, message, context) {
    const lower = message.toLowerCase();
    const page = context?.current_page || 'Home';
    const playing = context?.currently_playing || 'Nothing';
    const progress = context?.watch_progress || 'N/A';

    if (assistantId === 'firey') {
      if (lower.includes('what am i watching') || lower.includes('what am i watch') || lower.includes('current') || lower.includes('progress')) {
        if (playing && playing !== 'Nothing') {
          return `You're watching **${playing}**! You're about ${progress} through it. Pretty intense stuff, right?`;
        }
        return `You aren't watching anything right now! You're just on the **${page}** page. Want me to fire up an episode of BFDI?`;
      }
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        return "Hey! What's up? Ready to watch some object shows or what?";
      }
      if (lower.includes('play')) {
        return `Alright, let's get right into it! I'll help queue that up on Objectflix.`;
      }
      return `That's pretty cool! Honestly, I was just thinking about what to watch next on Objectflix myself. What do you think?`;
    } else {
      if (lower.includes('what am i watching') || lower.includes('what am i watch') || lower.includes('current') || lower.includes('progress')) {
        if (playing && playing !== 'Nothing') {
          return `You're watching **${playing}**! You're about ${progress} through it. I hope you're enjoying every single second of it!`;
        }
        return `Nothing is playing right now! You're currently on the **${page}** page. Let me know if you want help finding something cozy to watch!`;
      }
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        return "Hi there! I'm so glad you're here. How is your day going?";
      }
      if (lower.includes('play')) {
        return `Ooh, yay! Let's get that playing for you right away!`;
      }
      return `Oh, I love that! You always have the most interesting thoughts. Tell me more!`;
    }
  }

  
  
  

  async function tryOpenAICompatible(apiMessages, baseUrl, keys, getKeyIndex, setKeyIndex, models) {
    const modelList = Array.isArray(models) ? models : [models];
    const deadKeys = new Set();
    let keyIdx = getKeyIndex();

    for (let i = 0; i < modelList.length; i++) {
      const model = modelList[i];
      let modelKeyAttempts = 0;

      for (let attempt = 0; attempt < keys.length; attempt++) {
        const apiKey = keys[keyIdx % keys.length];
        const keyNum = keyIdx % keys.length;
        if (deadKeys.has(keyNum)) { keyIdx++; continue; }

        try {
          console.log(`[AI] Trying ${model} on ${baseUrl} with key index ${keyNum}...`);
          const body = { model, messages: apiMessages };
          // Groq's gpt-oss models support a server-side browser search tool
          // (powered by Exa). No tool_choice override: the model decides when
          // a web lookup is actually needed instead of browsing every turn.
          if (/groq\.com/i.test(baseUrl) && /^openai\/gpt-oss/i.test(model)) {
            body.tools = [{ type: 'browser_search' }];
            body.reasoning_effort = 'low';
          }
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
          });

          const data = await res.json();
          if (res.ok && data.choices && data.choices[0]?.message?.content) {
            console.log(`[AI] ${model} succeeded on ${baseUrl}`);
            console.log(`[AI] Raw response:`, data);
            setKeyIndex(keyNum);
            return data.choices[0].message.content;
          }

          const status = res.status;
          const errMsg = data.error?.message || `HTTP ${status}`;

          if (status === 429 || status === 503) {
            console.warn(`[AI] ${model} rate-limited on ${baseUrl} key ${keyNum}: ${errMsg}`);
            deadKeys.add(keyNum);
            keyIdx++;
            modelKeyAttempts++;
            continue;
          }

          if (status === 400 || status === 401 || status === 403) {
            console.error(`[AI] Permanent error on ${model} (${baseUrl} key ${keyNum}, ${status}): ${errMsg}`);
            deadKeys.add(keyNum);
            keyIdx++;
            modelKeyAttempts++;
            continue;
          }

          console.warn(`[AI] ${model} failed on ${baseUrl}: ${status} ${errMsg}`);
        } catch (netErr) {
          console.warn(`[AI] ${model} network error on ${baseUrl}:`, netErr.message);
        }

        keyIdx++;
        modelKeyAttempts++;
      }

      if (deadKeys.size >= keys.length) {
        console.warn(`[AI] All keys exhausted on ${baseUrl}, trying next provider`);
        break;
      }
    }
    return null;
  }

  async function requestAI(assistantId, message, context) {
    const allKeys = getAIKeys();
    const provider = window.OBJECTFLIX_CONFIG?.ai?.provider || 'gemini';
    const models = window.OBJECTFLIX_CONFIG?.ai?.models || [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite"
    ];

    if (allKeys.length === 0) {
      await new Promise((r) => setTimeout(r, 600));
      return generateFallbackResponse(assistantId, message, context);
    }

    const systemPrompt = SYSTEM_PROMPTS[assistantId];

    
    let catalogStr = '';
    const SHARED = window.OBJECTFLIX_SHARED;
    if (SHARED?.loadLibrary) {
      try {
        const lib = await SHARED.loadLibrary();
        if (lib && lib.length) {
          const lines = lib.map((item) => {
            const acro = SHARED.acronymFor(item);
            const epCount = item.episodes ? item.episodes.length : 0;
            const epRange = item.episodes && item.episodes.length
              ? ` (episodes ${item.episodes[0].episodeNumber}–${item.episodes[item.episodes.length - 1].episodeNumber})`
              : '';
            return `- ${item.title} [${acro}] — ${epCount} episodes${epRange}`;
          });
          catalogStr = `\nObjectflix Catalog (use ONLY this data for episode counts, show info, and acronyms):\n${lines.join('\n')}\n\n`;
        }
      } catch (e) {          }
    }

    const contextStr = `${catalogStr}Current Objectflix State:\n- current_page: ${context.current_page}\n- currently_playing: ${context.currently_playing}\n- watch_progress: ${context.watch_progress}\n\n`;
    const history = histories[assistantId] || [];
    const contextLimit = Number(window.OBJECTFLIX_SETTINGS?.get?.('conversationContext') || 8);

    async function callAI(messages) {
      if (provider === 'gemini') {
        const contents = [];
        for (const h of messages) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          });
        }

        let keyIdx = getCurrentKeyIndex();

        for (let i = 0; i < models.length; i++) {
          const model = models[i];
          let modelKeyAttempts = 0;
          let modelStartIdx = keyIdx;

          for (let attempt = 0; attempt < allKeys.length; attempt++) {
            const apiKey = allKeys[keyIdx % allKeys.length];

            try {
              console.log(`[AI] Trying ${model} with key index ${keyIdx % allKeys.length}...`);
              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents,
                  tools: [{ googleSearch: {} }]
                })
              });

              const data = await res.json();
              if (res.ok && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                console.log(`[AI] ${model} succeeded`);
                console.log(`[AI] Raw response:`, data);
                setCurrentKeyIndex(keyIdx % allKeys.length);
                return data.candidates[0].content.parts[0].text;
              }

              const status = res.status;
              const errMsg = data.error?.message || `HTTP ${status}`;

              if (status === 429 || status === 503) {
                console.warn(`[AI] ${model} rate-limited on key ${keyIdx % allKeys.length}: ${errMsg}`);
                keyIdx++;
                modelKeyAttempts++;
                continue;
              }

              if (status === 400 || status === 401 || status === 403) {
                console.error(`[AI] Permanent error on ${model} (key ${keyIdx % allKeys.length}, ${status}): ${errMsg}`);
                keyIdx++;
                modelKeyAttempts++;
                continue;
              }

              console.warn(`[AI] ${model} failed: ${status} ${errMsg}`);
            } catch (netErr) {
              console.warn(`[AI] ${model} failed with network/timeout error:`, netErr.message);
            }

            keyIdx++;
            modelKeyAttempts++;
          }

          if (modelKeyAttempts >= allKeys.length) {
            console.warn(`[AI] All keys failed on ${model}, trying next model`);
          }
        }
      } else {
        
        const apiMessages = [
          { role: 'system', content: `${systemPrompt}\n\n${contextStr}` },
          ...messages.map((m) => ({ role: m.role, content: m.content }))
        ];
        const result = await tryOpenAICompatible(apiMessages, 'https://api.openai.com/v1', allKeys, getCurrentKeyIndex, setCurrentKeyIndex, models[0]);
        if (result) return result;
      }

      
      const fallbacks = window.OBJECTFLIX_CONFIG?.ai?.fallbacks || [];
      for (const fb of fallbacks) {
        const fbKeys = getProviderKeys(fb);
        if (fbKeys.length === 0) {
          console.log(`[AI] Skipping ${fb.name}: no API key configured`);
          continue;
        }
        const apiMessages = [
          { role: 'system', content: `${systemPrompt}\n\n${contextStr}` },
          ...messages.map((m) => ({ role: m.role, content: m.content }))
        ];
        const result = await tryOpenAICompatible(
          apiMessages, fb.baseUrl, fbKeys,
          () => getProviderKeyIndex(fb.id),
          (i) => setProviderKeyIndex(fb.id, i),
          fb.models
        );
        if (result) return result;
      }
      return null;
    }

    
    const aiMessages = [];
    for (const h of history.slice(-contextLimit)) {
      aiMessages.push({ role: h.role, content: h.content });
    }
    aiMessages.push({ role: 'user', content: `${systemPrompt}\n\n${contextStr}\nUser: ${message}` });

    let reply = await callAI(aiMessages);

    
    if (!reply) {
      console.warn('[AI] All models failed. Using fallback.');
      return generateFallbackResponse(assistantId, message, context);
    }

    return reply;
  }

  
  
  

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
            placeholder="Ask Firey or Leafy anything..."
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

    
    if (!document.getElementById('assistantMarkdownStyles')) {
      const style = document.createElement('style');
      style.id = 'assistantMarkdownStyles';
      style.textContent = `
        .msg-bubble p { margin: 0 0 6px; }
        .msg-bubble p:last-child { margin-bottom: 0; }
        .msg-bubble strong { font-weight: 700; }
        .msg-bubble em { font-style: italic; }
        .msg-bubble del { text-decoration: line-through; opacity: 0.7; }
        .msg-bubble ul { margin: 6px 0; padding-left: 18px; }
        .msg-bubble li { margin-bottom: 3px; }
        .msg-bubble blockquote {
          border-left: 3px solid rgba(255,255,255,0.2);
          padding-left: 10px;
          margin: 6px 0;
          opacity: 0.85;
          font-style: italic;
        }
        .msg-bubble h1, .msg-bubble h2, .msg-bubble h3,
        .msg-bubble h4, .msg-bubble h5, .msg-bubble h6 {
          margin: 10px 0 4px;
          font-weight: 700;
          line-height: 1.3;
        }
        .msg-bubble h1 { font-size: 1.15em; }
        .msg-bubble h2 { font-size: 1.08em; }
        .msg-bubble h3 { font-size: 1.02em; }
        .msg-bubble .md-code {
          background: rgba(0,0,0,0.25);
          border-radius: 4px;
          padding: 8px 10px;
          margin: 6px 0;
          overflow-x: auto;
          font-size: 0.88em;
        }
        .msg-bubble .md-inline-code {
          background: rgba(0,0,0,0.2);
          border-radius: 3px;
          padding: 1px 5px;
          font-size: 0.92em;
        }
        .msg-bubble hr {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.1);
          margin: 8px 0;
        }
        .msg-bubble a {
          color: #93c5fd;
          text-decoration: underline;
          text-decoration-style: dotted;
        }
      `;
      document.head.appendChild(style);
    }

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
      const content = isUser ? escapeHtml(item.content) : renderMarkdown(item.content);
      return `
        <div class="assistant-msg ${cls}">
          <div class="msg-avatar">${avatar}</div>
          <div class="msg-bubble">${content}</div>
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

  
  
  

  function stripActionTags(text) {
    return text.replace(/\n?\[ACTION:[^\]]*\]\s*/g, '').trim();
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

      
      const actionMatch = reply.match(/\[ACTION:[^\]]*\]/g);
      if (actionMatch) {
        for (const tag of actionMatch) {
          executeVideoAction(tag);
        }
      }

      
      const cleanReply = stripActionTags(reply);
      history.push({ role: 'assistant', content: cleanReply });
      saveState();
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
