import assert from 'node:assert';
import { freshState, migrateLegacy } from '../src/branch/model.js';
import {
  chaptersOf, tipChapter, addChapter, forkBranch, forkExists,
  updateCharacter, setLootQty, switchBranch, exportJSON, importState,
} from '../src/branch/engine.js';
import { buildMergePlan, applyMerge } from '../src/branch/merge.js';

let s = freshState();
const mainId = s.activeBranchId;

// 1. 保存章节带入当时快照：先改状态/数量，再存章节
s = updateCharacter(s, mainId, 'c-moore', { status: '离线' });
s = setLootQty(s, mainId, 'l-herb', 5);
const r1 = addChapter(s, mainId, {
  date: '2024-06-29', title: '第三章：月下集市', summary: '莫尔缺席，队伍采购月光草。', tag: '主线',
});
s = r1.state;
const snap = s.branches[0].ownChapters.at(-1).snapshot;
assert.equal(snap.characters.find((c) => c.id === 'c-moore').status, '离线', '快照应带入当时角色状态');
assert.equal(snap.loot.find((l) => l.id === 'l-herb').qty, 5, '快照应带入当时物品数量');

// 之后的工作区改动不影响已存快照
s = updateCharacter(s, mainId, 'c-moore', { status: '在场' });
s = setLootQty(s, mainId, 'l-herb', 2);
assert.equal(
  s.branches[0].ownChapters.at(-1).snapshot.loot.find((l) => l.id === 'l-herb').qty,
  5, '已存快照不被后续改动覆盖',
);

// 2. 重开：从第 2 章长出分支
const ch2 = chaptersOf(s, mainId)[1];
const f1 = forkBranch(s, mainId, ch2.id, '伊琳同行线');
s = f1.state;
assert.equal(f1.reused, false);
const forkId = f1.branchId;
assert.equal(s.activeBranchId, forkId);
// 新分支工作区 = ch2 快照（最初状态：全员在场、月光草×3）
const fb = s.branches.find((b) => b.id === forkId);
assert.equal(fb.characters.find((c) => c.id === 'c-moore').status, '在场', '重开工作区来自章节快照');
assert.equal(fb.loot.find((l) => l.id === 'l-herb').qty, 3);
// 分支章节表 = 第1、2章（不含第3章）
assert.deepEqual(
  chaptersOf(s, forkId).map((c) => c.title),
  ['第一章：灰港的钟声', '第二章：雾中来客'],
);
// 旧分支照常可看，4 章都在
assert.equal(chaptersOf(s, mainId).length, 4);

// 3. 同一来源重复创建只留一条分支
const beforeCount = s.branches.length;
const f2 = forkBranch(s, mainId, ch2.id, '另一个名字');
assert.equal(f2.reused, true);
assert.equal(f2.branchId, forkId, '应复用已有分支');
assert.equal(f2.state.branches.length, beforeCount, '分支数量不应增加');

// 4. 分支上各自推进：角色离线 / 改判 / 物品数量互相对立
s = switchBranch(s, forkId);
s = updateCharacter(s, forkId, 'c-selin', { status: '离线', note: '玩家请假' });
s = setLootQty(s, forkId, 'l-herb', 0); // 支线里用掉
const rf = addChapter(s, forkId, {
  date: '2024-07-06', title: '分歧：瑟琳缺席之战', summary: '瑟琳离线。', tag: '番外',
});
s = rf.state;

s = switchBranch(s, mainId);
s = updateCharacter(s, mainId, 'c-selin', { status: '受伤', note: '钟楼伏击受伤' });
s = setLootQty(s, mainId, 'l-herb', 8); // 正史里又采到
const rm = addChapter(s, mainId, {
  date: '2024-07-06', title: '第四章：重返钟楼', summary: '瑟琳带伤上阵。', tag: '主线',
});
s = rm.state;

