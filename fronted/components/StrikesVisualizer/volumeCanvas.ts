// BSM normal CDF (A&S 7.1.26) — used only for Phase-1 mock volume simulation
function ncdf(x: number): number {
  const p = 0.2316419
  const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937
  const b4 = -1.821255978, b5 = 1.330274429
  const absX = Math.abs(x)
  const t = 1 / (1 + p * absX)
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))))
  const approx = 1 - poly * Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
  return x >= 0 ? approx : 1 - approx
}

// Deterministic pseudo-random — stable bars across re-renders
function srng(seed: number): number {
  let h = seed | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff
}

export function drawVolumeCanvas(
  canvas: HTMLCanvasElement,
  W: number,
  stockPrice: number,
  sMin: number,
  sMax: number,
  sig: number,
  T: number,
): void {
  canvas.width = W
  canvas.height = 40
  const ctx = canvas.getContext('2d')
  if (!ctx || W === 0) return
  ctx.clearRect(0, 0, W, 40)

  const maxVol = 100_000
  const step = 5
  for (let s = Math.ceil(sMin / step) * step; s <= sMax; s += step) {
    const z = Math.log(s / stockPrice) / (sig * Math.sqrt(T))
    const seed = Math.round(s * 10)
    const callV = Math.round(ncdf(z + 0.5) * maxVol * srng(seed) * 0.5 + 5_000)
    const putV  = Math.round(ncdf(-z - 0.3) * maxVol * srng(seed + 1) * 0.5 + 3_000)
    const x = (s - sMin) / (sMax - sMin) * W
    const bw = Math.max(W * (step / (sMax - sMin)) * 0.4, 2)
    ctx.fillStyle = 'rgba(10,184,122,0.4)'
    ctx.fillRect(x - bw / 2, 40 - callV / maxVol * 38, bw / 2, callV / maxVol * 38)
    ctx.fillStyle = 'rgba(232,54,74,0.4)'
    ctx.fillRect(x, 40 - putV / maxVol * 38, bw / 2, putV / maxVol * 38)
  }
}
