function MainDeckGrid({ cards }) {
  return (
    <section className="zone">
      <header className="zone__header">
        <h3>Main Deck</h3>
        <span>{cards.length} / 40</span>
      </header>
      <div className="card-grid card-grid--main">
        {cards.map((card) => (
          <article key={card.id} className={`card-slot card-slot--${card.rarity.toLowerCase()}`}>
            <span className="card-slot__name">{card.name}</span>
            <span className="card-slot__type">{card.type}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default MainDeckGrid;