// 5. 合并计划：三处冲突（瑟琳状态/备注、月光草数量）+ 各自章节
const plan = buildMergePlan(s, forkId, mainId);
const conflicts = plan.entries.filter((e) => e.conflict);
const confKeys = conflicts.map((c) => `${c.kind}:${c.field}`).sort();
assert.deepEqual(confKeys, ['character:note', 'character:status', 'loot:qty']);
const selinStatus = conflicts.find((c) => c.kind === 'character' && c.field === 'status');
assert.equal(selinStatus.source, '离线', '冲突需指出来源内容');
assert.equal(selinStatus.target, '受伤', '冲突需指出目标内容');
assert.equal(plan.sourceChapters.length, 1);
assert.equal(plan.sourceChapters[0].title, '分歧：瑟琳缺席之战');
assert.equal(plan.targetChapters.length, 3, '重开点后正史有 3 章');

// 5b. 仅一方改动的条目自动给边
s = updateCharacter(s, forkId, 'c-adrian', { status: '受伤' });
const plan2 = buildMergePlan(s, forkId, mainId);
const autoEntry = plan2.entries.find((e) => e.id === 'c-adrian' && e.field === 'status');
assert.ok(autoEntry && !autoEntry.conflict && autoEntry.action === 'source', '单边改动自动采纳来源');

// 6. 未确认冲突留在分支：冲突不选择（null），确认自动项
const actions = {};
plan2.entries.forEach((e) => { actions[e.key] = e.action; }); // 冲突仍是 null
const res = applyMerge(s, forkId, mainId, actions);
s = res.state;
assert.equal(res.skippedConflicts, 3, '未确认冲突计数');
const main = s.branches.find((b) => b.id === mainId);
assert.equal(main.characters.find((c) => c.id === 'c-selin').status, '受伤', '未确认状态不覆盖目标');
assert.equal(main.loot.find((l) => l.id === 'l-herb').qty, 8, '未确认数量不覆盖目标');
assert.equal(main.characters.find((c) => c.id === 'c-adrian').status, '受伤', '自动采纳单边改动');
assert.ok(
  main.ownChapters.some((c) => c.title === '分歧：瑟琳缺席之战'),
  '来源章节并入时间线',
);
const oldFork = s.branches.find((b) => b.id === forkId);
assert.equal(oldFork.mergedInto, mainId, '旧分支保留并标记');
assert.equal(oldFork.characters.find((c) => c.id === 'c-selin').status, '离线', '未确认变化留在来源分支');
assert.equal(chaptersOf(s, forkId).length, 3, '旧分支照常可看');

// 6b. 确认冲突：选来源 → 来源值覆盖
const plan3 = buildMergePlan(s, forkId, mainId);
const actions3 = {};
plan3.entries.forEach((e) => {
  if (e.conflict) actions3[e.key] = 'source';
  else actions3[e.key] = e.action;
});
// 跳过已并入章节造成的重复
const res3 = applyMerge(s, forkId, mainId, actions3);
s = res3.state;
const main3 = s.branches.find((b) => b.id === mainId);
assert.equal(main3.characters.find((c) => c.id === 'c-selin').status, '离线', '确认后采纳来源');
assert.equal(main3.loot.find((l) => l.id === 'l-herb').qty, 0, '确认后采纳来源数量');

// 7. 导出再导入仍能按分支查看
const json = exportJSON(s);
const imp = importState(json, null);
assert.equal(imp.ok, true);
assert.equal(imp.state.branches.length, beforeCount, '导入后分支数量一致');
assert.equal(chaptersOf(imp.state, forkId).length, 3, '导入后旧分支章节可还原');
assert.equal(imp.state.activeBranchId, mainId);
assert.equal(importState('{bad json', null).ok, false);
assert.equal(importState(JSON.stringify({ foo: 1 }), null).ok, false);

// 8. v1 旧存档导入迁移
const v1 = {
  name: '旧战役', system: 'COC',
  sessions: [{ id: 99, date: '2024-01-01', title: '旧章节', summary: 'x', tag: '主线' }],
  characters: [],
};
const impV1 = importState(JSON.stringify(v1), migrateLegacy);
assert.equal(impV1.ok, true, 'v1 存档可迁移导入');

console.log('全部断言通过 ✓');
