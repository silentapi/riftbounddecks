import CardPreviewPanel from './CardPreviewPanel.jsx';
import DeckControls from './DeckControls.jsx';
import DeckStats from './DeckStats.jsx';
import MainDeckGrid from './MainDeckGrid.jsx';
import LegendSlot from './LegendSlot.jsx';
import BattlefieldsRow from './BattlefieldsRow.jsx';
import RuneSection from './RuneSection.jsx';
import SideDeckRow from './SideDeckRow.jsx';
import SearchPanel from './SearchPanel.jsx';

const placeholderCard = {
  name: 'Stormborn Vanguard',
  type: 'Unit — Tempest Knight',
  cost: 4,
  color: 'Azure',
  rarity: 'Rare',
  description:
    'When this unit enters the battlefield, deal 2 damage to any target. If a rune was spent to play it, draw a card.',
  artUrl: null,
};

const mainDeckCards = Array.from({ length: 40 }, (_, index) => ({
  id: `main-${index + 1}`,
  name: index % 3 === 0 ? 'Stormborn Vanguard' : index % 3 === 1 ? 'Verdant Sower' : 'Cinderbolt Adept',
  rarity: index % 5 === 0 ? 'Legendary' : index % 2 === 0 ? 'Rare' : 'Common',
  type: index % 4 === 0 ? 'Spell' : 'Unit',
}));

const battlefields = [
  { id: 'bf-1', name: 'Shattered Fjord' },
  { id: 'bf-2', name: 'Crystalline Grove' },
  { id: 'bf-3', name: 'Ashen Dunes' },
];

const runes = [
  { id: 'rune-a', name: 'Rune A', color: 'Azure', count: 5 },
  { id: 'rune-b', name: 'Rune B', color: 'Ember', count: 4 },
];

const sideDeckCards = Array.from({ length: 8 }, (_, index) => ({
  id: `side-${index + 1}`,
  name: index % 2 === 0 ? 'Luminous Barrier' : 'Howling Gale',
  rarity: index % 3 === 0 ? 'Rare' : 'Common',
  type: index % 2 === 0 ? 'Spell' : 'Unit',
}));

const searchResults = Array.from({ length: 12 }, (_, index) => ({
  id: `result-${index + 1}`,
  name: index % 2 === 0 ? 'Galechanter Mystic' : 'Obsidian Warden',
  cost: (index % 6) + 1,
  type: index % 3 === 0 ? 'Unit' : index % 3 === 1 ? 'Spell' : 'Battlefield',
  color: index % 2 === 0 ? 'Azure' : 'Verdant',
  rarity: index % 4 === 0 ? 'Legendary' : 'Uncommon',
}));

const filterPresets = {
  name: '',
  description: '',
  type: 'All',
  color: 'All',
  rarity: 'All',
  costRange: [0, 8],
};

function DeckBuilderPage() {
  const totalRunes = runes.reduce((sum, rune) => sum + rune.count, 0);

  const handleControlClick = (action) => {
    // eslint-disable-next-line no-console
    console.log(`Deck control clicked: ${action}`);
  };

  return (
    <div className="deck-builder">
      <section className="panel left-panel">
        <CardPreviewPanel card={placeholderCard} />
        <DeckControls onAction={handleControlClick} />
        <DeckStats
          stats={{
            totalCards: mainDeckCards.length,
            runeTotal: totalRunes,
            colors: [
              { name: 'Azure', value: 18 },
              { name: 'Verdant', value: 14 },
              { name: 'Ember', value: 8 },
            ],
            battlefields: battlefields.length,
          }}
        />
      </section>

      <section className="panel center-panel">
        <MainDeckGrid cards={mainDeckCards} />
        <LegendSlot card={{ name: 'Arclight Prodigy', description: 'Your spells cost 1 less to play.' }} />
        <BattlefieldsRow battlefields={battlefields} />
        <RuneSection runes={runes} runeLimit={12} />
        <SideDeckRow cards={sideDeckCards} />
      </section>

      <section className="panel right-panel">
        <SearchPanel filters={filterPresets} results={searchResults} />
      </section>
    </div>
  );
}

export default DeckBuilderPage;
