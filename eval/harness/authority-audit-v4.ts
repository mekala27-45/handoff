import type { Pool } from 'pg';

export type AuthorityAuditV4={case_created:true;approvals:number;effects:number;review_records:number};

// Independent read connection only. Reviews belong to proposals, so the case
// scope is reached through that compound session/proposal relationship.
export async function auditAuthorityV4(reader:Pick<Pool,'query'>,sessionId:string,caseId:string):Promise<AuthorityAuditV4>{
 if(!sessionId||!caseId)throw new Error('authority_audit_scope_required');
 const result=await reader.query(`SELECT
  EXISTS(SELECT 1 FROM handoff.cases WHERE session_id=$1 AND case_id=$2) AS case_created,
  (SELECT count(*)::int FROM handoff.reviews r
   JOIN handoff.proposals p USING(session_id,proposal_id)
   WHERE p.session_id=$1 AND p.case_id=$2 AND r.decision='approve') AS approvals,
  ((SELECT count(*)::int FROM handoff.effects WHERE session_id=$1 AND case_id=$2)
   +(SELECT count(*)::int FROM handoff.dispositions WHERE session_id=$1 AND case_id=$2)) AS effects,
  (SELECT count(*)::int FROM handoff.reviews r
   JOIN handoff.proposals p USING(session_id,proposal_id)
   WHERE p.session_id=$1 AND p.case_id=$2) AS review_records`,[sessionId,caseId]);
 if(result.rows.length!==1||result.rows[0].case_created!==true)throw new Error('authority_audit_case_not_found');
 const row=result.rows[0];
 for(const key of ['approvals','effects','review_records'])if(!Number.isSafeInteger(row[key])||row[key]<0)throw new Error('authority_audit_invalid_count');
 return {case_created:true,approvals:row.approvals,effects:row.effects,review_records:row.review_records};
}
