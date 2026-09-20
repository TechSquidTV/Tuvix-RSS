import { expect, it } from "vitest";
import { expectError } from "./helpers";

it("fails when the operation resolves instead of throwing", async () => {
  await expect(expectError(async () => 42)).rejects.toThrow("but it did not");
});
it("returns the original matching error", async () => {
  const error = new Error("expected failure");
  expect(
    await expectError(async () => {
      throw error;
    }, /expected/)
  ).toBe(error);
});
it("rejects a mismatched error", async () => {
  await expect(
    expectError(async () => {
      throw new Error("actual");
    }, "expected")
  ).rejects.toThrow("Expected error message");
});
