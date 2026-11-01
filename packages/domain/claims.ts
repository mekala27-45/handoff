import { z } from 'zod';

export const statement = 'Synthetic support cases. Simulated actions only. Scripted, local-model and recorded runs are labeled separately. No real messages, refunds or customer data. This project does not demonstrate production customer-service readiness.';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const metricSchema = z.object({
  metric_id: z.string().min(1), mode: z.enum(['scripted','local-model']), split: z.enum(['development','held-out']),
  numerator: z.number().int().nonnegative(), denominator: z.number().int().positive(),
  unit: z.enum(['cases','effects','references','injections']), source: z.string().min(1), input_digest: hash,
}).strict().refine(x => x.numerator <= x.denominator, 'numerator_exceeds_denominator');
export const reportSchema = z.object({
  run_id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), mode: z.enum(['scripted','local-model']),
  source_commit: z.string().regex(/^[a-f0-9]{40}$/), dependency_digest: hash, dataset_digest: hash,
  configuration_digest: hash, policy_digest: hash, model_digest: hash.nullable(),
  started_at: z.iso.datetime(), finished_at: z.iso.datetime(),
  attempted_case_ids: z.array(z.string()).min(1), metrics: z.array(metricSchema).min(1),
  evidence_paths: z.array(z.string().min(1)).min(1), status: z.enum(['passed','failed']),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.attempted_case_ids).size !== r.attempted_case_ids.length) ctx.addIssue({code:'custom',message:'duplicate_attempt_ids'});
  if (r.mode === 'local-model' && !r.model_digest) ctx.addIssue({code:'custom',message:'model_provenance_missing'});
  if (r.metrics.some(m => m.mode !== r.mode || m.input_digest !== r.dataset_digest)) ctx.addIssue({code:'custom',message:'mixed_evidence'});
  if (Date.parse(r.finished_at) < Date.parse(r.started_at)) ctx.addIssue({code:'custom',message:'invalid_window'});
});
export type Report = z.infer<typeof reportSchema>;
export function validateReport(input: unknown, expected: {commit: string; configuration: string}): Report {
  const report = reportSchema.parse(input);
  if (report.source_commit !== expected.commit) throw new Error('stale_source_commit');
  if (report.configuration_digest !== expected.configuration) throw new Error('configuration_mismatch');
  return report;
}
export function renderClaims(report: Report): string {
  const r = reportSchema.parse(report);
  return `${statement}\n\nRun ${r.run_id}. Mode ${r.mode}. Source ${r.source_commit}.\n\n` + r.metrics.map(m => `${m.metric_id}: ${m.numerator} / ${m.denominator} ${m.unit}. Source ${m.source}.`).join('\n');
}
export function notMeasured(reason: string): string {
  if (!reason.trim()) throw new Error('missing_prerequisite');
  return `${statement}\n\nNot evaluated. ${reason}\n`;
}
