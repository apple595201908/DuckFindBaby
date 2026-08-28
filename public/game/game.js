(function startDuckGame() {
  "use strict";

  const Engine = globalThis.DuckEngine;
  if (!Engine) throw new Error("DuckEngine failed to load");

  // Cache the stable shell once. Rounds replace only candidate children, which
  // keeps repeated DOM queries and layout work outside the animation loop.
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    shell: $("#game-shell"),
    score: $("#scoreValue"),
    combo: $("#comboValue"),
    best: $("#bestValue"),
    parentOne: $("#parentOne"),
    parentTwo: $("#parentTwo"),
    parentOneLabel: $("#parentOneLabel"),
    parentTwoLabel: $("#parentTwoLabel"),
    prompt: $("#roundPrompt"),
    scorePop: $("#scorePop"),
    grid: $("#candidateGrid"),
    live: $("#liveRegion"),
    menu: $("#menuOverlay"),
    rules: $("#rulesOverlay"),
    pause: $("#pauseOverlay"),
    gameOver: $("#gameOverOverlay"),
    sound: $("#soundButton"),
    soundGlyph: $("#soundGlyph"),
    soundLabel: $("#soundLabel"),
    assist: $("#assistButton"),
    pauseButton: $("#pauseButton"),
    finalScore: $("#finalScore"),
    finalRounds: $("#finalRounds"),
    finalBest: $("#finalBest"),
    resultEyebrow: $("#resultEyebrow"),
  };

  // Privacy modes can reject localStorage. Storage errors must not prevent a
  // run, so each operation falls back safely to the in-memory state.
  const storage = {
    readNumber(key, fallback) {
      try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
      } catch {
        return fallback;
      }
    },
    readBoolean(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value === "true";
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // The game remains playable when storage is unavailable.
      }
    },
  };

  // Runtime state machine: menu -> countdown -> playing -> resolving ->
  // gameover. Every input path checks these phases before mutating a round.
  const state = {
    phase: "menu",
    score: 0,
    combo: 0,
    round: 0,
    best: storage.readNumber("duckGeneLab.best.v2", 0),
    sound: storage.readBoolean("duckFamilyMatch.sound", true),
    assist: storage.readBoolean("duckFamilyMatch.assist", false),
    vibration: true,
    current: null,
    token: 0,
    deadline: 0,
    frame: 0,
    paused: false,
    pausedAt: 0,
    audio: null,
    sfxBus: null,
    musicBus: null,
    bgmTimer: 0,
    bgmStep: 0,
    bgmNextNote: 0,
    scoreAnimation: null,
  };

  function setSprite(element, colorId) {
    const color = Engine.PALETTE[colorId];
    element.style.setProperty("--sprite-x-pos", `${(color.x / 3) * 100}%`);
    element.style.setProperty("--sprite-y-pos", `${(color.y / 3) * 100}%`);
    element.style.setProperty("--duck-color", color.hex);
    element.style.setProperty("--duck-ring", color.ring);
  }

  function setHidden(element, hidden) {
    element.classList.toggle("hidden", hidden);
  }

  function announce(message) {
    elements.live.textContent = "";
    requestAnimationFrame(() => {
      elements.live.textContent = message;
    });
  }

  function updateHud() {
    elements.score.textContent = state.score.toLocaleString("zh-Hant");
    elements.combo.textContent = String(state.combo);
    elements.best.textContent = state.best.toLocaleString("zh-Hant");
  }

  function updateSettings() {
    elements.soundGlyph.textContent = state.sound ? "♪" : "×";
    elements.soundLabel.textContent = state.sound ? "聲音" : "靜音";
    elements.sound.setAttribute("aria-pressed", String(state.sound));
    elements.sound.setAttribute("aria-label", state.sound ? "關閉音樂與音效" : "開啟音樂與音效");
    elements.assist.setAttribute("aria-pressed", String(state.assist));
    elements.assist.classList.toggle("active", state.assist);
    elements.shell.classList.toggle("assist-on", state.assist);
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!state.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        // Separate synthesized buses avoid external audio files. Creation is
        // deferred until user interaction to satisfy mobile autoplay rules.
        state.audio = new AudioContext();
        state.sfxBus = state.audio.createGain();
        state.musicBus = state.audio.createGain();
        state.sfxBus.gain.value = 0.82;
        state.musicBus.gain.value = 0.5;
        state.sfxBus.connect(state.audio.destination);
        state.musicBus.connect(state.audio.destination);
      }
    }
    if (state.audio && state.audio.state === "suspended") state.audio.resume().catch(() => {});
    return state.audio;
  }

  function tone(frequency, duration, type, volume, delay) {
    const audio = ensureAudio();
    if (!audio) return;
    const start = audio.currentTime + (delay || 0);
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.06, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(state.sfxBus || audio.destination);
    // Mobile browsers do not always release finished Web Audio graphs quickly.
    // Disconnecting them explicitly keeps long play sessions memory-stable.
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playSound(name) {
    if (!state.sound) return;
    if (name === "start") {
      tone(523, 0.12, "sine", 0.06, 0);
      tone(659, 0.12, "sine", 0.06, 0.11);
      tone(784, 0.18, "sine", 0.06, 0.22);
    } else if (name === "correct") {
      tone(659, 0.1, "triangle", 0.07, 0);
      tone(988, 0.18, "triangle", 0.07, 0.08);
    } else if (name === "wrong") {
      tone(240, 0.18, "sawtooth", 0.04, 0);
      tone(170, 0.25, "sawtooth", 0.035, 0.12);
    } else if (name === "tick") {
      tone(440, 0.04, "square", 0.018, 0);
    }
  }

  const BGM_MELODY = Object.freeze([
    523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 880, 783.99,
    440, 523.25, 659.25, 523.25, 440, 523.25, 783.99, 659.25,
    349.23, 440, 523.25, 440, 349.23, 440, 698.46, 659.25,
    392, 493.88, 587.33, 493.88, 392, 587.33, 783.99, 987.77,
  ]);
  const BGM_BASS = Object.freeze([130.81, 110, 87.31, 98]);
  const MAX_BGM_NOTES_PER_TICK = 8;

  function scheduleBgmNote(frequency, start, duration, type, volume) {
    if (!state.audio || !state.musicBus) return;
    const oscillator = state.audio.createOscillator();
    const gain = state.audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(state.musicBus);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function getBgmStepDuration() {
    const bpm = Math.min(150, 124 + state.score * 0.08);
    return 30 / bpm;
  }

  function scheduleBgm() {
    if (!state.sound || !state.audio || state.paused || !["countdown", "playing", "resolving"].includes(state.phase)) {
      state.bgmTimer = 0;
      return;
    }
    // A mobile browser may throttle this timer while the device is busy or the
    // page is backgrounded. Never try to catch up every missed note at once:
    // that creates thousands of audio nodes and can freeze a long session.
    const now = state.audio.currentTime;
    if (!Number.isFinite(state.bgmNextNote) || state.bgmNextNote < now - 0.1) {
      state.bgmNextNote = now + 0.04;
    }
    const horizon = now + 0.16;
    let scheduledNotes = 0;
    while (state.bgmNextNote < horizon && scheduledNotes < MAX_BGM_NOTES_PER_TICK) {
      const step = state.bgmStep % BGM_MELODY.length;
      const stepDuration = getBgmStepDuration();
      scheduleBgmNote(BGM_MELODY[step], state.bgmNextNote, stepDuration * 0.82, "triangle", 0.044);
      if (step % 4 === 0) {
        const bass = BGM_BASS[Math.floor(step / 8) % BGM_BASS.length];
        scheduleBgmNote(bass, state.bgmNextNote, stepDuration * 1.72, "sine", 0.035);
      }
      if (step % 8 === 7) {
        scheduleBgmNote(BGM_MELODY[step] * 2, state.bgmNextNote, stepDuration * 0.5, "sine", 0.018);
      }
      state.bgmStep += 1;
      state.bgmNextNote += stepDuration;
      scheduledNotes += 1;
    }
    state.bgmTimer = window.setTimeout(scheduleBgm, 70);
  }

  function startBgm() {
    const audio = ensureAudio();
    if (!audio || !state.musicBus || state.bgmTimer || !state.sound) return;
    state.musicBus.gain.cancelScheduledValues(audio.currentTime);
    state.musicBus.gain.setValueAtTime(0.5, audio.currentTime);
    state.bgmStep = 0;
    state.bgmNextNote = audio.currentTime + 0.04;
    scheduleBgm();
  }

  function stopBgm() {
    if (state.bgmTimer) window.clearTimeout(state.bgmTimer);
    state.bgmTimer = 0;
    if (state.audio && state.musicBus) {
      state.musicBus.gain.cancelScheduledValues(state.audio.currentTime);
      state.musicBus.gain.setValueAtTime(0.0001, state.audio.currentTime);
    }
  }

  function vibrate(pattern) {
    if (state.vibration && navigator.vibrate) navigator.vibrate(pattern);
  }

  function clearRound() {
    cancelAnimationFrame(state.frame);
    state.frame = 0;
    if (state.scoreAnimation) {
      state.scoreAnimation.cancel();
      state.scoreAnimation = null;
    }
    // Invalidate all delayed work from the previous run. Timeouts and animation
    // callbacks capture this token before they may touch the next round.
    state.token += 1;
    elements.grid.replaceChildren();
    elements.grid.classList.remove("animate-wave");
    elements.shell.dataset.candidates = "3";
    elements.shell.classList.remove("round-correct", "round-wrong", "is-paused");
  }

  function showMenu() {
    clearRound();
    stopBgm();
    state.phase = "menu";
    state.paused = false;
    setHidden(elements.pause, true);
    setHidden(elements.gameOver, true);
    setHidden(elements.rules, true);
    setHidden(elements.menu, false);
    elements.prompt.textContent = "最高點 10 分，下降越低分數越少！";
  }

  function runCountdown(token) {
    const steps = ["3", "2", "1", "GO！"];
    let index = 0;
    elements.prompt.classList.add("countdown");
    function next() {
      if (token !== state.token || state.phase !== "countdown") return;
      elements.prompt.textContent = steps[index];
      playSound(index === steps.length - 1 ? "start" : "tick");
      index += 1;
      if (index < steps.length) {
        window.setTimeout(next, 420);
      } else {
        window.setTimeout(() => {
          if (token !== state.token) return;
          elements.prompt.classList.remove("countdown");
          state.phase = "playing";
          launchPreparedRound();
        }, 360);
      }
    }
    next();
  }

  function startGame() {
    ensureAudio();
    clearRound();
    state.score = 0;
    state.combo = 0;
    state.round = 0;
    state.current = null;
    state.phase = "countdown";
    state.paused = false;
    updateHud();
    setHidden(elements.menu, true);
    setHidden(elements.rules, true);
    setHidden(elements.gameOver, true);
    // Render before countdown. GO launches this exact prepared round instead of
    // rerolling the parents or candidates after the player has previewed them.
    prepareRound();
    startBgm();
    const token = state.token;
    runCountdown(token);
  }

  function makeCandidate(colorId, index, duration) {
    const color = Engine.PALETTE[colorId];
    const button = document.createElement("button");
    button.className = "candidate";
    button.type = "button";
    button.dataset.color = String(colorId);
    button.style.setProperty("--duck-color", color.hex);
    button.style.setProperty("--duck-ring", color.ring);
    button.style.setProperty("--jump-ms", `${duration}ms`);
    button.setAttribute("aria-label", `候選 ${index + 1}：${color.name}`);

    const duck = document.createElement("span");
    duck.className = "duck-sprite candidate-duck";
    setSprite(duck, colorId);

    // This clipped viewport is the experiment chamber: it makes the duck enter
    // and leave through the card bottom without drawing outside the answer box.
    const viewport = document.createElement("span");
    viewport.className = "candidate-viewport";
    viewport.setAttribute("aria-hidden", "true");
    viewport.append(duck);

    const key = document.createElement("span");
    key.className = "key-hint";
    key.textContent = String(index + 1);

    const label = document.createElement("span");
    label.className = "assist-label";
    label.textContent = `${color.mark} ${color.name}`;

    const feedback = document.createElement("span");
    feedback.className = "feedback-badge";
    feedback.setAttribute("aria-hidden", "true");

    button.append(viewport, key, label, feedback);
    return button;
  }

  function startJumpWindow(current, token) {
    // CSS owns the smooth transform animation. This loop checks only the true
    // deadline, so it never forces layout while the duck moves.
    function updateJumpWindow(now) {
      if (token !== state.token || state.phase !== "playing" || state.paused) return;
      const remaining = Math.max(0, state.deadline - now);
      if (remaining <= 0) {
        endGame("timeout");
        return;
      }
      state.frame = requestAnimationFrame(updateJumpWindow);
    }
    state.frame = requestAnimationFrame(updateJumpWindow);
  }

  function renderPreparedRound() {
    if (!state.current) return;
    const current = state.current;

    setSprite(elements.parentOne, current.first);
    setSprite(elements.parentTwo, current.second);
    const firstColor = Engine.PALETTE[current.first];
    const secondColor = Engine.PALETTE[current.second];
    const firstCard = elements.parentOne.closest(".parent-card");
    const secondCard = elements.parentTwo.closest(".parent-card");
    firstCard.style.setProperty("--duck-color", firstColor.hex);
    firstCard.style.setProperty("--duck-ring", firstColor.ring);
    secondCard.style.setProperty("--duck-color", secondColor.hex);
    secondCard.style.setProperty("--duck-ring", secondColor.ring);
    elements.parentOneLabel.textContent = Engine.PALETTE[current.first].name;
    elements.parentTwoLabel.textContent = Engine.PALETTE[current.second].name;
    elements.prompt.textContent = state.score >= 100 ? "基因艙正在加速！趁寶寶還高快作答！" : "找出正確寶寶：分數越高，下降越快！";
    elements.shell.style.setProperty("--candidate-count", String(current.candidates.length));
    elements.shell.dataset.candidates = String(current.candidates.length);
    elements.grid.classList.remove("animate-wave");
    elements.grid.replaceChildren(
      ...current.candidates.map((colorId, index) => makeCandidate(colorId, index, current.duration)),
    );
    elements.grid.querySelectorAll(".candidate").forEach((candidate) => {
      candidate.disabled = state.phase !== "playing";
    });
    elements.shell.classList.remove("round-correct", "round-wrong");
  }

  function prepareRound() {
    state.round += 1;
    state.current = Engine.createRound(state.round, state.score);
    renderPreparedRound();
  }

  function launchPreparedRound() {
    if (state.phase !== "playing" || !state.current) return;
    const current = state.current;
    elements.prompt.textContent = state.score >= 100 ? "基因艙正在加速！趁寶寶還高快作答！" : "找出正確寶寶：分數越高，下降越快！";
    elements.grid.querySelectorAll(".candidate").forEach((candidate) => {
      candidate.disabled = false;
    });

    const token = state.token;
    // Start on the next frame so the resting candidates are painted before the
    // animation class and authoritative clock begin together.
    requestAnimationFrame(() => {
      if (token !== state.token || state.phase !== "playing") return;
      elements.grid.classList.add("animate-wave");
      state.deadline = performance.now() + current.duration;
      startJumpWindow(current, token);
    });
    announce(
      `第 ${state.round} 回合。${Engine.PALETTE[current.first].name}加${Engine.PALETTE[current.second].name}。`,
    );
  }

  function beginRound() {
    if (state.phase !== "playing") return;
    prepareRound();
    launchPreparedRound();
  }

  function chooseCandidate(colorId, button) {
    if (state.phase !== "playing" || state.paused || !state.current) return;
    // Capture time before locking input. The resolving phase prevents multi-
    // touch or rapid taps from scoring the same question more than once.
    const remaining = Math.max(0, state.deadline - performance.now());
    state.phase = "resolving";
    cancelAnimationFrame(state.frame);
    elements.grid.classList.remove("animate-wave");
    elements.grid.querySelectorAll(".candidate").forEach((candidate) => {
      candidate.disabled = true;
    });

    if (colorId === state.current.target) {
      state.combo += 1;
      const earned = Engine.calculateScore(state.current.duration, remaining);
      state.score += earned;
      if (state.score > state.best) state.best = state.score;
      updateHud();
      button.classList.add("correct");
      button.querySelector(".feedback-badge").textContent = "✓";
      elements.shell.classList.add("round-correct");
      elements.prompt.textContent = earned === 10 ? "完美判讀！最高點命中 10 分！" : `配對成功！下降位置獲得 ${earned} 分！`;
      elements.scorePop.textContent = `＋${earned}`;
      elements.scorePop.classList.remove("show");
      if (typeof elements.scorePop.animate === "function") {
        if (state.scoreAnimation) state.scoreAnimation.cancel();
        state.scoreAnimation = elements.scorePop.animate(
          [
            { opacity: 0, transform: "translate3d(-50%, 16%, 0) scale(0.75)" },
            { opacity: 1, transform: "translate3d(-50%, -35%, 0) scale(1.12)", offset: 0.3 },
            { opacity: 0, transform: "translate3d(-50%, -120%, 0) scale(1)" },
          ],
          { duration: 620, easing: "ease-out", fill: "both" },
        );
      } else {
        requestAnimationFrame(() => elements.scorePop.classList.add("show"));
      }
      playSound("correct");
      vibrate(25);
      announce(`答對，獲得 ${earned} 分。`);
      const token = state.token;
      window.setTimeout(() => {
        if (token !== state.token) return;
        state.phase = "playing";
        beginRound();
      }, 610);
    } else {
      button.classList.add("wrong");
      button.querySelector(".feedback-badge").textContent = "×";
      endGame("wrong");
    }
  }

  function endGame(reason) {
    if (!state.current || state.phase === "gameover") return;
    state.phase = "gameover";
    cancelAnimationFrame(state.frame);
    stopBgm();
    elements.grid.classList.remove("animate-wave");
    state.combo = 0;
    storage.write("duckGeneLab.best.v2", state.best);
    elements.grid.querySelectorAll(".candidate").forEach((candidate) => {
      candidate.disabled = true;
      if (Number(candidate.dataset.color) === state.current.target) {
        candidate.classList.add("answer");
        candidate.querySelector(".feedback-badge").textContent = "✓";
      }
    });
    elements.shell.classList.add("round-wrong");
    elements.prompt.textContent =
      reason === "timeout" ? "鴨寶寶落回實驗艙了！" : "基因判讀錯誤，這隻不是答案！";
    playSound("wrong");
    vibrate([45, 40, 70]);
    elements.finalScore.textContent = state.score.toLocaleString("zh-Hant");
    elements.finalRounds.textContent = String(Math.max(0, state.round - 1));
    elements.finalBest.textContent = state.best.toLocaleString("zh-Hant");
    elements.resultEyebrow.textContent =
      state.score === state.best && state.score > 0 ? "新的最佳紀錄！" : "這次差一點！";
    const token = state.token;
    window.setTimeout(() => {
      if (token !== state.token) return;
      setHidden(elements.gameOver, false);
      $("#retryButton").focus();
    }, 720);
  }

  function pauseGame() {
    if (state.phase !== "playing" || state.paused) return;
    state.paused = true;
    state.pausedAt = performance.now();
    cancelAnimationFrame(state.frame);
    stopBgm();
    elements.shell.classList.add("is-paused");
    setHidden(elements.pause, false);
    $("#resumeButton").focus();
  }

  function resumeGame() {
    if (!state.paused || state.phase !== "playing") return;
    state.deadline += performance.now() - state.pausedAt;
    state.paused = false;
    elements.shell.classList.remove("is-paused");
    setHidden(elements.pause, true);
    const current = state.current;
    const token = state.token;
    startBgm();
    startJumpWindow(current, token);
  }

  // One delegated pointer listener supports all candidate counts without
  // installing and removing per-button handlers on every round.
  elements.grid.addEventListener(
    "pointerdown",
    (event) => {
      const button = event.target.closest(".candidate");
      if (!button || button.disabled || !elements.grid.contains(button)) return;
      chooseCandidate(Number(button.dataset.color), button);
    },
    { passive: true },
  );

  $("#startButton").addEventListener("click", startGame);
  $("#retryButton").addEventListener("click", startGame);
  $("#menuButton").addEventListener("click", showMenu);
  $("#quitButton").addEventListener("click", showMenu);
  $("#rulesButton").addEventListener("click", () => {
    setHidden(elements.rules, false);
    $("#closeRulesButton").focus();
  });
  $("#closeRulesButton").addEventListener("click", () => setHidden(elements.rules, true));
  elements.pauseButton.addEventListener("click", pauseGame);
  $("#resumeButton").addEventListener("click", resumeGame);
  elements.sound.addEventListener("click", () => {
    state.sound = !state.sound;
    storage.write("duckFamilyMatch.sound", state.sound);
    updateSettings();
    if (state.sound) {
      playSound("correct");
      if (!state.paused && ["countdown", "playing", "resolving"].includes(state.phase)) startBgm();
    } else {
      stopBgm();
    }
  });
  elements.assist.addEventListener("click", () => {
    state.assist = !state.assist;
    storage.write("duckFamilyMatch.assist", state.assist);
    updateSettings();
  });
  $("#fullscreenButton").addEventListener("click", () => {
    const target = document.documentElement;
    if (!document.fullscreenElement && target.requestFullscreen) {
      target.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  });

  window.addEventListener("keydown", (event) => {
    if (/^[1-6]$/.test(event.key) && state.phase === "playing" && !state.paused) {
      const button = elements.grid.querySelectorAll(".candidate")[Number(event.key) - 1];
      if (button) chooseCandidate(Number(button.dataset.color), button);
    } else if (event.key === "Escape") {
      if (state.paused) resumeGame();
      else pauseGame();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("dragstart", (event) => event.preventDefault());

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // Offline support is progressive: registration failure is non-fatal and
    // online play remains available in restricted or private browser modes.
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=duck-gene-lab-r22").catch(() => {}));
  }

  // Retained for compatibility with the stopped Android wrapper. It is inert in
  // regular browsers and maps a legacy hardware-back call to web navigation.
  globalThis.handleDuckAndroidBack = () => {
    if (!elements.rules.classList.contains("hidden")) {
      setHidden(elements.rules, true);
      return true;
    }
    if (!elements.pause.classList.contains("hidden")) {
      resumeGame();
      return true;
    }
    if (!elements.gameOver.classList.contains("hidden")) {
      showMenu();
      return true;
    }
    if (state.phase === "playing") {
      pauseGame();
      return true;
    }
    if (state.phase === "countdown" || state.phase === "resolving") {
      showMenu();
      return true;
    }
    return false;
  };

  setSprite(elements.parentOne, 1);
  setSprite(elements.parentTwo, 0);
  updateHud();
  updateSettings();
})();
