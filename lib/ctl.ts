export const CTL_TC = 42;
export const ATL_TC = 7;

export function nextCtl(prev: number, load: number, tc: number = CTL_TC): number {
  return prev + (load - prev) / tc;
}

/**
 * Simulate CTL forward from a starting value over a list of daily loads.
 * Returns one CTL value per load (the value *after* that day's load is applied).
 */
export function simulateCtl(startCtl: number, loads: number[]): number[] {
  const out: number[] = [];
  let ctl = startCtl;
  for (const load of loads) {
    ctl = nextCtl(ctl, load);
    out.push(ctl);
  }
  return out;
}
