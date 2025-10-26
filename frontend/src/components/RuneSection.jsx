function RuneSection({ runes, runeLimit }) {
  return (
    <section className="zone">
      <header className="zone__header">
        <h3>Runes</h3>
        <span>
          {runes.reduce((sum, rune) => sum + rune.count, 0)} / {runeLimit}
        </span>
      </header>
      <div className="rune-row">
        {runes.map((rune) => (
          <article key={rune.id} className="rune-card">
            <div className={`rune-card__color rune-card__color--${rune.color.toLowerCase()}`} aria-hidden="true" />
            <div className="rune-card__info">
              <h4>{rune.name}</h4>
              <p>{rune.color}</p>
            </div>
            <div className="rune-card__controls" role="group" aria-label={`Adjust ${rune.name}`}>
              <button type="button" aria-label={`Decrease ${rune.name}`}>
                –
              </button>
              <span>{rune.count}</span>
              <button type="button" aria-label={`Increase ${rune.name}`}>
                +
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default RuneSection;
