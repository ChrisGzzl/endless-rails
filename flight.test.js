"use strict";
const assert=require("node:assert/strict");
const effects=require("./combat-effects.js");
const createGame=require("./test-harness.cjs");

for(let direction=0;direction<8;direction++){
 const angle=direction*Math.PI/4-Math.PI/2,vx=Math.cos(angle)*180,vy=Math.sin(angle)*180;
 let pose={};for(let i=0;i<90;i++)pose=effects.flightPose(pose,vx,vy,1/60);
 assert.equal(pose.direction,direction);
 assert.ok(Math.abs(Math.atan2(Math.sin(pose.flightAngle-angle),Math.cos(pose.flightAngle-angle)))<1e-8);
 const idle=effects.flightPose(pose,0,0,.1);
 assert.equal(idle.direction,direction,"release retains the last heading");
 assert.ok(idle.thrust<pose.thrust,"exhaust dims when movement stops");
}
const turn=effects.flightPose({flightAngle:-Math.PI/2,direction:0},180,0,.05);
assert.ok(Math.abs(turn.flightAngle+Math.PI/2)<=.250001,"turn rate is bounded");
assert.ok(turn.bank>0,"turning produces a bank pose");
const center={x:195,y:340},drone={slot:1,x:155,y:390};
const patrol=effects.autonomousGoal(center,drone,null,1,390,680);
const patrolLater=effects.autonomousGoal(center,drone,null,2,390,680);
assert.notDeepEqual(patrol,patrolLater,"idle followers patrol locally");
const attack=effects.autonomousGoal(center,drone,{x:130,y:430},1,390,680);
assert.equal(attack.behavior,"engage");
assert.ok(Math.hypot(attack.x-patrol.x,attack.y-patrol.y)<=15.0001,"autonomous engagement stays close to formation");
assert.equal(effects.autonomousGoal(center,{slot:1,x:0,y:0},null,1,390,680).behavior,"return");

const {run}=createGame();
run('state.mode="combat";state.enemies=[];state.spawnClock=Infinity;state.routeDistance=50;state.moveInput={x:1,y:1};update(.1);');
assert.equal(run('state.drone.direction'),3,"commander responds to southeast input");
run('state.modules={missile:1,chain:1};syncSwarm();for(let i=0;i<90;i++){state.visualTime+=1/60;updateSwarm(1/60);}');
assert.ok(run('state.swarm.every(d=>Number.isFinite(d.flightAngle)&&d.direction>=0&&d.direction<8)'));
const old=JSON.parse(run('JSON.stringify(state.swarm.map(d=>({x:d.x,y:d.y})))'));
run('state.visualTime+=.1;updateSwarm(.1);');
const moved=JSON.parse(run('JSON.stringify(state.swarm.map(d=>({x:d.x,y:d.y})))'));
assert.ok(moved.some((d,i)=>Math.hypot(d.x-old[i].x,d.y-old[i].y)>.01));
assert.ok(moved.every((d,i)=>Math.hypot(d.x-old[i].x,d.y-old[i].y)<=24.0001));
console.log("eight-direction and autonomous-flight tests passed");
