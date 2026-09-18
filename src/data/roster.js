// Static roster + peer cohort data — stand-in for a future HRIS integration (FR4)
// and peer-group tagging (FR8). All names are fictional placeholders.

export const TEAM_IDS = ['platform', 'backend', 'solstice']

export const TEAMS = {
  platform: {
    id: 'platform',
    name: 'Platform Team',
    // FR8: peer cohort tags — teams sharing these are considered a valid
    // peer-comparison pair (same headcount bucket, same function type).
    cohort: {
      sizeBucket: '6-10 engineers',
      functionType: 'Backend/Platform',
    },
  },
  backend: {
    id: 'backend',
    name: 'Backend Team',
    cohort: {
      sizeBucket: '6-10 engineers',
      functionType: 'Backend/Platform',
    },
  },
  // Fed by real signals from scripts/jira-ingest.js (see mockSignals.js).
  // Fictional client engagement used to pilot the real Jira integration.
  solstice: {
    id: 'solstice',
    name: 'Growth (Solstice Outdoors)',
    cohort: {
      sizeBucket: '1-5 engineers',
      functionType: 'Growth Marketing',
    },
  },
}

export const ROSTERS = {
  platform: [
    { name: 'Ava Stone', role: 'Tech Lead', team: 'platform' },
    { name: 'Marcus Cole', role: 'Platform Engineer', team: 'platform' },
    { name: 'Priya Nandan', role: 'Platform Engineer', team: 'platform' },
    { name: 'Leo Fischer', role: 'Site Reliability Engineer', team: 'platform' },
    { name: 'Noor Haddad', role: 'Platform Engineer', team: 'platform' },
    { name: 'Jun Park', role: 'QA Engineer', team: 'platform' },
  ],
  backend: [
    { name: 'Diego Ramos', role: 'Tech Lead', team: 'backend' },
    { name: 'Sofia Bianchi', role: 'Backend Engineer', team: 'backend' },
    { name: 'Tariq Malik', role: 'Backend Engineer', team: 'backend' },
    { name: 'Grace Owusu', role: 'Backend Engineer', team: 'backend' },
    { name: 'Ken Ibarra', role: 'Backend Engineer', team: 'backend' },
  ],
  // Real assignees from the growth3d SCRUM Jira project.
  solstice: [
    { name: 'Kristen Wang', role: 'Growth Lead', team: 'solstice' },
    { name: 'Jenny Shen', role: 'SEO & Content Strategist', team: 'solstice' },
    { name: 'Harshavardhini Gururaj', role: 'Paid Media Manager', team: 'solstice' },
    { name: 'Saloni Parekh', role: 'Lifecycle/CRM Marketer', team: 'solstice' },
    { name: 'Vicky Lin', role: 'Analyst', team: 'solstice' },
    { name: 'Harshini Sivachitravel', role: 'Referral & Partnerships Lead', team: 'solstice' },
  ],
}
