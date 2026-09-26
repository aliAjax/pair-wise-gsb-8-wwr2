import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  MAIN_ID, addChapter as modelAddChapter,
} from './branches/model.js';
import { loadState, saveState, downloadCampaign, readImportFile } from './branches/storage.js';
import LineSwitcher from './branches/LineSwitcher.jsx';
import BranchOrchestrator from './branches/BranchOrchestrator.jsx';
import MergeDialog from './branches/MergeDialog.jsx';
import { TimelineTab, CharactersTab, LootTab, PlacesTab } from './branches/tabs.jsx';

const NAV = [
  ['timeline', '◌', '时间线'],
  ['branches', '⎇', '分支编排'],
  ['characters', '♙', '角色与阵营'],
  ['places', '⌖', '地点图鉴'],
  ['loot', '◇', '战利品'],
];

const TITLES = {
  timeline: '战役时间线',
  branches: '分支编排',
  characters: '角色与阵营',
  places: '地点图鉴',
  loot: '战利品',
};

function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('timeline');
  const [notice, setNotice] = useState('');
  const [merge, setMerge] = useState(null); // { sourceId }
  const fileRef = useRef(null);

  useEffect(() => saveState(state), [state]);

  const current = state.lines[state.currentLineId] || state.lines[MAIN_ID];
  const notify = (msg) => {
    setNotice(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setNotice(''), 3200);
  };

  const patchLine = (nextLine) =>
    setState((s) => ({ ...s, lines: { ...s.lines, [nextLine.id]: nextLine } }));

  const switchLine = (id) => {
    if (!state.lines[id]) return;
    setState((s) => ({ ...s, currentLineId: id }));
    notify(`已切换到「${state.lines[id].name}」`);
  };

  const handleImport = async (file) => {
    if (!file) return;
    const res = await readImportFile(file);
    if (res.ok) {
      setState(res.state);
      setTab('branches');
      notify('战役已导入：全部分支、章节快照与合并记录均可查看');
    } else {
      notify(`导入失败：${res.error}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <div className="campaign">
          <small>当前战役</small>
          <strong>{state.name}</strong>
          <span>{state.system} · {state.year} · {state.lineOrder.length} 条线</span>
        </div>
        <nav>
          {NAV.map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <i>{icon}</i>{label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button onClick={() => notify('所有记录仅保存在本浏览器（localStorage）')}>⚙ 偏好设置</button>
          <small>本地存储已开启 · 数据含快照</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">MY CAMPAIGN / {state.system}</span>
            <h1>{TITLES[tab]}</h1>
          </div>
          <div className="actions">
            <LineSwitcher state={state} current={current} onSwitch={switchLine} />
            <button className="outline" onClick={() => downloadCampaign(state)}>↓ 导出</button>
            <button className="outline" onClick={() => fileRef.current?.click()}>↑ 导入</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden
              onChange={(e) => handleImport(e.target.files?.[0])} />
          </div>
        </header>

        {tab === 'timeline' && (
          <TimelineTab line={current} notify={notify}
            onAddChapter={(draft) => patchLine(modelAddChapter(current, draft))} />
        )}
        {tab === 'branches' && (
          <BranchOrchestrator state={state}
            onSwitch={switchLine}
            onState={setState}
            onOpenMerge={(sourceId) => setMerge({ sourceId })}
            notify={notify} />
        )}
        {tab === 'characters' && (
          <CharactersTab line={current} onUpdate={patchLine} notify={notify} />
        )}
        {tab === 'places' && <PlacesTab state={state} />}
        {tab === 'loot' && (
          <LootTab line={current} onUpdate={patchLine} notify={notify} />
        )}
      </main>

      {merge && (
        <MergeDialog state={state} initialSourceId={merge.sourceId}
          onClose={() => setMerge(null)}
          onApply={(next, record) => {
            setState(next);
            setMerge(null);
            setTab('branches');
            notify(record.leftBehind > 0
              ? `已合入「${record.sourceName}」，另有 ${record.leftBehind} 项未确认变化保留在来源分支`
              : `「${record.sourceName}」已合入，旧分支仍可查看`);
          }}
          notify={notify} />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
