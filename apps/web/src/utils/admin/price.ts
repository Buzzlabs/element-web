/**
 * Converts a price typed in reais (e.g. "10,50" or "10.5") into integer cents.
 *
 * Returns null when the text is not a valid non-negative amount. The rounding
 * happens after the multiplication, so values such as "19.99" do not end up as
 * 1998.9999999999998.
 */
export function reaisToCents(input: string): number | null {
    const normalized = input.trim().replace(",", ".");
    if (!/^(\d+|\d*\.\d+)$/.test(normalized)) return null;

    return Math.round(Number(normalized) * 100);
}
