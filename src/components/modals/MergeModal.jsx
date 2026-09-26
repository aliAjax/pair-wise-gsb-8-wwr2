import { useMemo, useState } from 'react';
import { findBranch } from '../../branch/engine.js';
import { buildMergePlan, applyMerge } from '../../branch/merge.js';

const fmtVal = (v) => (v === '' || v == null ? '（空）' : String(v));

export default function MergeModal({ state, sourceId, onCancel, onMerged }) {
  const source = findBranch(state, sourceId);
  const targetId = source?.parentId;
  const target = targetId ? findBranch(state, targetId) : null;

  const plan = useMemo(
    () => (source && target ? buildMergePlan(state, sourceId, targetId) : null),
    [state, sourceId, targetId],
  );

  // 每个条目的选择：'source' | 'target' | 'skip'
  const [actions, setActions] = useState(() => {
    const init = {};
    plan?.entries.forEach((e) => {
      init[e.key] = e.conflict ? 'skip' : e.action || 'skip';
    });
    return init;
  });

  if (!source || !target || !plan) {
    return (
      <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
        <div className="modal">
          <button className="close" onClick={onCancel}>×</button>
          <h2>无法合并</h2>
          <p className="modal-hint">该分支没有可合回的上级分支。</p>
          <button className="primary full" onClick={onCancel}>知道了</button>
        </div>
      </div>
    );
  }

  const setAction = (key, v) => setActions((a) => ({ ...a, [key]: v }));
  const unconfirmed = plan.entries.filter(
    (e) => e.conflict && actions[e.key] === 'skip',
  );
  const autoSkipped = plan.entries.filter(
    (e) => !e.conflict && actions[e.key] === 'skip',
  );

  const run = () => {
    // skip → null 传给逻辑层
    const payload = {};
    Object.entries(actions).forEach(([k, v]) => {
      payload[k] = v === 'skip' ? null : v;
    });
    const res = applyMerge(state, sourceId, targetId, payload);
    let msg = `已合入「${target.name}」：采纳 ${res.adopted} 项变化、并入 ${res.addedChapters} 章`;
    if (res.skippedConflicts > 0) {
      msg += `；${res.skippedConflicts} 处冲突未确认，已保留在「${source.name}」里`;
    }
    onMerged(res, msg);
  };

  return (
    <div className="modal-bg wide" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <button className="close" onClick={onCancel}>×</button>
        <span className="crumb">MERGE BRANCHES</span>
        <h2>合并分支</h2>
        <div className="merge-flow">
          <b>{source.name}</b>
          <span>合回</span>
          <b>{target.name}</b>
        </div>
        <p className="modal-hint">
          以重开点「{plan.baseChapter?.title || '根'}」的快照为共同祖先三方对比。
          选择保留哪一侧；不选的变化不会进入「{target.name}」，继续留在「{source.name}」。
        </p>

        <div className="merge-body">
          <section>
            <h4>① 章节</h4>
            <div className="merge-chapters">
              <div>
                <small>{source.name} 新增（{plan.sourceChapters.length}）</small>
                {plan.sourceChapters.length === 0 && <span className="muted">无</span>}
                {plan.sourceChapters.map((c) => (
                  <span key={c.id} className="chip chip-source">{c.title}</span>
                ))}
              </div>
              <div>
                <small>{target.name} 新增（{plan.targetChapters.length}）</small>
                {plan.targetChapters.map((c) => (
                  <span key={c.id} className="chip chip-target">{c.title}</span>
                ))}
              </div>
            </div>
            <p className="merge-note">两侧章节都会保留进合并后的时间线（不覆盖）。</p>
          </section>

          <section>
            <h4>
              ② 角色状态与物品数量
              {plan.conflicts.length > 0 && (
                <span className="conflict-count">{plan.conflicts.length} 处冲突</span>
              )}
            </h4>
            {plan.entries.length === 0 && <p className="muted">两侧工作区没有差异。</p>}
            <div className="diff-list">
              {plan.entries.map((e) => (
                <DiffRow
                  key={e.key}
                  entry={e}
                  sourceName={source.name}
                  targetName={target.name}
                  value={actions[e.key]}
                  onChange={(v) => setAction(e.key, v)}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="merge-footer">
          <span>
            {unconfirmed.length > 0 &&
              `${unconfirmed.length} 处冲突未确认，将留在「${source.name}」`}
            {unconfirmed.length === 0 && autoSkipped.length > 0 &&
              `${autoSkipped.length} 项改动被跳过`}
            {unconfirmed.length === 0 && autoSkipped.length === 0 &&
              '所有差异均已选择'}
          </span>
          <div className="modal-actions">
            <button className="outline" onClick={onCancel}>取消</button>
            <button className="primary" onClick={run}>
              {unconfirmed.length > 0 ? '确认合并（保留未决冲突）' : '确认合并'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffRow({ entry, sourceName, targetName, value, onChange }) {
  const { conflict, label, name, kind, source: sv, target: tv } = entry;
  const pick = (side) => (
    <label className={'pick ' + (value === side ? 'on ' + side : '')}>
      <input
        type="radio"
        name={entry.key}
        checked={value === side}
        onChange={() => onChange(side)}
      />
      <div>
        <small>{side === 'source' ? sourceName : targetName}{conflict ? '' : '（相对重开点）'}</small>
        <b>{kind === 'character' && entry.field === '__new__'
          ? `新增角色：${entry.source.name}`
          : kind === 'loot' && entry.field === '__new__'
            ? `新增物品：${entry.source.name} × ${entry.source.qty}`
            : fmtVal(side === 'source' ? sv : tv)}</b>
      </div>
    </label>
  );

  return (
    <div className={'diff-row ' + (conflict ? 'is-conflict' : '')}>
      <div className="diff-title">
        {conflict && <span className="conflict-flag">冲突</span>}
        <strong>{name}</strong>
        <span>{label}</span>
        {conflict && <small className="diff-base">重开点：{fmtVal(entry.base)}</small>}
      </div>
      <div className="diff-picks">
        {entry.field === '__new__' ? (
          <>
            {pick('source')}
            <label className={'pick skip ' + (value === 'skip' ? 'on' : '')}>
              <input
                type="radio"
                name={entry.key}
                checked={value === 'skip'}
                onChange={() => onChange('skip')}
              />
              <div><small>不纳入</small><b>跳过</b></div>
            </label>
          </>
        ) : (
          <>
            {pick('source')}
            {pick('target')}
            {conflict && (
              <label className={'pick skip ' + (value === 'skip' ? 'on' : '')}>
                <input
                  type="radio"
                  name={entry.key}
                  checked={value === 'skip'}
                  onChange={() => onChange('skip')}
                />
                <div><small>暂不决定</small><b>留在分支</b></div>
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}
