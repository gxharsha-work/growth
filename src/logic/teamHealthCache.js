// Per-team cache of computed health rows (see teamHealth.js). Its own module
// so signalsStore can invalidate it without a circular import.
export const healthCache = new Map()

export function invalidateTeamHealth(teamId) {
  healthCache.delete(teamId)
}
