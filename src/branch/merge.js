// 分支合并：以「重开点章节快照」为共同祖先做三方对比。
// 祖先=base，来源分支=source（被合并），目标分支=target（并入）。
// 仅一方相对祖先变化 → 自动采纳；双方都改且结果不同 → 冲突，必须显式选边。
// 未确认（未选择）的变化不会进入目标分支，继续留在来源分支里。
import { clone, findBranch, chaptersOf } from './engine.js';

const CHAR_FIELDS = [
  { field: 'status', label: '角色状态' },
  { field: 'note', label: '状态备注' },
];

const sharedPrefixLen = (state, source, target) => {
  const targetAll = chaptersOf(state, target.id);
  const stop = source.forkChapterId;
  const idx = stop ? targetAll.findIndex((c) => c.id === stop) : -1;
  return idx === -1 ? 0 : idx + 1;
};

// 生成合并计划（不改动 state）。
export function buildMergePlan(state, sourceId, targetId) {
  const source = findBranch(state, sourceId);
  const target = findBranch(state, targetId);
  const entries = [];

  const prefixLen = sharedPrefixLen(state, source, target);
  const targetAll = chaptersOf(state, targetId);
  const baseChapter = prefixLen ? targetAll[prefixLen - 1] : null;
  const base = baseChapter
    ? baseChapter.snapshot
    : { characters: [], loot: [] };

  const mk = (e) => {
    entries.push({
      key: `${e.kind}:${e.id}:${e.field}`,
      conflict: false,
      action: null, // 'source' | 'target' | null(跳过)
      ...e,
    });
  };

  // —— 角色：对比状态等字段 ——
  for (const sc of source.characters) {
    const tc = target.characters.find((x) => x.id === sc.id);
    const bc = base.characters.find((x) => x.id === sc.id);
    if (!tc) {
      // 来源分支新增的角色
      mk({
        kind: 'character', id: sc.id, name: sc.name, field: '__new__',
        label: '新增角色', base: null, source: sc, target: null,
        action: 'source',
      });
      continue;
    }
    for (const { field, label } of CHAR_FIELDS) {
      const sv = sc[field] ?? '';
      const tv = tc[field] ?? '';
      const bv = bc ? bc[field] ?? '' : '';
      if (sv === tv) continue;
      if (sv === bv && tv !== bv) {
        mk({ kind: 'character', id: sc.id, name: sc.name, field, label, base: bv, source: sv, target: tv, action: 'target' });
      } else if (tv === bv && sv !== bv) {
        mk({ kind: 'character', id: sc.id, name: sc.name, field, label, base: bv, source: sv, target: tv, action: 'source' });
      } else {
        mk({ kind: 'character', id: sc.id, name: sc.name, field, label, base: bv, source: sv, target: tv, action: null, conflict: true });
      }
    }
  }
  // 目标分支单方面新增的角色：保留，无需条目。

  // —— 战利品：对比数量 ——
  for (const si of source.loot) {
    const ti = target.loot.find((x) => x.id === si.id);
    const bi = base.loot.find((x) => x.id === si.id);
    if (!ti) {
      mk({
        kind: 'loot', id: si.id, name: si.name, field: '__new__',
        label: '新增物品', base: null, source: si, target: null,
        action: 'source',
      });
      continue;
    }
    const sv = si.qty;
    const tv = ti.qty;
    const bv = bi ? bi.qty : 0;
    if (sv === tv) continue;
    if (sv === bv && tv !== bv) {
      mk({ kind: 'loot', id: si.id, name: si.name, field: 'qty', label: '数量', base: bv, source: sv, target: tv, action: 'target' });
    } else if (tv === bv && sv !== bv) {
      mk({ kind: 'loot', id: si.id, name: si.name, field: 'qty', label: '数量', base: bv, source: sv, target: tv, action: 'source' });
    } else {
      mk({ kind: 'loot', id: si.id, name: si.name, field: 'qty', label: '数量', base: bv, source: sv, target: tv, action: null, conflict: true });
    }
  }

  // —— 章节：重开点之后各自新增的章节 ——
  const sourceAll = chaptersOf(state, sourceId);
  const sourceChapters = sourceAll.slice(prefixLen);
  const targetChapters = targetAll.slice(prefixLen);

  return {
    sourceId,
    targetId,
    baseChapter,
    entries,
    sourceChapters,
    targetChapters,
    conflicts: entries.filter((e) => e.conflict),
  };
}

// 按用户在计划上的选择（action）落地合并。返回新 state 与统计。
export function applyMerge(state, sourceId, targetId, actions) {
  const d = clone(state);
  const source = d.branches.find((b) => b.id === sourceId);
  const target = d.branches.find((b) => b.id === targetId);

  let adopted = 0;
  let skippedConflicts = 0;

  const plan = buildMergePlan(d, sourceId, targetId);

  for (const eRaw of plan.entries) {
    const action = actions[eRaw.key] ?? eRaw.action;
    if (!action) {
      if (eRaw.conflict) skippedConflicts += 1;
      continue; // 未确认变化：留在来源分支
    }
    const fromBranch = action === 'source' ? source : target;

    if (eRaw.field === '__new__') {
      if (action !== 'source') continue;
      const list = eRaw.kind === 'character' ? target.characters : target.loot;
      if (!list.some((x) => x.id === eRaw.id)) {
        list.push(clone(fromBranch[eRaw.kind === 'character' ? 'characters' : 'loot']
          .find((x) => x.id === eRaw.id)));
      }
      adopted += 1;
      continue;
    }

    const list = eRaw.kind === 'character' ? target.characters : target.loot;
    const dst = list.find((x) => x.id === eRaw.id);
    const src = (eRaw.kind === 'character'
      ? (action === 'source' ? source.characters : target.characters)
      : (action === 'source' ? source.loot : target.loot)).find((x) => x.id === eRaw.id);
    if (dst && src) {
      dst[eRaw.field] = clone(src[eRaw.field]);
      adopted += 1;
    }
  }

  // 来源分支在重开点之后新增的章节并入目标时间线（去重）。
  let addedChapters = 0;
  const prefixLen = (() => {
    const all = chaptersOf(d, targetId);
    const idx = source.forkChapterId
      ? all.findIndex((c) => c.id === source.forkChapterId)
      : -1;
    return idx === -1 ? 0 : idx + 1;
  })();
  for (const c of chaptersOf(d, sourceId).slice(prefixLen)) {
    if (!target.ownChapters.some((x) => x.id === c.id)) {
      target.ownChapters.push(clone(c));
      addedChapters += 1;
    }
  }

  // 来源分支保留可看，仅做合并标记。
  source.mergedInto = targetId;
  source.mergedAt = new Date().toISOString().slice(0, 10);
  d.activeBranchId = targetId;

  return { state: d, adopted, skippedConflicts, addedChapters };
}
