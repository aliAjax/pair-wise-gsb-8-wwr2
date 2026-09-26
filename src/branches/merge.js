// 分支合并：三方对比（分叉快照 base / 目标线 target / 来源线 source）
// 冲突必须指出“内容 + 来源”，主持人逐条确认；未确认的变化留在分支里，不进目标线。

const clone = (x) => JSON.parse(JSON.stringify(x));

// 分叉基线：优先取目标线上分叉章节的快照；
// 若目标线经过更早的合并、分叉章节已不在其中，则在来源线（及更早祖先）上回退查找。
export function findBaseSnapshot(state, source, target) {
  const inTarget = target.chapters.find((c) => c.id === source.rootChapterId);
  if (inTarget?.snapshot) return clone(inTarget.snapshot);

  let line = source;
  const seen = new Set();
  while (line && !seen.has(line.id)) {
    seen.add(line.id);
    const ch = line.chapters.find((c) => c.id === source.rootChapterId);
    if (ch?.snapshot) return clone(ch.snapshot);
    line = line.parentId ? state.lines[line.parentId] : null;
  }
  // 找不到分叉点时，以目标线最早章节快照为基线（仍可工作，退化为双向对比）。
  return clone(target.chapters[0]?.snapshot || { characters: [], loot: [] });
}

const byId = (list) => {
  const m = new Map();
  (list || []).forEach((x) => m.set(x.id, x));
  return m;
};

const isEmpty = (v) => v === undefined || v === null || v === '';
const eq = (a, b) => (isEmpty(a) && isEmpty(b) ? true : a === b);

// kind: character / loot，返回该实体各字段的变化与冲突。
function diffEntity(kind, base, src, tgt) {
  const fields = kind === 'character'
    ? ['name', 'role', 'player', 'status', 'color', 'note']
    : ['name', 'qty', 'category', 'note'];
  const changes = [];
  for (const field of fields) {
    const bv = base?.[field];
    const sv = src?.[field];
    const tv = tgt?.[field];
    if (eq(sv, tv)) continue; // 两侧一致（含都没动）
    const srcChanged = !eq(sv, bv);
    const tgtChanged = !eq(tv, bv);
    if (srcChanged && tgtChanged) {
      // 双方都改了同一字段且结果不同 → 冲突，必须二选一（或保留目标值）。
      changes.push({ type: 'conflict', field, base: bv, source: sv, target: tv,
        decision: 'target' });
    } else if (srcChanged) {
      changes.push({ type: 'source-change', field, base: bv, source: sv,
        decision: 'accept' });
    } else {
      // 只有目标线改了：默认保留目标值，列出供主持人知晓。
      changes.push({ type: 'target-change', field, base: bv, target: tv,
        decision: 'keep' });
    }
  }
  return changes;
}

function diffCollection(kind, baseList, srcList, tgtList) {
  const base = byId(baseList);
  const src = byId(srcList);
  const tgt = byId(tgtList);
  const entries = [];
  const allIds = new Set([...base.keys(), ...src.keys(), ...tgt.keys()]);
  for (const id of allIds) {
    const b = base.get(id);
    const s = src.get(id);
    const t = tgt.get(id);
    if (s && !t) {
      // 分支新增（或目标已移除）。分叉基线上没有即视为新增。
      entries.push({ kind, id, entityId: id, name: s.name, status: b ? 'removed-in-target' : 'added-in-source',
        source: clone(s), target: null, changes: [], decision: 'accept' });
    } else if (!s && t) {
      entries.push({ kind, id, entityId: id, name: t.name, status: 'removed-in-source',
        source: null, target: clone(t), changes: [], decision: 'keep' });
    } else if (s && t) {
      const changes = diffEntity(kind, b, s, t);
      if (changes.length) {
        entries.push({ kind, id, entityId: id, name: s.name || t.name,
          status: 'modified', source: clone(s), target: clone(t), changes,
          // 无冲突时默认按字段级决定生效（source-change 接受 / target-change 保留）；
          // 主持人在界面上显式选“暂不处理”才转为 pending、留在分支。
          decision: changes.some((c) => c.type === 'conflict') ? 'conflict' : 'modified' });
      }
    }
  }
  return entries;
}

