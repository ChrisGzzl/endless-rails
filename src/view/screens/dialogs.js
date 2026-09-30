"use strict";
// Modal dialogs: sound settings, the display help sheet, the GM debug panel
// and the test-save (cloud) sheet. Text fields are drawn like the former
// <input> boxes and edited through the platform prompt when tapped.

import { uiEl } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";

const dialogScreens = (() => {
  const E = uiEl, S = uiSheet;

  // A single-line text field: value (or placeholder) vertically centred in
  // the content box like the browser's inner editor.
  function field(style, props, value, placeholder) {
    const empty = value == null || value === "";
    return E({ ...style, display: "inline-flex", alignItems: "center", ...props, tapSound: false, role: "textbox" },
      E({ display: "block", primaryLineHeight: true, flexGrow: 1, flexShrink: 1, minWidth: 0, overflowX: "hidden", overflowY: "hidden", whiteSpace: "pre", pointerEvents: "none", color: empty ? "rgb(117, 117, 117)" : "inherit" },
        empty ? (placeholder || "") : String(value)));
  }

  function soundToggle(on, key, ref, label, disabled, onTap) {
    return E({ tag: "button", ...(on ? S.sfxToggle : S.musicToggle), key, ref, disabled, onTap, role: "switch", label: label + (on ? " 开启" : " 关闭") },
      E({ ...(on ? S.switchTrack_v4 : S.switchTrack_v3), ref: ref + "/0" },
        E({ ...(on ? S.switchTrack_after_v4 : S.switchTrack_after_v3), tag: "::after" })),
      E({ ...S.switchValue_v2, ref: ref + "/1" }, on ? "开启" : "关闭"));
  }
  function settings(m) {
    return E({ ...S.settingsScreen, key: "settingsScreen", ref: "", modal: true },
      E({ ...S.selectionTerminal_settingsTerminal, ref: "/0" },
        E({ ...S.stationHeading_v3, ref: "/0/0" },
          E({ ...S.eyebrow_v3, ref: "/0/0/0" }, E({ ...S.eyebrow_before, tag: "::before" }), "终端偏好 / 声音控制"),
          E({ ...S.cloudTitle, key: "settingsTitle", ref: "/0/0/1" }, "设置"),
          E({ ...S.stationHeading_p, ref: "/0/0/2" }, "让声音保持在舒服的位置。")),
        E({ ...S.soundOptions_v2, ref: "/0/1" },
          E({ ...S.soundOption_v3, ref: "/0/1/0" },
            E({ ...S.resultTrainDamage, ref: "/0/1/0/0" },
              E({ ...S.sfxLabel, key: "musicLabel", ref: "/0/1/0/0/0" }, "背景音乐"),
              E({ ...S.soundOption_p, ref: "/0/1/0/0/1" }, "低音量氛围配乐 · 缓慢电子节拍")),
            soundToggle(m.music, "musicToggle", "/0/1/0/1", "背景音乐", m.disabled, () => m.on.sound("music"))),
          E({ ...S.soundOption_v4, ref: "/0/1/1" },
            E({ ...S.resultTrainDamage, ref: "/0/1/1/0" },
              E({ ...S.sfxLabel, key: "sfxLabel", ref: "/0/1/1/0/0" }, "游戏音效"),
              E({ ...S.soundOption_p, ref: "/0/1/1/0/1" }, "武器与关键提示 · 限制密集叠音")),
            soundToggle(m.sfx, "sfxToggle", "/0/1/1/1", "游戏音效", m.disabled, () => m.on.sound("sfx")))),
        E({ ...S.soundNote, key: "soundNote", ref: "/0/2" }, m.note),
        E({ tag: "button", ...S.closeSettingsButton, key: "closeSettingsButton", ref: "/0/3", onTap: m.on.close }, "完成")));
  }

  function displayHelp(m) {
    return E({ ...S.displayHelp, key: "displayHelp", ref: "", modal: true },
      E({ ...S.displayHelp_div, ref: "/0" },
        E({ ...S.displayHelpTitle, key: "displayHelpTitle", ref: "/0/0" }, "使用独立窗口游玩"),
        E({ ...S.displayHelp_p, key: "displayHelpText", ref: "/0/1" }, m.text),
        E({ ...S.displayHelp_p, ref: "/0/2" }, "从桌面图标打开后，浏览器地址栏不再占用游戏空间。首次打开仍需联网。"),
        E({ tag: "button", ...S.closeDisplayHelp, key: "closeDisplayHelp", ref: "/0/3", onTap: m.on.close }, "知道了")));
  }

  function gm(m) {
    return E({ ...S.gmPanel, key: "gmPanel", ref: "", modal: true, scrollKey: "gmPanel" },
      E({ ...S.gmContent, ref: "/0" },
        E({ ...S.gmTitle, key: "gmTitle", ref: "/0/0" }, "GM · 机队调试"),
        E({ ...S.gmContent_p, ref: "/0/1" },
          "战斗已暂停 · 输入实际等级 · 0 为下架",
          E({ br: true, tag: "br" }),
          "Lv.10：普攻伤害 +35%，范围 +25%，切换突破皮肤"),
        E({ ...S.gmControls, key: "gmControls", ref: "/0/2" },
          m.controls.map((c, i) => E({ ...S.gmControls_label, ref: "/0/2/" + i, onTap: () => m.on.edit(c), tapSound: false },
            c.label,
            field(S.gmControls_input, { key: "gmInput-" + c.key, ref: `/0/2/${i}/0`, label: c.aria, onTap: () => m.on.edit(c) }, c.value)))),
        E({ ...S.gmBonds, key: "gmBonds", ref: "/0/3" },
          m.bonds.map((b, i) => E({ ...S.gmBonds_div, ref: "/0/3/" + i },
            E({ ...S.gmBonds_b, ref: `/0/3/${i}/0` }, b.title),
            E({ ...S.gmBonds_small, ref: `/0/3/${i}/1` }, b.detail)))),
        E({ tag: "button", ...S.closeDisplayHelp, key: "gmClose", ref: "/0/4", onTap: m.on.close }, "应用并返回")));
  }

  function cloud(m) {
    const btn = (key, ref, text, disabled, onTap) => E({ tag: "button", ...S.cloudUseLocal, key, ref, disabled, onTap }, text);
    return E({ ...S.cloudScreen, key: "cloudScreen", ref: "", modal: true },
      E({ ...S.selectionTerminal_cloudTerminal, ref: "/0", scrollKey: "cloudTerminal" },
        E({ ...S.cloudConflict, ref: "/0/0" },
          E({ ...S.eyebrow_v6, ref: "/0/0/0" }, E({ ...S.eyebrow_before_v2, tag: "::before" }), "远征档案"),
          E({ ...S.cloudTitle, key: "cloudTitle", ref: "/0/0/1" }, "测试存档"),
          E({ ...S.cloudIdentity, key: "cloudIdentity", ref: "/0/0/2" }, m.identity),
          E({ ...S.cloudBadge, key: "cloudBadge", ref: "/0/0/3" }, m.badge)),
        E({ ...S.cloudStatus, ref: "/0/1" }, "开发测试用：输入相同 ID 可读取同一份服务器存档，不是真实账号登录。"),
        E({ ...S.cloudConflict, key: "cloudLogin", ref: "/0/2" },
          E({ ...S.cloudLogin_label, ref: "/0/2/0", onTap: m.on.editId, tapSound: false }, "测试用户 ID"),
          field(S.cloudUserId, { key: "cloudUserId", ref: "/0/2/1", label: "测试用户 ID", onTap: m.on.editId }, m.userId, "例如 player-001"),
          btn("cloudSelect", "/0/2/2", "切换到此测试用户", m.selectDisabled, m.on.select)),
        m.accountVisible ? E({ ...S.cloudConflict, key: "cloudAccount", ref: "/0/3" },
          E({ ...S.cloudConflict_p, ref: "/0/3/0" }, "长期成长与战绩会在返回准备页后自动同步。战斗中的位置和敌人不保存。"),
          btn("cloudSync", "/0/3/1", "立即同步", m.syncDisabled, m.on.sync),
          btn("cloudImport", "/0/3/2", "将游客进度导入这个新用户", m.importDisabled, m.on.importGuest),
          btn("cloudLogout", "/0/3/3", "返回游客存档", m.logoutDisabled, m.on.logout)) : null,
        m.conflictVisible ? E({ ...S.cloudConflict, key: "cloudConflict", ref: "/0/4" },
          E({ ...S.cloudConflict_p, key: "cloudCompare", ref: "/0/4/0" }, m.compare),
          E({ ...S.cloudConflict_p, ref: "/0/4/1" }, "设备进度不同，自动同步已暂停。选择后会替换另一份进度，不会叠加资源。"),
          btn("cloudUseRemote", "/0/4/2", "使用服务器进度，替换本机", false, m.on.useRemote),
          btn("cloudUseLocal", "/0/4/3", "保留本机进度，覆盖服务器", false, m.on.useLocal)) : null,
        E({ ...S.cloudStatus, key: "cloudStatus", ref: "/0/5" }, m.status),
        E({ tag: "button", ...S.cloudClose, key: "cloudClose", ref: "/0/6", onTap: m.on.close }, "返回游戏")));
  }

  return { settings, displayHelp, gm, cloud, field };
})();

export { dialogScreens };
