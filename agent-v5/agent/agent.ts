import { defineAgent } from 'eve';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { modelFetch } from './lib/runtime.js';
import { v5Settings,V5_LIMITS } from './lib/configuration.js';
const settings=v5Settings();
const local=createOpenAICompatible({name:'ollama-v5',baseURL:'http://127.0.0.1:11435/v1',includeUsage:true,fetch:modelFetch});
export default defineAgent({model:local(settings.model.name),modelContextWindowTokens:V5_LIMITS.context,defaultTools:false,tool:false,limits:{sessionUsage:({total})=>total.outputTokens>=2048||total.inputTokens>=32768,sessionTimeoutMs:V5_LIMITS.deadlineMs}});
