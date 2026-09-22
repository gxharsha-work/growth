// Line-icon silhouettes for the eight building shapes. Same stroke language
// as lucide so they sit naturally beside the UI icons, but each one is the
// actual building the user will see on the island.
const PATHS = {
  lighthouse: (
    <>
      <path d="M9.5 21 10.5 10h3l1 11" />
      <path d="M7 21h10" />
      <path d="M10 10V7.5h4V10" />
      <path d="m9.2 7.5 2.8-3.5 2.8 3.5" />
      <path d="M3.5 6.5 8 8M20.5 6.5 16 8" />
      <path d="M10.2 15h3.6" />
    </>
  ),
  windmill: (
    <>
      <path d="M9.5 21.5 10.3 13h3.4l.8 8.5" />
      <path d="M7 21.5h10" />
      <path d="m12 9-4-4.5M12 9l4-4.5M12 9l-4 4.5M12 9l4 4.5" />
      <circle cx="12" cy="9" r="0.9" />
    </>
  ),
  observatory: (
    <>
      <path d="M5 14a7 7 0 0 1 14 0" />
      <path d="M5 14v7h14v-7" />
      <path d="M12 7.2V14" />
      <path d="m14.2 10.5 4-4" />
      <path d="M10 21v-3.5h4V21" />
    </>
  ),
  pagoda: (
    <>
      <path d="M12 2v2" />
      <path d="M8.5 8 12 4l3.5 4z" />
      <path d="M6.5 12 12 8l5.5 4z" />
      <path d="M4.5 16 12 12l7.5 4z" />
      <path d="M8.5 16v5M15.5 16v5M3 21h18" />
    </>
  ),
  crystal: (
    <>
      <path d="M6 4h12l4 5-10 12L2 9z" />
      <path d="M2 9h20" />
      <path d="m9 4 3 5 3-5" />
      <path d="M12 9v12" />
    </>
  ),
  forge: (
    <>
      <path d="M3 21V12l6 3v-3l6 3V4h5v17z" />
      <path d="M8 18.5h2M14 18.5h2" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z" />
      <path d="m9 15-3 4 4-1M15 15l3 4-4-1" />
      <circle cx="12" cy="9" r="1.6" />
      <path d="m10.5 19 1.5 3 1.5-3" />
    </>
  ),
  bazaar: (
    <>
      <path d="m3.5 9 2-5h13l2 5" />
      <path d="M3.5 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M5.5 12v9M18.5 12v9M3 21h18" />
      <path d="M9.5 16.5h5" />
    </>
  ),
}

export default function ArchetypeGlyph({ id, size = 20, strokeWidth = 1.75, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[id] ?? PATHS.lighthouse}
    </svg>
  )
}
