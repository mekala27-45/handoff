import { createPool,migrate } from '../packages/db/client.js';
const pool=createPool();try{await migrate(pool);console.log(JSON.stringify({schema:'handoff',version:1,status:'ready'}));}finally{await pool.end();}
