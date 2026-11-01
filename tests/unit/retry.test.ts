import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedRead } from '../../packages/domain/retry.js';
test('read retries are bounded, delayed and exclude authority failures',async()=>{
 let attempts=0;const delays:number[]=[];
 assert.equal(await boundedRead(async()=>{if(++attempts<3)throw new Error('read_timeout');return 7;},async()=>{},async ms=>{delays.push(ms);}),7);
 assert.equal(attempts,3);assert.equal(delays.length,2);assert.ok(delays[1]!>delays[0]!);
 attempts=0;await assert.rejects(()=>boundedRead(async()=>{attempts++;throw new Error('read_timeout');},async()=>{},async()=>{}));assert.equal(attempts,3);
 attempts=0;await assert.rejects(()=>boundedRead(async()=>{attempts++;throw new Error('unauthorized');},async()=>{}));assert.equal(attempts,1);
});
