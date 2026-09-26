import { CHAR_STATUS } from '../branch/model.js';

export default function Characters({ branch, onPatch }) {
  const offline = branch.characters.filter((c) => c.status === '离线').length;
  const readOnly = !!branch.mergedInto;

  return (
    <section className="cards">
      <div className="section-note">
        「{branch.name}」中有 {branch.characters.length} 位冒险者
        {offline > 0 && `，其中 ${offline} 位离线`}
        。改动只保存在本分支，不影响其它分支。
      </div>
      {branch.characters.map((c) => (
        <article
          className={'char-card char-edit ' + (c.status === '离线' ? 'is-off' : '')}
          key={c.id}
        >
          <div className="avatar" style={{ background: c.color }}>{c.name[0]}</div>
          <div className="char-main">
            <small>{c.role} · 玩家 {c.player}</small>
            <h3>{c.name}</h3>
            <select
              value={c.status}
              disabled={readOnly}
              onChange={(e) => onPatch(c.id, { status: e.target.value })}
            >
              {CHAR_STATUS.map((st) => <option key={st}>{st}</option>)}
            </select>
            <input
              value={c.note || ''}
              disabled={readOnly}
              placeholder="状态备注（改判理由等）"
              onChange={(e) => onPatch(c.id, { note: e.target.value })}
            />
          </div>
        </article>
      ))}
    </section>
  );
}
