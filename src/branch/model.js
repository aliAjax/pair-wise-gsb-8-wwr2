// 战役分支编排 —— 数据模型 / 存档迁移
// v2：以「分支」为中心。每个分支保存自己的章节、角色工作状态、战利品工作数量；
// 章节落库时自带当时快照，分支重开与合并都围绕快照做三方对比。

export const STORAGE_KEY = 'campaign-log';

export const CHAR_STATUS = ['在场', '受伤', '离线', '离队'];
export const LOOT_CATS = ['消耗品', '遗物', '任务物品', '装备'];

export const TAG_COLORS = {
  主线: '#d8a153',
  支线: '#93b7a6',
  番外: '#b9a6d1',
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const seedCharacters = () => [
  { id: 'c-adrian', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153', status: '在场', note: '' },
  { id: 'c-selin', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6', status: '在场', note: '' },
  { id: 'c-moore', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1', status: '在场', note: '' },
];

const seedLoot = () => [
  { id: 'l-herb', name: '月光草', qty: 3, cat: '消耗品' },
  { id: 'l-coin', name: '古老铜币', qty: 1, cat: '遗物' },
  { id: 'l-badge', name: '灰港守卫徽章', qty: 2, cat: '任务物品' },
];

const seedChapters = (snapshot) => [
  {
    id: 's-1', date: '2024-06-08', title: '第一章：灰港的钟声',
    summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。',
    tag: '主线', color: TAG_COLORS['主线'], snapshot,
  },
  {
    id: 's-2', date: '2024-06-15', title: '第二章：雾中来客',
    summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。',
    tag: '主线', color: TAG_COLORS['主线'], snapshot,
  },
  {
    id: 's-3', date: '2024-06-22', title: '支线：深林采药',
    summary: '帮助村民寻找月光草，获得一枚古老铜币。',
    tag: '支线', color: TAG_COLORS['支线'], snapshot,
  },
];

export const freshState = () => {
  const snapshot = { characters: seedCharacters(), loot: seedLoot() };
  return {
    version: 2,
    name: '暮光边境',
    system: 'D&D 5E',
    branches: [
      {
        id: 'b-main',
        name: '正史',
        parentId: null,
        forkChapterId: null,
        createdAt: '2024-06-08',
        ownChapters: seedChapters(snapshot),
        characters: snapshot.characters,
        loot: snapshot.loot,
      },
    ],
    activeBranchId: 'b-main',
  };
};

// 旧版（v1：全局章节/角色）迁移为单条正史分支，章节补上初始快照。
export const migrateLegacy = (old) => {
  const next = freshState();
  next.name = old.name || next.name;
  next.system = old.system || next.system;
  const root = next.branches[0];
  const snapChars = root.characters;
  const snapLoot = root.loot;
  root.ownChapters = (old.sessions || []).map((s, i) => ({
    id: s.id != null ? `s-${s.id}` : `s-old-${i}`,
    date: s.date || '',
    title: s.title || '未命名章节',
    summary: s.summary || '',
    tag: s.tag || '主线',
    color: s.color || TAG_COLORS[s.tag] || TAG_COLORS['主线'],
    snapshot: { characters: snapChars, loot: snapLoot },
  }));
  return next;
};

const isValidV2 = (d) =>
  d && d.version === 2 && Array.isArray(d.branches) && d.branches.length > 0 &&
  d.branches.every((b) => b && b.id && Array.isArray(b.ownChapters));

export const loadState = () => {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    raw = null;
  }
  if (!raw) return freshState();
  if (isValidV2(raw)) return raw;
  // v1 或损坏数据：能识别出旧结构就迁移，否则回到种子。
  if (Array.isArray(raw.sessions)) {
    try {
      return migrateLegacy(raw);
    } catch {
      return freshState();
    }
  }
  return freshState();
};
