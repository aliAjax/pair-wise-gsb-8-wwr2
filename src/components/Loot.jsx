export default function Loot({ branch, onQty }) {
  const readOnly = !!branch.mergedInto;
  return (
    <section className="loot-page">
      <div className="section-note">
        「{branch.name}」的战利品清单。数量随本分支剧情变化，保存章节时会写入快照。
      </div>
      <div className="loot-grid">
        {branch.loot.map((l) => (
          <div className="loot-item" key={l.id}>
            <div>
              <small>{l.cat}</small>
              <h3>{l.name}</h3>
            </div>
            <div className="stepper">
              <button
                disabled={readOnly || l.qty <= 0}
                onClick={() => onQty(l.id, l.qty - 1)}
              >−</button>
              <b>× {l.qty}</b>
              <button
                disabled={readOnly}
                onClick={() => onQty(l.id, l.qty + 1)}
              >＋</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
