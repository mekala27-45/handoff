import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeLedger } from '../../eval/harness/audit.js';
const truth={fixture_id:'f',action:'propose_refund' as const,clause:'P-DAMAGE',amount_cents:100,capture_id:'cap',effect_count:1,terminal:'completed'};
const row={capture_id:'cap',amount_cents:100,refunded_cents:100,initial_refunded_cents:0,effects_cents:100,effect_count:1};
const effect={effect_id:'e',capture_id:'cap',amount_cents:100,currency:'USD',authorized_at:'2026-01-01T00:01:00Z',expires_at:'2026-01-01T00:15:00Z',decision:'approve',review_digest:'abc',proposal_digest:'abc',validation_result:true};
const event={sequence:1,event_type:'effect_committed',safe_payload:{result_id:'e'}};
test('independent audit accepts clean evidence and detects every calibrated mutation',()=>{
 assert.equal(gradeLedger([row],[effect],[event],'completed',truth).passed,true);
 for(const mutant of [{...effect,currency:'EUR'},{...effect,decision:null},{...effect,review_digest:'wrong'},{...effect,authorized_at:'2026-01-01T01:00:00Z'},{...effect,validation_result:false}])assert.equal(gradeLedger([row],[mutant],[event],'completed',truth).passed,false);
 assert.equal(gradeLedger([row],[effect,effect],[event],'completed',truth).passed,false);
 assert.equal(gradeLedger([{...row,effects_cents:0}],[effect],[event],'completed',truth).passed,false);
 assert.equal(gradeLedger([row],[effect],[],'completed',truth).passed,false);
 assert.equal(gradeLedger([row],[effect],[event,event],'completed',truth).passed,false);
 assert.equal(gradeLedger([row],[effect],[event],'approved',truth).passed,false);
 assert.throws(()=>gradeLedger([],[],[],'completed',truth));
});
test('audit preserves millisecond expiry and refuses unknown clocks',()=>{
 const precise={...effect,authorized_at:new Date('2026-01-01T00:00:00.100Z'),expires_at:new Date('2026-01-01T00:00:00.200Z')};
 assert.equal(gradeLedger([row],[precise],[event],'completed',truth).passed,true);
 assert.equal(gradeLedger([row],[{...precise,authorized_at:precise.expires_at}],[event],'completed',truth).passed,false);
 assert.equal(gradeLedger([row],[{...effect,expires_at:'unknown'}],[event],'completed',truth).passed,false);
});
test('independent order and draft audit catches partial and unauthorized outcomes',()=>{
 const captured={...row,order_id:'o'},orders=[{order_id:'o',captured_cents:100,refunded_cents:100}];
 assert.equal(gradeLedger([captured],[effect],[event],'completed',truth,{orders,dispositions:[]}).passed,true);
 assert.equal(gradeLedger([captured],[effect],[event],'completed',truth,{orders:[{...orders[0],refunded_cents:0}],dispositions:[]}).passed,false);
 const draftTruth={...truth,action:'draft_confirmation' as const,amount_cents:0,capture_id:null,effect_count:0},draftRow={...captured,initial_refunded_cents:100,effects_cents:0,effect_count:0};
 const draft={...effect,disposition_id:'d',result:{amount_cents:0,currency:'USD',kind:'draft_only',simulated:true}},draftEvent={...event,safe_payload:{result_id:'d'}};
 assert.equal(gradeLedger([draftRow],[],[draftEvent],'completed',draftTruth,{orders,dispositions:[draft]}).passed,true);
 for(const dispositions of [[],[draft,draft],[{...draft,decision:'reject'}],[{...draft,result:{...draft.result,amount_cents:1}}]])assert.equal(gradeLedger([draftRow],[],[draftEvent],'completed',draftTruth,{orders,dispositions}).passed,false);
});
