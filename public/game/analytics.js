(function startDuckAnalytics() {
  "use strict";

  const disabled = new URLSearchParams(location.search).get("analytics") === "off";
  const endpointMeta = document.querySelector('meta[name="duck-analytics-endpoint"]');
  const endpoint = endpointMeta?.content?.trim() || "/api/analytics/events";
  const QUEUE_KEY = "duckAnalytics.queue.v1";
  const VISITOR_KEY = "duckAnalytics.visitor.v1";
  const VISIT_KEY = "duckAnalytics.visits.v1";
  const MAX_QUEUE = 250;
  const pageStartedAt = Date.now();
  let activeStartedAt = document.hidden ? 0 : performance.now();
  let activeMs = 0;
  let flushing = false;
  let sessionClosed = false;
  let currentGame = null;
  let playNumber = 0;

  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };

  function id(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${value}`;
  }

  let visitorId = storage.get(VISITOR_KEY);
  if (!visitorId || !/^[A-Za-z0-9_-]{8,80}$/.test(visitorId)) {
    visitorId = id("v");
    storage.set(VISITOR_KEY, visitorId);
  }
  const sessionId = id("s");
  const visitNumber = Math.max(1, Number(storage.get(VISIT_KEY) || 0) + 1);
  storage.set(VISIT_KEY, visitNumber);

  function readQueue() {
    try {
      const parsed = JSON.parse(storage.get(QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE) : [];
    } catch {
      return [];
    }
  }

  function writeQueue(queue) {
    storage.set(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  }

  function browserName(userAgent) {
    if (/Edg\//.test(userAgent)) return "Microsoft Edge";
    if (/OPR\//.test(userAgent)) return "Opera";
    if (/CriOS\//.test(userAgent)) return "Chrome iOS";
    if (/FxiOS\//.test(userAgent)) return "Firefox iOS";
    if (/Chrome\//.test(userAgent)) return "Chrome";
    if (/Firefox\//.test(userAgent)) return "Firefox";
    if (/Safari\//.test(userAgent)) return "Safari";
    return "其他";
  }

  function osName(userAgent) {
    if (/iPad|iPhone|iPod/.test(userAgent)) return "iOS / iPadOS";
    if (/Android/.test(userAgent)) return "Android";
    if (/Windows NT/.test(userAgent)) return "Windows";
    if (/Mac OS X/.test(userAgent)) return "macOS";
    if (/CrOS/.test(userAgent)) return "ChromeOS";
    if (/Linux/.test(userAgent)) return "Linux";
    return "其他";
  }

  function deviceType(userAgent) {
    if (/iPad|Tablet|PlayBook|Silk/.test(userAgent) || (/Android/.test(userAgent) && !/Mobile/.test(userAgent))) return "平板";
    if (/Mobi|iPhone|iPod|Android/.test(userAgent)) return "手機";
    return "桌機／筆電";
  }

  function context() {
    const userAgent = navigator.userAgent || "";
    return {
      visitNumber,
      deviceType: deviceType(userAgent),
      os: osName(userAgent),
      browser: browserName(userAgent),
      language: navigator.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screenWidth: screen.width || 0,
      screenHeight: screen.height || 0,
      viewportWidth: innerWidth || 0,
      viewportHeight: innerHeight || 0,
      touchPoints: navigator.maxTouchPoints || 0,
      isPwa: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      connectionType: navigator.connection?.effectiveType || "",
      referrer: document.referrer || "",
    };
  }

  function accumulateActiveTime() {
    if (!activeStartedAt) return;
    activeMs += Math.max(0, performance.now() - activeStartedAt);
    activeStartedAt = 0;
  }

  function activeTotal() {
    return Math.round(activeMs + (activeStartedAt ? Math.max(0, performance.now() - activeStartedAt) : 0));
  }

  function enqueue(type, data = {}) {
    if (disabled || location.protocol === "file:") return null;
    const event = {
      id: id("e"),
      type,
      visitorId,
      sessionId,
      occurredAt: new Date().toISOString(),
      data,
    };
    const queue = readQueue();
    queue.push(event);
    writeQueue(queue);
    if (queue.length >= 10 || ["session_start", "game_start", "game_end"].includes(type)) flush();
    return event;
  }

  async function flush(useBeacon = false) {
    if (disabled || flushing) return;
    const queue = readQueue().slice(0, 50);
    if (!queue.length) return;
    const payload = JSON.stringify({ visitorId, sessionId, events: queue });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
      return;
    }
    flushing = true;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "omit",
      });
      if (!response.ok) return;
      const sentIds = new Set(queue.map((event) => event.id));
      writeQueue(readQueue().filter((event) => !sentIds.has(event.id)));
    } catch {
      // Offline events stay in localStorage and are retried on the next flush.
    } finally {
      flushing = false;
    }
  }

  function startGame(data = {}) {
    if (currentGame) endGame({ reason: "restarted", completed: false });
    playNumber += 1;
    currentGame = {
      id: id("g"),
      startedAt: performance.now(),
      playNumber,
      finalScore: 0,
      roundsCompleted: 0,
      maxCombo: 0,
    };
    enqueue("game_start", {
      ...data,
      gameplayId: currentGame.id,
      playNumber,
    });
    return currentGame.id;
  }

  function trackRound(data = {}) {
    if (!currentGame) return;
    currentGame.finalScore = Math.max(currentGame.finalScore, Number(data.totalScore || 0));
    currentGame.roundsCompleted = Math.max(
      currentGame.roundsCompleted,
      data.correct ? Number(data.roundNumber || 0) : Math.max(0, Number(data.roundNumber || 1) - 1),
    );
    currentGame.maxCombo = Math.max(currentGame.maxCombo, Number(data.combo || 0));
    enqueue("round_answer", { ...data, gameplayId: currentGame.id, playNumber });
  }

  function endGame(data = {}) {
    if (!currentGame) return;
    const game = currentGame;
    currentGame = null;
    enqueue("game_end", {
      gameplayId: game.id,
      playNumber: game.playNumber,
      durationMs: Math.round(performance.now() - game.startedAt),
      finalScore: game.finalScore,
      roundsCompleted: game.roundsCompleted,
      maxCombo: game.maxCombo,
      completed: data.completed !== false,
      ...data,
    });
  }

  function heartbeat() {
    enqueue("heartbeat", {
      activeMs: activeTotal(),
      pageMs: Date.now() - pageStartedAt,
    });
    flush();
  }

  function closeSession() {
    if (sessionClosed) return;
    sessionClosed = true;
    accumulateActiveTime();
    if (currentGame) endGame({ reason: "page_exit", completed: false });
    enqueue("session_end", {
      activeMs: activeTotal(),
      pageMs: Date.now() - pageStartedAt,
    });
    flush(true);
  }

  const api = Object.freeze({
    startGame,
    trackRound,
    endGame,
    trackSetting(name, value) {
      enqueue("settings_change", { name, value });
    },
    flush,
    sessionId,
    visitorId,
  });
  globalThis.DuckAnalytics = api;

  if (!disabled) {
    enqueue("session_start", context());
    window.setInterval(heartbeat, 15_000);
    window.setInterval(flush, 5_000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        accumulateActiveTime();
        heartbeat();
      } else {
        activeStartedAt = performance.now();
        sessionClosed = false;
        flush();
      }
    });
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", closeSession);
    window.addEventListener("beforeunload", closeSession);
    flush();
  }
})();
