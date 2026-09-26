import { useState } from 'react';
import { forkExists } from '../../branch/engine.js';

export default function ForkModal({ state, branch, chapter, onCancel, onConfirm, onJump }) {
  if (!chapter) return null;
  const existing = forkExists(state, branch.id, chapter.id);
  const [name, setName] = useState(
    `「${chapter.title.replace(/^第.+?章：?/, '').slice(0, 8)}」另一种走向`,
  );

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <button className="close" onClick={onCancel}>×</button>
        <span className="crumb">FORK THE TIMELINE</span>
        <h2>从本章重开剧情</h2>
        <div className="fork-confirm-chapter" style={{ background: chapter.color }}>
          <b>{chapter.title}</b>
          <span>{chapter.date}</span>
        </div>
        <p className="modal-hint">
          新分支以本章快照为起点：成员状态与物品数量回到当时。
          「{branch.name}」之后的章节保持原样，随时可看。
        </p>

        {existing ? (
          <>
            <div className="conflict-banner">
              同一来源已经重开过一次（「{existing.name}」）。重复创建只会打开这条已有分支，
              不会再产生新分支。
            </div>
            <div className="modal-actions">
              <button className="outline" onClick={onCancel}>取消</button>
              <button
                className="primary"
                onClick={() => onJump(existing.id)}
              >
                打开「{existing.name}」
              </button>
            </div>
          </>
        ) : (
          <>
            <label>新分支名称
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：伊琳同行线" />
            </label>
            <div className="modal-actions">
              <button className="outline" onClick={onCancel}>取消</button>
              <button
                className="primary"
                disabled={!name.trim()}
                onClick={() => onConfirm({ chapterId: chapter.id, name: name.trim() })}
              >
                长出分支
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
