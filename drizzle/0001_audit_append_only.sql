-- Governance: audit_events is append-only. UPDATE and DELETE are rejected by the database itself,
-- in addition to the application exposing no mutation routes for this table (PRD §10 Auditability).
CREATE OR REPLACE FUNCTION bm3_audit_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION bm3_audit_events_immutable();
