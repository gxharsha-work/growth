# Changelog

## Sprint 9: Beta v0.9 (November 2026)

Live at `growth-3it.pages.dev` behind Cloudflare Access. Branch `sprint9/beta`.

- **Access control.** Cloudflare Access (one-time PIN email login) protects the site and every preview URL. The API verifies the Access token. Only admins (`ADMIN_EMAILS`) can rename or delete teams.
- **Privacy.** No API response contains ticket summaries or calendar event titles, and the database no longer stores them. The ingestion Worker no longer fetches them, and its public trigger URL is gone.
- **Consent (FR18) and roster (FR4).** The roster lives in D1 and can be imported from CSV. A live team is scored only after 3 or more members opt in, and the HUD shows coverage such as "4 of 6 opted in".
- **Explainable early warning.** The banner states the rule result for the selected week, with its numbers and the signals that dropped most. The HUD shows the baseline and the reason for the team's cohort.
- **Honest data states.** "Not enough data" appears when under 40% of the score's signals have data. Every signal carries a Live, Simulated or No data badge, and the garden fades when there is no GitHub data.
- **Reliability.** `GET /api/health`, friendly loading and error states, security headers (CSP, HSTS and others), Workers Logs for ingestion, and the build SHA in the footer.
- **Feedback and help.** A "Report an issue" button and a "How to read your village" legend.
- **Quality gates.** `npm test` runs 18 checks including the Sprint 8 regression gate. GitHub Actions CI runs on every push. `scripts/smoke-test.mjs` checks deployed environments. Lighthouse scores Accessibility 100 and Best practices 100.

## Sprint 8: Robustness and responsible AI (October 2026)

- The coaching note's status is decided in code. The model writes only one action line, validated field by field.
- Healthy weeks skip the model. The model call has an 8 s timeout with a template fallback.
- API hardening: JSON errors, field limits, fail-closed auth, and corrupt rows skipped. The stress suite went from 20 of 32 to 32 of 32.
- Live-model evaluation (51 real Workers AI calls) and a coaching playbook.

## Sprint 6: End-to-end alpha (October 2026)

- P0 hardening: API auth and roles, server-side evidence, and rate limiting on coaching.
- Data provenance: placeholder sources are excluded from the score.
- Jira metrics are aligned to sprint boundaries.

## Sprint 5: Core AI prototype (September 2026)

- Cloudflare backend: shared D1, REST API, and a daily ingestion Worker for Jira and Google Calendar.
- AI coaching suggestions on Workers AI (Llama 3.1 8B), plus a 255-case evaluation harness.
- 3D village with dynamic teams and a compare view.
