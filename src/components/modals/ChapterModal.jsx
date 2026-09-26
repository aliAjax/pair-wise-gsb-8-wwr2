import { useState } from 'react';

export default function ChapterModal({ defaultDate, onCancel, onSave }) {
  const [form, setForm] = useState({
    title: '', date: defaultDate, summary: '', tag: '主线',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = () => {
    if (!form.title.trim()) return;
    onSave({ ...form, title: form.title.trim() });
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <button className="close" onClick={onCancel}>×</button>
        <span className="crumb">NEW CHAPTER</span>
        <h2>记录新的章节</h2>
        <p className="modal-hint">保存时会把当前分支的角色状态、战利品数量一并写入章节快照。</p>
        <label>章节标题
          <input value={form.title} onChange={set('title')} placeholder="例：第三章：月下集市" />
        </label>
        <label>游戏日期
          <input type="date" value={form.date} onChange={set('date')} />
        </label>
        <label>章节摘要
          <textarea rows="3" value={form.summary} onChange={set('summary')} placeholder="发生了什么？" />
        </label>
        <label>章节类型
          <select value={form.tag} onChange={set('tag')}>
            <option>主线</option>
            <option>支线</option>
            <option>番外</option>
          </select>
        </label>
        <button className="primary full" onClick={submit} disabled={!form.title.trim()}>
          保存章节（含快照）
        </button>
      </div>
    </div>
  );
}
