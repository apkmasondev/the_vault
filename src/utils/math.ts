export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const mapRange = (
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
): number => {
  if (inputMax === inputMin) return outputMin;

  const normalized = clamp((value - inputMin) / (inputMax - inputMin));
  return outputMin + normalized * (outputMax - outputMin);
};

export const damp = (
  current: number,
  target: number,
  smoothingSeconds: number,
  deltaSeconds: number,
): number => {
  if (smoothingSeconds <= 0) return target;
  const factor = 1 - Math.exp(-deltaSeconds / smoothingSeconds);
  return current + (target - current) * factor;
};

export const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const normalized = clamp((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
};