// 章节对比：按 id 对齐。分支新增的章节可并入（追加到目标线分叉点之后），
// 同 id 章节摘要/标题被两侧改写 → 冲突条目。
function diffChapters(baseChapters, srcChapters, tgtChapters) {
  const base = byId(baseChapters);
  const src = byId(srcChapters);
  const tgt = byId(tgtChapters);
  const entries = [];

  srcChapters.forEach((c) => {
    if (!tgt.has(c.id)) {
      entries.push({ kind: 'chapter', id: c.id, entityId: c.id, name: c.title,
        status: 'added-in-source', chapter: clone(c), decision: 'accept' });
    }
  });
  tgtChapters.forEach((c) => {
    if (!src.has(c.id)) {
      entries.push({ kind: 'chapter', id: c.id, entityId: c.id, name: c.title,
        status: 'added-in-target', chapter: clone(c), decision: 'keep' });
    }
  });
  const allIds = new Set([...src.keys(), ...tgt.keys()]);
  for (const id of allIds) {
    const s = src.get(id);
    const t = tgt.get(id);
    const b = base.get(id);
    if (!s || !t) continue;
    const changes = [];
    for (const field of ['title', 'summary', 'date', 'tag']) {
      const bv = b?.[field];
      if (!eq(s[field], t[field])) {
        const srcChanged = !eq(s[field], bv);
        const tgtChanged = !eq(t[field], bv);
        changes.push(srcChanged && tgtChanged
          ? { type: 'conflict', field, base: bv, source: s[field], target: t[field], decision: 'target' }
          : srcChanged
            ? { type: 'source-change', field, base: bv, source: s[field], decision: 'accept' }
            : { type: 'target-change', field, base: bv, target: t[field], decision: 'keep' });
      }
    }
    if (changes.length) {
      entries.push({ kind: 'chapter', id, entityId: id, name: s.title,
        status: 'modified', source: clone(s), target: clone(t), changes,
        decision: changes.some((c) => c.type === 'conflict') ? 'conflict' : 'modified' });
    }
  }
  return entries;
}

// 生成合并对比报告。source = 要合入的分支，target = 接收线。
export function buildMergeReport(state, sourceId, targetId) {
  const source = state.lines[sourceId];
  const target = state.lines[targetId];
  if (!source || !target || sourceId === targetId) return null;
  const base = findBaseSnapshot(state, source, target);

  const characterEntries = diffCollection('character', base.characters,
    source.characters, target.characters);
  const lootEntries = diffCollection('loot', base.loot, source.loot, target.loot);

  // 章节的基线 = 分叉点及其之前的章节集合（按 id）。
  const tgtIdx = target.chapters.findIndex((c) => c.id === source.rootChapterId);
  const baseChapters = tgtIdx >= 0 ? target.chapters.slice(0, tgtIdx + 1) : source.chapters;
  const chapterEntries = diffChapters(baseChapters, source.chapters, target.chapters);

  return {
    sourceId,
    targetId,
    rootChapterId: source.rootChapterId,
    base,
    chapters: chapterEntries,
    characters: characterEntries,
    loot: lootEntries,
  };
}

export function reportGroups(report) {
  return [
    { key: 'chapters', label: '章节', entries: report.chapters },
    { key: 'characters', label: '角色状态', entries: report.characters },
    { key: 'loot', label: '战利品数量', entries: report.loot },
  ];
}

export function hasConflict(report) {
  return reportGroups(report).some((g) =>
    g.entries.some((e) => e.decision === 'conflict' ||
      e.changes?.some((c) => c.type === 'conflict')));
}

export function conflictCount(report) {
  let n = 0;
  for (const g of reportGroups(report)) {
    for (const e of g.entries) n += (e.changes || []).filter((c) => c.type === 'conflict').length;
  }
  return n;
}

