function SearchPanel({ filters, results }) {
  return (
    <div className="search-panel">
      <h3 className="panel-title">Card Search</h3>
      <form className="search-panel__form">
        <label>
          <span>Name</span>
          <input type="text" placeholder="Search by name" defaultValue={filters.name} />
        </label>
        <label>
          <span>Description</span>
          <input type="text" placeholder="Keywords" defaultValue={filters.description} />
        </label>
        <div className="search-panel__row">
          <label>
            <span>Type</span>
            <select defaultValue={filters.type}>
              <option>All</option>
              <option>Unit</option>
              <option>Spell</option>
              <option>Battlefield</option>
              <option>Rune</option>
              <option>Legend</option>
            </select>
          </label>
          <label>
            <span>Color</span>
            <select defaultValue={filters.color}>
              <option>All</option>
              <option>Azure</option>
              <option>Verdant</option>
              <option>Ember</option>
              <option>Umbral</option>
            </select>
          </label>
        </div>
        <div className="search-panel__row">
          <label>
            <span>Rarity</span>
            <select defaultValue={filters.rarity}>
              <option>All</option>
              <option>Common</option>
              <option>Uncommon</option>
              <option>Rare</option>
              <option>Legendary</option>
            </select>
          </label>
          <label>
            <span>Cost</span>
            <div className="cost-range">
              <input type="number" min="0" max="10" defaultValue={filters.costRange[0]} />
              <span>to</span>
              <input type="number" min="0" max="10" defaultValue={filters.costRange[1]} />
            </div>
          </label>
        </div>
        <div className="search-panel__actions">
          <button type="button" className="deck-button deck-button--ghost">
            Reset
          </button>
          <button type="submit" className="deck-button deck-button--primary">
            Search
          </button>
        </div>
      </form>
      <div className="search-panel__results">
        <header className="search-panel__results-header">
          <h4>Results</h4>
          <div className="search-panel__sort">
            <label>
              <span>Sort by</span>
              <select defaultValue="name">
                <option value="name">Name (A–Z)</option>
                <option value="cost">Cost</option>
                <option value="type">Type</option>
                <option value="rarity">Rarity</option>
              </select>
            </label>
            <button type="button" className="toggle-view">
              Grid
            </button>
          </div>
        </header>
        <div className="search-results-grid">
          {results.map((card) => (
            <article key={card.id} className="search-card">
              <div className="search-card__image" aria-hidden="true" />
              <div className="search-card__details">
                <h5>{card.name}</h5>
                <p>{card.type}</p>
                <dl>
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
              </div>
              <div className="search-card__actions">
                <button type="button">Add to Main</button>
                <button type="button">Add to Side</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SearchPanel;
