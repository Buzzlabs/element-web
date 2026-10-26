import { reaisToCents } from "../../../../src/utils/admin/price";

describe("reaisToCents", () => {
    it.each([
        ["0", 0],
        ["10", 1000],
        ["10,50", 1050],
        ["10.50", 1050],
        ["19.99", 1999],
        ["0,29", 29],
        [" 5 ", 500],
        [".5", 50],
    ])("converts %p to %p cents", (input, expected) => {
        expect(reaisToCents(input)).toBe(expected);
    });

    it.each(["", "abc", "-1", "1e3", "0x10", "1,2,3", "10 20"])("rejects %p", (input) => {
        expect(reaisToCents(input)).toBeNull();
    });
});
