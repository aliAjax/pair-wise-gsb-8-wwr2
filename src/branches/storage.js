// 持久化与导入导出：导出的整份战役包含全部线与章节快照，
// 重新导入后仍可按分支查看；同一份数据重复导入按内容指纹合并提示。

import { STORAGE_KEY, initialState, migrate } from './model.js';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return migrate(JSON.parse(raw));
  } catch {
    return initialState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时静默降级，导出仍可用 */
  }
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function downloadCampaign(state) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportJSON(state)], { type: 'application/json' }));
  const safe = (state.name || 'campaign').replace(/[\\/:*?"<>|\s]+/gu, '_');
  a.download = `${safe}-branches.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// 内容指纹：用于“同一来源重复创建只留一条”在导入场景的判定。
// 这里做整份战役指纹；分支去重由 model.findBranchAt 在线级保证。
export function fingerprint(state) {
  const key = {
    name: state.name,
    lines: Object.values(state.lines || {}).map((l) => ({
      parentId: l.parentId,
      rootChapterId: l.rootChapterId,
      chapters: (l.chapters || []).map((c) => c.id),
    })),
  };
  let h = 0;
  const s = JSON.stringify(key);
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `fp_${(h >>> 0).toString(36)}`;
}

// 导入：严格校验 → 迁移旧版 → 返回可用的 v2 state。
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是合法的 JSON。' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: '文件内容无法识别。' };
  }
  if (data.version === 2) {
    if (!data.lines || typeof data.lines !== 'object' || !data.lines[data.currentLineId || 'main']) {
      return { ok: false, error: '缺少分支数据（lines），文件可能已损坏。' };
    }
    for (const l of Object.values(data.lines)) {
      if (!Array.isArray(l.chapters) || !Array.isArray(l.characters) || !Array.isArray(l.loot)) {
        return { ok: false, error: '分支数据不完整（章节/角色/战利品缺失）。' };
      }
    }
    return { ok: true, state: data };
  }
  // 旧版单时间线导出：迁移成只有正史线的 v2。
  if (Array.isArray(data.sessions)) {
    return { ok: true, state: migrate(data) };
  }
  return { ok: false, error: '无法识别的战役记录格式。' };
}

export function readImportFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseImport(String(reader.result || '')));
    reader.onerror = () => resolve({ ok: false, error: '文件读取失败。' });
    reader.readAsText(file);
  });
}
