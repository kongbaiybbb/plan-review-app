import { describe, expect, it } from "vitest";
import { chooseLatest } from "./sync";

describe("chooseLatest", () => {
  type TestItem = {
    id: string;
    updatedAt: string;
    deletedAt?: string;
  };

  it("keeps the local item when local updatedAt is newer", () => {
    const local: TestItem = { id: "task_1", updatedAt: "2026-05-07T10:00:00.000Z" };
    const remote: TestItem = { id: "task_1", updatedAt: "2026-05-07T09:00:00.000Z" };

    expect(chooseLatest(local, remote)).toBe(local);
  });

  it("uses the remote item when remote updatedAt is newer", () => {
    const local: TestItem = { id: "task_1", updatedAt: "2026-05-07T09:00:00.000Z" };
    const remote: TestItem = { id: "task_1", updatedAt: "2026-05-07T10:00:00.000Z" };

    expect(chooseLatest(local, remote)).toBe(remote);
  });

  it("keeps remote soft-delete tombstones when they are newer", () => {
    const local: TestItem = { id: "task_1", updatedAt: "2026-05-07T09:00:00.000Z" };
    const remote: TestItem = {
      id: "task_1",
      updatedAt: "2026-05-07T10:00:00.000Z",
      deletedAt: "2026-05-07T10:00:00.000Z"
    };

    expect(chooseLatest(local, remote).deletedAt).toBe("2026-05-07T10:00:00.000Z");
  });
});
