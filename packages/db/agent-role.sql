DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='handoff_agent') THEN CREATE ROLE handoff_agent NOLOGIN; END IF; END $$;
GRANT handoff_agent TO CURRENT_USER;
GRANT USAGE ON SCHEMA handoff TO handoff_agent;
GRANT SELECT ON handoff.demo_sessions,handoff.cases,handoff.orders,handoff.captures,handoff.policy_heads,handoff.policy_versions,handoff.effects,handoff.proposals,handoff.case_events,handoff.request_receipts TO handoff_agent;
GRANT INSERT ON handoff.proposals,handoff.case_events,handoff.request_receipts TO handoff_agent;
GRANT UPDATE (state,revision) ON handoff.cases TO handoff_agent;
GRANT UPDATE (write_count,last_seen_at) ON handoff.demo_sessions TO handoff_agent;
-- PostgreSQL requires an UPDATE privilege for locking SELECT. These identity
-- columns grant that privilege without granting balance or version mutation.
GRANT UPDATE (order_id) ON handoff.orders TO handoff_agent;
GRANT UPDATE (capture_id) ON handoff.captures TO handoff_agent;
GRANT UPDATE (policy_id) ON handoff.policy_heads TO handoff_agent;
