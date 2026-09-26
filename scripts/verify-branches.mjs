import {
  initialState, migrate, createBranch, findBranchAt, addChapter,
  updateCharacter, updateLoot, addLoot,
} from '../src/branches/model.js';
import { buildMergeReport, conflictCount, pendingCount, applyMerge } from '../src/branches/merge.js';
import { exportJSON, parseImport } from '../src/branches/storage.js';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name} ${extra}`); }
};

// 1. 保存章节带入快照
{
  console.log('1) 章节快照冻结');
  let s = initialState();
  let main = s.lines.main;
  main = updateCharacter(main, 'c2', { status: 'offline' });
  main = updateLoot(main, 'l1', { qty: 9 });
  s = { ...s, lines: { ...s.lines, main } };
  let withCh = addChapter(s.lines.main, { title: '第四章', date: '2024-07-01', summary: '瑟琳离线', tag: '主线' });
  const snap = withCh.chapters.at(-1).snapshot;
  ok('快照含离线角色状态', snap.characters.find((c) => c.id === 'c2').status === 'offline');
  ok('快照冻结数量 9', snap.loot.find((l) => l.id === 'l1').qty === 9);
  // 之后再改线内状态，不影响已保存快照
  withCh = updateLoot(withCh, 'l1', { qty: 20 });
  ok('快照不随后续修改变化', withCh.chapters.at(-1).snapshot.loot.find((l) => l.id === 'l1').qty === 9);
}

// 2. 从指定章节分叉 + 隔离
{
  console.log('2) 分叉与隔离');
  const s0 = initialState();
  const { state: s1, branchId } = createBranch(s0, {
    parentId: 'main', chapterId: 's2', reason: 'restart', name: '伊琳之死',
  });
  const br = s1.lines[branchId];
  ok('分支只含分叉点及之前章节', br.chapters.length === 2);
  ok('分支从分叉章节快照起步', br.chapters.at(-1).id === 's2');
  // 在分支里改角色与战利品并加章节
  let b = updateCharacter(br, 'c3', { status: 'left' });
  b = addLoot(b, { name: '符文碎片', qty: 5, category: '遗物' });
  b = addChapter(b, { title: '分支第三章', date: '2024-07-01', summary: '莫尔离队', tag: '主线' });
  const s2 = { ...s1, lines: { ...s1.lines, [branchId]: b } };
  ok('主干章节未被分支覆盖', s2.lines.main.chapters.length === 3);
  ok('主干角色未被分支覆盖', s2.lines.main.characters.find((c) => c.id === 'c3').status === 'active');
  ok('主干战利品未被分支覆盖', s2.lines.main.loot.length === 3);
  // 主干继续写第四章，旧分支看不到
  let m = addChapter(s2.lines.main, { title: '正史第四章', date: '2024-07-08', summary: '继续', tag: '主线' });
  const s3 = { ...s2, lines: { ...s2.lines, main: m } };
  ok('分支看不到主干后续章节', !s3.lines[branchId].chapters.some((c) => c.title === '正史第四章'));
}

// 3. 同一来源重复创建只留一条
{
  console.log('3) 去重');
  const s0 = initialState();
  const a = createBranch(s0, { parentId: 'main', chapterId: 's1', reason: 'retcon' });
  ok('首次创建成功', !a.deduped);
  const b = createBranch(a.state, { parentId: 'main', chapterId: 's1', reason: 'offline', name: '另一个名字' });
  ok('重复来源返回同一分支', b.deduped && b.branchId === a.branchId);
  ok('线数量不增加', Object.keys(b.state.lines).length === 2);
  ok('findBranchAt 可查到', findBranchAt(b.state, 'main', 's1')?.id === a.branchId);
  // 不同章节应允许
  const c = createBranch(b.state, { parentId: 'main', chapterId: 's2', reason: 'restart' });
  ok('不同分叉章节可再建', !c.deduped && Object.keys(c.state.lines).length === 3);
}

// 构造两条分叉后各自演化的线，用于合并测试
function diverged() {
  let s = initialState();
  const made = createBranch(s, { parentId: 'main', chapterId: 's2', reason: 'custom', name: '测试分支' });
  s = made.state;
  const bid = made.branchId;
  // 分支侧：莫尔离队(字段冲突的一侧)、艾德里安备注变化(单边)、月光草 3->7(冲突)、新增遗物、新章节
  let b = s.lines[bid];
  b = updateCharacter(b, 'c3', { status: 'left' });
  b = updateCharacter(b, 'c1', { note: '分支线：艾德里安失去盾牌' });
  b = updateLoot(b, 'l1', { qty: 7 });
  b = addLoot(b, { name: '海雾水晶', qty: 1, category: '遗物', note: '分支独有' });
  b = addChapter(b, { title: '分支第三章：另一种结局', date: '2024-07-01', summary: '伊琳没有加入', tag: '主线' });
  // 主干侧：莫尔离线(冲突另一侧)、瑟琳备注(仅主干改)、月光草 3->5(冲突)、主干自有第四章
  let m = s.lines.main;
  m = updateCharacter(m, 'c3', { status: 'offline' });
  m = updateCharacter(m, 'c2', { note: '主干线：瑟琳驯养了海鹰' });
  m = updateLoot(m, 'l1', { qty: 5 });
  m = addChapter(m, { title: '正史第三章续', date: '2024-07-01', summary: '主干续写', tag: '主线' });
  return { s: { ...s, lines: { ...s.lines, [bid]: b, main: m } }, bid };
}

// 4. 合并：三方对比 + 冲突指出内容与来源
{
  console.log('4) 合并对比与冲突标注');
  const { s, bid } = diverged();
  const report = buildMergeReport(s, bid, 'main');
  ok('报告生成', !!report);
  ok('检测到冲突', conflictCount(report) >= 2, `conflicts=${conflictCount(report)}`);
  const charConf = report.characters.flatMap((e) => e.changes).filter((c) => c.type === 'conflict');
  ok('角色状态冲突含两侧来源值',
    charConf.some((c) => c.field === 'status' && c.source === 'left' && c.target === 'offline'));
  const lootConf = report.loot.flatMap((e) => e.changes).filter((c) => c.type === 'conflict');
  ok('物品数量冲突含两侧数量',
    lootConf.some((c) => c.field === 'qty' && c.source === 7 && c.target === 5));
  ok('分支新增物品列为 added-in-source',
    report.loot.some((e) => e.status === 'added-in-source' && e.name === '海雾水晶'));
  ok('分支新增章节可并入',
    report.chapters.some((e) => e.status === 'added-in-source' && e.name.includes('另一种结局')));
  ok('单边变化不判为冲突',
    !report.characters.find((e) => e.name === '艾德里安')?.changes
      .some((c) => c.type === 'conflict'));
}

// 5. 未确认变化留在分支
{
  console.log('5) 未确认项留存');
  const { s, bid } = diverged();
  const report = buildMergeReport(s, bid, 'main');
  // 默认状态：冲突未选边 -> 留在分支；其他单边变化默认接受
  ok('存在未确认项', pendingCount(report) >= 1);
  const { state: merged, mergeRecord } = applyMerge(s, JSON.parse(JSON.stringify(report)));
  ok('合并记录标注留存数', mergeRecord.leftBehind === pendingCount(report));
  // 莫尔冲突未确认：主干保持 offline
  ok('未确认冲突不写入接收线',
    merged.lines.main.characters.find((c) => c.id === 'c3').status === 'offline');
  // 月光草冲突未确认：主干保持 5
  ok('未确认数量冲突保持接收值',
    merged.lines.main.loot.find((l) => l.id === 'l1').qty === 5);
  // 单边接受项写入
  ok('已确认单边变化进入接收线',
    merged.lines.main.characters.find((c) => c.id === 'c1').note.includes('失去盾牌'));
  // 新增物品默认接受
  ok('分支新增物品进入接收线', merged.lines.main.loot.some((l) => l.name === '海雾水晶'));
  // 分支章节并入且保留主干自有章节顺序
  const titles = merged.lines.main.chapters.map((c) => c.title);
  ok('分支章节并入主干', titles.some((t) => t.includes('另一种结局')));
  ok('主干自有章节仍在', titles.some((t) => t.includes('正史第三章续')));
  // 旧分支仍在、仍可看
  ok('旧分支合后仍保留', !!merged.lines[bid] && merged.lines[bid].chapters.length === 3);
  // 再次合并：已并入的不再算新增
  const report2 = buildMergeReport(merged, bid, 'main');
  ok('已并入章节不再重复出现',
    !report2.chapters.some((e) => e.status === 'added-in-source' && e.name.includes('另一种结局')));

  // 现在解决冲突选来源，再合一次
  const r2 = JSON.parse(JSON.stringify(report2));
  for (const g of [r2.characters, r2.loot]) {
    for (const e of g) {
      for (const c of e.changes || []) {
        if (c.type === 'conflict') c.decision = 'source';
      }
      if (e.decision === 'conflict') e.decision = 'modified';
    }
  }
  const again = applyMerge(merged, r2).state;
  ok('确认后来源值进入接收线',
    again.lines.main.characters.find((c) => c.id === 'c3').status === 'left' &&
    again.lines.main.loot.find((l) => l.id === 'l1').qty === 7);
}

// 6. 导出再导入仍按分支查看
{
  console.log('6) 导出/导入往返');
  const { s, bid } = diverged();
  const text = exportJSON(s);
  const res = parseImport(text);
  ok('导入成功', res.ok);
  const t = res.state;
  ok('分支数量一致', Object.keys(t.lines).length === 2);
  ok('分支章节与快照保留', t.lines[bid].chapters.length === 3 &&
    t.lines[bid].chapters[1].snapshot.characters.length === 3);
  ok('分叉关系保留', t.lines[bid].parentId === 'main' && t.lines[bid].rootChapterId === 's2');
  // 导入后仍能再生成合并报告
  ok('导入后可再合并对比', !!buildMergeReport(t, bid, 'main'));
  const bad = parseImport('{"hello":1}');
  ok('非法文件被拒绝', !bad.ok);
}

// 7. 旧版 v1 数据迁移
{
  console.log('7) 旧版迁移');
  const v1 = {
    name: '旧战役', system: 'COC', sessions: [
      { id: 7, date: '2023-01-01', title: '旧章节', summary: 'x', tag: '主线', color: '#000' },
    ],
    characters: [{ name: '甲', role: '调查员', player: 'A', color: '#111' }],
  };
  const s = migrate(v1);
  ok('迁移为 v2', s.version === 2 && s.lines.main);
  ok('旧章节保留且补快照', s.lines.main.chapters[0].title === '旧章节' &&
    !!s.lines.main.chapters[0].snapshot);
  ok('parseImport 支持旧版导出', parseImport(JSON.stringify(v1)).ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
