// ============================================================
//  Логика приложения: рендер программы, трекинг, анкета
//  Хранение — localStorage (на этом устройстве/браузере)
// ============================================================

const LS_PROGRESS = "gym.progress.v1";   // { "YYYY-MM-DD": { exId: {sets:[bool], weight, reps} } }
const LS_ANKETA   = "gym.anketa.v1";
const LS_LASTDAY  = "gym.lastday.v1";

// ---------- helpers ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// parse "4" or "3–4 круга" -> number of trackable sets (fallback 1)
function setCount(setsStr) {
  const m = String(setsStr).match(/\d+/);
  return m ? Math.min(parseInt(m[0], 10), 8) : 1;
}

let currentDay = load(LS_LASTDAY, PROGRAM.days[0].id);
let currentDate = todayISO();

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
function init() {
  $("#appTitle").textContent = PROGRAM.meta.title.startsWith("💪") ? PROGRAM.meta.title : "💪 " + PROGRAM.meta.title;
  $("#appSubtitle").textContent = PROGRAM.meta.subtitle;
  $("#metaNote").textContent = PROGRAM.meta.note;

  // main tabs
  $$("#mainTabs .tab").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));

  // date
  const dateInp = $("#trainDate");
  dateInp.value = currentDate;
  dateInp.addEventListener("change", () => { currentDate = dateInp.value || todayISO(); renderDay(); });

  $("#resetDay").addEventListener("click", resetDay);

  renderSchedule();
  renderDayTabs();
  renderDay();
  renderInfo();
  initAnketa();
}

// ============================================================
//  ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ============================================================
function switchView(view) {
  $$("#mainTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
}

// ============================================================
//  РАСПИСАНИЕ НЕДЕЛИ
// ============================================================
function renderSchedule() {
  const strip = $("#scheduleStrip");
  strip.innerHTML = "";
  PROGRAM.schedule.forEach(s => {
    const day = PROGRAM.days.find(d => d.id === s.id);
    const isRest = !day;
    const el = document.createElement("div");
    el.className = "sch-item" + (isRest ? " rest" : "");
    el.innerHTML = `<div class="d">${s.day}</div><div class="n">${isRest ? "😴" : day.emoji}</div>`;
    el.title = isRest ? (s.label || "Отдых") : day.name;
    if (!isRest) {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => { currentDay = day.id; save(LS_LASTDAY, currentDay); renderDayTabs(); renderDay(); switchView("program"); });
    }
    strip.appendChild(el);
  });
}

// ============================================================
//  ВКЛАДКИ ДНЕЙ
// ============================================================
function renderDayTabs() {
  const box = $("#dayTabs");
  box.innerHTML = "";
  PROGRAM.days.forEach(d => {
    const el = document.createElement("div");
    el.className = "daytab" + (d.id === currentDay ? " active" : "");
    el.innerHTML = `<span class="emo">${d.emoji}</span>${d.name}`;
    el.addEventListener("click", () => { currentDay = d.id; save(LS_LASTDAY, currentDay); renderDayTabs(); renderDay(); });
    box.appendChild(el);
  });
}

// ============================================================
//  РЕНДЕР ДНЯ + ТРЕКИНГ
// ============================================================
function exId(dayId, blockIdx, exIdx) { return `${dayId}.${blockIdx}.${exIdx}`; }

function getDayData() {
  const all = load(LS_PROGRESS, {});
  return all[currentDate] || {};
}
function setExState(id, state) {
  const all = load(LS_PROGRESS, {});
  all[currentDate] = all[currentDate] || {};
  all[currentDate][id] = state;
  save(LS_PROGRESS, all);
}

