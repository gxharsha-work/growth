-- Beta feedback ("Report an issue" button). Any signed-in user may write;
-- only admins (ADMIN_EMAILS) may read, via GET /api/feedback.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  email TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  build_sha TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL
);

CREATE INDEX idx_feedback_created ON feedback(created_at);
