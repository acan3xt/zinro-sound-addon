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

const ids = Object.keys(DEFAULTS);
const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const status = document.getElementById("status");
const timerVolumeValue = document.getElementById("timerVolumeValue");
const keywordVolumeValue = document.getElementById("keywordVolumeValue");
const maintenanceVolumeValue = document.getElementById("maintenanceVolumeValue");

function readValue(id) {
  const el = elements[id];
  if (el.type === "checkbox") return el.checked;
  if (el.type === "range") return Number(el.value);
  return el.value;
}

function updateVolumeLabels() {
  timerVolumeValue.textContent = `${elements.timerVolume.value}%`;
  maintenanceVolumeValue.textContent = `${elements.maintenanceVolume.value}%`;
  keywordVolumeValue.textContent = `${elements.keywordVolume.value}%`;
}

function flash(text) {
  status.textContent = text;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { status.textContent = ""; }, 1500);
}

async function save(id) {
  await chrome.storage.local.set({ [id]: readValue(id) });
  updateVolumeLabels();
  flash("保存しました");
}

chrome.storage.local.get(DEFAULTS, stored => {
  for (const id of ids) {
    const el = elements[id];
    const value = stored[id];
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value;
    el.addEventListener(el.type === "range" ? "input" : "change", () => save(id));
  }

  elements.daySeconds.addEventListener("input", () => save("daySeconds"));
  elements.voteSeconds.addEventListener("input", () => save("voteSeconds"));
  elements.nightSeconds.addEventListener("input", () => save("nightSeconds"));
  elements.keywords.addEventListener("input", () => save("keywords"));
  elements.selfName.addEventListener("input", () => save("selfName"));
  updateVolumeLabels();
});

async function testSound(kind) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    flash("zinro.net のタブを開いてください");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "test-sound", kind });
    flash("テスト再生しました");
  } catch (_err) {
    flash("zinro.net のゲーム画面で試してください");
  }
}

document.getElementById("testTimer").addEventListener("click", () => testSound("timer"));
document.getElementById("testMaintenance").addEventListener("click", () => testSound("maintenance"));
document.getElementById("testKeyword").addEventListener("click", () => testSound("keyword"));
