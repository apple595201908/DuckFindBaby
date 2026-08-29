(function startDashboard() {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const loginView = $("#loginView");
  const dashboardView = $("#dashboardView");
  const rangeSelect = $("#rangeSelect");
  const reasonLabels = {
    wrong: "選錯答案",
    timeout: "作答逾時",
    quit: "中途離開",
    page_exit: "關閉頁面",
    restarted: "重新開始",
    unknown: "未知",
  };

  function setHidden(element, hidden) {
    element.classList.toggle("hidden", hidden);
  }

  function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat("zh-Hant", { maximumFractionDigits }).format(Number(value || 0));
  }

  function formatPercent(value) {
    return `${formatNumber(Number(value || 0) * 100, 1)}%`;
  }

  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
    const hours = Math.floor(minutes / 60);
    return `${hours} 小時 ${minutes % 60} 分`;
  }

  function localTime(value) {
    return new Intl.DateTimeFormat("zh-Hant", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  async function api(url, options) {
    const response = await fetch(url, {
      ...options,
      headers: { "content-type": "application/json", ...(options?.headers || {}) },
    });
    if (response.status === 401) {
      showLogin();
      const error = new Error("請重新登入。");
      error.unauthorized = true;
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "無法讀取資料，請稍後再試。");
    return body;
  }

  function showLogin() {
    setHidden(loginView, false);
    setHidden(dashboardView, true);
    $("#password").focus();
  }

  function showDashboard() {
    setHidden(loginView, true);
    setHidden(dashboardView, false);
  }

  function showError(message = "") {
    const banner = $("#errorBanner");
    banner.textContent = message;
    setHidden(banner, !message);
  }

  function renderBreakdown(selector, rows, labelTransform = (value) => value) {
    const container = $(selector);
    container.replaceChildren();
    const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
    if (!rows.length || rows.every((row) => Number(row.count) === 0)) {
      const empty = document.createElement("div");
      empty.className = "empty-chart";
      empty.textContent = "尚無資料";
      container.append(empty);
      return;
    }
    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "breakdown-item";
      const label = document.createElement("span");
      label.textContent = labelTransform(row.label);
      label.title = label.textContent;
      const count = document.createElement("strong");
      count.textContent = formatNumber(row.count);
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${Math.max(2, (Number(row.count || 0) / max) * 100)}%`;
      track.append(fill);
      item.append(label, count, track);
      container.append(item);
    }
  }

  function renderScoreDistribution(rows) {
    const container = $("#scoreDistribution");
    container.replaceChildren();
    const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
    for (const row of rows) {
      const bar = document.createElement("div");
      bar.className = "vertical-bar";
      const count = document.createElement("strong");
      count.textContent = formatNumber(row.count);
      const track = document.createElement("div");
      track.className = "vertical-bar-track";
      const fill = document.createElement("div");
      fill.className = "vertical-bar-fill";
      fill.style.height = `${Math.max(2, (Number(row.count || 0) / max) * 100)}%`;
      track.append(fill);
      const label = document.createElement("span");
      label.textContent = row.label;
      bar.append(count, track, label);
      container.append(bar);
    }
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function renderTrend(rows) {
    const container = $("#trendChart");
    container.replaceChildren();
    if (!rows.length || rows.every((row) => !row.visitors && !row.gameplays)) {
      const empty = document.createElement("div");
      empty.className = "empty-chart";
      empty.textContent = "尚無趨勢資料";
      container.append(empty);
      return;
    }
    const width = 760;
    const height = 240;
    const padding = { left: 35, right: 12, top: 12, bottom: 28 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const max = Math.max(1, ...rows.flatMap((row) => [Number(row.visitors || 0), Number(row.gameplays || 0)]));
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "每日玩家及遊玩次數折線圖" });
    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (plotHeight / 4) * index;
      svg.append(svgElement("line", { x1: padding.left, x2: width - padding.right, y1: y, y2: y, class: "grid-line" }));
      const label = svgElement("text", { x: 2, y: y + 3, class: "axis-label" });
      label.textContent = String(Math.round(max * (1 - index / 4)));
      svg.append(label);
    }
    const point = (row, index, field) => {
      const x = padding.left + (rows.length === 1 ? plotWidth / 2 : (plotWidth * index) / (rows.length - 1));
      const y = padding.top + plotHeight - (Number(row[field] || 0) / max) * plotHeight;
      return { x, y };
    };
    for (const field of ["visitors", "gameplays"]) {
      const points = rows.map((row, index) => point(row, index, field));
      svg.append(svgElement("polyline", {
        points: points.map(({ x, y }) => `${x},${y}`).join(" "),
        class: field === "visitors" ? "trend-line-visitors" : "trend-line-games",
      }));
      const step = Math.max(1, Math.ceil(rows.length / 14));
      points.forEach(({ x, y }, index) => {
        if (index % step === 0 || index === points.length - 1) {
          svg.append(svgElement("circle", {
            cx: x, cy: y, r: 2.7,
            class: field === "visitors" ? "trend-dot-visitors" : "trend-dot-games",
          }));
        }
      });
    }
    const labelStep = Math.max(1, Math.ceil(rows.length / 7));
    rows.forEach((row, index) => {
      if (index % labelStep !== 0 && index !== rows.length - 1) return;
      const { x } = point(row, index, "visitors");
      const label = svgElement("text", { x, y: height - 7, "text-anchor": "middle", class: "axis-label" });
      label.textContent = row.date.slice(5).replace("-", "/");
      svg.append(label);
    });
    container.append(svg);
  }

  function renderSessions(rows) {
    const body = $("#sessionsBody");
    body.replaceChildren();
    setHidden($("#sessionsEmpty"), rows.length > 0);
    for (const row of rows) {
      const tr = document.createElement("tr");
      const values = [
        { text: localTime(row.started_at) },
        { text: row.visitor_id },
        { text: row.device_type, className: "device-pill" },
        { text: `${row.os} · ${row.browser}` },
        { text: formatDuration(row.active_ms) },
        { text: formatNumber(row.gameplays) },
        { text: formatNumber(row.high_score), tdClass: "score" },
        { text: formatNumber(row.visit_number) },
      ];
      for (const value of values) {
        const td = document.createElement("td");
        if (value.tdClass) td.className = value.tdClass;
        if (value.className) {
          const span = document.createElement("span");
          span.className = value.className;
          span.textContent = value.text;
          td.append(span);
        } else {
          td.textContent = value.text;
        }
        tr.append(td);
      }
      body.append(tr);
    }
  }

  function render(data) {
    const summary = data.summary;
    $("#metricVisitors").textContent = formatNumber(summary.uniqueVisitors);
    $("#metricVisitorsHint").textContent = `回訪玩家 ${formatNumber(summary.returningVisitors)} · ${formatPercent(summary.repeatVisitorRate)}`;
    $("#metricGameplays").textContent = formatNumber(summary.gameplays);
    $("#metricGameplaysHint").textContent = `重玩率 ${formatPercent(summary.replayRate)} · ${formatNumber(summary.sessions)} 個工作階段`;
    $("#metricAverageScore").textContent = formatNumber(summary.averageScore, 1);
    $("#metricScoreHint").textContent = `最高 ${formatNumber(summary.highScore)} · 平均過 ${formatNumber(summary.averageRounds, 1)} 題`;
    $("#metricActiveTime").textContent = formatDuration(summary.averageActiveMs);
    $("#metricActiveHint").textContent = `總活躍 ${formatDuration(summary.totalActiveMs)}`;
    $("#lastUpdated").textContent = `更新於 ${localTime(data.generatedAt)} · 共 ${formatNumber(summary.completedGameplays)} 局正常結束`;
    $("#timezoneLabel").textContent = `日趨勢時區：${data.reportTimezone}`;
    renderTrend(data.trends);
    renderScoreDistribution(data.scoreDistribution);
    renderBreakdown("#deviceBreakdown", data.devices);
    renderBreakdown("#osBreakdown", data.operatingSystems);
    renderBreakdown("#browserBreakdown", data.browsers);
    renderBreakdown("#visitorFrequency", data.visitorFrequency);
    renderBreakdown("#endReasons", data.endReasons, (value) => reasonLabels[value] || value);
    renderBreakdown("#referrerBreakdown", data.referrers);
    renderSessions(data.recentSessions);
  }

  async function loadDashboard() {
    const button = $("#refreshButton");
    button.disabled = true;
    button.textContent = "讀取中…";
    showError();
    try {
      const data = await api(`/api/admin/summary?range=${encodeURIComponent(rangeSelect.value)}`);
      render(data);
    } catch (error) {
      if (!error.unauthorized) showError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "重新整理";
    }
  }

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#loginButton");
    const errorElement = $("#loginError");
    button.disabled = true;
    button.textContent = "驗證中…";
    errorElement.textContent = "";
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: $("#password").value }),
      });
      $("#password").value = "";
      showDashboard();
      await loadDashboard();
    } catch (error) {
      errorElement.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "進入後台";
    }
  });

  $("#logoutButton").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    showLogin();
  });
  $("#refreshButton").addEventListener("click", loadDashboard);
  rangeSelect.addEventListener("change", loadDashboard);
  $("#exportButton").addEventListener("click", () => {
    location.href = `/api/admin/export.csv?range=${encodeURIComponent(rangeSelect.value)}`;
  });

  api("/api/admin/session")
    .then(() => {
      showDashboard();
      return loadDashboard();
    })
    .catch((error) => {
      if (!error.unauthorized) $("#loginError").textContent = error.message;
    });
})();
