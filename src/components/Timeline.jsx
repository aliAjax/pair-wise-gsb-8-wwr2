import { findBranch } from '../branch/engine.js';

const fmt = (d) =>
  new Date(d).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

export default function Timeline({
  state, branch, chapters, owners, cur, onSelect, onFork, onJumpBranch,
}) {
  const curIdx = cur ? chapters.findIndex((c) => c.id === cur.id) : -1;
  const mergedInto = branch.mergedInto
    ? findBranch(state, branch.mergedInto)
    : null;

  return (
    <div className="timeline-layout">
      <section className="timeline">
        <div className="timeline-intro">
          <div>
            <span>THE CHRONICLE · {branch.name.toUpperCase()}</span>
            <h2>记录每一次冒险</h2>
          </div>
          <span className="count">{chapters.length} CHAPTERS</span>
        </div>

        {mergedInto && (
          <div className="branch-banner merged">
            本分支已于 {branch.mergedAt} 并入「{mergedInto.name}」，时间线保留仅供查看，
            <button onClick={() => onJumpBranch(mergedInto.id)}>
              前往「{mergedInto.name}」
            </button>
          </div>
        )}

        {chapters.map((s, i) => {
          const ownerId = owners[s.id];
          const inherited = ownerId !== branch.id;
          const owner = findBranch(state, ownerId);
          return (
            <button
              className={
                'chapter ' +
                (cur?.id === s.id ? 'selected ' : '') +
                (inherited ? 'inherited' : '')
              }
              onClick={() => onSelect(s.id)}
              key={s.id}
            >
              <div className="date">
                <b>{fmt(s.date)}</b>
                <small>{new Date(s.date).getFullYear()}</small>
              </div>
              <div className="line">
                <span style={{ background: s.color }}></span>
                {i < chapters.length - 1 && <i />}
              </div>
              <div className="chapter-copy">
                <div className="chapter-tags">
                  <span className="tag">{s.tag}</span>
                  {inherited && (
                    <span className="tag tag-inherit">继承自 {owner?.name}</span>
                  )}
                </div>
                <h3>{s.title}</h3>
                <p>{s.summary}</p>
              </div>
              <span className="arrow">↗</span>
            </button>
          );
        })}
      </section>

      {cur && (
        <section className="detail-panel">
          <div className="detail-cover" style={{ background: cur.color }}>
            <span>CHAPTER {String(curIdx + 1).padStart(2, '0')}</span>
            <i>✦</i>
          </div>
          <div className="detail-body">
            <span className="tag">{cur.tag}</span>
            <h2>{cur.title}</h2>
            <p>{cur.summary}</p>
            <div className="meta-grid">
              <div>
                <small>游戏日期</small>
                <strong>{cur.date}</strong>
              </div>
              <div>
                <small>保存时快照</small>
                <strong>
                  {cur.snapshot.characters.length} 角色 · {cur.snapshot.loot.length} 物品
                </strong>
              </div>
            </div>

            <SnapshotBox chapter={cur} />

            <div className="fork-box">
              <div>
                <strong>⑂ 从本章重开剧情</strong>
                <p>以本章快照为起点长出新分支，本分支的章节与改动保持不变。</p>
              </div>
              <button
                className="outline"
                disabled={!!branch.mergedInto}
                onClick={() => onFork(cur.id)}
              >
                重开分支
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SnapshotBox({ chapter }) {
  const { snapshot } = chapter;
  return (
    <div className="snapshot">
      <div className="snapshot-head">
        <span>本章保存时的快照</span>
        <small>重开 / 合并对比的依据</small>
      </div>
      <div className="snapshot-cols">
        <div>
          <small>角色状态</small>
          {snapshot.characters.map((c) => (
            <span key={c.id} className="snap-row">
              <i style={{ background: c.color }} />
              {c.name}
              <b>{c.status}</b>
            </span>
          ))}
        </div>
        <div>
          <small>战利品数量</small>
          {snapshot.loot.map((l) => (
            <span key={l.id} className="snap-row">
              {l.name}
              <b>× {l.qty}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
