"use strict";
const assert=require("node:assert/strict");
const {createAudio,STORAGE_KEY}=require("../src/core/audio");
const createGame=require("./test-harness.cjs");
class Param{
  constructor(){this.value=0;this.events=[];}
  setValueAtTime(value,time){this.events.push({kind:"set",value,time});}
  linearRampToValueAtTime(value,time){this.events.push({kind:"linear",value,time});}
  exponentialRampToValueAtTime(value,time){assert.ok(value>0);this.events.push({kind:"exponential",value,time});}
  setTargetAtTime(value,time){this.events.push({kind:"target",value,time});}
  cancelScheduledValues(time){this.events=this.events.filter(e=>e.time<time);}
}
class Node{
  constructor(){for(const p of ["gain","frequency","Q","threshold","knee","ratio"])this[p]=new Param();}
  connect(destination){this.destination=destination;}
  disconnect(){this.disconnected=true;}
}
class Context{
  static instances=[];
  constructor(){this.currentTime=0;this.state="suspended";this.destination={};this.sources=[];this.gains=[];this.resumeCount=0;Context.instances.push(this);}
  createGain(){const n=new Node();this.gains.push(n);return n;}
  createBiquadFilter(){return new Node();}
  createDynamicsCompressor(){return new Node();}
  createOscillator(){
    const n=new Node();n.start=t=>{n.startAt=t;};
    n.stop=t=>{n.stopAt=t??this.currentTime;if(t===undefined)n.onended?.();};
    this.sources.push(n);return n;
  }
  async resume(){this.resumeCount++;this.state="running";}
  async suspend(){this.state="suspended";}
  advance(seconds){this.currentTime+=seconds;for(const n of this.sources)if(!n.ended&&n.stopAt<=this.currentTime){n.ended=true;n.onended?.();}}
}
function memoryStorage(){const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
(async()=>{
  const storage=memoryStorage(),audio=createAudio({AudioContext:Context,storage});
  assert.equal(Context.instances.length,0,"page loading never creates or autoplays an audio context");
  await Promise.all([audio.unlock(),audio.unlock()]);
  assert.equal(Context.instances.length,1,"repeated gestures reuse one audio graph");
  const ctx=Context.instances[0];audio.tick("combat");
  assert.ok(ctx.sources.length>=4,"music includes a chord, bass and a sparse melody");
  const musicNodes=ctx.sources.slice();
  assert.ok(audio.play("shot"));
  assert.equal(audio.play("shot"),false,"rapid volleys cannot spam the same cue");
  assert.equal(audio.play("laser"),false,"combat cues also share an interval limit");
  ctx.advance(.2);assert.ok(audio.play("laser"));
  audio.setPreference("music",false);
  assert.ok(musicNodes.every(n=>n.disconnected),"disabling music releases its sources");
  assert.deepEqual(audio.getPreferences(),{music:false,sfx:true});
  assert.ok(audio.play("pulse"),"effects remain available with music off");
  audio.setPreference("sfx",false);
  assert.equal(audio.play("ui"),false,"effects switch silences new cues");
  assert.ok(ctx.sources.every(n=>n.disconnected),"muting both channels leaves no live sound sources");
  audio.setPreference("music",true);audio.tick("combat");
  assert.ok(ctx.sources.some(n=>!n.disconnected),"music plays independently with effects muted");
  const reloaded=createAudio({AudioContext:Context,storage});
  assert.deepEqual(reloaded.getPreferences(),{music:true,sfx:false},"independent settings survive reload");
  const copy=reloaded.getPreferences();copy.music=false;assert.equal(reloaded.getPreferences().music,true);
  const beforeHidden=ctx.sources.length;audio.setHidden(true);audio.tick("combat");
  assert.equal(ctx.state,"suspended");assert.equal(ctx.sources.length,beforeHidden);
  assert.ok(ctx.sources.every(n=>n.disconnected),"backgrounding cancels music and effect tails");
  audio.setHidden(false);audio.tick("combat");
  assert.equal(ctx.sources.length,beforeHidden,"returning alone does not replay old sounds");
  await audio.unlock();ctx.advance(40);const beforeCatchup=ctx.sources.length;audio.tick("combat");
  assert.ok(ctx.sources.length-beforeCatchup<=5,"a delayed frame schedules only one beat, never a burst");
  assert.ok(ctx.sources.slice(beforeCatchup).every(n=>n.startAt>=ctx.currentTime));
  audio.setPreference("sfx",true);ctx.advance(1);audio.play("upgrade");audio.play("station");audio.play("shot");audio.play("ui");
  assert.ok(ctx.sources.filter(n=>!n.disconnected&&n.destination?.destination===ctx.gains[1]).length<=4,"at most four effect voices can overlap");
  for(let i=0;i<2000;i++){ctx.advance(.1);audio.tick("combat");}
  assert.ok(ctx.sources.filter(n=>!n.disconnected).length<=12,"music releases finished oscillators across many loops");
  const malformed=memoryStorage();malformed.setItem(STORAGE_KEY,'{"music":"false","sfx":false}');
  assert.deepEqual(createAudio({storage:malformed}).getPreferences(),{music:true,sfx:false});
  const locked={get localStorage(){throw Error("blocked");}};
  const silent=createAudio(locked);assert.equal(await silent.unlock(),false);assert.doesNotThrow(()=>silent.setPreference("music",false));
  class Denied extends Context{resume(){return Promise.reject(Error("gesture required"));}}
  assert.equal(await createAudio({AudioContext:Denied}).unlock(),false,"autoplay rejection does not break gameplay");

  const game=createGame({window:{AudioContext:Context,localStorage:memoryStorage()}});
  const {ui,run}=game,focused=()=>run("EndlessRailsCanvasHost.kit.focusedKey()");
  ui.tap('startSettingsButton');assert.equal(run('dialogCtl.settingsOpen'),false,'home settings is an inline tab');
  ui.tap('homeMusicToggle');assert.equal(run('dialogCtl.soundState().music'),false,'home and pause settings share the same preference');
  assert.equal(ui.text('homeMusicToggle'),'关闭');
  ui.tap('homeMusicToggle');assert.equal(run('dialogCtl.soundState().music'),true);
  // open the sheet from the fleet terminal, as in combat
  run("homeCtl.isOpen=false;state.mode='combat';state.paused=false;runCtl.togglePause()");
  run("EndlessRailsCanvasHost.kit.focus('pauseSettingsButton',true)");ui.key('keydown','Enter');
  assert.equal(ui.visible('settingsScreen'),true);assert.equal(ui.visible('pauseScreen'),false,'the fleet terminal hides under the settings sheet');
  assert.equal(focused(),'musicToggle');
  assert.equal(ui.text('musicToggle'),'开启');
  ui.tap('musicToggle');assert.equal(ui.text('musicToggle'),'关闭');assert.equal(run('dialogCtl.soundState().music'),false);
  assert.equal(ui.text('sfxToggle'),'开启','settings toggles do not alter the other channel');
  run("EndlessRailsCanvasHost.kit.focus('musicToggle',true)");
  ui.key('keydown','Tab',{shiftKey:true});
  assert.equal(focused(),'closeSettingsButton','focus stays within the dialog');
  ui.key('keydown','KeyP');assert.equal(run('state.paused'),true,'settings cannot accidentally resume combat');
  ui.tap('closeSettingsButton');assert.equal(ui.visible('settingsScreen'),false);assert.equal(run('state.paused'),true,'closing settings preserves the fleet pause');
  assert.equal(focused(),'pauseSettingsButton','focus returns to the opener');
  ui.tap('pauseSettingsButton');
  run("runCtl.togglePause()");assert.equal(run("state.paused"),true,"settings cannot accidentally resume combat");
  ui.key('keydown','Escape');
  assert.equal(ui.visible('settingsScreen'),false);assert.equal(run("state.paused"),true,"closing settings preserves the fleet pause");
  assert.equal(ui.visible('pauseScreen'),true);
  // tap feedback: buttons click, switches and cards stay silent
  const gameCtx=Context.instances.at(-1);gameCtx.advance(1);const before=gameCtx.sources.length;
  ui.tap('inspectStatus');
  assert.ok(Context.instances.at(-1).sources.length>before,'a button tap plays the interface click');
  console.log("Audio: gesture start, separate persistent switches, limited voices, background silence, scheduling and settings navigation passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
