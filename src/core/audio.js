(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.EndlessRailsAudio=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  const STORAGE_KEY="endless-rails-audio-v1";
  const BEAT=60/78;
  // Original eight-bar ambient cue: Dm / Bb / F / C, with generous rests.
  const CHORDS=[[146.83,174.61,220],[116.54,146.83,174.61],[130.81,174.61,220],[130.81,164.81,196]];
  const MELODY=[293.66,0,440,349.23,0,293.66,0,220,349.23,0,293.66,0,261.63,0,329.63,0];
  const COOLDOWN={ui:.09,shot:.28,laser:.36,pulse:.8,upgrade:.5,station:1.2,hurt:.9};
  const PRIORITY={ui:2,shot:0,laser:1,pulse:3,upgrade:3,station:3,hurt:2};
  function createAudio(env={}){
    let storage;
    try{storage=env.storage===undefined?env.localStorage:env.storage;}catch{}
    let preferences={music:true,sfx:true};
    try{
      const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||"null");
      for(const key of ["music","sfx"])if(typeof saved?.[key]==="boolean")preferences[key]=saved[key];
    }catch{}
    const Context=env.AudioContext||env.webkitAudioContext;
    let ctx=null,musicBus,sfxBus,nextBeat=0,beat=0,hidden=false,quiet=true,resuming=null;
    const voices=new Set(),lastCue=new Map();
    let lastCombat=-Infinity;
    const getPreferences=()=>({...preferences});
    function level(bus,value){
      if(!bus)return;
      const now=ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(value,now,.045);
    }
    function stopVoice(voice){
      try{voice.source.stop();}catch{}
      voice.source.disconnect();voice.gain.disconnect();voices.delete(voice);
    }
    function clear(channel){for(const voice of [...voices])if(!channel||voice.channel===channel)stopVoice(voice);}
    function applyLevels(){
      level(musicBus,preferences.music&&!hidden?(quiet?.13:.2):0);
      level(sfxBus,preferences.sfx&&!hidden?.32:0);
    }
    // AudioContext is created only inside the first player gesture.
    function unlock(){
      if(!Context||hidden||(!preferences.music&&!preferences.sfx))return Promise.resolve(false);
      try{
        if(!ctx){
          ctx=new Context();
          musicBus=ctx.createGain();sfxBus=ctx.createGain();
          const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=1300;filter.Q.value=.5;
          const master=ctx.createDynamicsCompressor();master.threshold.value=-14;master.knee.value=18;master.ratio.value=3;
          musicBus.connect(filter);filter.connect(master);sfxBus.connect(master);master.connect(ctx.destination);
          musicBus.gain.value=0;sfxBus.gain.value=0;nextBeat=ctx.currentTime+.04;applyLevels();
        }
        if(ctx.state==="running"){applyLevels();return Promise.resolve(true);}
        if(!resuming)resuming=Promise.resolve(ctx.resume()).then(()=>{
          if(hidden){ctx.suspend().catch(()=>{});return false;}
          nextBeat=ctx.currentTime+.04;applyLevels();return ctx.state==="running";
        }).catch(()=>false).finally(()=>{resuming=null;});
        return resuming;
      }catch{return Promise.resolve(false);}
    }
    function tone(channel,freq,start,duration,volume,type="sine",endFreq=freq,priority=0,attack=.012){
      const source=ctx.createOscillator(),gain=ctx.createGain();
      source.type=type;source.frequency.setValueAtTime(freq,start);
      if(endFreq!==freq)source.frequency.exponentialRampToValueAtTime(endFreq,start+duration);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+attack);
      gain.gain.exponentialRampToValueAtTime(.0001,start+duration);gain.gain.linearRampToValueAtTime(0,start+duration+.02);
      source.connect(gain);gain.connect(channel==="music"?musicBus:sfxBus);
      const voice={source,gain,channel,priority};voices.add(voice);
      source.onended=()=>{source.disconnect();gain.disconnect();voices.delete(voice);};
      source.start(start);source.stop(start+duration+.03);
    }
    function scheduleBeat(index,time){
      const chord=CHORDS[Math.floor(index/8)%4];
      if(index%8===0)chord.forEach(f=>tone("music",f,time,BEAT*7.9,.075,"sine",f,0,.65));
      if(index%2===0){
        tone("music",chord[0]/2,time,BEAT*.75,.12,"triangle",chord[0]/2,0,.04);
        const note=MELODY[(index/2)%MELODY.length];
        if(note)tone("music",note,time+.08,BEAT*1.5,.055,"sine",note,0,.045);
      }
    }
    function tick(mode="menu",paused=false){
      const nextQuiet=paused||!["combat","docking"].includes(mode);
      if(quiet!==nextQuiet){quiet=nextQuiet;applyLevels();}
      if(!ctx||ctx.state!=="running"||hidden||!preferences.music)return;
      // Never catch up missed notes in a burst after backgrounding or a slow frame.
      if(nextBeat<ctx.currentTime-.15)nextBeat=ctx.currentTime+.025;
      if(nextBeat<ctx.currentTime+.15){scheduleBeat(beat,nextBeat);beat=(beat+1)%32;nextBeat+=BEAT;}
    }
    function play(name){
      if(!ctx||ctx.state!=="running"||hidden||!preferences.sfx||!(name in COOLDOWN))return false;
      const now=ctx.currentTime,priority=PRIORITY[name];
      if(now-(lastCue.get(name)??-Infinity)<COOLDOWN[name])return false;
      if(priority<2&&now-lastCombat<.18)return false;
      const count=name==="upgrade"||name==="station"?3:1;
      const active=[...voices].filter(v=>v.channel==="sfx");
      if(active.length+count>4){
        const removable=active.filter(v=>v.priority<priority);
        if(active.length+count-removable.length>4)return false;
        for(const voice of removable.slice(0,active.length+count-4))stopVoice(voice);
      }
      lastCue.set(name,now);if(priority<2)lastCombat=now;
      const t=now+.005;
      const note=(f,offset,duration,vol,type="sine",end=f)=>tone("sfx",f,t+offset,duration,vol,type,end,priority);
      if(name==="ui")note(620,0,.045,.09);
      else if(name==="shot")note(180,0,.055,.12,"triangle",75);
      else if(name==="laser")note(720,0,.22,.13,"sine",150);
      else if(name==="pulse")note(165,0,.42,.32,"sine",42);
      else if(name==="hurt")note(92,0,.2,.25,"triangle",48);
      else [293.66,440,name==="station"?587.33:349.23].forEach((f,i)=>note(f,i*.12,.22,.13));
      return true;
    }
    function setPreference(key,value){
      if(!Object.hasOwn(preferences,key))return;
      preferences[key]=!!value;
      try{storage?.setItem(STORAGE_KEY,JSON.stringify(preferences));}catch{}
      if(!preferences[key])clear(key);
      if(key==="music"&&preferences.music&&ctx){beat=0;nextBeat=ctx.currentTime+.04;}
      applyLevels();
    }
    function setHidden(value){
      hidden=!!value;
      if(hidden&&ctx){clear();lastCue.clear();lastCombat=-Infinity;beat=0;applyLevels();ctx.suspend().catch(()=>{});}
      // The next player gesture resumes audio, including Safari's interrupted state.
    }
    return {unlock,tick,play,setPreference,getPreferences,setHidden,supported:!!Context};
  }
  return {createAudio,STORAGE_KEY};
});