function renderDay() {
  const day = PROGRAM.days.find(d => d.id === currentDay);
  const cont = $("#dayContent");
  cont.innerHTML = "";

  const focus = document.createElement("div");
  focus.className = "day-focus";
  focus.textContent = day.focus;
  cont.appendChild(focus);

  const dayState = getDayData();

  day.blocks.forEach((block, bi) => {
    const bt = document.createElement("div");
    bt.className = "block-title";
    bt.textContent = block.title;
    cont.appendChild(bt);

    block.exercises.forEach((ex, ei) => {
      const id = exId(day.id, bi, ei);
      const n = setCount(ex.sets);
      const st = dayState[id] || { sets: Array(n).fill(false), weight: "", reps: "" };
      if (st.sets.length !== n) st.sets = Array(n).fill(false).map((_, i) => st.sets[i] || false);

      const allDone = st.sets.every(Boolean);

      const card = document.createElement("div");
      card.className = "ex" + (allDone ? " done" : "");
      card.innerHTML = `
        <div class="ex-head">
          <div class="ex-name">${ex.name}</div>
        </div>
        <div class="ex-meta">
          <span class="pill sets">${ex.sets} × ${ex.reps}</span>
          <span class="pill int">${ex.intensity}</span>
        </div>
        ${ex.note ? `<div class="ex-note">${ex.note}</div>` : ""}
        <div class="sets-row"></div>
        <div class="log-row">
          <input type="text" placeholder="вес / уровень" value="${st.weight || ""}" data-field="weight">
          <input type="text" placeholder="факт. повторы" value="${st.reps || ""}" data-field="reps">
        </div>`;

      const setsRow = $(".sets-row", card);
      st.sets.forEach((on, si) => {
        const dot = document.createElement("div");
        dot.className = "set-dot" + (on ? " on" : "");
        dot.textContent = si + 1;
        dot.addEventListener("click", () => {
          st.sets[si] = !st.sets[si];
          setExState(id, st);
          renderDay();        // re-render to update done-state + progress
        });
        setsRow.appendChild(dot);
      });

      $$(".log-row input", card).forEach(inp => {
        inp.addEventListener("change", () => {
          st[inp.dataset.field] = inp.value;
          setExState(id, st);
        });
      });

      cont.appendChild(card);
    });
  });

  updateProgress(day, dayState);
}

function updateProgress(day, dayState) {
  let total = 0, done = 0;
  day.blocks.forEach((block, bi) => block.exercises.forEach((ex, ei) => {
    const id = exId(day.id, bi, ei);
    const n = setCount(ex.sets);
    const st = dayState[id];
    total += n;
    if (st) done += st.sets.filter(Boolean).length;
  }));
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("#dayProgressBar").style.width = pct + "%";
  $("#dayProgressPct").textContent = pct + "%";
  $("#dayProgressLabel").textContent = `Прогресс дня · ${done}/${total} подходов`;
}

function resetDay() {
  if (!confirm("Сбросить отметки за эту дату для текущего дня?")) return;
  const all = load(LS_PROGRESS, {});
  if (all[currentDate]) {
    Object.keys(all[currentDate]).forEach(k => { if (k.startsWith(currentDay + ".")) delete all[currentDate][k]; });
    save(LS_PROGRESS, all);
  }
  renderDay();
}

// ============================================================
//  ИНФО: прогрессия + питание
// ============================================================
function renderInfo() {
  const tl = $("#progressionList");
  tl.innerHTML = PROGRAM.progression.map(p =>
    `<div class="tl-item"><div class="w">${p.weeks}</div><div class="t">${p.title}</div><div class="d">${p.desc}</div></div>`
  ).join("");

  const nu = $("#nutritionList");
  nu.innerHTML = PROGRAM.nutrition.map(n =>
    `<div class="nutri-item"><div class="ic">${n.icon}</div><div><div class="t">${n.title}</div><div class="d">${n.desc}</div></div></div>`
  ).join("");
}

// ============================================================
//  АНКЕТА УРОВНЯ
// ============================================================
const LEVELS = {
  pushups: [[0, 15, "Новичок", "beg"], [16, 30, "Средний", "mid"], [31, 999, "Продвинутый", "adv"]],
  squats:  [[0, 25, "Новичок", "beg"], [26, 50, "Средний", "mid"], [51, 999, "Продвинутый", "adv"]],
  pullups: [[0, 5, "Новичок", "beg"], [6, 12, "Средний", "mid"], [13, 999, "Продвинутый", "adv"]],
  plank:   [[0, 45, "Новичок", "beg"], [46, 90, "Средний", "mid"], [91, 999, "Продвинутый", "adv"]]
};
const LABELS = { pushups: "Отжимания", squats: "Приседания", pullups: "Подтягивания", plank: "Планка, сек" };

