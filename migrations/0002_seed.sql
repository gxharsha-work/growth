-- Seed data: the three teams the prototype has shipped with so far, plus
-- their default starter building layout (computed once with the same
-- pickAutoTile/guessArchetype logic villageStore.js uses at runtime).
-- created_at = 0 marks these as pre-dating real creation tracking, matching
-- the SEED_TEAMS convention teamsStore.js used before this migration.

INSERT INTO teams (id, name, size_bucket, function_type, capabilities, created_at) VALUES ('platform', 'Platform Team', '6-10 engineers', 'Backend/Platform', '["Frontend", "Backend", "QA", "DevOps"]', 0);
INSERT INTO teams (id, name, size_bucket, function_type, capabilities, created_at) VALUES ('backend', 'Backend Team', '6-10 engineers', 'Backend/Platform', '["APIs", "Data Pipelines", "Reliability", "Security"]', 0);
INSERT INTO teams (id, name, size_bucket, function_type, capabilities, created_at) VALUES ('solstice', 'Growth (Solstice Outdoors)', '1-5 engineers', 'Growth Marketing', '["Paid Media", "SEO & Content", "Lifecycle & CRM", "Analytics", "Partnerships"]', 0);

INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b1', 'platform', 'Frontend', 'crystal', '', 4, 6, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b2', 'platform', 'Backend', 'forge', '', 6, 3, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b3', 'platform', 'QA', 'observatory', '', 1, 4, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b4', 'platform', 'DevOps', 'windmill', '', 3, 1, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b5', 'backend', 'APIs', 'forge', '', 4, 6, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b6', 'backend', 'Data Pipelines', 'forge', '', 6, 3, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b7', 'backend', 'Reliability', 'windmill', '', 1, 4, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b8', 'backend', 'Security', 'observatory', '', 3, 1, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b9', 'solstice', 'Paid Media', 'rocket', '', 4, 6, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b10', 'solstice', 'SEO & Content', 'lighthouse', '', 6, 3, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b11', 'solstice', 'Lifecycle & CRM', 'rocket', '', 1, 4, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b12', 'solstice', 'Analytics', 'pagoda', '', 3, 1, 0);
INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('b13', 'solstice', 'Partnerships', 'bazaar', '', 6, 5, 0);

