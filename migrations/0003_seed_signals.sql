-- Real ingested Solstice signal rows, carried over from the old
-- jiraSignals.generated.json / calendarSignals.generated.json files so
-- signals work from D1 immediately, without waiting on the ingestion
-- Worker's first scheduled run. platform/backend are NOT seeded here:
-- functions/api/_lib/signals.ts serves their hand-tuned demo rows
-- directly from code (HAND_TUNED_IDS), bypassing D1 entirely, so rows
-- for those two ids would just be dead data.
--
-- Ticket summaries and event titles were removed from this file in Sprint 9
-- (FR17: team-level aggregates only). Only the numbers the score uses remain.

INSERT INTO signal_weeks (team_id, iso_week, source, payload, updated_at) VALUES ('solstice', '2026-W38', 'jira', '{"issueCount": 6, "avgCycleTimeDays": 4, "sprintCompletionPct": 17}', 0);
INSERT INTO signal_weeks (team_id, iso_week, source, payload, updated_at) VALUES ('solstice', '2026-W38', 'calendar', '{"avgMeetingHoursPerWeek": 2}', 0);
