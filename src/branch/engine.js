// 纯逻辑层：分支路径、章节快照、重开分支、工作区改动、导入导出。
// 所有变更函数都返回新的 state（深拷贝小数据，避免分支间互相覆盖）。
import { uid, TAG_COLORS } from './model.js';

export const clone = (v) => JSON.parse(JSON.stringify(v));

export const findBranch = (state, id) =>
  state.branches.find((b) => b.id === id) || null;

// 根 → 当前分支 的链路。
export const branchPath = (state, id) => {
  const out = [];
  const guard = new Set();
  let cur = findBranch(state, id);
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? findBranch(state, cur.parentId) : null;
  }
  return out;
};

// 沿分支链还原完整章节表：进入子分支时只保留父链上 forkChapterId（含）之前的章节。
export const chaptersOf = (state, id) => {
  const b = findBranch(state, id);
  if (!b) return [];
  if (!b.parentId) return b.ownChapters.slice();
  const parentChapters = chaptersOf(state, b.parentId);
  if (!b.forkChapterId) return parentChapters.concat(b.ownChapters);
  const idx = parentChapters.findIndex((c) => c.id === b.forkChapterId);
  if (idx === -1) return b.ownChapters.slice();
  return parentChapters.slice(0, idx + 1).concat(b.ownChapters);
};

export const tipChapter = (state, id) => {
  const list = chaptersOf(state, id);
  return list[list.length - 1] || null;
};

// chapterId -> 拥有该章节的分支（沿当前分支链）
export const ownerMap = (state, id) => {
  const map = {};
  branchPath(state, id).forEach((b) => {
    b.ownChapters.forEach((c) => {
      map[c.id] = b.id;
    });
  });
  return map;
};

export const childrenOf = (state, branchId) =>
  state.branches.filter((b) => b.parentId === branchId);

// 某章节是否已被同一来源重开过（幂等键：来源分支 + 来源章节）。
export const forkExists = (state, fromBranchId, chapterId) =>
  state.branches.find(
    (b) => b.parentId === fromBranchId && b.forkChapterId === chapterId,
  ) || null;

// 保存章节：把当前分支工作区（角色状态 / 物品数量）原样拍进快照。
export function addChapter(state, branchId, fields) {
  const d = clone(state);
  const b = findBranch(d, branchId);
  const snapshot = {
    characters: clone(b.characters),
    loot: clone(b.loot),
  };
  const ch = {
    id: uid(),
    date: fields.date,
    title: fields.title,
    summary: fields.summary,
    tag: fields.tag,
    color: TAG_COLORS[fields.tag] || '#d8a153',
    snapshot,
  };
  b.ownChapters.push(ch);
  return { state: d, chapterId: ch.id };
}

// 重开剧情：从指定章节长出新分支。同一来源重复创建时只返回已有分支。
export function forkBranch(state, fromBranchId, chapterId, name) {
  const existing = forkExists(state, fromBranchId, chapterId);
  if (existing) {
    return { state, branchId: existing.id, reused: true };
  }
  const d = clone(state);
  const base = chaptersOf(d, fromBranchId).find((c) => c.id === chapterId);
  const nb = {
    id: uid(),
    name: name || '新分支',
    parentId: fromBranchId,
    forkChapterId: chapterId,
    createdAt: new Date().toISOString().slice(0, 10),
    ownChapters: [],
    // 工作区从该章节的快照起步：旧分支不受影响。
    characters: clone(base.snapshot.characters),
    loot: clone(base.snapshot.loot),
  };
  d.branches.push(nb);
  d.activeBranchId = nb.id;
  return { state: d, branchId: nb.id, reused: false };
}

export function switchBranch(state, branchId) {
  if (!findBranch(state, branchId)) return state;
  const d = clone(state);
  d.activeBranchId = branchId;
  return d;
}

export function renameBranch(state, branchId, name) {
  const d = clone(state);
  const b = findBranch(d, branchId);
  if (b) b.name = name;
  return d;
}

// —— 分支工作区改动（成员离线 / 改判 / 物品增减都只动当前分支）——
export function updateCharacter(state, branchId, charId, patch) {
  const d = clone(state);
  const b = findBranch(d, branchId);
  const c = b.characters.find((x) => x.id === charId);
  if (c) Object.assign(c, patch);
  return d;
}

export function setLootQty(state, branchId, itemId, qty) {
  const d = clone(state);
  const b = findBranch(d, branchId);
  const it = b.loot.find((x) => x.id === itemId);
  if (it) it.qty = Math.max(0, qty);
  return d;
}

// 导出整个分支树（id 稳定，导入后仍可按分支查看）。
export const exportJSON = (state) => JSON.stringify(state, null, 2);

// 导入：接受 v2 存档；v1 结构交给 model 迁移逻辑。
export function importState(raw, migrate) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: '文件不是合法的 JSON' };
  }
  if (
    parsed &&
    parsed.version === 2 &&
    Array.isArray(parsed.branches) &&
    parsed.branches.length > 0 &&
    parsed.branches.every(
      (b) => b && b.id && Array.isArray(b.ownChapters) && b.parentId !== undefined,
    )
  ) {
    if (!findBranch(parsed, parsed.activeBranchId)) {
      parsed.activeBranchId = parsed.branches[0].id;
    }
    return { ok: true, state: parsed };
  }
  if (parsed && Array.isArray(parsed.sessions)) {
    try {
      return { ok: true, state: migrate(parsed) };
    } catch {
      /* fall through */
    }
  }
  return { ok: false, error: '文件结构无法识别，需要 v2 分支存档' };
}
