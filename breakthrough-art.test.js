"use strict";
const assert=require('node:assert/strict');
const createGame=require('./test-harness.cjs');
const draws=[];
const ctx=new Proxy({drawImage(...args){draws.push(args);},createRadialGradient(){return{addColorStop(){}};}},{get:(t,k)=>t[k]||(()=>{})});
const game=createGame({context:ctx});
for(const key of ['hover','breakthrough','bond','vfx','evolvedVfx','combatVfx']){
  game.sandbox[key+'Image']={key,naturalWidth:1254,naturalHeight:1254};game.run(`gameArt.${key}=${key}Image`);
}
const frames=JSON.parse(game.run('JSON.stringify(hoverFrames)'));
for(const id of ['gun','missile','incendiary','ricochet','blades','chain','scatter','piercing']){
  for(let dir=0;dir<8;dir++){
    draws.length=0;
    game.run(`drawFlight({id:'${id}',level:9,x:100,y:100,color:'#68ccff',flightAngle:${dir*Math.PI/4},slot:1});drawFlight({id:'${id}',level:10,x:100,y:100,color:'#68ccff',flightAngle:${dir*Math.PI/4},slot:1});`);
    const [normal,skin]=draws;assert.equal(normal[0].key,'hover');assert.equal(skin[0].key,'breakthrough');
    assert.deepEqual(normal.slice(1),skin.slice(1),id+': same source rect, draw size and center at Lv.9/10');
    assert.deepEqual(skin.slice(1,5),frames[game.run(`spriteCells['${id}']`)]);
  }
}
draws.length=0;
game.run(`state.shots=[{x:100,y:100,vx:220,vy:0,life:2,missile:true,bondId:'red'},{x:150,y:100,vx:270,vy:0,life:2,bounce:true,bondId:'purple'}];
state.weaponFx=[{kind:'bondLaser',x:50,y:200,tx:350,ty:200,width:10,life:.15,maxLife:.18},{kind:'arc',bondId:'purple',x:100,y:250,tx:200,ty:260,life:.1,maxLife:.16}];drawShots();drawWeaponEffects();`);
for(const c of draws){
  assert.equal(c[0].key,'bond','all bond drawing uses the new generated attack sheet');
  const [x,y,w,h]=c.slice(1,5);assert.ok(x>=0&&y>=0&&x+w<=1254&&y+h<=1254);
}
assert.ok(draws.length>=5);
// Breaking through adds neither another cast nor a cosmetic explosion at the drone.
game.run(`state.modules={missile:10};state.drone.x=100;state.drone.y=200;state.swarm=[];syncSwarm();
state.enemies=[{x:200,y:200,r:8,hp:100,maxHp:100,delay:0}];state.shots=[];state.weaponFx=[];
state.weaponClocks={command:Infinity,gun:Infinity};updateArsenal(.01);`);
assert.equal(game.run('state.enemies[0].hp'),100,'no phantom Lv.10 damage before missile impact');
assert.equal(game.run('state.shots.length'),1);assert.equal(game.run('state.shots[0].breakthrough'),true);
assert.equal(game.run('state.weaponFx.some(f=>f.kind==="ultimate")'),false);
console.log('Breakthrough art: eight models/eight headings, exact old sprite footprints, generated bond shots and no extra skill passed.');
