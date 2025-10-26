function BattlefieldsRow({ battlefields }) {
  return (
    <section className="zone">
      <header className="zone__header">
        <h3>Battlefields</h3>
        <span>{battlefields.length} / 3</span>
      </header>
      <div className="battlefield-row">
        {battlefields.map((field) => (
          <article key={field.id} className="battlefield-card">
            <span>{field.name}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default BattlefieldsRow;
