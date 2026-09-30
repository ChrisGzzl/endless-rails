"use strict";
// Dialog controllers for the canvas interface (port of the former DOM
// settings.js, display.js, gm.js and cloud-ui.js): sound settings, the
// fullscreen / install / display-help flow, the GM debug panel and the
// test-save sheet. Rules and texts are unchanged; browser-only services go
// through app/platform.js so the module also evaluates without a document.

import { state, gameAudio, level, effects, syncSwarm, longterm, metaStorage, runRecord } from "./engine.js";
import { draw } from "../view/render.js";
import { gamePlatform } from "./platform.js";

const dialogCtl = (() => {
  let hub = null; // host services (see canvas-host.js)
  function changed() { hub?.invalidate(); }

  // -- sound settings -------------------------------------------------------------------------------

  let settingsOpen = false, settingsReturnFocus = null, settingsPreviousPause = false;
  function soundState() {
    const prefs = gameAudio?.getPreferences() || { music: false, sfx: false };
    return {
      music: !!prefs.music, sfx: !!prefs.sfx, disabled: !gameAudio?.supported,
      note: gameAudio?.supported ? "设置自动保存 · 切到后台时静音" : "当前浏览器暂不支持音频，游戏可继续运行。",
    };
  }
  function openSettings(e) {
    if (settingsOpen) return;
    settingsReturnFocus = hub.focusedKey(); settingsPreviousPause = state.paused;
    settingsOpen = true; state.paused = true; hub.run.resetJoystick(); gameAudio?.tick(state.mode, true);
    hub.focus(soundState().disabled ? "closeSettingsButton" : "musicToggle", !!e?.keyboard || hub.keyboardMode());
    changed();
  }
  function closeSettings() {
    if (!settingsOpen) return;
    settingsOpen = false; state.paused = settingsPreviousPause;
    gameAudio?.tick(state.mode, state.paused); hub.run.updateHud();
    if (settingsReturnFocus) hub.focus(settingsReturnFocus); else hub.blur();
    changed();
  }
  function toggleSound(key) {
    if (!gameAudio) return;
    const enabled = !gameAudio.getPreferences()[key]; gameAudio.setPreference(key, enabled); changed();
    if (enabled) gameAudio.unlock().then(() => { if (key === "sfx") gameAudio.play("ui"); });
  }
  function settingsModel() { return { ...soundState(), on: { sound: toggleSound, close: closeSettings } }; }
  function settingsKey(e) {
    if (e.code === "Escape") { closeSettings(); return true; }
    if (e.code === "Tab") {
      const s = soundState();
      const controls = ["musicToggle", "sfxToggle", "closeSettingsButton"].filter(k => !(s.disabled && k !== "closeSettingsButton"));
      const index = controls.indexOf(hub.focusedKey()), next = (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
      hub.focus(controls[next], true);
      return true;
    }
    return false;
  }

  // -- display: fullscreen, install, help ----------------------------------------------------------------

  let helpOpen = false, helpText = "", helpReturnFocus = null;
  function display() {
    const full = gamePlatform.isFullscreen(), standalone = gamePlatform.standalone();
    const text = full ? "退出全屏" : standalone ? "已独立运行" : "全屏游玩";
    const label = full ? "退出全屏" : standalone ? "已独立运行" : "进入全屏";
    const disabled = standalone && !full;
    return { full, standalone, immersive: full || standalone, pause: { text, label, disabled }, start: { text, label, disabled }, game: { text: "⛶", label, disabled }, installHidden: standalone };
  }
  function updateDisplay() {
    hub.displayChanged();
    if (state.paused) hub.run.renderPause();
    changed();
  }
  function showDisplayHelp() {
    helpReturnFocus = hub.focusedKey();
    if (!state.paused && ["combat", "docking"].includes(state.mode)) hub.run.togglePause();
    helpText = gamePlatform.isApple() ? "在 Safari 打开此页面 → 分享 → 添加到主屏幕；如果出现“作为 Web App 打开”，请保持开启。" : "当前浏览器未提供全屏或安装入口。请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”；内置浏览器可先选择在系统浏览器打开。";
    helpOpen = true; hub.focus("closeDisplayHelp", hub.keyboardMode()); changed();
  }
  function closeDisplayHelp() {
    helpOpen = false;
    if (helpReturnFocus) hub.focus(helpReturnFocus); else hub.blur();
    changed();
  }
  async function toggleFullscreen() {
    try {
      if (gamePlatform.isFullscreen()) await gamePlatform.exitFullscreen();
      else if (!gamePlatform.standalone()) {
        if (!gamePlatform.fullscreenSupported()) { showDisplayHelp(); return; }
        await gamePlatform.requestFullscreen();
      }
      updateDisplay();
    } catch { showDisplayHelp(); }
  }
  async function installGame() {
    if (!gamePlatform.hasInstallOffer()) { showDisplayHelp(); return; }
    try { await gamePlatform.install(); } catch { showDisplayHelp(); }
  }
  function helpModel() { return { text: helpText, on: { close: closeDisplayHelp } }; }
  function helpKey(e) {
    if (e.code === "Escape") { closeDisplayHelp(); return true; }
    if (e.code === "Tab") { hub.focus("closeDisplayHelp", true); return true; }
    return false;
  }

  // -- GM debug panel -------------------------------------------------------------------------------------

  // v0.10 (需求 §26.3): GM can set train level, research levels and resources
  // for verification. Changes persist to the save; combat stats freeze at the
  // next departure, matching the run-snapshot rule.
  let gmOpen = false, gmPreviousPause = false;
  function setGMMeta(key, value) {
    const next = longterm.normalizeMeta(state.metaProfile);
    if (key === "trainLevel") {
      const lv = Math.max(1, Math.min(longterm.MAX_TRAIN_LEVEL, Math.floor(Number(value) || 1)));
      next.train.level = lv;
    } else if (key === "resources") {
      const [scrap, components, data] = String(value).split(/[,\s]+/).map(n => Math.max(0, Math.floor(Number(n) || 0)));
      next.resources = { scrap: scrap || 0, components: components || 0, data: data || 0 };
    } else if (longterm.RESEARCH_IDS.includes(key)) {
      next.research[key] = Math.max(0, Math.min(longterm.MAX_RESEARCH_LEVEL, Math.floor(Number(value) || 0)));
    } else return;
    state.metaProfile = longterm.normalizeMeta(next);
    longterm.saveMeta(metaStorage, state.metaProfile);
    hub.home.refresh();
  }
  // GM values are actual displayed drone levels. Zero undeploys a specialist.
  function setGMDroneLevel(id, value) {
    const n = Math.max(0, Math.min(30, Math.floor(Number(value) || 0)));
    if (id === "gun" || id === "rapid") {
      state.modules.rapid = Math.max(0, n - 1);
      if (n === 0) state.modules.gunDisabled = 1; else delete state.modules.gunDisabled;
      id = "gun";
    } else if (id === "wingman") { state.modules.wingman = Math.min(3, n); }
    else if (effects.DRONE_TYPES.some(d => d.id === id)) state.modules[id] = n; else return;
    // A GM edit applies to existing projectiles immediately rather than leaving old test attacks alive.
    state.shots = state.shots.filter(s => s.owner !== id && !s.bondId);
    state.zones = state.zones.filter(s => s.owner !== id && !s.bondId);
    state.weaponFx = []; state.weaponClocks[id] = 0; state.weaponClocks.command = 0;
    syncSwarm(); hub.run.updateHud(); if (hub.run.pauseVisible) hub.run.renderPause();
    draw();
  }
  function gmControls() {
    const m = state.metaProfile;
    return [
      ...effects.DRONE_TYPES.map(d => ({ key: "drone-" + d.id, kind: "drone", id: d.id, label: effects.droneLabel(d.id), aria: d.name + "等级", value: effects.droneLevel(state.modules, d.id) })),
      { key: "drone-wingman", kind: "drone", id: "wingman", label: "雨燕僚机数量", aria: "僚机数量", value: level("wingman") },
      { key: "meta-trainLevel", kind: "meta", id: "trainLevel", label: "列车等级", aria: "GM 列车等级", value: m.train.level },
      ...longterm.RESEARCH_IDS.map(id => ({ key: "meta-" + id, kind: "meta", id, label: longterm.RESEARCH_NAMES[id] + "研究", aria: `GM ${longterm.RESEARCH_NAMES[id]}研究等级`, value: m.research[id] || 0 })),
      { key: "meta-resources", kind: "meta", id: "resources", label: "资源 废料/组件/数据", aria: "GM 资源", value: `${Math.floor(m.resources.scrap)},${Math.floor(m.resources.components)},${Math.floor(m.resources.data)}` },
    ];
  }
  function editGM(c) {
    gamePlatform.promptText(c.label, String(c.value), value => {
      if (value == null || String(value) === String(c.value)) return;
      if (c.kind === "drone") setGMDroneLevel(c.id, value); else setGMMeta(c.id, value);
      changed();
    });
  }
  function gmModel() {
    return {
      controls: gmControls(),
      bonds: effects.bondStates(state.modules).map(b => ({ title: `${b.name} · ${b.active ? "Lv." + b.level : "未激活"}`, detail: b.pair.map((id, i) => effects.droneIdentity(id).name + " Lv." + b.levels[i]).join(" + ") })),
      on: { edit: editGM, close: closeGM },
    };
  }
  function openGM() { gmOpen = true; gmPreviousPause = state.paused; state.paused = true; hub.run.resetJoystick(); changed(); }
  function closeGM() { if (!gmOpen) return; gmOpen = false; state.paused = gmPreviousPause; hub.run.updateHud(); hub.blur(); changed(); }
  function gmKey(e) {
    if (e.code === "Escape") { closeGM(); return true; }
    return hub.focusInside("gmPanel");
  }

  // -- test save (cloud) sheet --------------------------------------------------------------------------------

  const cloud = { enabled: false, open: false, userId: "", status: "测试存档保存在运行服务的电脑上。", working: false, ready: false, lastSync: 0, retryAt: 0, failures: 0, tabOwner: false, initializing: true, store: null };
  function cloudSafe() { return ["menu", "result"].includes(state.mode); }
  function cloudSay(message) { cloud.status = message; changed(); }
  function cloudRefreshGame() {
    if (["menu", "result"].includes(state.mode)) { state.metaProfile = longterm.loadMeta(metaStorage); state.record = runRecord.loadRecord(metaStorage); }
    hub.home.refresh();
  }
  function cloudInit() {
    const G = globalThis, cfg = G.EndlessRailsCloudConfig;
    let qa = false;
    try { qa = new URLSearchParams(G.location?.search || "").get("qa") === "1"; } catch {}
    if (!cfg?.enabled || qa || typeof G.fetch !== "function") { cloud.initializing = false; return; }
    cloud.enabled = true;
    // the run gate in engine.beginRun (and QA scripts) read the same global the DOM build published
    G.EndlessRailsCloud = cloudApi;
    const defaults = () => ({ schemaVersion: 1, meta: longterm.emptyMeta(), record: runRecord.emptyRecord() });
    const request = async (id, body) => {
      const response = await G.fetch(cfg.apiBase + "/" + encodeURIComponent(id), {
        method: body ? "PUT" : "GET", headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      const value = await response.json();
      if (!response.ok && response.status !== 409) throw Error(value.error || "save_failed");
      return value;
    };
    cloud.transport = { read: id => request(id), save: (id, p) => request(id, { expectedRevision: p.revision, mutationId: p.id, payload: p.payload }) };
    const initialize = async () => {
      // One active test-save tab prevents stale in-memory game state clobbering the same local cache.
      if (!G.navigator?.locks) throw Error("locks_unavailable");
      await new Promise((resolve, reject) => {
        G.navigator.locks.request("endless-rails-test-save-tab", { ifAvailable: true }, lock => {
          if (!lock) { reject(Error("another_tab")); return; }
          cloud.tabOwner = true; resolve(); return new Promise(() => {});
        }).catch(reject);
      });
      cloud.store = G.EndlessRailsCloudSync.createStore({ storage: G.localStorage, defaults, uuid: () => G.crypto.randomUUID(), changed });
      G.EndlessRailsCloudStorage = cloud.store.storage;
      const id = G.sessionStorage?.getItem("endless-rails-test-user");
      if (id) { cloud.userId = id; await cloudSelect(id); }
    };
    initialize().catch(() => cloudSay("测试存档暂不可用：请使用新版浏览器，并关闭其他游戏标签页。"))
      .finally(() => { cloud.initializing = false; changed(); });
    setInterval(() => { if (cloudSafe()) cloudSync(); }, 2000);
    G.addEventListener?.("online", () => { cloud.retryAt = 0; cloud.lastSync = 0; });
  }
  async function cloudSync(force = false) {
    const store = cloud.store;
    if (!store?.userId || !cloudSafe() || cloud.working || !cloud.tabOwner) return;
    const now = Date.now(); if (!force && (now < cloud.retryAt || now - cloud.lastSync < 60000)) return;
    cloud.working = true; changed();
    try {
      const result = await store.sync(cloud.transport, cloudSafe); cloud.lastSync = Date.now(); cloud.failures = 0; cloud.retryAt = 0; cloud.ready = true;
      cloudSay(result.status === "conflict" ? "设备进度不同，请选择要保留的一份。" : store.document().revision === 0 ? "服务器暂无此用户存档，可导入本机进度或直接开始新档。" : result.status === "pending" ? "进度已留在本机，下一次同步将上传最新变化。" : "服务器存档已同步。");
      if (result.status === "downloaded") cloudRefreshGame();
    } catch {
      cloud.failures++; cloud.retryAt = Date.now() + Math.min(300000, 5000 * 2 ** Math.min(cloud.failures, 6)) + Math.random() * 3000;
      cloud.ready = store.document().revision !== null; cloudSay("暂时无法同步，进度留在本机。服务恢复后会重试。");
    } finally { cloud.working = false; changed(); }
  }
  async function cloudSelect(id) {
    if (cloud.working || !cloudSafe()) return;
    if (!cloud.tabOwner) { cloudSay("另一个标签页正在使用测试存档，请关闭它后刷新。"); return; }
    if (id && !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)) { cloudSay("测试 ID 使用 1–48 位小写字母、数字、下划线或短横线。"); return; }
    try {
      cloud.store.activate(id || null); globalThis.sessionStorage?.setItem("endless-rails-test-user", id || ""); cloud.ready = false; cloudRefreshGame(); changed();
      if (id) await cloudSync(true); else cloudSay("已返回游客存档。测试用户未上传的进度仍保留在本机。");
    } catch { cloudSay("本机存储不可用，无法切换测试存档。"); }
  }
  function cloudModel() {
    const store = cloud.store, id = store?.userId;
    const summary = p => `列车 Lv.${p.meta.train.level} · 废料 ${p.meta.resources.scrap} · 远征 ${p.meta.totals.expeditions} 次`;
    return {
      identity: id ? "测试用户：" + id : "本机游客存档",
      badge: store?.conflict ? "存档冲突" : id ? (store.document().dirty ? "等待上传" : "测试用户已连接") : "本机存档",
      userId: cloud.userId,
      accountVisible: !!id, conflictVisible: !!store?.conflict,
      compare: store?.conflict ? "本机：" + summary(store.document().payload) + "；服务器：" + summary(store.conflict.payload) : "",
      importDisabled: !cloud.ready || store?.document().revision !== 0 || !!store?.document().base,
      syncDisabled: cloud.working || !cloud.ready, logoutDisabled: cloud.working, selectDisabled: cloud.working || cloud.initializing,
      status: cloud.status,
      on: {
        close: () => { cloud.open = false; changed(); },
        editId: () => gamePlatform.promptText("测试用户 ID", cloud.userId, v => { if (v != null) { cloud.userId = String(v).slice(0, 48); changed(); } }),
        select: () => cloudSelect(cloud.userId.trim()),
        logout: () => cloudSelect(null),
        sync: () => cloudSync(true),
        importGuest: () => {
          if (cloud.working || !cloudSafe()) return;
          try { cloud.store.importGuest(); cloudRefreshGame(); cloud.lastSync = 0; cloudSync(true); } catch { cloudSay("只能导入到尚未创建服务器存档的新测试用户。"); }
        },
        useRemote: () => cloudResolve("cloud"), useLocal: () => cloudResolve("local"),
      },
    };
  }
  function cloudResolve(choice) {
    try { cloud.store.resolve(choice, cloudSafe); cloudRefreshGame(); cloud.lastSync = 0; cloudSync(true); } catch { cloudSay("暂时无法处理冲突，请返回准备页后重试。"); }
  }
  const cloudApi = {
    get enabled() { return cloud.enabled; },
    canStart() { return !cloud.initializing && !cloud.working && (!cloud.store?.userId || (cloud.tabOwner && cloud.ready && !cloud.store.conflict)); },
    open() { cloud.open = true; changed(); },
    openFromButton() { if (cloudSafe()) { cloud.open = true; changed(); } },
  };

  function attach(h) {
    hub = h;
    gamePlatform.onDisplayChange(updateDisplay);
    cloudInit();
  }

  return {
    attach, display, updateDisplay, toggleFullscreen, installGame, showDisplayHelp,
    openSettings, closeSettings, toggleSound, soundState, settingsModel, settingsKey,
    helpModel, helpKey, openGM, closeGM, gmModel, gmKey, cloudModel, cloud: cloudApi,
    toggleGM: () => { gmOpen ? closeGM() : openGM(); },
    resetGM: () => { gmOpen = false; changed(); },
    get settingsOpen() { return settingsOpen; }, get helpOpen() { return helpOpen; }, get gmOpen() { return gmOpen; }, get cloudOpen() { return cloud.open; },
  };
})();

export { dialogCtl };
