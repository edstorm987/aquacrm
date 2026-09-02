/** Numeric constraints shared by manifest validation and the settings writer. */
export interface NumericSettingsGrid {
  min?: number;
  max?: number;
  step?: number;
}

export type NumericSettingsValueError =
  | "not_a_number"
  | "number_below_min"
  | "number_above_max"
  | "number_step_mismatch";

interface DecimalInteger {
  coefficient: bigint;
  scale: number;
}

/**
 * Convert JavaScript's canonical finite-number representation into an exact
 * decimal integer. This avoids both sides of an epsilon bug: ordinary authored
 * decimals such as 0.3 stay on a 0.1 grid, while 1.0000000001 cannot sneak onto
 * an integer grid through a broad floating-point tolerance.
 */
function decimalInteger(value: number): DecimalInteger {
  const raw = value.toString().toLowerCase();
  const [mantissa, exponentText = "0"] = raw.split("e");
  const exponent = Number(exponentText);
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const decimalPlaces = fraction.length - exponent;
  if (decimalPlaces <= 0) {
    return {
      coefficient: BigInt(`${negative ? "-" : ""}${digits}`) * (10n ** BigInt(-decimalPlaces)),
      scale: 0,
    };
  }
  return {
    coefficient: BigInt(`${negative ? "-" : ""}${digits}`),
    scale: decimalPlaces,
  };
}

function scaledCoefficient(value: DecimalInteger, scale: number): bigint {
  return value.coefficient * (10n ** BigInt(scale - value.scale));
}

function matchesDecimalGrid(value: number, base: number, step: number): boolean {
  const decimalValue = decimalInteger(value);
  const decimalBase = decimalInteger(base);
  const decimalStep = decimalInteger(step);
  const scale = Math.max(decimalValue.scale, decimalBase.scale, decimalStep.scale);
  const offset = scaledCoefficient(decimalValue, scale) - scaledCoefficient(decimalBase, scale);
  const increment = scaledCoefficient(decimalStep, scale);
  return increment > 0n && offset % increment === 0n;
}

/** Return the first settings error for a numeric value, or null when valid. */
export function numericSettingsValueError(
  value: unknown,
  grid: NumericSettingsGrid,
): NumericSettingsValueError | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not_a_number";
  if (Number.isFinite(grid.min) && value < grid.min!) return "number_below_min";
  if (Number.isFinite(grid.max) && value > grid.max!) return "number_above_max";
  if (Number.isFinite(grid.step) && grid.step! > 0) {
    const base = Number.isFinite(grid.min) ? grid.min! : 0;
    if (!matchesDecimalGrid(value, base, grid.step!)) return "number_step_mismatch";
  }
  return null;
}
