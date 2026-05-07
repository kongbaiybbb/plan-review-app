import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardList,
  Gift,
  Plus,
  RefreshCw,
  Settings,
  Trash2
} from "lucide-react";
import {
  createId,
  db,
  ensureDefaults,
  exportAllData,
  getActiveCategories,
  getActiveRewardClaims,
  getActiveRewardRules,
  getReviewsInRange,
  getTasksInRange,
  importAllData,
  markDeleted,
  nowIso
} from "./lib/db";
import { addDays, formatZhDate, getPeriodRange, periodKey, rangeLabel, todayKey } from "./lib/date";
import { calculateCompletion, completionTone, isRewardMet } from "./lib/stats";
import { getSession, signInWithEmail, signOut, supabase, isSyncConfigured } from "./lib/supabase";
import { initialSyncState, syncNow, type SyncState } from "./lib/sync";
import type { Category, Period, ReviewEntry, RewardRule, Task } from "./lib/types";

type View = "plan" | "review" | "compare" | "reward" | "settings";

const viewItems: Array<{ id: View; label: string; icon: typeof ClipboardList }> = [
  { id: "plan", label: "规划", icon: ClipboardList },
  { id: "review", label: "复盘", icon: CalendarCheck },
  { id: "compare", label: "对比", icon: ChartNoAxesCombined },
  { id: "reward", label: "奖励", icon: Gift },
  { id: "settings", label: "设置", icon: Settings }
];

