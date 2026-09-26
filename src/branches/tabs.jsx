import React, { useState } from 'react';
import { CHAR_STATUS, addChapter, updateCharacter, updateLoot } from './model.js';

// ---------------- 新建章节 ----------------
export function ChapterModal({onClose, onSave}) {
  const [form, setForm] = useState({
    title: '', date: new Date().toISOString().slice(0, 10), summary: '', tag: '主线',
  });
  const save = () => {
    if (!form.title.trim()) return;
    onSave(form);
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">NEW CHAPTER · 保存时冻结快照</span>
        <h2>记录新的章节</h2>
        <p className="muted small">
          保存此章节会把当前的角色在场状态与战利品数量一并冻结进章节快照，供日后从这里分叉。
        </p>
        <label>章节标题
          <input value={form.title} autoFocus
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="例：第三章：月下集市" />
        </label>
        <label>游戏日期
          <input type="date" value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label>章节摘要
          <textarea rows={3} value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="发生了什么？" />
        </label>
        <label>章节类型
          <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
            <option>主线</option><option>支线</option><option>番外</option>
          </select>
        </label>
        <button className="primary full" onClick={save}>保存章节（含当前快照）</button>
      </div>
    </div>
  );
}

// ---------------- 时间线 ----------------
export function TimelineTab({line, onAddChapter, notify}) {
  const [active, setActive] = useState(() => line.chapters[line.chapters.length - 1]?.id);
  const [show, setShow] = useState(false);
  const activeId = line.chapters.some((c) => c.id === active)
    ? active
    : line.chapters[line.chapters.length - 1]?.id;
  const cur = line.chapters.find((c) => c.id === activeId);
  const idx = line.chapters.findIndex((c) => c.id === activeId);

  const save = (draft) => {
    onAddChapter(draft);
    setShow(false);
    notify('章节已保存，角色/战利品快照已随章节冻结');
  };

  return (
    <div className="timeline-layout">
      <section className="timeline">
        <div className="timeline-intro">
          <div>
            <span>THE CHRONICLE · {line.name}</span>
            <h2>记录每一次冒险</h2>
          </div>
          <span className="count">{line.chapters.length} CHAPTERS</span>
        </div>
        {line.chapters.map((s, i) => (
          <button className={`chapter ${activeId === s.id ? 'selected' : ''}`}
            onClick={() => setActive(s.id)} key={s.id}>
            <div className="date">
              <b>{s.date ? new Date(s.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '——'}</b>
              <small>{s.date ? new Date(s.date).getFullYear() : ''}</small>
            </div>
            <div className="line">
              <span style={{ background: s.color }} />
              {i < line.chapters.length - 1 && <i />}
            </div>
            <div className="chapter-copy">
              <div className="tag">{s.tag}</div>
              <h3>{s.title}</h3>
              <p>{s.summary}</p>
            </div>
            <span className="arrow">↗</span>
          </button>
        ))}
        <button className="add-chapter-btn" onClick={() => setShow(true)}>＋ 在此线记录新章节</button>
      </section>

      <section className="detail-panel">
        {cur ? (
          <>
            <div className="detail-cover" style={{ background: cur.color }}>
              <span>CHAPTER {String(idx + 1).padStart(2, '0')} / {line.name}</span>
              <i>✦</i>
            </div>
            <div className="detail-body">
              <span className="tag">{cur.tag}</span>
              <h2>{cur.title}</h2>
              <p>{cur.summary}</p>
              <div className="meta-grid">
                <div><small>游戏日期</small><strong>{cur.date}</strong></div>
                <div><small>章节快照</small>
                  <strong>
                    {cur.snapshot?.characters?.length ?? line.characters.length} 角色 ·{' '}
                    {cur.snapshot?.loot?.reduce((n, l) => n + (Number(l.qty) || 0), 0) ?? 0} 件战利品
                  </strong>
                </div>
              </div>
              <div className="note">
                <span>⎇</span>
                <div>
                  <strong>分支快照</strong>
                  <p>从这一章节可以长出新分支，角色状态与战利品数量将回到本章保存的瞬间。</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="detail-body"><p className="muted">这条线还没有章节。</p></div>
        )}
      </section>
      {show && <ChapterModal onClose={() => setShow(false)} onSave={save} />}
    </div>
  );
}

// ---------------- 角色 ----------------
export function CharactersTab({line, onUpdate, notify}) {
  return (
    <section className="cards">
      <div className="section-note">
        {line.name}共有 {line.characters.length} 位冒险者。成员离线/离队只影响当前线，并会进入章节快照。
      </div>
      {line.characters.map((c) => (
        <article className={`char-card status-${c.status}`} key={c.id}>
          <div className="avatar" style={{ background: c.color }}>{c.name[0]}</div>
          <div className="char-main">
            <small>{c.role}</small>
            <h3>{c.name}</h3>
            <p>玩家 · {c.player}</p>
            <div className="status-row">
              {Object.entries(CHAR_STATUS).map(([k, v]) => (
                <button key={k}
                  className={`status-chip ${c.status === k ? 'on' : ''}`}
                  onClick={() => { onUpdate(updateCharacter(line, c.id, { status: k })); notify(`${c.name} 已标记为「${v}」（仅当前线）`); }}>
                  {v}
                </button>
              ))}
            </div>
            {c.note && <p className="char-note">{c.note}</p>}
          </div>
        </article>
      ))}
    </section>
  );
}

// ---------------- 战利品 ----------------
export function LootTab({line, onUpdate, notify}) {
  const total = line.loot.reduce((n, l) => n + (Number(l.qty) || 0), 0);
  const step = (l, d) => {
    const qty = Math.max(0, (Number(l.qty) || 0) + d);
    onUpdate(updateLoot(line, l.id, { qty }));
  };
  return (
    <section className="loot-wrap">
      <div className="section-note">
        {line.name}的战利品：{line.loot.length} 种，共 {total} 件。数量调整只影响当前线，并计入此后保存章节的快照。
      </div>
      <div className="loot-list">
        {line.loot.map((l) => (
          <article className="loot-row" key={l.id}>
            <div className="loot-name"><span>◇</span><div><strong>{l.name}</strong><small>{l.note}</small></div></div>
            <span className="loot-cat">{l.category}</span>
            <div className="qty-ctl">
              <button onClick={() => step(l, -1)}>−</button>
              <input type="number" min="0" value={l.qty}
                onChange={(e) => onUpdate(updateLoot(line, l.id, { qty: Math.max(0, Number(e.target.value) || 0) }))} />
              <button onClick={() => step(l, 1)}>＋</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------- 地点（沿用静态记录，不属于分支状态） ----------------
export function PlacesTab({state}) {
  return (
    <section className="empty">
      <div>⌖</div>
      <h2>地点图鉴</h2>
      <p>从章节笔记中收集地点。地点为战役级资料，各分支通用。</p>
      <div className="place-list">
        {state.places.map((p, i) => (
          <span key={p.name}>{String(i + 1).padStart(2, '0')}　{p.name} <b>{p.state}</b></span>
        ))}
      </div>
    </section>
  );
}
