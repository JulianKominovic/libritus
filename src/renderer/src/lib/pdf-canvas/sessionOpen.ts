/** True when an in-flight open should still apply its result to the UI. */
export function shouldApplyOpenResult(
  cancelled: boolean,
  gen: number,
  currentGen: number
): boolean {
  return !cancelled && gen === currentGen
}
