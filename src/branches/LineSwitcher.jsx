import React from 'react';
import { MAIN_ID } from './model.js';

// 顶部“线切换器”：主干与所有分支照常可看，分叉关系缩进展示。
export default function LineSwitcher({ state, current, onSwitch }) {
  const lines = state.lineOrder.map((id) => state.lines[id]).filter(Boolean);
  return (
    <label className="line-switch">
      <span>⎇ 当前线</span>
      <select value={current.id} onChange={(e) => onSwitch(e.target.value)}>
        {lines.map((l) => (
          <option key={l.id} value={l.id}>
            {l.id === MAIN_ID ? '⌖ ' : '⎇ '}{l.name}
            {l.parentId ? `（自 ${state.lines[l.parentId]?.name || '?'} 分叉）` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
