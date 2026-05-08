import Dexie, { type Table } from "dexie";
import type { Category, JournalEntry, ReviewEntry, RewardClaim, RewardRule, Task } from "./types";

const defaultStamp = "2026-01-01T00:00:00.000Z";

export const defaultCategories: Category[] = [
  { id: "health", name: "健康", color: "#4f8f7d", updatedAt: defaultStamp },
  { id: "study", name: "学习", color: "#5e6fa3", updatedAt: defaultStamp },
  { id: "growth", name: "拓展", color: "#d6a548", updatedAt: defaultStamp },
  { id: "daily", name: "日常", color: "#d55e4f", updatedAt: defaultStamp }
];

class PlanReviewDatabase extends Dexie {
  categories!: Table<Category, string>;
  tasks!: Table<Task, string>;
  reviewEntries!: Table<ReviewEntry, string>;
  rewardRules!: Table<RewardRule, string>;
  rewardClaims!: Table<RewardClaim, string>;
  journalEntries!: Table<JournalEntry, string>;

  constructor() {
    super("personal-plan-review");
    this.version(1).stores({
      categories: "id, name",
      tasks: "id, date, categoryId, completed",
      reviewEntries: "id, date, categoryId, taskId, isAdHoc",
      rewardRules: "id, period, active",
      rewardClaims: "id, ruleId, period, periodKey"
    });
    this.version(2)
      .stores({
        categories: "id, name, updatedAt, deletedAt",
        tasks: "id, date, categoryId, completed, updatedAt, deletedAt",
        reviewEntries: "id, date, categoryId, taskId, isAdHoc, updatedAt, deletedAt",
        rewardRules: "id, period, active, updatedAt, deletedAt",
        rewardClaims: "id, ruleId, period, periodKey, updatedAt, deletedAt"
      })
      .upgrade(async (transaction) => {
        const stamp = nowIso();
        const tableNames = ["categories", "tasks", "reviewEntries", "rewardRules", "rewardClaims"];
        await Promise.all(
          tableNames.map((tableName) =>
            transaction
              .table(tableName)
              .toCollection()
              .modify((record) => {
                record.updatedAt = record.updatedAt ?? record.createdAt ?? record.claimedAt ?? stamp;
              })
          )
        );
      });
    this.version(3).stores({
      categories: "id, name, updatedAt, deletedAt",
      tasks: "id, date, categoryId, completed, updatedAt, deletedAt",
      reviewEntries: "id, date, categoryId, taskId, isAdHoc, updatedAt, deletedAt",
      rewardRules: "id, period, active, updatedAt, deletedAt",
      rewardClaims: "id, ruleId, period, periodKey, updatedAt, deletedAt",
      journalEntries: "id, date, updatedAt, deletedAt"
    });
  }
}

export const db = new PlanReviewDatabase();

export async function ensureDefaults() {
  const count = await db.categories.filter((category) => !category.deletedAt).count();
  if (count === 0) {
    await db.categories.bulkPut(defaultCategories.map((category) => ({ ...category, updatedAt: nowIso() })));
  }
}

export async function getTasksInRange(start: string, end: string): Promise<Task[]> {
  const tasks = await db.tasks.where("date").between(start, end, true, true).sortBy("date");
  return tasks.filter((task) => !task.deletedAt);
}

export async function getReviewsInRange(start: string, end: string): Promise<ReviewEntry[]> {
  const entries = await db.reviewEntries.where("date").between(start, end, true, true).sortBy("date");
  return entries.filter((entry) => !entry.deletedAt);
}

export async function getJournalEntriesInRange(start: string, end: string): Promise<JournalEntry[]> {
  const entries = await db.journalEntries.where("date").between(start, end, true, true).sortBy("date");
  return entries.filter((entry) => !entry.deletedAt);
}

export async function getActiveCategories(): Promise<Category[]> {
  return (await db.categories.toArray()).filter((category) => !category.deletedAt);
}

export async function getAllCategories(): Promise<Category[]> {
  return db.categories.toArray();
}

export async function getActiveRewardRules(): Promise<RewardRule[]> {
  return (await db.rewardRules.toArray()).filter((rule) => !rule.deletedAt);
}

export async function getActiveRewardClaims(): Promise<RewardClaim[]> {
  return (await db.rewardClaims.toArray()).filter((claim) => !claim.deletedAt);
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function exportAllData() {
  return {
    exportedAt: nowIso(),
    categories: await getActiveCategories(),
    tasks: (await db.tasks.toArray()).filter((item) => !item.deletedAt),
    reviewEntries: (await db.reviewEntries.toArray()).filter((item) => !item.deletedAt),
    rewardRules: await getActiveRewardRules(),
    rewardClaims: await getActiveRewardClaims(),
    journalEntries: (await db.journalEntries.toArray()).filter((item) => !item.deletedAt)
  };
}

export async function importAllData(payload: {
  categories?: Category[];
  tasks?: Task[];
  reviewEntries?: ReviewEntry[];
  rewardRules?: RewardRule[];
  rewardClaims?: RewardClaim[];
  journalEntries?: JournalEntry[];
}) {
  const stamp = nowIso();
  await db.transaction("rw", [db.categories, db.tasks, db.reviewEntries, db.rewardRules, db.rewardClaims, db.journalEntries], async () => {
    if (payload.categories) await db.categories.bulkPut(payload.categories.map((item) => ({ ...item, updatedAt: item.updatedAt ?? stamp })));
    if (payload.tasks) await db.tasks.bulkPut(payload.tasks.map((item) => ({ ...item, updatedAt: item.updatedAt ?? stamp })));
    if (payload.reviewEntries) await db.reviewEntries.bulkPut(payload.reviewEntries.map((item) => ({ ...item, updatedAt: item.updatedAt ?? stamp })));
    if (payload.rewardRules) await db.rewardRules.bulkPut(payload.rewardRules.map((item) => ({ ...item, updatedAt: item.updatedAt ?? stamp })));
    if (payload.rewardClaims) await db.rewardClaims.bulkPut(payload.rewardClaims.map((item) => ({ ...item, updatedAt: item.updatedAt ?? stamp })));
    if (payload.journalEntries) await db.journalEntries.bulkPut(payload.journalEntries.map((item) => ({ ...item, updatedAt: item.updatedAt ?? stamp })));
  });
}

export type SyncTableName = "categories" | "tasks" | "reviewEntries" | "rewardRules" | "rewardClaims" | "journalEntries";

export async function markDeleted(tableName: SyncTableName, id: string) {
  const stamp = nowIso();
  await db.table(tableName).update(id, {
    deletedAt: stamp,
    updatedAt: stamp
  });
}
