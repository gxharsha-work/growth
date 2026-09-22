import { getToonGradient } from '../toonGradient'

// One toon material with the conventions every structure follows:
//  - `ghost` makes it a translucent placement preview
//  - `noTint` opts out of the health tint (lights, flames, glass keep their
//    color even in a struggling week — only "solid" parts fade)
//  - `glow` adds emissive light in the material's own color
export function Mat({ color, ghost = false, noTint = false, glow = 0, opacity = 1, side }) {
  const transparent = ghost || opacity < 1
  const extra = {}
  if (glow > 0) {
    extra.emissive = color
    extra.emissiveIntensity = glow
  }
  if (side !== undefined) extra.side = side
  if (noTint) extra.userData = { noTint: true }
  return (
    <meshToonMaterial
      color={color}
      gradientMap={getToonGradient()}
      transparent={transparent}
      opacity={ghost ? Math.min(opacity, 0.55) : opacity}
      depthWrite={!transparent}
      {...extra}
    />
  )
}

// Unlit, always-bright material for beams, flames and smoke.
export function Glow({ color, opacity = 1, ghost = false }) {
  return (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={ghost ? 0 : opacity}
      depthWrite={false}
      userData={{ noTint: true }}
    />
  )
}

export const STONE = '#c9c3b8'
export const STONE_DARK = '#8c93a1'
export const WOOD = '#8a5a3b'
export const WOOD_DARK = '#5b3a27'
export const CREAM = '#f6ead2'
export const WHITE = '#fbfbff'
export const DARK = '#2f2a3d'
