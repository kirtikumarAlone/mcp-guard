import { describe, expect, it } from "vitest";
import { assertReadOnlySelect, clampLimit, withLimit } from "../src/dataSources/postgres";
import { HttpError } from "../src/middleware/errors";

describe("postgres source guard", () => {
  it("accepts a plain SELECT", () => {
    expect(assertReadOnlySelect("select * from customers")).toBe("select * from customers");
  });

  it("strips a trailing semicolon", () => {
    expect(assertReadOnlySelect("SELECT 1;")).toBe("SELECT 1");
  });

  it("rejects anything that isn't a SELECT", () => {
    expect(() => assertReadOnlySelect("DELETE FROM customers")).toThrow(HttpError);
    expect(() => assertReadOnlySelect("update customers set x=1")).toThrow(HttpError);
    expect(() => assertReadOnlySelect("DROP TABLE customers")).toThrow(HttpError);
  });

  it("rejects a second statement stacked after the first", () => {
    expect(() => assertReadOnlySelect("select 1; drop table customers")).toThrow(HttpError);
  });

  it("rejects a write keyword hidden inside an otherwise SELECT-shaped query", () => {
    expect(() =>
      assertReadOnlySelect("select * from customers where 1=1; insert into x values (1)"),
    ).toThrow(HttpError);
  });

  it("rejects an empty query", () => {
    expect(() => assertReadOnlySelect("   ")).toThrow(HttpError);
  });

  it("appends a LIMIT only when the query doesn't already have one", () => {
    expect(withLimit("select * from t", 10)).toBe("select * from t LIMIT 10");
    expect(withLimit("select * from t limit 5", 10)).toBe("select * from t limit 5");
  });

  it("clamps the requested row limit into a safe range", () => {
    expect(clampLimit(undefined)).toBeGreaterThan(0);
    expect(clampLimit(100000)).toBeLessThanOrEqual(200);
    expect(clampLimit(-5)).toBeGreaterThanOrEqual(1);
  });
});
