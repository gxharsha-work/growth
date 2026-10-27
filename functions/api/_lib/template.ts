// Deterministic coaching note built entirely from the fact sheet, no model.
// Two jobs: it's the report's "template baseline" the AI has to beat, and it's
// the safe fallback shown whenever the model's wording fails validation
// (validate.ts). The SIGNAL line is the same code-generated sentence the model
// path uses, so a fallback is indistinguishable in its factual content.

import { type Facts, type SignalId, signalSentence } from './facts'

const NEXT_STEP: Record<SignalId, string> = {
  cycleTime: 'Review what is slowing tickets from start to done.',
  completion: 'Check scope and blockers on the unfinished sprint work.',
  reviewTurnaround: 'Spread review load or agree a review turnaround target.',
  afterHoursCommits: 'Check whether deadlines are pushing work late in the day.',
  meetingLoad: 'Audit recurring meetings for any that can be dropped.',
}

export type CoachingNote = { status: string; signal: string; action: string }

// The status comes from facts.statusText (derived in code from the flag, the
// trend and the absolute score). A healthy week gets no next step: Sprint 5
// showed that generated "next steps" on healthy weeks only manufacture concern.
export function templateNote(facts: Facts): CoachingNote {
  return {
    status: facts.statusText,
    signal: signalSentence(facts),
    action: facts.status === 'healthy' ? 'No action needed — keep monitoring.' : NEXT_STEP[facts.top.id],
  }
}