function levelOf(metric, val) {
  if (val === "" || val == null || isNaN(val)) return null;
  const v = +val;
  for (const [lo, hi, name, cls] of LEVELS[metric]) if (v >= lo && v <= hi) return { name, cls };
  return null;
}

function initAnketa() {
  const form = $("#anketaForm");
  const saved = load(LS_ANKETA, null);
  if (saved) {
    ["pushups", "squats", "pullups", "plank", "weight"].forEach(f => { if (saved[f] != null) form[f].value = saved[f]; });
    $$("input[name=like]", form).forEach(c => c.checked = (saved.like || []).includes(c.value));
    $$("input[name=dislike]", form).forEach(c => c.checked = (saved.dislike || []).includes(c.value));
    showAnketaResult(saved);
  }
  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = {
      pushups: form.pushups.value, squats: form.squats.value,
      pullups: form.pullups.value, plank: form.plank.value, weight: form.weight.value,
      like: $$("input[name=like]:checked", form).map(c => c.value),
      dislike: $$("input[name=dislike]:checked", form).map(c => c.value)
    };
    save(LS_ANKETA, data);
    showAnketaResult(data);
    $("#anketaResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function showAnketaResult(d) {
  const box = $("#anketaResult");
  box.classList.remove("hidden");

  const metrics = ["pushups", "squats", "pullups", "plank"];
  const scores = metrics.map(m => ({ m, val: d[m], lvl: levelOf(m, d[m]) })).filter(s => s.lvl);

  // overall level = mode-ish: average index
  const idxMap = { beg: 0, mid: 1, adv: 2 };
  let overall = "Средний";
  if (scores.length) {
    const avg = scores.reduce((a, s) => a + idxMap[s.lvl.cls], 0) / scores.length;
    overall = avg < 0.67 ? "Новичок" : avg < 1.34 ? "Средний" : "Продвинутый";
  }

  const grid = scores.map(s =>
    `<div class="score-item"><div class="lab">${LABELS[s.m]}</div><div class="val">${s.val}</div><div class="lvl ${s.lvl.cls}">${s.lvl.name}</div></div>`
  ).join("");

  // recommendations
  const recs = [];
  const pu = levelOf("pullups", d.pullups);
  if (pu && pu.cls === "beg") recs.push("Подтягивания слабое звено — в день «Грудь+Спина» делай тягу верхнего блока и гравитрон, каждую неделю чуть снижай помощь.");
  const push = levelOf("pushups", d.pushups);
  if (push && push.cls === "beg") recs.push("Жимовая сила низкая — в жиме лёжа держись объёма (8–10 повт.), не гонись за весом раньше времени.");
  if ((d.like || []).length) recs.push(`Любимые группы (${(d.like || []).join(", ")}) уже получают повышенный объём в программе — продолжай.`);
  if ((d.dislike || []).includes("Колени") || (d.dislike || []).includes("Приседания")) recs.push("Колени/приседы исключены: в день ног — жим ногами с мягкой амплитудой, румынка и сгибания. Без боли в коленях.");
  if (d.weight) recs.push(`Белок-ориентир ≈ ${Math.round(d.weight * 1.8)} г/день (1.8 г/кг) для сохранения мышц при лёгкой сушке.`);
  recs.push("Перепройди анкету в конце лета и сравни цифры — это твой главный показатель прогресса.");

  box.innerHTML = `
    <h2>Твой уровень</h2>
    <span class="level-badge">${overall}</span>
    <div class="score-grid">${grid || '<span class="muted">Заполни хотя бы одно поле теста.</span>'}</div>
    <h2 style="font-size:15px;margin-top:6px">Рекомендации</h2>
    <ul class="recs">${recs.map(r => `<li>${r}</li>`).join("")}</ul>`;
}

// ---------- GO ----------
init();
