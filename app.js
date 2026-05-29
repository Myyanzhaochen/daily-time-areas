const categories = [
  { id: "sleep", label: "Sleep", group: "Life Necessary", mode: "Resilient Mode", color: "#8cc653" },
  { id: "cleaning", label: "Morning and Night Cleaning", group: "Life Necessary", mode: "Resilient Mode", color: "#ef3d2f" },
  { id: "cooking", label: "Cooking, Washing and Laundry", group: "Life Necessary", mode: "Resilient Mode", color: "#f4eb45" },
  { id: "rest-planned", label: "Fun, Rest and Expected Life", group: "Life Necessary", mode: "Diffuse Mode", color: "#bf67f0" },
  { id: "rest-unplanned", label: "Unscheduled Fun or Rest", group: "Life Necessary", mode: "Diffuse Mode", color: "#d766e8" },
  { id: "social", label: "Social, Media or Environment", group: "Life Necessary", mode: "Diffuse Mode", color: "#d991f2" },
  { id: "deep-work", label: "Important and Urgent 80%", group: "Life Improvement", mode: "Focused Mode", color: "#55b5df" },
  { id: "important-not-urgent", label: "Important but Not Urgent 20%", group: "Life Improvement", mode: "Focused Mode", color: "#3d9bd9" },
  { id: "learning", label: "Learning, Gym or Growth", group: "Life Improvement", mode: "Focused Mode", color: "#35aee2" },
];

const storagePrefix = "daily-time-areas";
let activeDate = todayKey();
let records = [];
let timer = {
  running: false,
  startedAt: null,
  elapsedBeforePause: 0,
};

const els = {
  activeDate: document.querySelector("#active-date"),
  category: document.querySelector("#category"),
  timerCategory: document.querySelector("#timer-category"),
  form: document.querySelector("#entry-form"),
  startTime: document.querySelector("#start-time"),
  endTime: document.querySelector("#end-time"),
  note: document.querySelector("#note"),
  clearForm: document.querySelector("#clear-form"),
  trackedTotal: document.querySelector("#tracked-total"),
  untrackedTotal: document.querySelector("#untracked-total"),
  mainArea: document.querySelector("#main-area"),
  categoryBars: document.querySelector("#category-bars"),
  records: document.querySelector("#records"),
  recordTemplate: document.querySelector("#record-template"),
  clearDay: document.querySelector("#clear-day"),
  exportCsv: document.querySelector("#export-csv"),
  timerDisplay: document.querySelector("#timer-display"),
  timerStatus: document.querySelector("#timer-status"),
  timerToggle: document.querySelector("#timer-toggle"),
  timerSave: document.querySelector("#timer-save"),
};

function init() {
  activeDate = todayKey();
  els.activeDate.value = activeDate;
  populateCategorySelects();
  setDefaultTimes();
  loadDay();
  bindEvents();
  render();
  window.setInterval(updateTimerDisplay, 1000);
}

function populateCategorySelects() {
  const grouped = categories.reduce((result, category) => {
    result[category.group] = result[category.group] || [];
    result[category.group].push(category);
    return result;
  }, {});

  [els.category, els.timerCategory].forEach((select) => {
    select.innerHTML = "";
    Object.entries(grouped).forEach(([group, items]) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group;
      items.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = `${category.label} · ${category.mode}`;
        optgroup.append(option);
      });
      select.append(optgroup);
    });
  });
}

function bindEvents() {
  els.activeDate.addEventListener("change", () => {
    activeDate = els.activeDate.value || todayKey();
    loadDay();
    render();
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    addManualRecord();
  });

  els.clearForm.addEventListener("click", () => {
    els.note.value = "";
    setDefaultTimes();
  });

  els.clearDay.addEventListener("click", () => {
    if (!records.length) return;
    const confirmed = window.confirm("Clear all records for this day?");
    if (!confirmed) return;
    records = [];
    saveDay();
    render();
  });

  els.exportCsv.addEventListener("click", exportCsv);
  els.timerToggle.addEventListener("click", toggleTimer);
  els.timerSave.addEventListener("click", saveTimerRecord);
}

function addManualRecord() {
  const start = timeToMinutes(els.startTime.value);
  const end = timeToMinutes(els.endTime.value);
  const duration = durationBetween(start, end);

  if (duration <= 0) {
    window.alert("Please choose a valid time range.");
    return;
  }

  records.push({
    id: crypto.randomUUID(),
    categoryId: els.category.value,
    start: els.startTime.value,
    end: els.endTime.value,
    duration,
    note: els.note.value.trim(),
    createdAt: new Date().toISOString(),
  });

  saveDay();
  els.note.value = "";
  setDefaultTimes(els.endTime.value);
  render();
}

