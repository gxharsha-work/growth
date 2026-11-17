// Why a team sits in its peer cohort (FR8, fairness/transparency NFR, IT-03).
// Mirrors the server's peer rule in functions/api/_lib/evidence.ts: a peer
// shares BOTH tags (size bucket and function type). Tags are set by the team
// lead in the team editor, never inferred.

export function describeCohort(team, teams) {
  if (!team) return null
  const { sizeBucket, functionType } = team.cohort
  const peers = teams.filter(
    (t) => t.id !== team.id && t.cohort.sizeBucket === sizeBucket && t.cohort.functionType === functionType
  )
  const unset = sizeBucket === 'Unspecified' || functionType === 'Unspecified'
  return {
    label: `${sizeBucket} · ${functionType}`,
    peerCount: peers.length,
    reason: unset
      ? 'Cohort tags are not set yet, so this team has no peer comparison. The team lead can set them with the edit button.'
      : `In this cohort because the team lead tagged it "${sizeBucket}" and "${functionType}". Peers must match both tags: ${
          peers.length === 0 ? 'no other team does yet, so there is no peer comparison.' : `${peers.length} other team${peers.length === 1 ? '' : 's'} do${peers.length === 1 ? 'es' : ''}.`
        }`,
  }
}
