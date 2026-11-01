import { createPool } from '../packages/db/client.js';
import { Handoff } from '../packages/domain/execution.js';
import { handler } from '../apps/api/handler.js';
const pool=createPool();
export default handler(new Handoff(pool));
