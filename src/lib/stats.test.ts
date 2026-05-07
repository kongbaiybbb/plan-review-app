import { describe, expect, it } from "vitest";
import { calculateCompletion, isRewardMet } from "./stats";
import type { RewardRule, Task } from "./types";

const task = (completed: boolean, date = "2026-05-07"): Task => ({
  id: crypto.randomUUID(),
  date,
  title: "任务",
  categoryId: "study",
  completed,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

describe("calculateCompletion", () => {
  it("returns zero and no-plan label for empty plans", () => {
    expect(calculateCompletion([])).toMatchObject({
      planned: 0,
      completed: 0,
      percent: 0,
      label: "暂无计划",
      hasPlan: false
    });
  });

  it("calculates percentage from completed planned tasks", () => {
    expect(calculateCompletion([task(true), task(false), task(true)])).toMatchObject({
      planned: 3,
      completed: 2,
      percent: 67,
      label: "2/3",
      hasPlan: true
    });
  });
});

describe("isRewardMet", () => {
  const rule: RewardRule = {
    id: "rule",
    period: "week",
    thresholdPercent: 80,
    rewardText: "看一部电影",
    active: true,
    updatedAt: new Date().toISOString()
  };

  it("requires an active rule, a plan, and enough completion", () => {
    expect(isRewardMet(rule, calculateCompletion([task(true), task(true)]))).toBe(true);
    expect(isRewardMet(rule, calculateCompletion([task(true), task(false)]))).toBe(false);
    expect(isRewardMet(rule, calculateCompletion([]))).toBe(false);
    expect(isRewardMet({ ...rule, active: false }, calculateCompletion([task(true)]))).toBe(false);
  });
});
