import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { policy } from '../fixtures/policy.js';
export type Db = pg.PoolClient;
export function createPool(url=process.env.DATABASE_URL,role?:'handoff_agent'):pg.Pool {
  if(!url)throw new Error('database_not_configured');
  if(new URL(url).hostname.includes('-pooler.'))throw new Error('direct_database_connection_required');
  return new pg.Pool({connectionString:url,max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,statement_timeout:10000,application_name:'handoff',...(role?{options:'-c role=handoff_agent'}:{})});
}
export async function migrate(pool:pg.Pool):Promise<void> {
  await pool.query(await readFile('packages/db/schema.sql','utf8'));
  await pool.query('INSERT INTO handoff.policy_versions(policy_id,version,effective_from,effective_until,content_digest,clauses) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[policy.policy_id,policy.version,policy.effective_from,policy.effective_until,policy.content_digest,JSON.stringify(policy.clauses)]);
  await pool.query('INSERT INTO handoff.policy_heads(policy_id,active_version) VALUES($1,$2) ON CONFLICT DO NOTHING',[policy.policy_id,policy.version]);
}
export async function transaction<T>(pool:pg.Pool,fn:(db:Db)=>Promise<T>):Promise<T> {
  for(let attempt=0;attempt<3;attempt++) {
    const db=await pool.connect();
    let guarded=false;
    try {
      // Acquire before BEGIN so a waiter does not retain an old SSI snapshot.
      // The tiny demo intentionally serializes domain transactions across hosts.
      await db.query("SELECT pg_advisory_lock(hashtext('handoff'),22031)");guarded=true;
      await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const result=await fn(db);await db.query('COMMIT');return result;
    }
    catch(error){await db.query('ROLLBACK').catch(()=>{});const code=(error as {code?:string}).code;if(!['40001','40P01'].includes(code??'')||attempt===2)throw error;}
    finally {let discard=false;if(guarded)try{await db.query("SELECT pg_advisory_unlock(hashtext('handoff'),22031)");}catch{discard=true;}db.release(discard);}
    await new Promise(r=>setTimeout(r,20*2**attempt));
  }
  throw new Error('transaction_retry_exhausted');
}
