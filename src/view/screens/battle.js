"use strict";
// The play frame (former main#app): HUD header, the battlefield canvas with
// its overlaid controls (fullscreen, pulse / claim rail, objective, train and
// boss health, combo, toast, touch hint, floating joystick) and the footer.
// The battlefield itself is painted by the host through the canvas node's
// paint hook; everything else is plain UI nodes.

import { uiEl, uiKit } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";

const battleScreen = (() => {
  const E = uiEl, S = uiSheet;

  // CSS keyframe sampling: each segment eases with the animation's timing
  // function, like the browser does between keyframes.
  function sampleKeyframes(p, frames, ease) {
    let a = frames[0], b = frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) if (p >= frames[i].at && p <= frames[i + 1].at) { a = frames[i]; b = frames[i + 1]; break; }
    const span = b.at - a.at || 1;
    const t = ease((p - a.at) / span);
    return a.v + (b.v - a.v) * t;
  }
  const easeOut = t => uiKit.cubic(Math.max(0, Math.min(1, t)), 0, 0, 0.58, 1);
  // toast-pop 1.2s ease-out: 0% {opacity:0} 15%,75% {opacity:1} 100% {opacity:0}
  function toastStyle(m) {
    const p = uiKit.keyframe("toast", m.toast.serial, 1200);
    if (p === null) return {};
    return { opacity: sampleKeyframes(p, [{ at: 0, v: 0 }, { at: 0.15, v: 1 }, { at: 0.75, v: 1 }, { at: 1, v: 0 }], easeOut) };
  }
  // combo-pop .7s ease-out: 0% {opacity:0; translateY(8px)} 25% {opacity:1} 100% {opacity:0; translateY(-12px)}
  function comboStyle(m) {
    const p = uiKit.keyframe("combo", m.combo.serial, 700);
    if (p === null) return {};
    const y = sampleKeyframes(p, [{ at: 0, v: 8 }, { at: 1, v: -12 }], easeOut);
    return { opacity: sampleKeyframes(p, [{ at: 0, v: 0 }, { at: 0.25, v: 1 }, { at: 1, v: 0 }], easeOut), transform: `translateY(${y}px)` };
  }

  // The frame. part: "full" (default), "under" (frame chrome below the
  // battlefield) or "over" (everything painted above it).
  function build(m, part = "full") {
    const under = part !== "over", over = part !== "under";
    const appStyle = under ? S.app : { ...S.app, backgroundColor: "transparent", backgroundImage: "none", boxShadow: "none", borderTopColor: "transparent", borderRightColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "transparent" };
    const hud = m.hud;
    return E({ ...appStyle, key: part === "over" ? "appOver" : "app", ref: "" },
      over ? header(m) : null,
      E({ ...(under ? S.arenaWrap : { ...S.arenaWrap, backgroundColor: "transparent" }), ref: "/1", key: part === "over" ? "arenaOver" : "arena" },
        E({ ...S.gameCanvas, key: "gameCanvas", ref: "/1/0", paint: under ? m.paintBattlefield : null,
          onPress: over ? m.on.stickDown : null, onDrag: over ? m.on.stickMove : null, onRelease: over ? m.on.stickUp : null,
          focusable: false, label: "无人机移动战场，按住任意位置滑动或使用方向键移动" }),
        over && m.joystick.visible ? E({ ...S.joystickBase_x1, left: m.joystick.x, top: m.joystick.y, key: "joystickBase", ref: "/1/1" },
          E({ ...S.joystickCross_x1, ref: "/1/1/0" }),
          E({ ...S.joystickThumb_x1, transform: `translate(${m.joystick.dx}px, ${m.joystick.dy}px)`, key: "joystickThumb", ref: "/1/1/1" })) : null,
        over ? arenaControls(m) : null,
        over ? E({ ...S.arenaWrap_after, tag: "::after" }) : null),
      over ? E({ ...S.controls, ref: "/2" },
        E({ ...S.controlReadouts, ref: "/2/1" },
          E({ ...S.droneReadout, ref: "/2/1/0" },
            E({ ...S.droneReadout_span, ref: "/2/1/0/0" }, "蜂群"),
            E({ ...S.droneLevel, key: "droneLevel", ref: "/2/1/0/1" }, hud.drones)))) : null);
  }
  function header(m) {
    const hud = m.hud;
    const routeW = uiKit.tween("routeFill", hud.routePercent, 150);
    const xpW = uiKit.tween("xpFill", hud.xpPercent, 150);
    return E({ ...S.hud, ref: "/0" },
      E({ tag: "button", ...S.pauseButton, key: "pauseButton", ref: "/0/0", onTap: m.on.pause, label: hud.paused ? "继续游戏" : "暂停游戏" },
        E({ ...S.pauseButton_before, tag: "::before" }),
        hud.paused ? "▶" : "Ⅱ"),
      E({ ...S.runReadout, ref: "/0/1" },
        E({ ...S.timerValue, key: "timerValue", ref: "/0/1/1" }, hud.timer, E({ ...S.timerValue_after, tag: "::after" }, "s"))),
      E({ ...S.brand, ref: "/0/2" },
        E({ tag: "button", ...S.gmToggle, key: "gmToggle", ref: "/0/2/0", onTap: m.on.gm, label: "GM 模式" }, "ER")),
      E({ ...S.hudStat, ref: "/0/3" },
        E({ ...S.stationValue, key: "stationValue", ref: "/0/3/1" }, E({ ...S.stationValue_before, tag: "::before" }, "站 "), hud.station)),
      E({ ...S.hudStat_hudStat_Right, ref: "/0/4" },
        E({ ...S.hudStat_span, ref: "/0/4/0" }, "废料"),
        E({ ...S.scrapValue, key: "scrapValue", ref: "/0/4/1" }, hud.scrap)),
      E({ ...S.progressStrip, ref: "/0/5" },
        E({ ...S.progressRow, ref: "/0/5/0" },
          E({ ...S.routeProgressLabel, key: "routeProgressLabel", ref: "/0/5/0/0" }, hud.routeLabel),
          E({ ...S.routeProgressTrack, key: "routeProgressTrack", ref: "/0/5/0/1", role: "progressbar" },
            E({ ...S.routeProgressFill, width: routeW + "%", key: "routeProgressFill", ref: "/0/5/0/1/0" }))),
        E({ ...S.progressRow_progressRow_Xp, ref: "/0/5/1" },
          E({ ...S.experienceProgressLabel, key: "experienceProgressLabel", ref: "/0/5/1/0" }, hud.xpLabel),
          E({ ...S.experienceProgressTrack, key: "experienceProgressTrack", ref: "/0/5/1/1", role: "progressbar" },
            E({ ...S.experienceProgressFill, width: xpW + "%", key: "experienceProgressFill", ref: "/0/5/1/1/0" })))));
  }
  function arenaControls(m) {
    const hud = m.hud;
    const hint = hud.hintOpacity == null ? {} : { opacity: uiKit.tween("hintOpacity", hud.hintOpacity, 400) };
    const cooldown = uiKit.tween("pulseCooldown", hud.pulseCooldown, 100);
    const healthW = uiKit.tween("healthFill", hud.healthPercent, 150);
    return [
      E({ tag: "button", ...S.gameFullscreenButton, key: "gameFullscreenButton", ref: "/1/2", disabled: m.display.gameDisabled, onTap: m.on.fullscreen, label: m.display.label },
        E({ ...S.gameFullscreenButton_before, tag: "::before" }),
        "⛶"),
      E({ ...S.skillRail, ref: "/1/3" },
        E({ tag: "button", ...(hud.pulseCooling ? S.pulseButton_v2 : S.pulseButton), key: "pulseButton", ref: "/1/3/0", disabled: hud.pulseDisabled, onTap: m.on.pulse, tapSound: false, label: "释放电磁脉冲" },
          E({ ...S.pulseRing, ref: "/1/3/0/0" }, E({ ...S.uiIcon_uiIcon_Pulse_v2, ref: "/1/3/0/0/0" })),
          E({ ...S.pulseButton_span, ref: "/1/3/0/1" }, "脉冲"),
          E({ ...S.pulseCooldown, height: cooldown + "%", key: "pulseCooldown", ref: "/1/3/0/2" })),
        hud.claimVisible ? E({ tag: "button", ...S.claimUpgradeButton_x1, key: "claimUpgradeButton", ref: "/1/3/1", onTap: m.on.claim },
          E({ ...S.claimUpgradeButton_before_x1, tag: "::before" }),
          hud.claimText) : null),
      E({ ...S.commandRing, key: "commandRing", ref: "/1/4" }),
      E({ ...S.objective, ref: "/1/5" },
        E({ ...S.pulseDot, ref: "/1/5/0" }),
        E({ ...S.objectiveText, key: "objectiveText", ref: "/1/5/1" }, hud.objective)),
      E({ ...S.healthWrap, ref: "/1/6" },
        E({ ...S.healthLabel, ref: "/1/6/0" },
          E({ ...S.healthLabel_span, ref: "/1/6/0/0" }, "列车完整度"),
          E({ ...S.healthText, key: "healthText", ref: "/1/6/0/1" }, hud.health)),
        E({ ...S.healthTrack, ref: "/1/6/1" },
          E({ ...S.healthFill, width: healthW + "%", key: "healthFill", ref: "/1/6/1/0" }))),
      hud.boss ? E({ ...S.bossWrap, key: "bossWrap", ref: "/1/7" },
        E({ ...S.healthLabel, ref: "/1/7/0" },
          E({ ...S.bossName, key: "bossName", ref: "/1/7/0/0" }, "感染巨兽"),
          E({ ...S.bossText, key: "bossText", ref: "/1/7/0/1" }, hud.boss.text)),
        E({ ...S.healthTrack_bossTrack, ref: "/1/7/1" },
          E({ ...S.bossFill, width: hud.boss.percent + "%", key: "bossFill", ref: "/1/7/1/0" }))) : null,
      E({ ...S.comboText, ...comboStyle(m), key: "comboText", ref: "/1/8" }, m.combo.text),
      E({ ...S.toast, ...toastStyle(m), key: "toast", ref: "/1/9" }, m.toast.text),
      E({ ...S.touchHint, ...hint, key: "touchHint", ref: "/1/10" }, "按住滑动 · 自动开火"),
    ];
  }

  return { build };
})();

export { battleScreen };
