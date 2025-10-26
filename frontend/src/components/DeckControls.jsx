const controls = [
  { id: 'new', label: 'New Deck' },
  { id: 'rename', label: 'Rename Deck' },
  { id: 'delete', label: 'Delete Deck' },
  { id: 'save', label: 'Save Deck', primary: true },
  { id: 'save-as', label: 'Save As' },
  { id: 'import', label: 'Import Deck' },
  { id: 'export', label: 'Export Deck' },
  { id: 'clear', label: 'Clear Deck' },
  { id: 'default', label: 'Set as Default' },
];

function DeckControls({ onAction }) {
  return (
    <div className="deck-controls">
      <h3 className="panel-title">Deck Management</h3>
      <div className="deck-controls__grid">
        {controls.map((control) => (
          <button
            key={control.id}
            type="button"
            className={`deck-button${control.primary ? ' deck-button--primary' : ''}`}
            onClick={() => onAction(control.id)}
          >
            {control.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DeckControls;
