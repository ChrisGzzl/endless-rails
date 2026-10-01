'use strict';
// Information-boundary and input regressions through the real canvas host.
const assert = require('node:assert/strict');
const createGame = require('./test-harness.cjs');

for (const viewport of [{ w: 320, h: 568 }, { w: 390, h: 844 }]) {
  const game = createGame({ viewport });
  const { run, json, ui } = game;
  ui.tap('startButton');
  const initial = run('JSON.stringify(state.activeExpedition)');
  const initialGraph = json('railMap.graph(mapCtl.model())');
  for (const layer of [1, 5, 10, 11, 12]) {
    // Advance a real generated path without changing its topology.
    run(`state.activeExpedition.visitedIds = [state.activeExpedition.nodes.find(n => n.layer === 1).id];
      for (let l = 2; l <= ${layer}; l++) {
        const last = expedition.visitedNode(state.activeExpedition);
        state.activeExpedition.visitedIds.push(last.nextIds[0]);
      }
      mapCtl.open();`);
    const before = run('JSON.stringify(state.activeExpedition)');
    ui.render();
    const g = json('railMap.graph(mapCtl.model())');
    const model = json('mapCtl.model()');
    assert.equal(g.nodes.length, model.rows.flatMap(r => r.nodes).length, 'the complete map exists from the start');
    assert.equal(g.edges.length, model.edges.length, 'all railway connections remain visible');
    assert.equal(g.height, initialGraph.height, 'exploration never resizes the map');
    const current = g.nodes.find(n => n.id === g.currentId);
    assert.equal(current.layer, layer, 'the train follows the current node');
    for (const row of model.rows) for (const n of row.nodes) {
      const visited = model.rows.flatMap(r => r.nodes).filter(n => ['current', 'cleared'].includes(n.state)).map(n => n.id);
      const known = visited.includes(n.id) || model.edges.some(e => e.to === n.id && visited.includes(e.from));
      const marker = ui.node('mapNode-' + n.id), drawn = g.nodes.find(v => v.id === n.id);
      assert.ok(marker, `L${layer}: every station has a marker, including unknown branches`);
      assert.equal(drawn.known, known, 'only visited stations and their immediate exits disclose contents');
      assert.ok(marker.label.includes('L' + row.layer));
      assert.equal(drawn.cy, initialGraph.nodes.find(v => v.id === n.id).cy, 'node positions stay stable as the train advances');
      assert.equal(drawn.cx, initialGraph.nodes.find(v => v.id === n.id).cx, 'revealing contents never changes railway junction order');
      if (!known) {
        assert.equal(marker.label, '未知站点·L' + row.layer, 'unknown labels do not disclose the type or reward');
        for (const key of ['type', 'glyph', 'name', 'tag']) assert.equal(drawn[key], undefined, 'unknown presentation is type independent');
      }
    }
    assert.ok(g.edges.every(e => g.nodes.some(n => n.id === e.from) && g.nodes.some(n => n.id === e.to)), 'all tracks retain their original endpoints');
    ui.tap('mapNode-' + current.id);
    assert.ok(ui.node('mapDetail'), 'the current station can still be inspected at every layer');
    const column = ui.node('mapColumn'), train = ui.node('mapNode-' + current.id);
    assert.ok(train.absY + train.h / 2 + 40 <= column.absY + column.h, 'the train and its label remain visible above the sheet');
    ui.tap('mapCloseDetail');
    const hidden = g.nodes.find(n => !n.known);
    if (hidden) {
      ui.tap('mapNode-' + hidden.id);
      assert.equal(ui.node('mapDetail'), null, 'tapping an unknown marker cannot disclose intelligence');
      run(`mapCtl.model().on.select(${JSON.stringify(hidden.id)})`);
      assert.equal(ui.node('mapDetail'), null, 'a stale hidden selection cannot expose node details');
      assert.equal(ui.node('mapStartButton'), null, 'hidden details cannot expose a battle entry');
      run('mapCtl.model().on.closeDetail()');
    }
    assert.equal(run('JSON.stringify(state.activeExpedition)'), before, 'painting, scrolling and previews never change the save');
  }
  run(`state.activeExpedition = JSON.parse(${JSON.stringify(initial)});
    state.metaProfile.activeExpedition = state.activeExpedition; mapCtl.open();`);
  const next = json('expedition.reachableNext(state.activeExpedition)')[0];
  ui.tap('mapNode-' + next.id);
  assert.equal(ui.node('mapLegend'), null, 'the redundant glyph legend is gone');
  assert.match(ui.text('mapProgress'), /1 \/ 12/);
  assert.match(ui.text('mapDetailTitle'), /废弃站点|危险区域/);
  const sheet = ui.node('mapDetail'), column = ui.node('mapColumn');
  assert.ok(column.h >= viewport.h * 0.4, 'the tactical terminal leaves the map visible');
  assert.ok(sheet.h < viewport.h * 0.4, 'the detail sheet never becomes a fullscreen panel');
  for (const key of ['mapStartButton', 'mapCloseDetail']) {
    const n = ui.node(key);
    assert.ok(n.h >= 44, 'the detail actions remain finger sized');
    assert.ok(n.absX >= 0 && n.absX + n.w <= viewport.w && n.absY + n.h <= viewport.h, 'detail actions fit the viewport');
  }
  const trainId = run('expedition.visitedNode(state.activeExpedition).id');
  const train = ui.node('mapNode-' + trainId);
  assert.ok(train.absY + train.h / 2 >= column.absY && train.absY + train.h / 2 + 32 <= column.absY + column.h, 'the current train stays visible with the detail open');
  const beforePreview = run('JSON.stringify(state.activeExpedition)');
  const future = json('mapCtl.model().rows.find(r => r.layer === 3).nodes')[0];
  ui.tap('mapNode-' + future.id);
  assert.equal(ui.node('mapDetail'), null, 'distant stations remain unknown even though the whole route is visible');
  assert.equal(ui.node('mapStartButton'), null, 'unknown stations cannot enter battle');
  ui.tap('mapResetButton');
  assert.ok(ui.visible('mapResetConfirm'));
  ui.tap('mapResetCancel');
  assert.equal(run('JSON.stringify(state.activeExpedition)'), beforePreview, 'preview and cancelling reset do not write the expedition');
  ui.tap('mapNode-' + next.id);
  assert.equal(ui.disabled('mapStartButton'), false);
  ui.tap('mapStartButton');
  assert.equal(run('state.mode'), 'combat', 'the existing transaction still enters battle');
  assert.equal(run('state.activeExpedition.checkpoint.nodeId'), next.id);
}
console.log('Rail map visibility, input and save boundaries passed.');
