// The eight building "shapes" a capability can take. A capability is
// whatever a team decides it is (Payments, Paid Media, Customer Success...),
// so the shape is purely a visual identity — it never encodes a discipline.
// `guessArchetype` picks a sensible default from the name so naming a
// capability is the only thing anyone has to do.

export const ARCHETYPES = {
  lighthouse: {
    id: 'lighthouse',
    label: 'Lighthouse',
    blurb: 'Sets direction and guides the way',
    color: '#ef5350',
    height: 2.5,
  },
  windmill: {
    id: 'windmill',
    label: 'Windmill',
    blurb: 'Keeps everything turning',
    color: '#f2b233',
    height: 2.2,
  },
  observatory: {
    id: 'observatory',
    label: 'Observatory',
    blurb: 'Watches, measures and protects',
    color: '#6c63e8',
    height: 2.0,
  },
  pagoda: {
    id: 'pagoda',
    label: 'Pagoda',
    blurb: 'Built on knowledge and craft',
    color: '#1fa596',
    height: 2.4,
  },
  crystal: {
    id: 'crystal',
    label: 'Crystal Spire',
    blurb: 'Shapes what people see and feel',
    color: '#2ea8e8',
    height: 2.2,
  },
  forge: {
    id: 'forge',
    label: 'Forge',
    blurb: 'Where the heavy lifting happens',
    color: '#f0703a',
    height: 1.9,
  },
  rocket: {
    id: 'rocket',
    label: 'Launch Pad',
    blurb: 'Drives growth and launches',
    color: '#e94a8a',
    height: 2.4,
  },
  bazaar: {
    id: 'bazaar',
    label: 'Bazaar',
    blurb: 'Connects with customers and partners',
    color: '#4bae5c',
    height: 1.8,
  },
}

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES)

// Keyword -> shape. First match wins. Deliberately broad: it only has to be
// a good first guess, and the user can always swap the shape.
const KEYWORD_RULES = [
  [/front|ui\b|ux|design|brand|creative|visual|web\b|mobile/, 'crystal'],
  [/qa|quality|test|secur|complian|risk|audit|trust|safety|monitor/, 'observatory'],
  [/devops|infra|cloud|sre|reliab|platform|ops\b|operations|release|deploy/, 'windmill'],
  [/back|api|service|data eng|pipeline|payment|billing|core|database|integration/, 'forge'],
  [/growth|market|paid|campaign|launch|acquisition|product|media|lifecycle|crm|email/, 'rocket'],
  [/sales|partner|support|customer|success|referral|community|account|service desk/, 'bazaar'],
  [/analytic|insight|research|learn|document|enable|training|knowledge|science|bi\b/, 'pagoda'],
  [/seo|content|strateg|plan|vision|roadmap|lead|manage|pmo|program/, 'lighthouse'],
]

function hashString(text) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Best-guess shape for a capability name. `usedCounts` (archetypeId ->
 * number already placed) is only used for the no-keyword fallback, which
 * prefers the least-used shape so a village full of unfamiliar names still
 * looks varied.
 */
export function guessArchetype(name, usedCounts = {}) {
  const text = (name ?? '').toLowerCase()
  for (const [pattern, id] of KEYWORD_RULES) {
    if (pattern.test(text)) return id
  }
  const offset = hashString(text)
  const ranked = ARCHETYPE_IDS.map((id, i) => ({
    id,
    used: usedCounts[id] ?? 0,
    order: (i + offset) % ARCHETYPE_IDS.length,
  })).sort((a, b) => a.used - b.used || a.order - b.order)
  return ranked[0].id
}

// Shown for any team once its own suggestions are placed — a starting
// vocabulary that isn't tied to engineering.
export const GENERIC_SUGGESTIONS = [
  'Delivery',
  'Quality',
  'Design',
  'Operations',
  'Customer Success',
  'Analytics',
]
