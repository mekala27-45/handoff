import { createServer } from 'node:http';
import { createPool } from '../../packages/db/client.js';
import { Handoff } from '../../packages/domain/execution.js';
import { handler } from './handler.js';
export const pool=createPool();
export const server=createServer(handler(new Handoff(pool)));
server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
server.listen(Number(process.env.PORT??8080),process.env.HOST??'127.0.0.1',()=>console.log(JSON.stringify({service:'handoff',listening:true,port:Number(process.env.PORT??8080)})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{void pool.end().then(()=>process.exit(0));}));
