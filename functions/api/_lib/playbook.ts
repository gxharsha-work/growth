// The coaching playbook: for each signal, ONE concrete, outcome-linked move a team lead can make, and the
// guidance the model is given so it can word that move for the team's situation.
//
// Source: practitioner skills in docs/reference-skills/ (see its README for the mapping, licence and
// attribution). They are third-party working guidance, not validated research; what they gave us is
// SPECIFICITY. Sprint 5 and the first live-model run showed the model defaulting to "schedule a meeting to
// discuss ...", which the agile-coach skill names as a red flag (process without an outcome). Each move
// below names what to change or look at, and ties to what to watch afterwards.
//
// Constraint: NO digits in this file's text. Template notes are checked so that every number in them comes
// from the evidence (scripts/validation/faithfulness.mjs F3), and the model must not echo numbers.

import type { SignalId } from './facts'

export type Move = {
  step: string // the deterministic next step (template note and fallback); <= 160 chars
  guidance: string // given to the model as grounding
  source: string // where the idea comes from
}

export const PLAYBOOK: Record<SignalId, Move> = {
  cycleTime: {
    step: 'Look at the oldest in-progress items first and limit work in progress so work finishes before new work starts.',
    guidance:
      'Read cycle time as a spread, not an average: the slowest items and the items open longest are where delay hides. Limiting work in progress so that items finish before new ones start is the usual lever.',
    source: 'cycle-time-analyzer (aging work in progress, WIP limits, distribution not average)',
  },
  completion: {
    step: 'Commit to less than full team capacity, keep extra items as stretch, and re-plan unfinished work instead of rolling it over.',
    guidance:
      'Sprints filled to full capacity usually miss. A healthy commitment leaves headroom for the unexpected, with extra items kept separate as stretch. Unfinished work should be re-planned, not silently carried over.',
    source: 'sprint-plan (commitment discipline, capacity, stretch)',
  },
  reviewTurnaround: {
    step: 'Agree a review SLA (first review within one working day) and check review load per reviewer and pull request size.',
    guidance:
      'Slow reviews are usually a load or size problem: check how many reviews each reviewer holds and how large the pull requests are, and agree a service level for the first review. Assigning reviewers by code ownership helps spread the load.',
    source: 'vpe-advisor references (review SLA, PR size) and delivery-manager (review load, small batches)',
  },
  afterHoursCommits: {
    step: 'Check whether ad-hoc requests are eating sprint capacity, look at overtime trends, and make sure time off is being used.',
    guidance:
      'Work landing late in the day is a team-level signal about sustainable pace. Look at whether unplanned requests are eating sprint capacity and whether time off is being taken. Never frame it around individuals.',
    source: 'agile-coach team_health_checker (sustainable pace)',
  },
  meetingLoad: {
    step: 'Audit recurring meetings: keep the ones that produce decisions, shorten or cancel the rest, and require an agenda and an owner.',
    guidance:
      'Judge each recurring meeting by whether it produces decisions and actions that close. Cut or shorten the ones that decide nothing, and require an agenda and an owner for those that stay.',
    source: 'meeting-analyzer (decision density, recurring-meeting audit)',
  },
}