export function App() {
  const [view, setView] = useState<View>("plan");
  const [date, setDate] = useState(todayKey());
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [claims, setClaims] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>(initialSyncState);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const refresh = () => setRefreshKey((value) => value + 1);
  const syncAndRefresh = async (mode: "startup" | "manual" | "after-write" = "after-write") => {
    await syncNow(mode, setSyncState);
    refresh();
  };

  useEffect(() => {
    ensureDefaults().then(async () => {
      const session = await getSession();
      setUserEmail(session?.user.email ?? null);
      await syncAndRefresh("startup");
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (session?.user) void syncAndRefresh("startup");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncAndRefresh("startup");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const monthRange = getPeriodRange("month", date);
    const range = { start: addDays(monthRange.start, -7), end: addDays(monthRange.end, 7) };
    Promise.all([
      getActiveCategories(),
      getTasksInRange(range.start, range.end),
      getReviewsInRange(range.start, range.end),
      getActiveRewardRules(),
      getActiveRewardClaims()
    ]).then(([nextCategories, nextTasks, nextReviews, nextRules, nextClaims]) => {
      setCategories(nextCategories);
      setTasks(nextTasks);
      setReviews(nextReviews);
      setRules(nextRules);
      setClaims(nextClaims.map((claim) => `${claim.ruleId}:${claim.periodKey}`));
    });
  }, [date, refreshKey]);

  const dayTasks = tasks.filter((task) => task.date === date);
  const dayReviews = reviews.filter((entry) => entry.date === date);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">个人计划复盘</p>
          <h1>{formatZhDate(date)}</h1>
        </div>
        <div className="date-controls" aria-label="日期选择">
          <button type="button" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <button type="button" onClick={() => setDate(addDays(date, 1))}>›</button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="主功能">
        {viewItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <main>
        {view === "plan" && <PlanView date={date} categories={categories} tasks={dayTasks} refresh={refresh} syncAndRefresh={syncAndRefresh} />}
        {view === "review" && (
          <ReviewView date={date} categories={categories} tasks={dayTasks} reviews={dayReviews} categoryMap={categoryMap} syncAndRefresh={syncAndRefresh} />
        )}
        {view === "compare" && <CompareView date={date} categories={categories} tasks={tasks} reviews={reviews} />}
        {view === "reward" && <RewardView date={date} tasks={tasks} rules={rules} claims={claims} syncAndRefresh={syncAndRefresh} />}
        {view === "settings" && (
          <SettingsView
            categories={categories}
            userEmail={userEmail}
            syncState={syncState}
            refresh={refresh}
            syncAndRefresh={syncAndRefresh}
            setSyncState={setSyncState}
            setUserEmail={setUserEmail}
          />
        )}
      </main>
    </div>
  );
}

function PlanView({
  date,
  categories,
  tasks,
  refresh,
  syncAndRefresh
}: {
  date: string;
  categories: Category[];
  tasks: Task[];
  refresh: () => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const cleaned = title.trim();
    if (!cleaned || !categoryId) return;
    const stamp = nowIso();
    await db.tasks.add({
      id: createId("task"),
      date,
      title: cleaned,
      categoryId,
      note: note.trim() || undefined,
      completed: false,
      createdAt: stamp,
      updatedAt: stamp
    });
    setTitle("");
    setNote("");
    refresh();
    void syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <form className="panel form-panel" onSubmit={addTask}>
        <h2>今日规划</h2>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下一个任务" />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注，可不填" />
        <button className="primary" type="submit"><Plus size={18} />添加任务</button>
      </form>
      <section className="panel">
        <PanelTitle title="计划色块" meta={`${tasks.length} 个任务`} />
        <BlockGrid items={tasks} categories={categories} empty="今天还没有计划。" refresh={syncAndRefresh} editable />
      </section>
    </section>
  );
}

function ReviewView({
  categories,
  tasks,
  reviews,
  categoryMap,
  date,
  syncAndRefresh
}: {
  date: string;
  categories: Category[];
  tasks: Task[];
  reviews: ReviewEntry[];
  categoryMap: Map<string, Category>;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const stats = calculateCompletion(tasks);

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function toggleTask(task: Task) {
    const stamp = nowIso();
    const nextCompleted = !task.completed;
    await db.tasks.update(task.id, { completed: nextCompleted, updatedAt: stamp });
    const existing = await db.reviewEntries.where("taskId").equals(task.id).first();
    if (nextCompleted) {
      if (existing) {
        await db.reviewEntries.put({ ...existing, deletedAt: undefined, updatedAt: stamp });
      } else {
        await db.reviewEntries.add({
          id: createId("review"),
          date: task.date,
          title: task.title,
          categoryId: task.categoryId,
          taskId: task.id,
          isAdHoc: false,
          createdAt: stamp,
          updatedAt: stamp
        });
      }
    }
    if (!nextCompleted && existing) await markDeleted("reviewEntries", existing.id);
    await syncAndRefresh("after-write");
  }

  async function addReview(event: FormEvent) {
    event.preventDefault();
    const cleaned = title.trim();
    if (!cleaned || !categoryId) return;
    const stamp = nowIso();
    await db.reviewEntries.add({
      id: createId("review"),
      date,
      title: cleaned,
      categoryId,
      isAdHoc: true,
      createdAt: stamp,
      updatedAt: stamp
    });
    setTitle("");
    await syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <section className="panel">
        <PanelTitle title="复盘勾选" meta={`${stats.percent}% · ${stats.label}`} />
        <div className={`meter ${completionTone(stats.percent)}`}><span style={{ width: `${stats.percent}%` }} /></div>
        <div className="check-list">
          {tasks.length === 0 && <p className="empty">今天暂无计划。</p>}
          {tasks.map((task) => {
            const category = categoryMap.get(task.categoryId);
            return (
              <label key={task.id} className="check-row">
                <input type="checkbox" checked={task.completed} onChange={() => toggleTask(task)} />
                <span className="swatch" style={{ background: category?.color }} />
                <span>{task.title}</span>
              </label>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <PanelTitle title="实际色块" meta={`${reviews.length} 条记录`} />
        <form className="inline-form" onSubmit={addReview}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="补录临时做过的事" />
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} compact />
          <button className="icon-button" aria-label="补录" type="submit"><Plus size={18} /></button>
        </form>
        <BlockGrid items={reviews} categories={categories} empty="完成的任务和补录事项会出现在这里。" />
      </section>
    </section>
  );
}

function CompareView({ date, categories, tasks, reviews }: { date: string; categories: Category[]; tasks: Task[]; reviews: ReviewEntry[] }) {
  const [mode, setMode] = useState<Period>("week");
  const range = getPeriodRange(mode, date);
  const rangeTasks = tasks.filter((task) => task.date >= range.start && task.date <= range.end);
  const rangeReviews = reviews.filter((entry) => entry.date >= range.start && entry.date <= range.end);
  const stats = calculateCompletion(rangeTasks);

  return (
    <section className="stack">
      <div className="panel summary-panel">
        <div>
          <h2>{mode === "week" ? "周对比" : "月对比"}</h2>
          <p>{rangeLabel(range.start, range.end)}</p>
        </div>
        <div className="segmented">
          <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>周</button>
          <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>月</button>
        </div>
        <div className={`score ${completionTone(stats.percent)}`}>{stats.percent}%</div>
      </div>
      <section className="compare-grid">
        <div className="panel">
          <PanelTitle title="计划" meta={`${rangeTasks.length} 个`} />
          <BlockGrid items={rangeTasks} categories={categories} empty="该周期暂无计划。" />
        </div>
        <div className="panel">
          <PanelTitle title="实际" meta={`${rangeReviews.length} 个`} />
          <BlockGrid items={rangeReviews} categories={categories} empty="该周期暂无复盘记录。" />
        </div>
      </section>
    </section>
  );
}

function RewardView({
  date,
  tasks,
  rules,
  claims,
  syncAndRefresh
}: {
  date: string;
  tasks: Task[];
  rules: RewardRule[];
  claims: string[];
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [threshold, setThreshold] = useState(80);
  const [rewardText, setRewardText] = useState("");

  async function addRule(event: FormEvent) {
    event.preventDefault();
    const cleaned = rewardText.trim();
    if (!cleaned) return;
    const stamp = nowIso();
    await db.rewardRules.add({
      id: createId("reward"),
      period,
      thresholdPercent: threshold,
      rewardText: cleaned,
      active: true,
      updatedAt: stamp
    });
    setRewardText("");
    await syncAndRefresh("after-write");
  }

  return (
    <section className="workspace-grid">
      <form className="panel form-panel" onSubmit={addRule}>
        <h2>目标奖励</h2>
        <div className="segmented full">
          <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>周</button>
          <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>月</button>
        </div>
        <label className="field-label">完成率门槛 {threshold}%</label>
        <input type="range" min="10" max="100" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
        <input value={rewardText} onChange={(event) => setRewardText(event.target.value)} placeholder="达标后奖励自己什么" />
        <button className="primary" type="submit"><Plus size={18} />添加奖励</button>
      </form>
      <section className="panel reward-list">
        <PanelTitle title="当前奖励" meta={`${rules.length} 条规则`} />
        {rules.length === 0 && <p className="empty">还没有奖励规则。</p>}
        {rules.map((rule) => {
          const range = getPeriodRange(rule.period, date);
          const stats = calculateCompletion(tasks.filter((task) => task.date >= range.start && task.date <= range.end));
          const key = periodKey(rule.period, date);
          const met = isRewardMet(rule, stats);
          const claimed = claims.includes(`${rule.id}:${key}`);
          return (
            <article key={rule.id} className="reward-card">
              <div>
                <strong>{rule.rewardText}</strong>
                <p>{rule.period === "week" ? "每周" : "每月"} · 门槛 {rule.thresholdPercent}% · 当前 {stats.percent}%</p>
              </div>
              <button
                className={met ? "primary small" : "small"}
                disabled={!met || claimed}
                onClick={async () => {
                  const stamp = nowIso();
                  await db.rewardClaims.add({
                    id: createId("claim"),
                    ruleId: rule.id,
                    period: rule.period,
                    periodKey: key,
                    claimedAt: stamp,
                    updatedAt: stamp
                  });
                  await syncAndRefresh("after-write");
                }}
              >
                {claimed ? "已领取" : met ? "领取" : "未达标"}
              </button>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function SettingsView({
  categories,
  userEmail,
  syncState,
  refresh,
  syncAndRefresh,
  setSyncState,
  setUserEmail
}: {
  categories: Category[];
  userEmail: string | null;
  syncState: SyncState;
  refresh: () => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
  setSyncState: (state: SyncState) => void;
  setUserEmail: (email: string | null) => void;
}) {
  const [email, setEmail] = useState("");

  async function exportData() {
    const payload = await exportAllData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plan-review-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await importAllData(JSON.parse(await file.text()));
    event.target.value = "";
    refresh();
    void syncAndRefresh("after-write");
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    const cleaned = email.trim();
    if (!cleaned) return;
    try {
      await signInWithEmail(cleaned);
      setSyncState({ status: "signed-out", message: "登录邮件已发送，请在电脑或手机邮箱中打开链接" });
    } catch (error) {
      setSyncState({ status: "error", message: error instanceof Error ? error.message : "发送登录邮件失败" });
    }
  }

  async function handleSignOut() {
    await signOut();
    setUserEmail(null);
    setSyncState({ status: isSyncConfigured ? "signed-out" : "not-configured", message: "已退出，当前仅本地保存" });
  }

  return (
    <section className="workspace-grid">
      <section className="panel form-panel">
        <PanelTitle title="同步账号" meta={syncState.message} />
        {userEmail ? (
          <>
            <p className="sync-user">{userEmail}</p>
            <button className="primary" type="button" onClick={() => syncAndRefresh("manual")}>
              <RefreshCw size={18} />立即同步
            </button>
            <button type="button" className="secondary" onClick={handleSignOut}>退出登录</button>
          </>
        ) : (
          <form className="form-panel compact-form" onSubmit={sendMagicLink}>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="输入邮箱接收登录链接" disabled={!isSyncConfigured} />
            <button className="primary" type="submit" disabled={!isSyncConfigured}>发送登录邮件</button>
          </form>
        )}
        {!isSyncConfigured && <p className="empty">请先在 `.env` 中配置 Supabase URL 和 anon key。</p>}
      </section>

      <section className="panel">
        <PanelTitle title="分类颜色" meta={`${categories.length} 个`} />
        <div className="category-list">
          {categories.map((category) => (
            <label key={category.id} className="category-row">
              <input
                type="color"
                value={category.color}
                onChange={async (event) => {
                  await db.categories.update(category.id, { color: event.target.value, updatedAt: nowIso() });
                  refresh();
                  void syncAndRefresh("after-write");
                }}
              />
              <CategoryNameInput category={category} refresh={refresh} syncAndRefresh={syncAndRefresh} />
            </label>
          ))}
        </div>
      </section>

      <section className="panel form-panel">
        <h2>数据备份</h2>
        <button className="primary" onClick={exportData} type="button">导出 JSON</button>
        <label className="file-button">
          导入 JSON
          <input type="file" accept="application/json" onChange={importData} />
        </label>
      </section>
    </section>
  );
}

function CategoryNameInput({
  category,
  refresh,
  syncAndRefresh
}: {
  category: Category;
  refresh: () => void;
  syncAndRefresh: (mode?: "startup" | "manual" | "after-write") => Promise<void>;
}) {
  const [draft, setDraft] = useState(category.name);

  useEffect(() => {
    setDraft(category.name);
  }, [category.id, category.name]);

  async function save() {
    const cleaned = draft.trim();
    if (!cleaned || cleaned === category.name) {
      setDraft(category.name);
      return;
    }
    await db.categories.update(category.id, { name: cleaned, updatedAt: nowIso() });
    refresh();
    void syncAndRefresh("after-write");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={handleKeyDown}
    />
  );
}

function PanelTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span>{meta}</span>
    </div>
  );
}

function CategoryPicker({
  categories,
  value,
  onChange,
  compact = false
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "category-picker compact" : "category-picker"}>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={value === category.id ? "selected" : ""}
          onClick={() => onChange(category.id)}
          title={category.name}
        >
          <span style={{ background: category.color }} />
          {!compact && category.name}
        </button>
      ))}
    </div>
  );
}

function BlockGrid({
  items,
  categories,
  empty,
  editable = false,
  refresh
}: {
  items: Array<Task | ReviewEntry>;
  categories: Category[];
  empty: string;
  editable?: boolean;
  refresh?: () => Promise<void>;
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  if (items.length === 0) return <p className="empty">{empty}</p>;

  return (
    <div className="block-grid">
      {items.map((item) => {
        const category = categoryMap.get(item.categoryId);
        const isTask = "completed" in item;
        return (
          <article
            key={item.id}
            className={isTask && item.completed ? "task-block completed" : "task-block"}
            style={{ borderColor: category?.color, background: `${category?.color ?? "#888"}22` }}
          >
            <span className="block-dot" style={{ background: category?.color }} />
            <strong>{item.title}</strong>
            <small>{category?.name ?? "未分类"}{!isTask && item.isAdHoc ? " · 补录" : ""}</small>
            {editable && (
              <button
                className="delete-button"
                aria-label="删除任务"
                onClick={async () => {
                  await markDeleted("tasks", item.id);
                  const linkedReviews = await db.reviewEntries.where("taskId").equals(item.id).toArray();
                  await Promise.all(linkedReviews.map((entry) => markDeleted("reviewEntries", entry.id)));
                  await refresh?.();
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
