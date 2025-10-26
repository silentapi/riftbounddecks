function LegendSlot({ card }) {
  return (
    <section className="zone legend-zone">
      <header className="zone__header">
        <h3>Legend</h3>
        <span>1 / 1</span>
      </header>
      <div className="legend-card">
        <div className="legend-card__art">
          <span>Legend</span>
        </div>
        <div className="legend-card__info">
          <h4>{card.name}</h4>
          <p>{card.description}</p>
        </div>
      </div>
    </section>
  );
}

export default LegendSlot;
