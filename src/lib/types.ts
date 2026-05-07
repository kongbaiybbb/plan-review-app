export type Period = "week" | "month";

export type SyncFields = {
  updatedAt: string;
  deletedAt?: string;
};

export type Category = {
  id: string;
  name: string;
  color: string;
} & SyncFields;

export type Task = {
  id: string;
  date: string;
  title: string;
  categoryId: string;
  note?: string;
  completed: boolean;
  createdAt: string;
} & SyncFields;

export type ReviewEntry = {
  id: string;
  date: string;
  title: string;
  categoryId: string;
  taskId?: string;
  isAdHoc: boolean;
  createdAt: string;
} & SyncFields;

export type RewardRule = {
  id: string;
  period: Period;
  thresholdPercent: number;
  rewardText: string;
  active: boolean;
} & SyncFields;

export type RewardClaim = {
  id: string;
  ruleId: string;
  period: Period;
  periodKey: string;
  claimedAt: string;
} & SyncFields;

export type CompletionStats = {
  planned: number;
  completed: number;
  percent: number;
  label: string;
  hasPlan: boolean;
};
