import React, {useState} from 'react';
import {MAIN_ID, BRANCH_REASONS, findBranchAt, createBranch} from './model.js';

// 从指定章节重开：选择来源线 + 分叉章节 + 原因（重开/改判/离线）。
function BranchModal({state, defaultLineId, onClose, onCreate}) {
  const [parentId, setParentId] = useState(defaultLineId || MAIN_ID);
  const parent = state.lines[parentId] || state.lines[MAIN_ID];
  const [chapterId, setChapterId] = useState(
    () => parent.chapters[parent.chapters.length - 1]?.id || '');
  const [reason, setReason] = useState('restart');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const switchParent = (id) => {
    setParentId(id);
    const line = state.lines[id];
    setChapterId(line.chapters[line.chapters.length - 1]?.id || '');
  };

  const chapter = parent.chapters.find((c) => c.id === chapterId);
  const dup = findBranchAt(state, parentId, chapterId);

  const submit = () => {
    setTouched(true);
    if (!chapterId) return;
    const result = createBranch(state, {parentId, chapterId, name, reason});
    onCreate(result, dup);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">NEW BRANCH · 从快照长出</span>
        <h2>重开一条分支</h2>
        <p className="muted small">
          新分支复制所选章节（含）之前的记录，并从该章节保存时冻结的角色/战利品快照起步；
          旧线不会被改动。
        </p>
        <label>来源线
          <select value={parentId} onChange={(e) => switchParent(e.target.value)}>
            {state.lineOrder.map((id) => (
              <option key={id} value={id}>
                {id === MAIN_ID ? '⌖ ' : '⎇ '}{state.lines[id].name}
              </option>
            ))}
          </select>
        </label>
        <label>从哪个章节长出
          <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            {parent.chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                第 {i + 1} 章 · {c.title}（{c.date}）
              </option>
            ))}
          </select>
        </label>
        <label>分叉原因
          <div className="reason-row">
            {Object.entries(BRANCH_REASONS).map(([k, v]) => (
              <button type="button" key={k}
                className={`chip ${reason === k ? 'on' : ''}`}
                onClick={() => setReason(k)}>{v}</button>
            ))}
          </div>
        </label>
        <label>分支名称（可留空自动生成）
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={`例：${parent.name} · ${chapter?.title || '分叉'}之后`} />
        </label>
        {dup && (
          <div className="dup-warn">
            ⚠ 同一来源已有分支「{dup.name}」。重复创建只会打开那条已有分支，不会再生成新线。
          </div>
        )}
        <button className="primary full" onClick={submit}>
          {dup ? `打开已有分支：${dup.name}` : '创建并切换到分支'}
        </button>
        {touched && !chapterId && <small className="err">请选择分叉章节。</small>}
      </div>
    </div>
  );
}

