import type { Session } from "@supabase/supabase-js";
import { db, nowIso } from "./db";
import { supabase, getSession as getSupabaseSession, isSyncConfigured } from "./supabase";
import type { Category, Period, ReviewEntry, RewardClaim, RewardRule, SyncFields, Task } from "./types";

export type SyncMode = "startup" | "manual" | "after-write";

export type SyncState = {
  status: "not-configured" | "signed-out" | "syncing" | "synced" | "error";
  message: string;
  lastSyncedAt?: string;
};

export const initialSyncState: SyncState = {
  status: isSyncConfigured ? "signed-out" : "not-configured",
  message: isSyncConfigured ? "本地模式" : "未配置 Supabase"
};

type RemoteBase = {
  id: string;
  user_id: string;
  updated_at: string;
  deleted_at?: string | null;
};

type RemoteCategory = RemoteBase & { name: string; color: string };
type RemoteTask = RemoteBase & {
  date: string;
  title: string;
  category_id: string;
  note?: string | null;
  completed: boolean;
  created_at: string;
};
type RemoteReviewEntry = RemoteBase & {
  date: string;
  title: string;
  category_id: string;
  task_id?: string | null;
  is_ad_hoc: boolean;
  created_at: string;
};
type RemoteRewardRule = RemoteBase & {
  period: Period;
  threshold_percent: number;
  reward_text: string;
  active: boolean;
};
type RemoteRewardClaim = RemoteBase & {
  rule_id: string;
  period: Period;
  period_key: string;
  claimed_at: string;
};

export function chooseLatest<T extends SyncFields>(local: T | undefined, remote: T): T {
  if (!local) return remote;
  return new Date(remote.updatedAt).getTime() >= new Date(local.updatedAt).getTime() ? remote : local;
}

export async function syncNow(mode: SyncMode = "manual", onState?: (state: SyncState) => void): Promise<SyncState> {
  if (!isSyncConfigured || !supabase) {
    const state: SyncState = { status: "not-configured", message: "未配置 Supabase，当前仅本地保存" };
    onState?.(state);
    return state;
  }

  const session = await getSupabaseSession();
  if (!session?.user) {
    const state: SyncState = { status: "signed-out", message: "未登录，当前仅本地保存" };
    onState?.(state);
    return state;
  }

  onState?.({ status: "syncing", message: mode === "after-write" ? "正在后台同步" : "正在同步" });

  try {
    await pullRemoteData(session);
    await uploadLocalData(session);
    await pullRemoteData(session);
    const state: SyncState = { status: "synced", message: "已同步", lastSyncedAt: nowIso() };
    onState?.(state);
    return state;
  } catch (error) {
    const state: SyncState = {
      status: "error",
      message: error instanceof Error ? error.message : "同步失败"
    };
    onState?.(state);
    return state;
  }
}

async function uploadLocalData(session: Session) {
  await upsertRows("categories", (await db.categories.toArray()).map((item) => categoryToRemote(item, session.user.id)));
  await upsertRows("tasks", (await db.tasks.toArray()).map((item) => taskToRemote(item, session.user.id)));
  await upsertRows("review_entries", (await db.reviewEntries.toArray()).map((item) => reviewToRemote(item, session.user.id)));
  await upsertRows("reward_rules", (await db.rewardRules.toArray()).map((item) => ruleToRemote(item, session.user.id)));
  await upsertRows("reward_claims", (await db.rewardClaims.toArray()).map((item) => claimToRemote(item, session.user.id)));
}

async function pullRemoteData(session: Session) {
  const [categories, tasks, reviews, rules, claims] = await Promise.all([
    selectRows<RemoteCategory>("categories", session.user.id),
    selectRows<RemoteTask>("tasks", session.user.id),
    selectRows<RemoteReviewEntry>("review_entries", session.user.id),
    selectRows<RemoteRewardRule>("reward_rules", session.user.id),
    selectRows<RemoteRewardClaim>("reward_claims", session.user.id)
  ]);

  await mergeIntoTable(db.categories, categories.map(categoryFromRemote));
  await mergeIntoTable(db.tasks, tasks.map(taskFromRemote));
  await mergeIntoTable(db.reviewEntries, reviews.map(reviewFromRemote));
  await mergeIntoTable(db.rewardRules, rules.map(ruleFromRemote));
  await mergeIntoTable(db.rewardClaims, claims.map(claimFromRemote));
}

