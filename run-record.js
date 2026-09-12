"use strict";

const STORAGE_KEY = "endless-rails-v04-record";

function emptyRecord() { return { version: 1, runs: 0, bestStations: 0, bestKills: 0, bestCombo: 0, bestScrap: 0, latest: null }; }
function normalizeRecord(value) {
  const record = value && typeof value === "object" ? value : {};
  return { version: 1, runs: Math.max(0, Number(record.runs) || 0), bestStations: Math.max(0, Number(record.bestStations) || 0), bestKills: Math.max(0, Number(record.bestKills) || 0), bestCombo: Math.max(0, Number(record.bestCombo) || 0), bestScrap: Math.max(0, Number(record.bestScrap) || 0), latest: record.latest || null };
}
function buildRunSummary(state) {
  return { stations: Math.max(0, Math.min(5, Number(state.station) || 0)), kills: Math.max(0, Number(state.kills) || 0), scrap: Math.max(0, Number(state.scrap) || 0), bestCombo: Math.max(0, Number(state.bestCombo) || 0), eventId: state.activeEvent?.id || null, contractId: state.activeContract?.id || null, modules: { ...(state.modules || {}) }, cores: { ...(state.coreStacks || {}) }, damageByWeapon: JSON.parse(JSON.stringify(state.weaponStats || {})), damageByBond: JSON.parse(JSON.stringify(state.bondStats || {})), trainDamage: Number(state.trainDamage || 0), outcome: state.outcome || "lost" };
}
function mergeRecord(previous, summary) {
  const record = normalizeRecord(previous);
  return { ...record, runs: record.runs + 1, bestStations: Math.max(record.bestStations, summary.stations), bestKills: Math.max(record.bestKills, summary.kills), bestCombo: Math.max(record.bestCombo, summary.bestCombo), bestScrap: Math.max(record.bestScrap, summary.scrap), latest: { ...summary, modules: { ...summary.modules }, cores: { ...summary.cores } } };
}
function loadRecord(storage) { try { return normalizeRecord(storage?.getItem ? JSON.parse(storage.getItem(STORAGE_KEY) || "null") : null); } catch { return emptyRecord(); } }
function saveRecord(storage, record) { try { if (!storage?.setItem) return false; storage.setItem(STORAGE_KEY, JSON.stringify(normalizeRecord(record))); return true; } catch { return false; } }

const runRecordApi = { STORAGE_KEY, emptyRecord, normalizeRecord, buildRunSummary, mergeRecord, loadRecord, saveRecord };
if (typeof module !== "undefined" && module.exports) module.exports = runRecordApi;
if (typeof window !== "undefined") window.EndlessRailsRunRecord = runRecordApi;
