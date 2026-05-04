export function formatStrike(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : strike.toFixed(2).replace(/\.?0+$/, '')
}
