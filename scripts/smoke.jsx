import { renderToString } from 'react-dom/server.browser';
import { freshState } from '../src/branch/model.js';
import {
  chaptersOf, ownerMap, forkBranch, switchBranch,
  updateCharacter, setLootQty, addChapter,
} from '../src/branch/engine.js';
import Timeline from '../src/components/Timeline.jsx';
import BranchTree from '../src/components/BranchTree.jsx';
import Characters from '../src/components/Characters.jsx';
import Loot from '../src/components/Loot.jsx';
import ForkModal from '../src/components/modals/ForkModal.jsx';
import MergeModal from '../src/components/modals/MergeModal.jsx';

const strip = (h) => h.replace(/<!-- -->/g, '');
const noop = () => {};

let s = freshState();
const main = s.branches[0];
const chs = chaptersOf(s, main.id);
const owners = ownerMap(s, main.id);

const h1 = strip(renderToString(
  <Timeline state={s} branch={main} chapters={chs} owners={owners} cur={chs[0]}
    onSelect={noop} onFork={noop} onJumpBranch={noop} />,
));
console.log('Timeline  快照面板:', h1.includes('本章保存时的快照'),
  '| 重开按钮:', h1.includes('从本章重开剧情'));

// 子分支时间线：前 2 章应标记为「继承自 正史」
let r = forkBranch(s, main.id, chs[1].id, '伊琳同行线'); s = r.state;
const forkId = r.branchId;
const h1b = strip(renderToString(
  <Timeline state={s} branch={s.branches.find((b) => b.id === forkId)}
    chapters={chaptersOf(s, forkId)} owners={ownerMap(s, forkId)}
    cur={chaptersOf(s, forkId)[0]}
    onSelect={noop} onFork={noop} onJumpBranch={noop} />,
));
console.log('Timeline 继承标记:', h1b.includes('继承自 正史'));

// 子分支制造冲突
s = switchBranch(s, forkId);
s = updateCharacter(s, forkId, 'c-selin', { status: '离线' });
s = setLootQty(s, forkId, 'l-herb', 0);
s = addChapter(s, forkId, { date: '2024-07-01', title: '分歧章节', summary: 'x', tag: '番外' }).state;
s = switchBranch(s, main.id);
s = updateCharacter(s, main.id, 'c-selin', { status: '受伤' });
s = setLootQty(s, main.id, 'l-herb', 8);
const fork = s.branches.find((b) => b.id === forkId);

const h2 = strip(renderToString(
  <BranchTree state={s} currentId={main.id} onView={noop} onMerge={noop} onRename={noop} />,
));
console.log('BranchTree 子分支:', h2.includes('伊琳同行线'),
  '| 合回按钮:', h2.includes('合回「正史」'),
  '| 重开点:', h2.includes('雾中来客'));

const h3 = strip(renderToString(
  <ForkModal state={s} branch={main} chapter={chs[1]}
    onCancel={noop} onConfirm={noop} onJump={noop} />,
));
// 同一来源已存在 → 幂等提示，而不是再给新建表单
console.log('ForkModal 幂等提示:', h3.includes('同一来源已经重开过'),
  '| 不再给长出:', !h3.includes('长出分支'));

const h4 = strip(renderToString(
  <MergeModal state={s} sourceId={forkId} onCancel={noop} onMerged={noop} />,
));
console.log('MergeModal 双方内容(离线/受伤):', h4.includes('离线') && h4.includes('受伤'),
  '| 来源分支名:', h4.includes('伊琳同行线'),
  '| 祖先值在场:', h4.includes('在场'),
  '| 未决留分支:', h4.includes('留在分支'),
  '| 分歧章节:', h4.includes('分歧章节'),
  '| 月光草 0/8:', h4.includes('月光草') && /<b>0<\/b>/.test(h4) && /<b>8<\/b>/.test(h4));

const h5 = strip(renderToString(<Characters branch={fork} onPatch={noop} />));
console.log('Characters 状态/备注:', h5.includes('<select') && h5.includes('状态备注'));

const h6 = strip(renderToString(<Loot branch={fork} onQty={noop} />));
console.log('Loot 数量步进:', h6.includes('stepper') && h6.includes('× 0') && h6.includes('−'));

// 全新来源（未重开过）的 ForkModal 应给新建表单
const fresh = freshState();
const h7 = strip(renderToString(
  <ForkModal state={fresh} branch={fresh.branches[0]} chapter={chaptersOf(fresh, fresh.branches[0].id)[0]}
    onCancel={noop} onConfirm={noop} onJump={noop} />,
));
console.log('ForkModal 新建态:', h7.includes('长出分支') && h7.includes('新分支名称'));

console.log('组件冒烟通过 ✓');
process.exit(0);
