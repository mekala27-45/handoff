export const retryDelay=(attempt:number,seed=22031)=>25*2**attempt+((seed+attempt*17)%11);
export async function boundedRead<T>(read:()=>Promise<T>,onRetry:(attempt:number,delay:number)=>Promise<void>,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  try{return await read();}catch(error){if((error as Error).message!=='read_timeout'||attempt===2)throw error;const delay=retryDelay(attempt);await onRetry(attempt+1,delay);await wait(delay);}
 }
 throw new Error('read_retry_exhausted');
}
