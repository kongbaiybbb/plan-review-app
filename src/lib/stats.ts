import type { CompletionStats, RewardRule, Task } from "./types";

export function calculateCompletion(tasks: Task[]): CompletionStats {
  const planned = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const percent = planned === 0 ? 0 : Math.round((completed / planned) * 100);

  return {
    planned,
    completed,
    percent,
    label: planned === 0 ? "暂无计划" : `${completed}/${planned}`,
    hasPlan: planned > 0
  };
}

export function isRewardMet(rule: RewardRule, stats: CompletionStats): boolean {
  return rule.active && stats.hasPlan && stats.percent >= rule.thresholdPercent;
}

export function completionTone(percent: number): "low" | "mid" | "high" {
  if (percent >= 80) return "high";
  if (percent >= 50) return "mid";
  return "low";
}
