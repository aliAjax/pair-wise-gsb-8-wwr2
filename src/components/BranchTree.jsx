import { useState } from 'react';
import { childrenOf, chaptersOf, findBranch } from '../branch/engine.js';

export default function BranchTree({ state, currentId, onView, onMerge, onRename }) {
  const roots = state.branches.filter((b) => !b.parentId);

  return (
    <section className="tree-page">
      <div className="section-note">
        每条线是一次跑团重开。旧分支始终可看；把一条分支合回主线前，
        会先对比章节、角色状态与物品数量，冲突逐条确认。
      </div>
      <div className="tree">
        {roots.map((r) => (
          <BranchNode
            key={r.id}
            state={state}
            id={r.id}
            depth={0}
            currentId={currentId}
            onView={onView}
            onMerge={onMerge}
            onRename={onRename}
          />
        ))}
      </div>
    </section>
  );
}

function BranchNode({ state, id, depth, currentId, onView, onMerge, onRename }) {
  const b = findBranch(state, id);
  const kids = childrenOf(state, id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(b.name);
  const count = chaptersOf(state, id).length;
  const forkChapter = b.forkChapterId
    ? chaptersOf(state, b.parentId).find((c) => c.id === b.forkChapterId)
    : null;
  const parent = b.parentId ? findBranch(state, b.parentId) : null;
  const mergeTarget = b.parentId && !findBranch(state, b.parentId).mergedInto
    ? findBranch(state, b.parentId)
    : null;

  const commitName = () => {
    const n = name.trim();
    if (n && n !== b.name) onRename(id, n);
    else setName(b.name);
    setEditing(false);
  };

  return (
    <div className="tree-node-wrap">
      <div
        className={
          'tree-node ' +
          (currentId === id ? 'current ' : '') +
          (b.mergedInto ? 'merged' : '')
        }
        style={{ marginLeft: depth * 30 }}
      >
        <div className="tree-node-main">
          <span className="tree-glyph">{b.parentId ? '↳' : '●'}</span>
          {editing ? (
            <input
              className="tree-name-input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setName(b.name); setEditing(false); }
              }}
            />
          ) : (
            <button className="tree-name" onClick={() => setEditing(true)} title="点击重命名">
              {b.name}
            </button>
          )}
          <span className="tree-meta">
            {count} 章 · {b.createdAt}
            {forkChapter && <> · 从「{forkChapter.title}」重开</>}
            {b.mergedInto && <> · 已并入「{findBranch(state, b.mergedInto)?.name}」</>}
          </span>
        </div>
        <div className="tree-actions">
          <button className="outline" onClick={() => onView(id)}>查看时间线</button>
          {mergeTarget && !b.mergedInto && (
            <button className="primary" onClick={() => onMerge(id)}>
              合回「{mergeTarget.name}」
            </button>
          )}
          {b.mergedInto && parent && (
            <button className="outline" onClick={() => onView(b.mergedInto)}>
              查看并入结果
            </button>
          )}
        </div>
      </div>
      {kids.length > 0 && (
        <div className="tree-children">
          {kids.map((k) => (
            <BranchNode
              key={k.id}
              state={state}
              id={k.id}
              depth={depth + 1}
              currentId={currentId}
              onView={onView}
              onMerge={onMerge}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
