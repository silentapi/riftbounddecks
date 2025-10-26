function SideDeckRow({ cards }) {
  return (
    <section className="zone">
      <header className="zone__header">
        <h3>Side Deck</h3>
        <span>{cards.length} / 8</span>
      </header>
      <div className="card-grid card-grid--side">
        {cards.map((card) => (
          <article key={card.id} className={`card-slot card-slot--${card.rarity.toLowerCase()}`}>
            <span className="card-slot__name">{card.name}</span>
            <span className="card-slot__type">{card.type}</span>
          </article>
        ))}
        {cards.length < 8 &&
          Array.from({ length: 8 - cards.length }).map((_, index) => (
            <div key={`empty-${index}`} className="card-slot card-slot--empty">
              <span>Empty</span>
            </div>
          ))}
      </div>
    </section>
  );
}

export default SideDeckRow;
