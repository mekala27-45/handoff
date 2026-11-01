import { createPool } from '../packages/db/client.js';
const pool=createPool();
try{const result=await pool.query("DELETE FROM handoff.demo_sessions WHERE expires_at<=clock_timestamp() RETURNING session_id");console.log(JSON.stringify({expired_sessions_removed:result.rowCount}));}finally{await pool.end();}
