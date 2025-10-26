function DeckStats({ stats }) {
  return (
    <div className="deck-stats">
      <h3 className="panel-title">Deck Statistics</h3>
      <div className="deck-stats__summary">
        <div className="stat-tile">
          <span className="stat-tile__label">Main Deck</span>
          <span className="stat-tile__value">{stats.totalCards}/40</span>
        </div>
        <div className={`stat-tile${stats.runeTotal > 12 ? ' stat-tile--warning' : ''}`}>
          <span className="stat-tile__label">Runes</span>
          <span className="stat-tile__value">{stats.runeTotal}/12</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Battlefields</span>
          <span className="stat-tile__value">{stats.battlefields}/3</span>
        </div>
      </div>
      <div className="deck-stats__distribution">
        <h4>Color Distribution</h4>
        <ul>
          {stats.colors.map((color) => (
            <li key={color.name}>
              <span>{color.name}</span>
              <span>{color.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default DeckStats;
