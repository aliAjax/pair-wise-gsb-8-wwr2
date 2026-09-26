import { useEffect, useMemo, useState } from 'react';
import { loadState, STORAGE_KEY, migrateLegacy } from './branch/model.js';
import {
  switchBranch, renameBranch, addChapter, forkBranch,
  updateCharacter, setLootQty, exportJSON, importState,
  chaptersOf, branchPath, ownerMap, findBranch,
} from './branch/engine.js';
import Sidebar from './components/Sidebar.jsx';
import Timeline from './components/Timeline.jsx';
import Characters from './components/Characters.jsx';
import Loot from './components/Loot.jsx';
import BranchTree from './components/BranchTree.jsx';
import ChapterModal from './components/modals/ChapterModal.jsx';
import ForkModal from './components/modals/ForkModal.jsx';
import MergeModal from './components/modals/MergeModal.jsx';

const TABS = [
  ['timeline', '◌', '时间线'],
  ['branches', '⑂', '分支编排'],
  ['characters', '♙', '角色与阵营'],
  ['places', '⌖', '地点图鉴'],
  ['loot', '◇', '战利品'],
];

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('timeline');
  const [activeChapterId, setActiveChapterId] = useState(null);
  const [notice, setNotice] = useState('');
  const [chapterModal, setChapterModal] = useState(false);
  const [forkFor, setForkFor] = useState(null); // { chapterId }
  const [mergeFor, setMergeFor] = useState(null); // source branch id

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const toast = (msg) => {
    setNotice(msg);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setNotice(''), 2600);
  };

  const branch = findBranch(state, state.activeBranchId) || state.branches[0];
  const chapters = useMemo(
    () => chaptersOf(state, branch.id),
    [state, branch.id],
  );
  const owners = useMemo(() => ownerMap(state, branch.id), [state, branch.id]);
  const path = useMemo(() => branchPath(state, branch.id), [state, branch.id]);
  const cur = chapters.find((c) => c.id === activeChapterId) || chapters[chapters.length - 1];

  const selectChapter = (id) => setActiveChapterId(id);
  const gotoBranch = (id) => {
    setState((s) => switchBranch(s, id));
    setActiveChapterId(null);
  };

  const saveChapter = (fields) => {
    const r = addChapter(state, branch.id, fields);
    setState(r.state);
    setActiveChapterId(r.chapterId);
    setChapterModal(false);
    toast('章节已保存，并带入当时的角色 / 战利品快照');
  };

  const createFork = ({ chapterId, name }) => {
    const r = forkBranch(state, branch.id, chapterId, name);
    setState(r.state);
    setForkFor(null);
    setActiveChapterId(null);
    setTab('timeline');
    toast(r.reused ? '该来源已重开过，已直接打开现有分支' : `已从指定章节重开「${name}」`);
  };

  const patchCharacter = (charId, patch) =>
    setState((s) => updateCharacter(s, branch.id, charId, patch));

  const changeQty = (itemId, qty) =>
    setState((s) => setLootQty(s, branch.id, itemId, qty));

  const rename = (id, name) => {
    setState((s) => renameBranch(s, id, name));
    toast('分支已重命名');
  };

  const doExport = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([exportJSON(state)], { type: 'application/json' }),
    );
    a.download = 'campaign-branches.json';
    a.click();
    toast('已导出含全部分支的战役存档');
  };

  const onImportFile = async (file) => {
    const text = await file.text();
    const r = importState(text, migrateLegacy);
    if (!r.ok) {
      toast(`导入失败：${r.error}`);
      return;
    }
    setState(r.state);
    setActiveChapterId(null);
    setTab('branches');
    toast(`导入成功：${r.state.branches.length} 条分支，可按分支查看`);
  };

  return (
    <div className="shell">
      <Sidebar
        state={state}
        branch={branch}
        tab={tab}
        tabs={TABS}
        onTab={setTab}
        onSwitch={gotoBranch}
      />
      <main>
        <header>
          <div>
            <span className="crumb">
              MY CAMPAIGN / {state.system}
              {' · '}
              {path.map((b) => b.name).join(' / ')}
            </span>
            <h1>
              {tab === 'timeline' && '战役时间线'}
              {tab === 'branches' && '分支编排'}
              {tab === 'characters' && '角色与阵营'}
              {tab === 'places' && '地点图鉴'}
              {tab === 'loot' && '战利品'}
            </h1>
          </div>
          <div className="actions">
            <button className="outline" onClick={doExport}>↓ 导出</button>
            <ImportButton onFile={onImportFile} />
            <button
              className="primary"
              disabled={!!branch.mergedInto}
              title={branch.mergedInto ? '该分支已合并，仅可查看' : ''}
              onClick={() => setChapterModal(true)}
            >
              ＋ 新建章节
            </button>
          </div>
        </header>

        {tab === 'timeline' && (
          <Timeline
            state={state}
            branch={branch}
            chapters={chapters}
            owners={owners}
            cur={cur}
            onSelect={selectChapter}
            onFork={(chapterId) => setForkFor({ chapterId })}
            onJumpBranch={gotoBranch}
          />
        )}

        {tab === 'branches' && (
          <BranchTree
            state={state}
            currentId={branch.id}
            onView={(id) => { gotoBranch(id); setTab('timeline'); }}
            onMerge={(id) => setMergeFor(id)}
            onRename={rename}
          />
        )}

        {tab === 'characters' && (
          <Characters branch={branch} onPatch={patchCharacter} />
        )}

        {tab === 'places' && (
          <section className="empty">
            <div>⌖</div>
            <h2>地点图鉴</h2>
            <p>从章节笔记中收集地点。当前已记录灰港、雾林和失落钟楼。</p>
            <div className="place-list">
              <span>01　灰港 <b>已探索</b></span>
              <span>02　失落钟楼 <b>已探索</b></span>
              <span>03　雾林 <b>待探索</b></span>
            </div>
          </section>
        )}

        {tab === 'loot' && (
          <Loot branch={branch} onQty={changeQty} />
        )}
      </main>

      {chapterModal && (
        <ChapterModal
          defaultDate={new Date().toISOString().slice(0, 10)}
          onCancel={() => setChapterModal(false)}
          onSave={saveChapter}
        />
      )}
      {forkFor && (
        <ForkModal
          state={state}
          branch={branch}
          chapter={chapters.find((c) => c.id === forkFor.chapterId)}
          onCancel={() => setForkFor(null)}
          onConfirm={createFork}
          onJump={(id) => { setForkFor(null); gotoBranch(id); setTab('timeline'); }}
        />
      )}
      {mergeFor && (
        <MergeModal
          state={state}
          sourceId={mergeFor}
          onCancel={() => setMergeFor(null)}
          onMerged={(result, msg) => {
            setState(result.state);
            setActiveChapterId(null);
            setMergeFor(null);
            setTab('branches');
            toast(msg);
          }}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function ImportButton({ onFile }) {
  return (
    <label className="outline file-btn">
      ↑ 导入
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}
