import { defineDynamic,defineInstructions } from 'eve/instructions';
import { observedResults } from '../lib/runtime.js';
import { phaseGuidance } from '../lib/phase-guidance.js';

export default defineDynamic(async()=>{
 let observed;try{observed=await observedResults();}catch{return null;}
 const content=phaseGuidance(observed);
 return content===null?null:defineInstructions({content,role:'user'});
});