async function upsertRows(tableName: string, rows: RemoteBase[]) {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from(tableName).upsert(rows, { onConflict: "user_id,id" });
  if (error) throw error;
}

async function selectRows<T extends RemoteBase>(tableName: string, userId: string): Promise<T[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(tableName).select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as T[];
}

async function mergeIntoTable<T extends SyncFields & { id: string }>(table: { get: (id: string) => Promise<T | undefined>; put: (value: T) => Promise<unknown> }, remoteItems: T[]) {
  for (const remote of remoteItems) {
    const local = await table.get(remote.id);
    await table.put(chooseLatest(local, remote));
  }
}

function cleanDeletedAt(value?: string | null) {
  return value ?? undefined;
}

function categoryToRemote(item: Category, userId: string): RemoteCategory {
  return {
    id: item.id,
    user_id: userId,
    name: item.name,
    color: item.color,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt ?? null
  };
}

function categoryFromRemote(item: RemoteCategory): Category {
  return {
    id: item.id,
    name: item.name,
    color: item.color,
    updatedAt: item.updated_at,
    deletedAt: cleanDeletedAt(item.deleted_at)
  };
}

function taskToRemote(item: Task, userId: string): RemoteTask {
  return {
    id: item.id,
    user_id: userId,
    date: item.date,
    title: item.title,
    category_id: item.categoryId,
    note: item.note ?? null,
    completed: item.completed,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt ?? null
  };
}

function taskFromRemote(item: RemoteTask): Task {
  return {
    id: item.id,
    date: item.date,
    title: item.title,
    categoryId: item.category_id,
    note: item.note ?? undefined,
    completed: item.completed,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: cleanDeletedAt(item.deleted_at)
  };
}

function reviewToRemote(item: ReviewEntry, userId: string): RemoteReviewEntry {
  return {
    id: item.id,
    user_id: userId,
    date: item.date,
    title: item.title,
    category_id: item.categoryId,
    task_id: item.taskId ?? null,
    is_ad_hoc: item.isAdHoc,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt ?? null
  };
}

function reviewFromRemote(item: RemoteReviewEntry): ReviewEntry {
  return {
    id: item.id,
    date: item.date,
    title: item.title,
    categoryId: item.category_id,
    taskId: item.task_id ?? undefined,
    isAdHoc: item.is_ad_hoc,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: cleanDeletedAt(item.deleted_at)
  };
}

function ruleToRemote(item: RewardRule, userId: string): RemoteRewardRule {
  return {
    id: item.id,
    user_id: userId,
    period: item.period,
    threshold_percent: item.thresholdPercent,
    reward_text: item.rewardText,
    active: item.active,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt ?? null
  };
}

function ruleFromRemote(item: RemoteRewardRule): RewardRule {
  return {
    id: item.id,
    period: item.period,
    thresholdPercent: item.threshold_percent,
    rewardText: item.reward_text,
    active: item.active,
    updatedAt: item.updated_at,
    deletedAt: cleanDeletedAt(item.deleted_at)
  };
}

function claimToRemote(item: RewardClaim, userId: string): RemoteRewardClaim {
  return {
    id: item.id,
    user_id: userId,
    rule_id: item.ruleId,
    period: item.period,
    period_key: item.periodKey,
    claimed_at: item.claimedAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt ?? null
  };
}

function claimFromRemote(item: RemoteRewardClaim): RewardClaim {
  return {
    id: item.id,
    ruleId: item.rule_id,
    period: item.period,
    periodKey: item.period_key,
    claimedAt: item.claimed_at,
    updatedAt: item.updated_at,
    deletedAt: cleanDeletedAt(item.deleted_at)
  };
}
