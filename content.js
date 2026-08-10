(() => {
  "use strict";

  const DEFAULTS = {
    timerEnabled: true,
    daySeconds: "",
    voteSeconds: "50,30,10,9,8",
    nightSeconds: "",
    timerVolume: 70,
    maintenanceEnabled: false,
    maintenanceVolume: 70,
    keywordEnabled: false,
    keywords: "",
    keywordVolume: 70,
    excludeSelf: true,
    selfName: "",
    caseInsensitive: true
  };

  let settings = { ...DEFAULTS };
  let lastTimerKey = null;
  let timerObserver = null;
  let timerTarget = null;
  let messageObserver = null;
  let messageTarget = null;
  let lastMaintenanceKey = null;

  function clampVolume(value) {
    const n = Number(value);
    return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 70)) / 100;
  }

  function parseSeconds(value) {
    return new Set(
      String(value ?? "")
        .split(/[、,\s]+/)
        .map(v => Number(v.trim()))
        .filter(v => Number.isInteger(v) && v >= 0)
    );
  }

  function parseKeywords(value) {
    return String(value ?? "")
      .split(/\r?\n|、|,/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function normalize(value) {
    const text = String(value ?? "");
    return settings.caseInsensitive ? text.toLocaleLowerCase("ja-JP") : text;
  }

  function detectSelfName() {
    if (settings.selfName.trim()) return settings.selfName.trim();

    const candidates = [
      document.querySelector('.morningScene > div[style*="font-size"]'),
      document.querySelector('.nightScene > div[style*="font-size"]'),
      document.querySelector('.voteScene > div[style*="font-size"]')
    ].filter(Boolean);

    for (const el of candidates) {
      const text = el.textContent?.trim() ?? "";
      const match = text.match(/^(.+?)さん(?:\(|（)/);
      if (match) return match[1].trim();
    }
    return "";
  }

  function playSound(kind) {
    const file = kind === "keyword"
      ? "sounds/keyword.wav"
      : kind === "maintenance"
        ? "sounds/maintenance.wav"
        : "sounds/timer.wav";
    const volume = kind === "keyword"
      ? settings.keywordVolume
      : kind === "maintenance"
        ? settings.maintenanceVolume
        : settings.timerVolume;
    const audio = new Audio(chrome.runtime.getURL(file));
    audio.volume = clampVolume(volume);
    audio.play().catch(err => {
      console.warn("[zinro notifier] 音声を再生できませんでした", err);
    });
  }

  function getTimerState(el) {
    if (!el) return null;
    const sec = Number(String(el.textContent ?? "").trim());
    if (!Number.isFinite(sec)) return null;

    const parentText = el.parentElement?.textContent ?? "";
    let phase = null;
    if (parentText.includes("【昼】")) phase = "day";
    else if (parentText.includes("【投票】") || parentText.includes("【投票時間】")) phase = "vote";
    else if (parentText.includes("【夜】")) phase = "night";

    return phase ? { phase, sec } : null;
  }

  function handleTimer() {
    if (!settings.timerEnabled || !timerTarget) return;
    const state = getTimerState(timerTarget);
    if (!state) return;

    const key = `${state.phase}:${state.sec}`;
    if (key === lastTimerKey) return;
    lastTimerKey = key;

    const targets = state.phase === "day"
      ? parseSeconds(settings.daySeconds)
      : state.phase === "vote"
        ? parseSeconds(settings.voteSeconds)
        : parseSeconds(settings.nightSeconds);

    if (targets.has(state.sec)) {
      playSound("timer");
    }
  }

  function attachTimer() {
    const el = document.getElementById("limit_sec");
    if (!el || el === timerTarget) return;

    timerObserver?.disconnect();
    timerTarget = el;
    lastTimerKey = null;
    timerObserver = new MutationObserver(handleTimer);
    timerObserver.observe(el, { childList: true, characterData: true, subtree: true });

    handleTimer();
  }

  function extractLiveMessage(node) {
    if (!(node instanceof HTMLElement) || node.tagName !== "DIV") return null;
    if (node.id === "message_text") return null;

    const spans = Array.from(node.children).filter(el => el.tagName === "SPAN");
    if (spans.length < 2) return null;

    const sender = (spans[0].textContent ?? "").trim();
    const text = (spans[1].textContent ?? "").replace(/^\s*:\s*/, "").trim();
    if (!sender || !text) return null;

    return { sender, text };
  }

  function handleNewMessage(message) {
    if (!settings.keywordEnabled) return;
    if (!message || message.sender === "鯖") return;

    const selfName = detectSelfName();
    const senderBase = message.sender.split("→")[0].trim();
    if (settings.excludeSelf && selfName && senderBase === selfName) return;

    const keywords = parseKeywords(settings.keywords);
    if (keywords.length === 0) return;

    const haystack = normalize(message.text);
    const hit = keywords.some(keyword => haystack.includes(normalize(keyword)));
    if (hit) playSound("keyword");
  }

  function checkMaintenanceTime() {
    if (!settings.maintenanceEnabled) return;

    const now = new Date();
    const minute = now.getMinutes();
    if (minute % 10 !== 9) return;

    const key = [
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      minute
    ].join(":");

    if (key === lastMaintenanceKey) return;
    lastMaintenanceKey = key;
    playSound("maintenance");
  }

  function attachMessages() {
    const el = document.getElementById("message");
    if (!el || el === messageTarget) return;

    messageObserver?.disconnect();
    messageTarget = el;
    messageObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          const message = extractLiveMessage(node);
          if (message) handleNewMessage(message);
        }
      }
    });
    messageObserver.observe(el, { childList: true });
  }

  function attachAll() {
    attachTimer();
    attachMessages();
  }

  const pageObserver = new MutationObserver(attachAll);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.local.get(DEFAULTS, stored => {
    settings = { ...DEFAULTS, ...stored };
    attachAll();
    checkMaintenanceTime();
  });

  setInterval(checkMaintenanceTime, 1000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "test-sound") {
      const kind = message.kind === "keyword"
        ? "keyword"
        : message.kind === "maintenance"
          ? "maintenance"
          : "timer";
      playSound(kind);
      sendResponse({ ok: true });
    }
  });
})();
