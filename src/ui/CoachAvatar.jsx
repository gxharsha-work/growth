// The AI coach's little face: a sprout seedling, on-brand with the Growth
// village (same seedling the app logo uses). It "speaks" the coaching note in
// the adjacent speech bubble (see CoachingNote.jsx). Pure inline SVG so there
// is no asset to ship; `mood` only swaps the mouth/brow so the same figure can
// look happy (a healthy note), thinking (loading) or concerned (warning / no
// data). Decorative — the bubble text carries the meaning — so aria-hidden.
export default function CoachAvatar({ mood = 'happy', size = 46 }) {
  return (
    <svg
      className={`coach-avatar coach-avatar--${mood}`}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="coachHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#64d492" />
          <stop offset="1" stopColor="#2f9e63" />
        </linearGradient>
        <linearGradient id="coachLeaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ae8ac" />
          <stop offset="1" stopColor="#43b478" />
        </linearGradient>
      </defs>

      {/* contact shadow */}
      <ellipse cx="24" cy="43" rx="11" ry="2.3" fill="rgba(22,34,58,0.12)" />

      {/* everything above the ground bobs together */}
      <g className="coach-avatar-body">
        {/* sprout leaves + stem behind the head */}
        <g className="coach-avatar-sprout">
          <path d="M24 17 C18 7 9 9 10.5 15.5 C12 20.5 20 20 24 17Z" fill="url(#coachLeaf)" />
          <path d="M24 17 C30 7 39 9 37.5 15.5 C36 20.5 28 20 24 17Z" fill="url(#coachLeaf)" />
          <path d="M24 18 L24 11" stroke="#2f9e63" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* head / body */}
        <circle cx="24" cy="29" r="13" fill="url(#coachHead)" />
        <ellipse cx="19" cy="23" rx="4.5" ry="3" fill="rgba(255,255,255,0.22)" />

        {/* cheeks */}
        <circle cx="16.3" cy="31.5" r="1.9" fill="rgba(229,72,77,0.2)" />
        <circle cx="31.7" cy="31.5" r="1.9" fill="rgba(229,72,77,0.2)" />

        {/* eyes */}
        <g className="coach-avatar-eyes">
          <circle cx="19.6" cy="28" r="1.85" fill="#16223a" />
          <circle cx="28.4" cy="28" r="1.85" fill="#16223a" />
        </g>

        {/* mouth — the one part the mood changes */}
        {mood === 'concerned' ? (
          <path d="M21 34 Q24 31.6 27 34" stroke="#16223a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <ellipse className="coach-avatar-mouth" cx="24" cy="33" rx="1.7" ry="1.4" fill="#16223a" />
        ) : (
          <path d="M20.8 32.4 Q24 35.6 27.2 32.4" stroke="#16223a" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
