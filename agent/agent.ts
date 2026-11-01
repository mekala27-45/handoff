import { defineAgent } from 'eve';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { modelFetch } from './lib/runtime.js';
const local=createOpenAICompatible({name:'ollama',baseURL:'http://127.0.0.1:11435/v1',includeUsage:true,fetch:modelFetch});
export default defineAgent({model:local('qwen3:0.6b'),modelContextWindowTokens:8192,defaultTools:false,tool:false,limits:{sessionUsage:({total})=>total.outputTokens>=2048||total.inputTokens>=32768,sessionTimeoutMs:120000}});
