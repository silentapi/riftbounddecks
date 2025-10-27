#!/usr/bin/env python3
"""
Extract specific card fields from a JSON dump.

Input:  a JSON file containing a list of card objects (like the sample you sent)
Output: a JSON file with an array of simplified card objects containing:
  - name
  - description
  - variantNumber (first that matches ^[A-Z]{3}-\d{3}$, or null if none; i.e., any three-letter all-caps code before dash)
  - type
  - energy
  - might
  - colors (array of color names)
  - tags (array)

Usage:
  python extract_cards.py --in cards_raw.json --out cards_min.json
"""

import argparse, json, re, sys
from typing import Any, Dict, List

# Accepts any three uppercase letters followed by a dash and three digits, e.g., OGN-001, XYZ-123
SET_VARIANT_PATTERN = re.compile(r"^[A-Z]{3}-\d{3}$")

def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def dump_json(obj: Any, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def first_matching_variant(card: Dict[str, Any]) -> str | None:
    """
    Returns the first variantNumber matching the pattern of any three-letter, all-uppercase code and a hyphen, three digits.
    For example: OGN-001, FOL-123, XYZ-456, etc.
    Returns None if no such variantNumber is found.
    """
    variants = card.get("cardVariants", []) or []
    for v in variants:
        vn = v.get("variantNumber")
        if isinstance(vn, str) and SET_VARIANT_PATTERN.match(vn):
            return vn
    return None

def extract_colors(card: Dict[str, Any]) -> List[str]:
    colors = []
    for cc in card.get("cardColors", []) or []:
        color = cc.get("color") or {}
        name = color.get("name")
        if isinstance(name, str):
            colors.append(name)
    return colors

def normalize_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return [] if value is None else [value]

def simplify_card(card: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": card.get("name"),
        "description": card.get("description"),
        "variantNumber": first_matching_variant(card),
        "type": card.get("type"),
        "super": card.get("super"),
        "energy": card.get("energy"),
        "power": card.get("power"),
        "might": card.get("might"),
        "colors": extract_colors(card),
        "tags": normalize_list(card.get("tags")),
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description="Extract simplified card JSON.")
    parser.add_argument("--in", dest="infile", required=True, help="Path to input JSON")
    parser.add_argument("--out", dest="outfile", required=True, help="Path to output JSON")
    args = parser.parse_args(argv)

    raw = load_json(args.infile)

    # Support either a top-level list or an object with a 'cards' field
    cards = raw
    if isinstance(raw, dict) and "cards" in raw:
        cards = raw["cards"]

    if not isinstance(cards, list):
        print("Input must be a list of card objects or an object with 'cards' list.", file=sys.stderr)
        sys.exit(1)

    simplified = [simplify_card(card) for card in cards]
    dump_json(simplified, args.outfile)
    print(f"Wrote {len(simplified)} cards to {args.outfile}")

if __name__ == "__main__":
    main()
