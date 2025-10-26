function CardPreviewPanel({ card }) {
  return (
    <div className="card-preview">
      <div className="card-preview__image" aria-label={`Preview of ${card.name}`}>
        <span className="card-preview__placeholder">Card Art</span>
      </div>
      <div className="card-preview__details">
        <header className="card-preview__header">
          <h2>{card.name}</h2>
          <span className="card-preview__tag">{card.type}</span>
        </header>
        <dl className="card-preview__meta">
          <div>
            <dt>Cost</dt>
            <dd>{card.cost}</dd>
          </div>
          <div>
            <dt>Color</dt>
            <dd>{card.color}</dd>
          </div>
          <div>
            <dt>Rarity</dt>
            <dd>{card.rarity}</dd>
          </div>
        </dl>
        <p className="card-preview__text">{card.description}</p>
      </div>
    </div>
  );
}

export default CardPreviewPanel;
