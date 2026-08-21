import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const api=require('./field-fast-inspection-nico-lot-v1.js');
const source=readFileSync(new URL('./field-fast-inspection-nico-lot-v1.js',import.meta.url),'utf8');

assert.match(source,/<select id="inventoryWorkLocation">/);
assert.doesNotMatch(source,/id="inventoryWorkLocation" list=/);
assert.doesNotMatch(source,/type===NICO_MELT&&[^\n]*inventoryWorkInstruction/);

const metrics=api.inboundMetrics({netWeight:4218,grossWeight:4242,packageCount:4,weight:9999});
assert.deepEqual(metrics,{net:4218,gross:4242,tare:24,packing:4});
assert.deepEqual(api.inboundMetrics({netWeight:0,nw:0,weight:500,grossWeight:0,packageCount:0}),{net:500,gross:500,tare:0,packing:1});

const items=Array.from({length:8},(_,index)=>({
  key:`C-${index+1}`,
  completionNo:`A-TEST-${index+1}`,
  weight:index===0||index===4?900:index===1||index===5?1300:1100,
  ni:index%2?24:26,
  co:index%2?13:11,
  powder:index===0||index===4
}));
const lots=api.optimizeNiCoLots(items);
assert.equal(lots.length,2);
assert.equal(new Set(lots.flatMap(lot=>lot.items.map(item=>item.key))).size,8);
for(const lot of lots){
  assert.equal(api.validLot(lot.stats),true);
  assert.ok(lot.stats.weight>=4300&&lot.stats.weight<=4999);
  assert.ok(lot.stats.powderWeight<=1000);
  assert.ok(lot.stats.ni>=20&&lot.stats.co>=10);
}

const coDominant=api.optimizeNiCoLots(Array.from({length:4},(_,index)=>({key:`CO-${index}`,weight:1100,ni:12,co:20,powder:false})));
assert.equal(coDominant.length,1);
assert.equal(api.validLot(coDominant[0].stats),true);
assert.ok(coDominant[0].stats.co>coDominant[0].stats.ni);

assert.throws(
  ()=>api.optimizeNiCoLots([{key:'too-heavy',weight:5100,ni:25,co:12,powder:false}]),
  /최대중량/
);
assert.throws(
  ()=>api.optimizeNiCoLots([{key:'powder',weight:1200,ni:25,co:12,powder:true},{key:'solid',weight:3200,ni:25,co:12,powder:false}]),
  /Powder/
);

console.log('field fast inspection / Ni Co LOT tests passed');
