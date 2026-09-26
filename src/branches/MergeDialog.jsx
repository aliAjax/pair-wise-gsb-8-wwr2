import React, { useMemo, useState } from 'react';
import { MAIN_ID, CHAR_STATUS } from './model.js';
import { buildMergeReport, reportGroups, conflictCount, pendingCount, applyMerge } from './merge.js';

const FIELD_LABELS = {
  title: '标题', summary: '摘要', date: '日期', tag: '类型',
  name: '名称', role: '职业', player: '玩家', status: '在场状态',
  color: '标识色', note: '备注', qty: '数量', category: '分类',
};
const fmtVal = (field, v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (field === 'status') return CHAR_STATUS[v] || v;
  if (field === 'qty') return `× ${v}`;
  if (field === 'summary') return String(v).length > 40 ? `${String(v).slice(0, 40)}…` : String(v);
  return String(v);
};

// 单条变化：冲突时二选一并标注来源；单边变化可接受或保留。
function ChangeRow({ change, onDecision }) {
  const isConflict = change.type === 'conflict';
  return (
    <div className={`diff-change ${isConflict ? 'is-conflict' : change.type}`}>
      <div className="diff-field">
        {isConflict && <b className="conflict-flag">冲突</b>}
        {FIELD_LABELS[change.field] || change.field}
      </div>
      <div className="diff-options">
        {isConflict ? (
          <>
            <label className={change.decision === 'source' ? 'pick' : ''}>
              <input type="radio" checked={change.decision === 'source'}
                onChange={() => onDecision('source')} />
              <span className="src-tag">来源分支</span>
              <em>{fmtVal(change.field, change.source)}</em>
            </label>
            <label className={change.decision === 'target' ? 'pick' : ''}>
              <input type="radio" checked={change.decision === 'target'}
                onChange={() => onDecision('target')} />
              <span className="tgt-tag">接收线</span>
              <em>{fmtVal(change.field, change.target)}</em>
            </label>
          </>
        ) : change.type === 'source-change' ? (
          <label className={change.decision === 'keep' ? '' : 'pick'}>
            <input type="checkbox"
              checked={change.decision !== 'keep'}
              onChange={(e) => onDecision(e.target.checked ? 'accept' : 'keep')} />
            <span className="src-tag">来源分支改为</span>
            <em>{fmtVal(change.field, change.source)}</em>
            <small>（原 {fmtVal(change.field, change.base)}）</small>
          </label>
        ) : (
          <div className="keep-only">
            <span className="tgt-tag">接收线为</span>
            <em>{fmtVal(change.field, change.target)}</em>
            <small>来源分支未改动，自动保留</small>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffEntry({ entry, onField, onEntry }) {
  const isChapter = entry.kind === 'chapter';
  const leftBehind = entry.decision === 'pending' || entry.decision === 'conflict';
  return (
    <div className={`diff-entry ${entry.status} ${leftBehind ? 'left-behind' : ''}`}>
      <div className="diff-entry-head">
        <strong>{entry.name || '未命名'}</strong>
        <span className={`diff-status ${entry.status}`}>
          {entry.status === 'added-in-source' && '来源分支新增'}
          {entry.status === 'added-in-target' && '接收线新增'}
          {entry.status === 'removed-in-source' && '来源分支已移除'}
          {entry.status === 'removed-in-target' && '接收线无此项'}
          {entry.status === 'modified' && '两侧均有改动'}
        </span>
        {!isChapter || entry.status === 'modified' ? (
          <div className="entry-actions">
            {entry.status === 'modified' && (
              <>
                <button className="mini" onClick={() => onEntry('accept-all')}>全部取来源</button>
                <button className="mini" onClick={() => onEntry('keep-all')}>全部留接收线</button>
              </>
            )}
            <button className={`mini ${leftBehind ? 'on' : ''}`}
              onClick={() => onEntry(leftBehind ? 'resolve' : 'leave')}>
              {leftBehind ? '↺ 继续处理' : '暂不处理 · 留在分支'}
            </button>
          </div>
        ) : (
          <div className="entry-actions">
            {entry.status === 'added-in-source' && (
              <label className="inline-check">
                <input type="checkbox" checked={entry.decision === 'accept'}
                  onChange={(e) => onEntry(e.target.checked ? 'accept' : 'pending')} />
                并入接收线
              </label>
            )}
            {entry.status !== 'added-in-source' && <small>自动保留在接收线</small>}
          </div>
        )}
      </div>
      {(entry.changes || []).map((c, i) => (
        <ChangeRow key={c.field + i} change={c}
          onDecision={(d) => onField(i, d)} />
      ))}
      {leftBehind && <div className="left-note">未确认：合入后此变化仍保留在来源分支中，不影响接收线。</div>}
    </div>
  );
}

export default function MergeDialog({ state, initialSourceId, onClose, onApply, notify }) {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState(MAIN_ID);
  const [drafts, setDrafts] = useState({}); // sourceId|targetId => 报告副本

  const cacheKey = `${sourceId}>>${targetId}`;
  const baseReport = useMemo(
    () => buildMergeReport(state, sourceId, targetId),
    [state, sourceId, targetId]);

  const report = drafts[cacheKey] && baseReport
    ? drafts[cacheKey]
    : baseReport;

  const branchLines = state.lineOrder
    .map((id) => state.lines[id])
    .filter((l) => l.id !== targetId);

  if (!report) {
    return (
      <div className="modal-bg" onClick={onClose}>
        <div className="modal wide" onClick={(e) => e.stopPropagation()}>
          <button className="close" onClick={onClose}>×</button>
          <span className="crumb">MERGE BRANCHES</span>
          <h2>合并分支</h2>
          <p className="muted">请选择来源分支与接收线。</p>
          <button className="primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    );
  }

  const groups = reportGroups(report);
  const totalChanges = groups.reduce((n, g) => n + g.entries.length, 0);
  const conflicts = conflictCount(report);
  const pending = pendingCount(report);

  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(report));
    fn(copy);
    setDrafts((d) => ({ ...d, [cacheKey]: copy }));
  };

  const setField = (groupKey, entryIdx, fieldIdx, decision) => {
    mutate((r) => {
      const e = r[groupKey][entryIdx];
      e.changes[fieldIdx].decision = decision;
      if (e.decision === 'conflict' || e.decision === 'pending') e.decision = 'modified';
    });
  };
  const setEntry = (groupKey, entryIdx, action) => {
    mutate((r) => {
      const e = r[groupKey][entryIdx];
      if (action === 'leave') {
        e.decision = 'pending';
      } else if (action === 'resolve') {
        e.decision = e.changes?.some((c) => c.type === 'conflict') ? 'conflict' : 'modified';
      } else if (action === 'accept-all') {
        e.decision = 'accept';
        (e.changes || []).forEach((c) => { if (c.source !== undefined) c.decision = 'source'; });
      } else if (action === 'keep-all') {
        e.decision = 'keep';
        (e.changes || []).forEach((c) => { if (c.target !== undefined) c.decision = 'target'; });
      } else {
        e.decision = action; // accept / pending （新增章节等）
      }
    });
  };

  const doMerge = () => {
    const { state: next, mergeRecord } = applyMerge(state, JSON.parse(JSON.stringify(report)));
    onApply(next, mergeRecord);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">MERGE BRANCHES · 三方对比</span>
        <h2>合并分支</h2>

        <div className="merge-direction">
          <label>来源分支（变化方）
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {branchLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id === MAIN_ID ? '⌖ ' : '⎇ '}{l.name}
                </option>
              ))}
            </select>
          </label>
          <span className="arrow-into">→</span>
          <label>接收线（被合入）
            <select value={targetId} onChange={(e) => {
              const next = e.target.value;
              setTargetId(next);
              if (next === sourceId) {
                const other = state.lineOrder.find((id) => id !== next);
                if (other) setSourceId(other);
              }
            }}>
              {state.lineOrder.map((id) => (
                <option key={id} value={id}>
                  {id === MAIN_ID ? '⌖ ' : '⎇ '}{state.lines[id].name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="merge-summary">
          {totalChanges === 0
            ? <span className="ok">两条线在分叉后没有差异，无需合并。</span>
            : <>
                <span>共 {totalChanges} 处差异</span>
                {conflicts > 0 && <span className="badge danger">{conflicts} 处冲突</span>}
                {pending > 0 && <span className="badge warn">{pending} 项未确认 · 将留在分支</span>}
              </>}
        </div>

        <div className="diff-scroll">
          {groups.map((g) => (
            <div className="diff-group" key={g.key}
              data-group={g.key === 'chapters' ? 0 : g.key === 'characters' ? 1 : 2}>
              <h4>{g.label}（{g.entries.length}）</h4>
              {g.entries.length === 0 && <p className="muted small">无差异</p>}
              {g.entries.map((e, i) => (
                <DiffEntry key={e.id} entry={e}
                  onField={(fi, d) => setField(g.key, i, fi, d)}
                  onEntry={(a) => setEntry(g.key, i, a)} />
              ))}
            </div>
          ))}
        </div>

        <div className="merge-legend">
          <span><i className="src-dot" /> 来源：{state.lines[sourceId]?.name}</span>
          <span><i className="tgt-dot" /> 接收：{state.lines[targetId]?.name}</span>
          <small>未勾选项不会进入接收线，仍可在来源分支中查看与再次合并。</small>
        </div>

        <div className="modal-actions">
          <button className="outline" onClick={onClose}>取消</button>
          <button className="primary" disabled={totalChanges === 0} onClick={doMerge}>
            {pending > 0 ? `确认合入（${pending} 项留在分支）` : '确认合入'}
          </button>
        </div>
      </div>
    </div>
  );
}
