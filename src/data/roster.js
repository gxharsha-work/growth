// Static roster data — stand-in for a future HRIS integration (FR4). All
// names are fictional placeholders. The team list itself (id, name, cohort,
// capabilities) now lives in src/store/teamsStore.js so it can be created/
// renamed/deleted at runtime — ROSTERS (member lists) is out of scope for
// that and stays static here, keyed by the same team ids.

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