function toggleTimer() {
  if (timer.running) {
    timer.elapsedBeforePause += Date.now() - timer.startedAt;
    timer.running = false;
    timer.startedAt = null;
    els.timerToggle.textContent = "Resume";
    els.timerSave.disabled = timer.elapsedBeforePause < 60000;
    els.timerStatus.textContent = "Paused";
    updateTimerDisplay();
    return;
  }

  timer.running = true;
  timer.startedAt = Date.now();
  els.timerToggle.textContent = "Pause";
  els.timerSave.disabled = true;
  els.timerStatus.textContent = "Tracking";
  updateTimerDisplay();
}

function saveTimerRecord() {
  const elapsedMs = currentTimerMs();
  const duration = Math.max(1, Math.round(elapsedMs / 60000));
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - duration * 60000);

  records.push({
    id: crypto.randomUUID(),
    categoryId: els.timerCategory.value,
    start: toTimeInput(startDate),
    end: toTimeInput(endDate),
    duration,
    note: "Live timer",
    createdAt: new Date().toISOString(),
  });

  timer = { running: false, startedAt: null, elapsedBeforePause: 0 };
  els.timerToggle.textContent = "Start";
  els.timerSave.disabled = true;
  els.timerStatus.textContent = "Saved";
  saveDay();
  render();
  updateTimerDisplay();
}

function render() {
  records.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  renderSummary();
  renderBars();
  renderRecords();
}

function renderSummary() {
  const tracked = records.reduce((sum, record) => sum + record.duration, 0);
  const totals = totalsByCategory();
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];

  els.trackedTotal.textContent = formatDuration(tracked);
  els.untrackedTotal.textContent = formatDuration(Math.max(0, 1440 - tracked));
  els.mainArea.textContent = top ? categoryById(top[0]).label : "No data";
}

function renderBars() {
  const totals = totalsByCategory();
  const max = Math.max(60, ...Object.values(totals));
  els.categoryBars.innerHTML = "";

  categories.forEach((category) => {
    const minutes = totals[category.id] || 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label">
        <span>${category.label}</span>
        <span>${formatDuration(minutes)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${(minutes / max) * 100}%; background: ${category.color};"></div>
      </div>
    `;
    els.categoryBars.append(row);
  });
}

function renderRecords() {
  els.records.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No records yet for this day.";
    els.records.append(empty);
    return;
  }

  records.forEach((record) => {
    const category = categoryById(record.categoryId);
    const node = els.recordTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".record-color").style.background = category.color;
    node.querySelector(".record-title").textContent = category.label;
    node.querySelector(".record-duration").textContent = formatDuration(record.duration);
    node.querySelector(".record-meta").textContent = `${record.start} to ${record.end} · ${category.group} · ${record.note || "No note"}`;
    node.querySelector(".delete-record").addEventListener("click", () => {
      records = records.filter((item) => item.id !== record.id);
      saveDay();
      render();
    });
    els.records.append(node);
  });
}

function totalsByCategory() {
  return records.reduce((result, record) => {
    result[record.categoryId] = (result[record.categoryId] || 0) + record.duration;
    return result;
  }, {});
}

function exportCsv() {
  const rows = [
    ["Date", "Category", "Group", "Mode", "Start", "End", "Minutes", "Hours", "Note"],
    ...records.map((record) => {
      const category = categoryById(record.categoryId);
      return [
        activeDate,
        category.label,
        category.group,
        category.mode,
        record.start,
        record.end,
        record.duration,
        (record.duration / 60).toFixed(2),
        record.note,
      ];
    }),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `time-areas-${activeDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function loadDay() {
  const raw = localStorage.getItem(storageKey());
  records = raw ? JSON.parse(raw) : [];
}

function saveDay() {
  localStorage.setItem(storageKey(), JSON.stringify(records));
}

function storageKey() {
  return `${storagePrefix}:${activeDate}`;
}

function categoryById(id) {
  return categories.find((category) => category.id === id) || categories[0];
}

function todayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultTimes(startValue) {
  const now = new Date();
  const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * 15 * 60000);
  const start = startValue || toTimeInput(new Date(rounded.getTime() - 60 * 60000));
  const endMinutes = (timeToMinutes(start) + 60) % 1440;
  els.startTime.value = start;
  els.endTime.value = minutesToTime(endMinutes);
}

function toTimeInput(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function durationBetween(start, end) {
  return end >= start ? end - start : 1440 - start + end;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function currentTimerMs() {
  return timer.elapsedBeforePause + (timer.running ? Date.now() - timer.startedAt : 0);
}

function updateTimerDisplay() {
  const totalSeconds = Math.floor(currentTimerMs() / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  els.timerDisplay.textContent = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");

  if (timer.running) {
    els.timerSave.disabled = true;
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
