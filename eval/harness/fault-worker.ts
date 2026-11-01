import { createServer } from 'node:http';
import { createPool } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { handler } from '../../apps/api/handler.js';
const mode=process.argv[2];
const pool=createPool();
const barrier=async(stage:string,backend:number|null)=>{process.send?.({type:'barrier',stage,backend,at:new Date().toISOString()});await new Promise<void>(()=>{});};
const app=new Handoff(pool,{testMode:true,
 ...(mode==='crash_before_commit'?{beforeCommit:async(db)=>{const r=await db.query('SELECT pg_backend_pid() AS pid');await barrier('writes_staged_before_commit',r.rows[0].pid);}}:{}),
 ...(mode==='response_lost'?{afterCommit:async()=>barrier('commit_complete_before_response',null)}:{})});
const server=createServer(handler(app));
server.listen(0,'127.0.0.1',()=>process.send?.({type:'ready',port:(server.address() as {port:number}).port,pid:process.pid}));
process.on('disconnect',()=>{server.close();void pool.end().finally(()=>process.exit());});
