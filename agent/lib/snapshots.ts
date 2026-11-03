import type { Versions } from '../../packages/domain/evidence.js';

export type ObservedSnapshot={kind:'facts';versions:Versions}|{kind:'refused'};

// Tokens name observations within one active run; they grant no authority.
export class ObservedSnapshots {
 private runId:string|null=null;
 private snapshots=new Map<string,ObservedSnapshot>();
 private factsCount=0;
 private refusalsCount=0;

 begin(runId:string){this.end();this.runId=runId;}
 end(){this.runId=null;this.snapshots.clear();this.factsCount=0;this.refusalsCount=0;}
 private requireRun(runId:string){if(this.runId===null||runId!==this.runId)throw new Error('snapshot_scope_mismatch');}
 facts(runId:string,versions:Versions){
  this.requireRun(runId);const token=`f${++this.factsCount}`;
  this.snapshots.set(token,{kind:'facts',versions:structuredClone(versions)});return token;
 }
 refused(runId:string){
  this.requireRun(runId);const token=`r${++this.refusalsCount}`;
  this.snapshots.set(token,{kind:'refused'});return token;
 }
 resolve(runId:string,token:string):ObservedSnapshot {
  this.requireRun(runId);const snapshot=this.snapshots.get(token);
  if(!snapshot)throw new Error('unknown_snapshot_token');
  return structuredClone(snapshot);
 }
}
