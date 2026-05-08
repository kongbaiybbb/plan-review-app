export type Period = "day" | "week" | "month";

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

export type JournalEntry = {
  id: string;
  date: string;
  moodEmoji?: string;
  moodText?: string;
  energyLevel?: number;
  stressLevel?: number;
  focusLevel?: number;
  bodyState?: string;
  mindState?: string;
  keyEvents?: string;
  gratitudeText?: string;
  reflectionText?: string;
  tomorrowText?: string;
  freeText?: string;
  promptsOpen: boolean;
  createdAt: string;
} & SyncFields;

export type CompletionStats = {
  planned: number;
  completed: number;
  percent: number;
  label: string;
  hasPlan: boolean;
};
