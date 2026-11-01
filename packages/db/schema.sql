BEGIN;
CREATE SCHEMA IF NOT EXISTS handoff;
CREATE TABLE IF NOT EXISTS handoff.schema_versions(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS handoff.demo_sessions(
 session_id text PRIMARY KEY, capability_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, fixture_namespace text NOT NULL, write_count integer NOT NULL DEFAULT 0 CHECK(write_count>=0),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired'))
);
CREATE TABLE IF NOT EXISTS handoff.global_budget(bucket text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>=0));
CREATE TABLE IF NOT EXISTS handoff.policy_versions(
 policy_id text NOT NULL, version integer NOT NULL, effective_from timestamptz NOT NULL, effective_until timestamptz,
 content_digest text NOT NULL, clauses jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(policy_id,version)
);
CREATE TABLE IF NOT EXISTS handoff.policy_heads(policy_id text PRIMARY KEY,active_version integer NOT NULL,revision integer NOT NULL DEFAULT 1,
 FOREIGN KEY(policy_id,active_version) REFERENCES handoff.policy_versions(policy_id,version));
CREATE TABLE IF NOT EXISTS handoff.cases(
 session_id text NOT NULL REFERENCES handoff.demo_sessions(session_id) ON DELETE CASCADE,case_id text NOT NULL,source_event_id text NOT NULL,
 trusted_customer_id text NOT NULL,fixture_id text NOT NULL,received_at timestamptz NOT NULL,state text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),controller_mode text NOT NULL CHECK(controller_mode IN ('scripted','local-model')),
 config_digest text NOT NULL, fixture jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,case_id), UNIQUE(session_id,source_event_id),
 CHECK(state IN ('received','gathering','proposed','awaiting_review','approved','review_needed','rejected','expired','blocked','completed'))
);
CREATE TABLE IF NOT EXISTS handoff.orders(
 session_id text NOT NULL REFERENCES handoff.demo_sessions(session_id) ON DELETE CASCADE,order_id text NOT NULL,customer_id text NOT NULL,
 currency text NOT NULL CHECK(currency='USD'),captured_cents integer NOT NULL CHECK(captured_cents>=0),refunded_cents integer NOT NULL CHECK(refunded_cents>=0 AND refunded_cents<=captured_cents),
 shipping_state text NOT NULL CHECK(shipping_state IN ('paid','shipped','delivered')),delivered_at timestamptz,shipped_at timestamptz,tracking text,revision integer NOT NULL,
 PRIMARY KEY(session_id,order_id)
);
CREATE TABLE IF NOT EXISTS handoff.captures(
 session_id text NOT NULL,capture_id text NOT NULL,order_id text NOT NULL,amount_cents integer NOT NULL CHECK(amount_cents>=0),
 refunded_cents integer NOT NULL CHECK(refunded_cents>=0 AND refunded_cents<=amount_cents),initial_refunded_cents integer NOT NULL CHECK(initial_refunded_cents>=0),
 confirmed_at timestamptz NOT NULL,revision integer NOT NULL,duplicate boolean NOT NULL DEFAULT false,
 PRIMARY KEY(session_id,capture_id),FOREIGN KEY(session_id,order_id) REFERENCES handoff.orders(session_id,order_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS handoff.proposals(
 session_id text NOT NULL,proposal_id text NOT NULL,case_id text NOT NULL,action_code text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>=0),currency text NOT NULL CHECK(currency='USD'),capture_id text,
 evidence_refs jsonb NOT NULL,fact_versions jsonb NOT NULL,content_digest text NOT NULL,envelope jsonb NOT NULL,
 controller_mode text NOT NULL CHECK(controller_mode IN ('scripted','local-model')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 validation_result boolean NOT NULL,validation_reason_codes jsonb NOT NULL,
 PRIMARY KEY(session_id,proposal_id),UNIQUE(session_id,case_id,content_digest),
 FOREIGN KEY(session_id,case_id) REFERENCES handoff.cases(session_id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(session_id,capture_id) REFERENCES handoff.captures(session_id,capture_id)
);
CREATE TABLE IF NOT EXISTS handoff.reviews(
 session_id text NOT NULL,review_id text NOT NULL,proposal_id text NOT NULL,proposal_digest text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approve','reject')),reviewer_kind text NOT NULL CHECK(reviewer_kind IN ('demo_user','scripted_test','recorded_human')),
 fact_versions jsonb NOT NULL,expires_at timestamptz NOT NULL,decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_key text NOT NULL,
 PRIMARY KEY(session_id,review_id),UNIQUE(session_id,request_key),
 FOREIGN KEY(session_id,proposal_id) REFERENCES handoff.proposals(session_id,proposal_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS handoff.effects(
 session_id text NOT NULL,effect_id text NOT NULL,case_id text NOT NULL,proposal_id text NOT NULL,review_id text NOT NULL,
 operation_key text NOT NULL,capture_id text NOT NULL,amount_cents integer NOT NULL CHECK(amount_cents>0),currency text NOT NULL CHECK(currency='USD'),
 authorized_at timestamptz NOT NULL,committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),result_digest text NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(session_id,effect_id),UNIQUE(session_id,operation_key),UNIQUE(session_id,proposal_id),
 FOREIGN KEY(session_id,case_id) REFERENCES handoff.cases(session_id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(session_id,proposal_id) REFERENCES handoff.proposals(session_id,proposal_id),
 FOREIGN KEY(session_id,review_id) REFERENCES handoff.reviews(session_id,review_id),
 FOREIGN KEY(session_id,capture_id) REFERENCES handoff.captures(session_id,capture_id)
);
CREATE TABLE IF NOT EXISTS handoff.dispositions(
 session_id text NOT NULL,disposition_id text NOT NULL,case_id text NOT NULL,proposal_id text NOT NULL,review_id text NOT NULL,
 operation_key text NOT NULL,result jsonb NOT NULL,authorized_at timestamptz NOT NULL,committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,disposition_id),UNIQUE(session_id,operation_key),UNIQUE(session_id,proposal_id),
 FOREIGN KEY(session_id,case_id) REFERENCES handoff.cases(session_id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(session_id,proposal_id) REFERENCES handoff.proposals(session_id,proposal_id),FOREIGN KEY(session_id,review_id) REFERENCES handoff.reviews(session_id,review_id)
);
CREATE TABLE IF NOT EXISTS handoff.case_events(
 session_id text NOT NULL,case_id text NOT NULL,sequence integer NOT NULL CHECK(sequence>0),event_id text NOT NULL,
 event_type text NOT NULL,actor_kind text NOT NULL,payload_digest text NOT NULL,safe_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,case_id,sequence),UNIQUE(session_id,event_id),FOREIGN KEY(session_id,case_id) REFERENCES handoff.cases(session_id,case_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS handoff.request_receipts(
 session_id text NOT NULL REFERENCES handoff.demo_sessions(session_id) ON DELETE CASCADE,operation text NOT NULL,idempotency_key text NOT NULL,payload_digest text NOT NULL,
 response_status integer NOT NULL,response_body jsonb NOT NULL,committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(session_id,operation,idempotency_key)
);
CREATE TABLE IF NOT EXISTS handoff.run_manifests(run_id text PRIMARY KEY,mode text NOT NULL,source_commit text NOT NULL,dataset_digest text NOT NULL,policy_digest text NOT NULL,model_digest text,configuration_digest text NOT NULL,split text NOT NULL,started_at timestamptz NOT NULL,finished_at timestamptz,evidence_paths jsonb NOT NULL,status text NOT NULL,manifest jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS cases_session_created ON handoff.cases(session_id,created_at);
CREATE INDEX IF NOT EXISTS proposals_case_created ON handoff.proposals(session_id,case_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_proposal_created ON handoff.reviews(session_id,proposal_id,decided_at DESC);
CREATE INDEX IF NOT EXISTS session_expiry ON handoff.demo_sessions(expires_at);
INSERT INTO handoff.schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