function LineCard({line, state, isCurrent, onView, onBranchFrom, onMergeFrom}) {
  const parent = line.parentId ? state.lines[line.parentId] : null;
  const root = parent?.chapters.find((c) => c.id === line.rootChapterId);
  const sharedCount = line.chapters.filter((c) => parent?.chapters.some((p) => p.id === c.id)).length;
  const ownCount = line.chapters.length - (line.id === MAIN_ID ? 0 : sharedCount);
  const offline = line.characters.filter((c) => c.status !== 'active').length;

  return (
    <article className={`branch-card ${isCurrent ? 'current' : ''} ${line.id === MAIN_ID ? 'trunk' : ''}`}>
      <div className="branch-head">
        <span className="branch-icon">{line.id === MAIN_ID ? '⌖' : '⎇'}</span>
        <div>
          <h3>{line.name}</h3>
          <small>
            {line.id === MAIN_ID
              ? '主干 · 所有分支的共同基线'
              : <>自 <b>{parent?.name || '?'}</b> 的「{root?.title || '未知章节'}」分叉 · {BRANCH_REASONS[line.reason] || '分支'}</>}
          </small>
        </div>
        {isCurrent && <span className="now-badge">当前</span>}
      </div>
      <div className="branch-stats">
        <span>{line.chapters.length} 章节 {line.id !== MAIN_ID && <i>（自有 {Math.max(ownCount, 0)}）</i>}</span>
        <span>{line.characters.length} 角色{offline > 0 && <i> · {offline} 人离线/离队</i>}</span>
        <span>{line.loot.reduce((n, l) => n + (Number(l.qty) || 0), 0)} 件战利品</span>
        <span>建于 {line.createdAt}</span>
      </div>
      {line.merges?.length > 0 && (
        <div className="merge-history">
          {line.merges.map((m) => (
            <span key={m.id} className="merge-tag">
              {m.direction === 'outgoing' ? '↑ 已合出至' : '⇐ 已并入'}
              {' '}{m.sourceName} · {m.at}
              {m.leftBehind > 0 && <i>（{m.leftBehind} 项留在分支）</i>}
            </span>
          ))}
        </div>
      )}
      <div className="branch-actions">
        <button className="outline mini" onClick={() => onView(line.id)} disabled={isCurrent}>
          {isCurrent ? '正在查看' : '查看这条线'}
        </button>
        <button className="outline mini" onClick={() => onBranchFrom(line.id)}>＋ 从此处分叉</button>
        {line.id !== MAIN_ID && (
          <button className="primary mini" onClick={() => onMergeFrom(line.id)}>⇄ 发起合并</button>
        )}
      </div>
    </article>
  );
}

export default function BranchOrchestrator({state, onSwitch, onState, onOpenMerge, notify}) {
  const [showBranch, setShowBranch] = useState(false);
  const [parentPrefill, setParentPrefill] = useState(state.currentLineId);

  const handleCreate = (result, dup) => {
    setShowBranch(false);
    if (result.deduped || dup) {
      onSwitch(result.branchId);
      notify('该来源已存在分支，已为你打开原分支（同一来源不重复建线）');
    } else {
      onState(result.state);
      notify('分支已创建：已带入分叉章节及其角色/战利品快照');
    }
  };

  // 简易族谱：主干在列，分支以连线缩进挂在父线之下。
  const branches = state.lineOrder
    .filter((id) => id !== MAIN_ID)
    .map((id) => state.lines[id]);

  return (
    <section className="orchestrator">
      <div className="orch-toolbar">
        <p className="muted">
          主持人把每次跑团写成一条线。重开剧情、改判或成员离线时新建分支，
          章节、角色状态与战利品各自随快照隔离；合并前逐项三方对比，冲突标明内容与来源。
        </p>
        <button className="primary" onClick={() => { setParentPrefill(state.currentLineId); setShowBranch(true); }}>
          ＋ 新建分支
        </button>
      </div>

      <div className="branch-tree">
        <div className="tree-node trunk-node">
          <LineCard line={state.lines[MAIN_ID]} state={state}
            isCurrent={state.currentLineId === MAIN_ID}
            onView={onSwitch}
            onBranchFrom={(id) => { setParentPrefill(id); setShowBranch(true); }}
            onOpenMerge={onOpenMerge}
            onMergeFrom={onOpenMerge} />
        </div>
        {branches.length > 0 && (
          <div className="tree-children">
            <span className="tree-rail" />
            {branches.map((l) => (
              <div className="tree-node branch-node" key={l.id}>
                <LineCard line={l} state={state}
                  isCurrent={state.currentLineId === l.id}
                  onView={onSwitch}
                  onBranchFrom={(id) => { setParentPrefill(id); setShowBranch(true); }}
                  onMergeFrom={onOpenMerge} />
              </div>
            ))}
          </div>
        )}
      </div>

      {showBranch && (
        <BranchModal state={state} defaultLineId={parentPrefill}
          onClose={() => setShowBranch(false)}
          onCreate={handleCreate} />
      )}
    </section>
  );
}
