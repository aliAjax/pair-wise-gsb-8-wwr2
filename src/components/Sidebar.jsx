import { branchPath } from '../branch/engine.js';

export default function Sidebar({ state, branch, tab, tabs, onTab, onSwitch }) {
  return (
    <aside>
      <div className="logo"><span>✦</span> CAMPAIGNER</div>

      <div className="campaign">
        <small>当前战役</small>
        <strong>{state.name}</strong>
        <span>{state.system} · 分支时间线</span>
        <div className="branch-switch">
          <small>查看分支</small>
          <select
            value={branch.id}
            onChange={(e) => onSwitch(e.target.value)}
            title="切换分支查看，旧分支互不覆盖"
          >
            {state.branches.map((b) => {
              const depth = branchPath(state, b.id).length - 1;
              const tag = b.mergedInto ? '（已合并）' : '';
              return (
                <option key={b.id} value={b.id}>
                  {'　'.repeat(depth)}{depth ? '↳ ' : ''}{b.name}{tag}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <nav>
        {tabs.map(([id, icon, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => onTab(id)}
          >
            <i>{icon}</i>{label}
          </button>
        ))}
      </nav>

      <div className="side-bottom">
        <button>⚙ 偏好设置</button>
        <small>本地存储已开启 · v2 分支存档</small>
      </div>
    </aside>
  );
}
