/* Shared 2:1 isometric projection for the mini floor-stack navigator.
   Plate coordinates (1000×640) → tiny axonometric diorama. */

const K = 0.115
const CX = 0.866 * K // cos 30°
const SY = 0.5 * K // sin 30°

export function isoPt(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * CX, y: (x + y) * SY }
}

/** SVG path for an axis-aligned plate rect projected to iso. */
export function isoRect(x: number, y: number, w: number, h: number): string {
  const a = isoPt(x, y)
  const b = isoPt(x + w, y)
  const c = isoPt(x + w, y + h)
  const d = isoPt(x, y + h)
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)} L${c.x.toFixed(1)},${c.y.toFixed(1)} L${d.x.toFixed(1)},${d.y.toFixed(1)} Z`
}