// 仍有未处理（未确认）变化的条目数 —— 这些将留在分支里。
export function pendingCount(report) {
  let n = 0;
  for (const g of reportGroups(report)) {
    for (const e of g.entries) {
      if (e.kind === 'chapter') {
        if (e.decision === 'pending') n += 1;
      } else if (e.decision === 'pending') {
        n += 1;
      } else if (e.decision === 'conflict') {
        n += 1;
      }
    }
  }
  return n;
}

function resolveEntity(entity, entry) {
  if (entry.decision === 'accept') return clone(entry.source);
  if (entry.decision === 'keep') return clone(entry.target);
  if (entry.decision === 'discard') return null;
  // 逐字段选择
  const out = { ...clone(entry.target) };
  for (const c of entry.changes) {
    if (c.decision === 'source') out[c.field] = c.source;
    else if (c.decision === 'accept') out[c.field] = c.source;
    else if (c.decision === 'target' || c.decision === 'keep') out[c.field] = c.target;
  }
  return out;
}

// 应用确认结果。未确认（pending / 未解决 conflict）的条目不写入目标，
// 调用方据 leftBehind 提示“变化仍留在分支里”。
export function applyMerge(state, report) {
  const source = state.lines[report.sourceId];
  const target = state.lines[report.targetId];

  // ---- 角色 ----
  const charMap = new Map(target.characters.map((c) => [c.id, c]));
  for (const e of report.characters) {
    if (e.decision === 'pending' || e.decision === 'conflict') continue;
    const resolved = resolveEntity(null, e);
    if (resolved === null) charMap.delete(e.entityId);
    else charMap.set(e.entityId, resolved);
  }

  // ---- 战利品 ----
  const lootMap = new Map(target.loot.map((l) => [l.id, l]));
  for (const e of report.loot) {
    if (e.decision === 'pending' || e.decision === 'conflict') continue;
    const resolved = resolveEntity(null, e);
    if (resolved === null) lootMap.delete(e.entityId);
    else lootMap.set(e.entityId, resolved);
  }

  // ---- 章节 ----
  let chapters = clone(target.chapters);
  const acceptedNew = report.chapters
    .filter((e) => e.status === 'added-in-source' && e.decision === 'accept')
    .map((e) => clone(e.chapter));
  if (acceptedNew.length) {
    const rootIdx = chapters.findIndex((c) => c.id === report.rootChapterId);
    // 按来源章节顺序插入到分叉点之后、目标线自有续写之前。
    const ordered = acceptedNew.sort(
      (a, b) => source.chapters.findIndex((c) => c.id === a.id) -
                source.chapters.findIndex((c) => c.id === b.id));
    const insertAt = rootIdx >= 0 ? rootIdx + 1 : chapters.length;
    const existing = new Set(chapters.map((c) => c.id));
    chapters = [
      ...chapters.slice(0, insertAt),
      ...ordered.filter((c) => !existing.has(c.id)),
      ...chapters.slice(insertAt),
    ];
  }
  // 同 id 章节的字段级选择
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  for (const e of report.chapters) {
    if (e.status !== 'modified' || e.decision === 'pending' || e.decision === 'conflict') continue;
    const ch = chapterById.get(e.entityId);
    if (!ch) continue;
    if (e.decision === 'accept') {
      Object.assign(ch, clone(e.source));
    } else {
      for (const c of e.changes) {
        if (c.decision === 'source' || c.decision === 'accept') ch[c.field] = c.source;
      }
    }
  }

  const mergeRecord = {
    id: `mg_${Date.now().toString(36)}`,
    at: new Date().toISOString().slice(0, 10),
    sourceId: source.id,
    sourceName: source.name,
    leftBehind: pendingCount(report),
    conflicts: conflictCount(report),
  };

  const nextTarget = {
    ...target,
    characters: [...charMap.values()],
    loot: [...lootMap.values()],
    chapters,
    merges: [...target.merges, mergeRecord],
  };
  const nextSource = {
    ...source,
    merges: [...source.merges, { ...mergeRecord, id: `${mergeRecord.id}_src`, direction: 'outgoing' }],
  };
  return {
    state: {
      ...state,
      lines: { ...state.lines, [target.id]: nextTarget, [source.id]: nextSource },
      currentLineId: target.id,
    },
    mergeRecord,
  };
}
