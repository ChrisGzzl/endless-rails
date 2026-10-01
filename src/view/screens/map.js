"use strict";
// Canvas railway terminal: a view over the unchanged expedition projection.
import { uiEl, uiKit } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";
import { railMap } from "../components/map/rail-map.js";

const mapScreen = (() => {
  const E = uiEl, S = uiSheet;
  const CONTENT_H = railMap.CONTENT_H, HIT = railMap.HIT;
  let keepTrainVisible = false;

  function select(m, node) {
    keepTrainVisible = ["next", "current"].includes(node.state);
    m.on.select(node.id);
  }

  function paintMap(ctx, box, wrapper, graph) {
    railMap.paint(ctx, box, wrapper, graph);
    // The sheet reduces the scroll viewport after selection. Adjust once using
    // the actual laid-out height; ordinary scrolling remains under player control.
    if (!keepTrainVisible) return;
    keepTrainVisible = false;
    const column = uiKit.find("mapColumn"), train = graph.nodes.find(n => n.id === graph.currentId);
    if (!column || !train) return;
    const bottom = box.y + train.cy + 52;
    const overflow = bottom - (column.absY + column.h);
    if (overflow > 0) uiKit.setScroll("mapColumn", uiKit.getScroll("mapColumn") + overflow, column.scrollMax);
  }

  function detail(m, graph) {
    const d = m.detail;
    const node = graph.nodes.find(n => n.id === d?.id);
    if (!node?.known) return null;
    const name = railMap.nameOf(node), danger = railMap.dangerOf(node);
    const start = node.type === "start";
    return E({ ...S.mapDetail, key: "mapDetail", ref: "/2" },
      E({ ...S.mapDetail_heading, ref: "/2/0" },
        E({ ...S.mapDetail_copy, ref: "/2/0/0" },
          E({ ...S.mapEyebrow, ref: "/2/0/0/0" }, "TACTICAL TERMINAL / 战术终端"),
          E({ ...S.mapDetail_b, key: "mapDetailTitle", ref: "/2/0/0/1" }, name,
            E({ ...S.mapDetail_small, ref: "/2/0/0/1/0" }, "L" + d.layer))),
        E({ ...S.mapDanger, key: "mapDetailDanger", ref: "/2/0/1", color: danger > 1 ? "#ffaaa0" : "#e5ce9b" }, danger ? "危险 " + "★".repeat(danger) : "安全区")),
      E({ ...S.mapDetail_copy, ref: "/2/1" },
        E({ ...S.mapDetail_p, ref: "/2/1/0" }, start ? "远征起点 · 沿铁路向上探索" : node.type === "final" ? "目标  走完终点轨道 · 完成整图结算" : "目标  护送列车 · 存活约 60 秒"),
        E({ ...S.mapDetail_p_v2, key: "mapDetailReward", ref: "/2/1/1" }, start ? "启程已完成 · 请选择下一站" : "收益  " + d.rewardHint),
        E({ ...S.mapDetail_p_v3, key: "mapDetailStatus", ref: "/2/1/2" }, d.startable ? "约 1 分钟 · 失败可重试本节点" : node.tag + " · " + (node.state === "future" ? "抵达后确认路线" : "浏览不影响路线"))),
      E({ ...S.mapDetail_actions, ref: "/2/2" },
        E({ tag: "button", ...S.mapStartButton, key: "mapStartButton", ref: "/2/2/0", disabled: !d.startable, onTap: d.startable ? m.on.start : null, label: d.startable ? "开始" + d.name : d.name + "暂不可开始" },
          d.startable ? "进入节点  »" : node.state === "future" ? "抵达后开放" : "当前不可进入"),
        E({ tag: "button", ...S.mapCloseDetail, key: "mapCloseDetail", ref: "/2/2/1", onTap: m.on.closeDetail }, "收起")));
  }

  function build(m) {
    const graph = railMap.graph(m, uiKit.env.vh < 700);
    const current = graph.nodes.find(n => n.id === graph.currentId);
    const danger = current ? railMap.dangerOf(current) : 0;
    const region = (m.title || "远征路线").split(" · 第 ")[0];
    return E({ ...S.mapScreen, key: "mapScreen", ref: "" },
      E({ ...S.mapHeader, ref: "/0" },
        E({ ...S.mapHeader_row, ref: "/0/0" },
          E({ ...S.mapHeader_copy, ref: "/0/0/0" },
            E({ ...S.mapEyebrow, ref: "/0/0/0/0" }, "RAIL EXPEDITION / 铁路远征"),
            E({ ...S.mapTitle, key: "mapTitle", ref: "/0/0/0/1" }, region)),
          E({ ...S.mapTokens, key: "mapTokens", ref: "/0/0/1" }, "远征券 ", E({ ...S.mapTokens_b, key: "mapTokensValue", ref: "/0/0/1/0" }, String(m.tokens)))),
        E({ ...S.mapHeader_row, ref: "/0/1" },
          E({ ...S.mapProgressLabel, key: "mapProgress", ref: "/0/1/0" }, "远征进度  ", E({ ...S.mapProgressValue, ref: "/0/1/0/0" }, graph.currentLayer + " / " + railMap.LAYERS)),
          E({ ...S.mapDanger, key: "mapDanger", ref: "/0/1/1" }, "危险等级 " + (danger ? "★".repeat(danger) : "—"))),
        E({ ...S.mapProgressTrack, key: "mapProgressTrack", ref: "/0/2", paint: (ctx, box) => {
          const progress = (graph.currentLayer - 1) / (railMap.LAYERS - 1);
          const x = box.x + 5, width = Math.max(0, box.w - 10), y = box.y + box.h / 2;
          ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.strokeStyle = "#65725f"; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width * progress, y); ctx.strokeStyle = "#b7c69b"; ctx.stroke();
          ctx.beginPath(); ctx.arc(x + width * progress, y, 4, 0, Math.PI * 2); ctx.fillStyle = "#eee9cf"; ctx.fill(); ctx.restore();
        } }),
        E({ ...S.mapHeader_row, ref: "/0/3" },
          E({ ...S.mapGuide, key: "mapGuide", ref: "/0/3/0" }, /已通关|已重置/.test(m.title) ? m.title.split(" · ").pop() : "上滑查看全图 · ？站点尚未侦察"),
          m.resetConfirm ? E({ ...S.mapResetRow, ref: "/0/1/1" },
            E({ tag: "button", ...S.mapResetConfirm, key: "mapResetConfirm", ref: "/0/1/1/0", onTap: m.on.reset }, "确认重置"),
            E({ tag: "button", ...S.mapCloseDetail, key: "mapResetCancel", ref: "/0/1/1/1", onTap: m.on.cancelReset }, "取消"))
            : E({ tag: "button", ...S.mapResetButton, key: "mapResetButton", ref: "/0/1/1", onTap: m.on.reset, label: "重置远征" }, "重置远征")),
        m.result ? E({ ...S.mapResult, key: "mapResult", ref: "/0/4" }, m.result) : null),
      E({ ...S.mapColumn, key: "mapColumn", ref: "/1" },
        E({ ...S.mapArea, key: "mapArea", ref: "/1/0", height: graph.height, paint: (ctx, box, node) => paintMap(ctx, box, node, graph) },
          graph.nodes.map(node => E({ tag: "button", ...S.mapHit, key: "mapNode-" + node.id, ref: "/1/0/" + node.layer + "/" + node.slot, left: (node.cx * 100) + "%", top: node.cy - HIT / 2, marginLeft: -HIT / 2, width: HIT, height: HIT, borderRadius: 6, label: node.known ? railMap.nameOf(node) + "·L" + node.layer + "·" + node.tag : "未知站点·L" + node.layer, onTap: node.known ? () => select(m, node) : m.on.closeDetail })))),
      detail(m, graph));
  }

  return { build, CONTENT_H };
})();

export { mapScreen };
