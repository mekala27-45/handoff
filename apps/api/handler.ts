import type { IncomingMessage,ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Handoff } from '../../packages/domain/execution.js';
import { DomainError } from '../../packages/domain/errors.js';
import { publicFixtures } from '../../packages/domain/store.js';
import { reportSchema } from '../../packages/domain/claims.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), revision=z.number().int().positive();
const intake=z.object({fixture_id:id,source_event_id:id}).strict();
const step=z.object({expected_revision:revision,revise:z.boolean().optional()}).strict();
const execute=z.object({proposal_digest:z.string().regex(/^[a-f0-9]{64}$/),expected_revision:revision}).strict();
const review=execute.extend({decision:z.enum(['approve','reject'])}).strict();
const empty=z.object({}).strict();
async function body(req:IncomingMessage){
 if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new DomainError('json_required',415);
 const bytes:Buffer[]=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>32768)throw new DomainError('payload_too_large',413);bytes.push(chunk);}
 try{return JSON.parse(Buffer.concat(bytes).toString('utf8')||'{}');}catch{throw new DomainError('invalid_json');}
}
export function handler(app:Handoff,origins=String(process.env.ALLOWED_ORIGINS??'http://127.0.0.1:5173,http://localhost:5173').split(',')){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('x-request-id',randomUUID());res.setHeader('vary','Origin');
  const send=(status:number,value:unknown)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  try {
   const origin=req.headers.origin;if(origin&&!origins.includes(origin))throw new DomainError('origin_not_allowed',403);if(origin)res.setHeader('access-control-allow-origin',origin);
   if(req.method==='OPTIONS'){res.setHeader('access-control-allow-methods','GET, POST, OPTIONS');res.setHeader('access-control-allow-headers','Content-Type, Authorization, Idempotency-Key');res.statusCode=204;res.end();return;}
   const url=new URL(req.url??'/','http://127.0.0.1'),path=url.pathname;
   if(req.method==='GET'&&path==='/health'){send(200,{status:'ok',service:'handoff',source_commit:process.env.SOURCE_COMMIT??'local-development',build_timestamp:process.env.BUILD_TIMESTAMP??null,capabilities:{scripted:true,local_model:false,real_actions:false}});return;}
   if(req.method==='GET'&&path==='/ready'){const r=await app.pool.query('SELECT max(version) AS schema_version FROM handoff.schema_versions');send(r.rows[0].schema_version===1?200:503,{status:r.rows[0].schema_version===1?'ready':'unready',schema_version:r.rows[0].schema_version});return;}
   if(req.method==='GET'&&path==='/fixtures'){send(200,publicFixtures);return;}
   if(req.method==='POST'&&path==='/demo/sessions'){empty.parse(await body(req));send(201,await app.createSession());return;}
   const reportMatch=path.match(/^\/reports\/([A-Za-z0-9_-]+)$/);
   if(req.method==='GET'&&reportMatch){try{const r=reportSchema.parse(JSON.parse(await readFile(`reports/public/${reportMatch[1]}.json`,'utf8')));send(200,r);}catch{throw new DomainError('report_not_available',404);}return;}
   const auth=String(req.headers.authorization??'');if(!auth.startsWith('Bearer '))throw new DomainError('unauthorized',401);
   const cap=auth.slice(7),key=String(req.headers['idempotency-key']??'');let result:any;
   if(path==='/cases'&&req.method==='GET')result=await app.list(cap);
   else if(path==='/cases'&&req.method==='POST'){const input=intake.parse(await body(req));if(!publicFixtures.some(f=>f.fixture_id===input.fixture_id))throw new DomainError('unknown_fixture');result=await app.intake(cap,input,key);}
   else if(path.startsWith('/operations/')&&req.method==='GET')result=await app.recover(cap,id.parse(path.slice('/operations/'.length)));
   else {
    const match=path.match(/^\/cases\/([A-Za-z0-9_-]+)(?:\/(step|events|reviews|execute))?$/);if(!match)throw new DomainError('not_found',404);
    const caseId=match[1]!,action=match[2];
    if(req.method==='GET'&&!action)result=await app.view(cap,caseId);
    else if(req.method==='GET'&&action==='events'){const after=z.coerce.number().int().nonnegative().max(100000).parse(url.searchParams.get('after')??0);result=await app.events(cap,caseId,after);}
    else if(req.method==='POST'&&action==='step'){const input=step.parse(await body(req));result=await app.step(cap,caseId,input.expected_revision,key,input.revise??false);}
    else if(req.method==='POST'&&action==='reviews')result=await app.review(cap,caseId,review.parse(await body(req)),key);
    else if(req.method==='POST'&&action==='execute')result=await app.execute(cap,caseId,execute.parse(await body(req)),key);
    else throw new DomainError('method_not_allowed',405);
   }
   send(result?.code?409:200,result);
  }catch(error){
   if(error instanceof DomainError)send(error.status,{code:error.code});
   else if(error instanceof z.ZodError)send(400,{code:'invalid_request'});
   else send(503,{code:'infrastructure_unavailable',commit_outcome:'unknown',recovery:'Retry the same request key or read its operation receipt.'});
  }
 };
}
