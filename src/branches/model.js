// 战役分支编排：数据模型
// 一条线（line）= 主干 main 或从某章节快照长出的分支。
// 章节保存时随章节冻结当时的角色/战利品快照；重开剧情时从指定章节复制出一条新线，
// 旧线不再被改动，因此“章节、角色、战利品互相覆盖”的问题被隔离在线内。

export const STORAGE_KEY = 'campaign-log:v2';
export const MAIN_ID = 'main';

export const BRANCH_REASONS = {
  restart: '重开剧情',
  retcon: '改判',
  offline: '成员离线',
  custom: '假设推演',
};

export const CHAR_STATUS = {
  active: '在场',
  offline: '离线',
  left: '离队',
};

let seq = 0;
export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const seedSessions = [
  { id: 's1', date: '2024-06-08', title: '第一章：灰港的钟声',
    summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', tag: '主线', color: '#d8a153' },
  { id: 's2', date: '2024-06-15', title: '第二章：雾中来客',
    summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', tag: '主线', color: '#93b7a6' },
  { id: 's3', date: '2024-06-22', title: '支线：深林采药',
    summary: '帮助村民寻找月光草，获得一枚古老铜币。', tag: '支线', color: '#b9a6d1' },
];

const seedCharacters = [
  { id: 'c1', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153',
    status: 'active', note: '队伍的盾牌，誓言守护灰港平民。' },
  { id: 'c2', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6',
    status: 'active', note: '负责追踪与斥候工作。' },
  { id: 'c3', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1',
    status: 'active', note: '与神秘存在签订了契约。' },
];

const seedLoot = [
  { id: 'l1', name: '月光草', qty: 3, category: '消耗品', note: '深林采得，可用于疗伤药剂。' },
  { id: 'l2', name: '古老铜币', qty: 1, category: '遗物', note: '正面刻着失落钟楼的纹样。' },
  { id: 'l3', name: '灰港守卫徽章', qty: 2, category: '任务物品', note: '死去守卫留下的身份凭证。' },
];

const clone = (x) => JSON.parse(JSON.stringify(x));

// 取一条线“当前”的角色/战利品状态（章节只增不改这两个集合，
// 它们在线级维护；快照则随章节冻结）。
export function lineState(line) {
  return { characters: clone(line.characters), loot: clone(line.loot) };
}

function buildSnapshot(characters, loot) {
  return { characters: clone(characters), loot: clone(loot) };
}

// 为既有章节补快照：默认每章结尾与当前状态一致。
function attachSnapshots(sessions, characters, loot) {
  return sessions.map((s) => ({
    ...clone(s),
    snapshot: s.snapshot ? clone(s.snapshot) : buildSnapshot(characters, loot),
  }));
}

export function initialState() {
  const main = {
    id: MAIN_ID,
    name: '正史线',
    reason: null,
    parentId: null, // 来源线
    rootChapterId: null, // 分叉章节
    createdAt: '2024-06-22',
    characters: clone(seedCharacters),
    loot: clone(seedLoot),
    chapters: attachSnapshots(seedSessions, seedCharacters, seedLoot),
    merges: [],
    archived: false,
  };
  return {
    version: 2,
    name: '暮光边境',
    system: 'D&D 5E',
    year: 2024,
    places: [
      { name: '灰港', state: '已探索' },
      { name: '失落钟楼', state: '已探索' },
      { name: '雾林', state: '待探索' },
    ],
    lines: { [MAIN_ID]: main },
    lineOrder: [MAIN_ID],
    currentLineId: MAIN_ID,
  };
}

// 兼容旧版（v1：单一时间线，无分支）数据。
export function migrate(old) {
  if (!old || typeof old !== 'object') return initialState();
  if (old.version === 2 && old.lines) return old;
  const chars = Array.isArray(old.characters) && old.characters.length
    ? old.characters.map((c, i) => ({
        id: c.id || `c${i + 1}`,
        name: c.name, role: c.role || '', player: c.player || '',
        color: c.color || '#93b7a6', status: 'active', note: '',
      }))
    : clone(seedCharacters);
  const loot = clone(seedLoot);
  const sessions = (Array.isArray(old.sessions) ? old.sessions : []).map((s, i) => ({
    id: String(s.id ?? `s${i + 1}`),
    date: s.date || '', title: s.title || '未命名章节',
    summary: s.summary || '', tag: s.tag || '主线',
    color: s.color || '#d8a153',
    snapshot: buildSnapshot(chars, loot),
  }));
  const main = {
    id: MAIN_ID, name: '正史线', reason: null, parentId: null, rootChapterId: null,
    createdAt: new Date().toISOString().slice(0, 10),
    characters: chars, loot, chapters: sessions, merges: [], archived: false,
  };
  return {
    version: 2, name: old.name || '未命名战役', system: old.system || '', year: 2024,
    places: initialState().places,
    lines: { [MAIN_ID]: main }, lineOrder: [MAIN_ID], currentLineId: MAIN_ID,
  };
}

// 同一来源（来源线 + 分叉章节）重复创建只留一条分支：返回既有分支 id。
export function findBranchAt(state, parentId, rootChapterId) {
  return state.lineOrder
    .map((id) => state.lines[id])
    .find((l) => l.parentId === parentId && l.rootChapterId === rootChapterId) || null;
}

// 从指定章节长出分支：复制分叉点（含）之前的章节及其快照，
// 角色/战利品从该章节保存时冻结的快照起步。
export function createBranch(state, { parentId, chapterId, name, reason }) {
  const parent = state.lines[parentId];
  if (!parent) throw new Error('来源线不存在');
  const idx = parent.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) throw new Error('分叉章节不存在');
  const existing = findBranchAt(state, parentId, chapterId);
  if (existing) return { state, branchId: existing.id, deduped: true };

  const rootChapter = parent.chapters[idx];
  const snap = rootChapter.snapshot || lineState(parent);
  const id = uid('br');
  const branch = {
    id,
    name: name?.trim() || `${parent.name} · ${BRANCH_REASONS[reason] || '分支'}`,
    reason: reason || 'custom',
    parentId,
    rootChapterId: chapterId,
    createdAt: new Date().toISOString().slice(0, 10),
    characters: clone(snap.characters),
    loot: clone(snap.loot),
    // 旧分支与主干上之后新增的章节互不可见 —— 复制而非引用。
    chapters: parent.chapters.slice(0, idx + 1).map(clone),
    merges: [],
    archived: false,
  };
  const next = {
    ...state,
    lines: { ...state.lines, [id]: branch },
    lineOrder: [...state.lineOrder, id],
    currentLineId: id,
  };
  return { state: next, branchId: id, deduped: false };
}

// 在线内保存（新增）章节：冻结保存瞬间的角色/战利品快照。
export function addChapter(line, draft) {
  const chapter = {
    id: uid('s'),
    date: draft.date,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    tag: draft.tag,
    color: draft.color || '#d8a153',
    snapshot: buildSnapshot(line.characters, line.loot),
  };
  return { ...line, chapters: [...line.chapters, chapter] };
}

export function updateCharacter(line, id, patch) {
  return {
    ...line,
    characters: line.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function addCharacter(line, draft) {
  return {
    ...line,
    characters: [...line.characters, { id: uid('c'), status: 'active', note: '', ...draft }],
  };
}

export function updateLoot(line, id, patch) {
  return {
    ...line,
    loot: line.loot.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  };
}

export function addLoot(line, draft) {
  return {
    ...line,
    loot: [...line.loot, { id: uid('l'), qty: 1, category: '消耗品', note: '', ...draft }],
  };
}
