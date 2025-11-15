#!/usr/bin/env python3
"""
Extract specific card fields by fetching from API or from a local JSON file.

Input:  Fetches from API by default (preferred). Optionally use --in to specify a local JSON file.
Output: a JSON file with an array of simplified card objects containing:
  - name
  - description
  - variantNumber (first that matches ^[A-Z]{3}-\\d{3}$, or null if none; i.e., any three-letter all-caps code before dash)
  - variants (array of all variant numbers, sorted by releaseDate, then 3-digit number, then suffix; normal variant first)
  - variantImages (array of imageUrls in the same order as variants)
  - type
  - energy
  - might
  - colors (array of color names)
  - tags (array)
  - releaseDate (release date of the primary variant number's set)

Usage:
  python cards.py --out cards_min.json                    # Fetch from API (preferred)
  python cards.py --in cards_raw.json --out cards_min.json  # Use local file (fallback only)
"""

import argparse, json, re, sys
from typing import Any, Dict, List, Tuple
import requests

# Accepts any three uppercase letters followed by a dash and three digits, e.g., OGN-001, XYZ-123
SET_VARIANT_PATTERN = re.compile(r"^[A-Z]{3}-\d{3}$")
# Pattern to parse variant number: 3 uppercase letters, dash, 3 digits, optional suffix
VARIANT_PARSE_PATTERN = re.compile(r"^([A-Z]{3})-(\d{3})(.*)$")

def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def dump_json(obj: Any, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def normalize_variant_number(variant_number: str) -> str:
    """
    Normalizes a variant number by replacing trailing '*' with 's'.
    For example: "OGN-308*" becomes "OGN-308s"
    """
    if variant_number.endswith("*"):
        return variant_number[:-1] + "s"
    return variant_number

def parse_variant_number(variant_number: str) -> Tuple[str, int, str] | None:
    """
    Parses a variant number like "OGN-066a" into (prefix, number, suffix).
    Returns None if the format doesn't match.
    """
    match = VARIANT_PARSE_PATTERN.match(variant_number)
    if match:
        prefix = match.group(1)
        number = int(match.group(2))
        suffix = match.group(3)
        return (prefix, number, suffix)
    return None

def get_release_date(variant: Dict[str, Any]) -> str:
    """
    Gets the release date from variant.set.releaseDate.
    Returns empty string if not found.
    """
    set_obj = variant.get("set") or {}
    release_date = set_obj.get("releaseDate") or ""
    return release_date

def sort_variants(variants: List[Dict[str, Any]]) -> List[str]:
    """
    Sorts variants by:
    1. set.releaseDate (earliest first)
    2. The 3-digit number after the set code and dash
    3. The suffix after the 3 digits (e.g., 'a', '*')
    
    Returns a list of sorted variantNumbers.
    """
    def sort_key(variant: Dict[str, Any]) -> Tuple[str, int, str, str]:
        variant_number = variant.get("variantNumber", "")
        parsed = parse_variant_number(variant_number)
        
        # Get release date for primary sort
        release_date = get_release_date(variant)
        
        if parsed:
            prefix, number, suffix = parsed
            # Extract suffix characters (like 'a' or '*')
            suffix_chars = suffix if suffix else ""
            return (release_date, number, suffix_chars, variant_number)
        else:
            # If parsing fails, sort by variant number as-is
            return (release_date, 999999, variant_number, variant_number)
    
    sorted_variants = sorted(variants, key=sort_key)
    return [normalize_variant_number(v.get("variantNumber", "")) for v in sorted_variants if v.get("variantNumber")]

def get_normal_variant_number(card: Dict[str, Any]) -> str | None:
    """
    Returns the variantNumber matching the pattern that has the smallest number.
    Among variants matching ^[A-Z]{3}-\\d{3}$, picks the one with:
    1. Earliest set.releaseDate
    2. Smallest 3-digit number
    For example: OGN-001, FOL-123, XYZ-456, etc.
    Returns None if no such variantNumber is found.
    """
    variants = card.get("cardVariants", []) or []
    matching_variants = []
    
    # Find all variants that match the pattern (no suffix)
    for v in variants:
        vn = v.get("variantNumber")
        if isinstance(vn, str) and SET_VARIANT_PATTERN.match(vn):
            matching_variants.append(v)
    
    if not matching_variants:
        return None
    
    # Sort matching variants by the same criteria: releaseDate, then number
    def sort_key(variant: Dict[str, Any]) -> Tuple[str, int]:
        variant_number = variant.get("variantNumber", "")
        parsed = parse_variant_number(variant_number)
        release_date = get_release_date(variant)
        
        if parsed:
            _, number, _ = parsed
            return (release_date, number)
        else:
            return (release_date, 999999)
    
    sorted_matching = sorted(matching_variants, key=sort_key)
    return sorted_matching[0].get("variantNumber")

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

def extract_cards_array(text: str) -> List[Dict[str, Any]]:
    """
    Extract the cards array from a JSONL response.
    The response contains multiple JSON objects (one per line), and the cards array
    is nested in the last object at json[2][0][0] based on the structure:
    {"json": [3, 0, [[[...cards...]]]]}
    """
    # Parse JSONL format - each line is a separate JSON object
    lines = text.strip().split('\n')
    
    # Find the object that contains the cards array (usually the last one)
    # It should have structure: {"json": [3, 0, [[[...cards...]]]]}
    for line in reversed(lines):  # Start from the end
        line = line.strip()
        if not line:
            continue
            
        try:
            obj = json.loads(line)
            if isinstance(obj, dict) and "json" in obj:
                json_data = obj["json"]
                # Check if it's the structure [3, 0, [[[...]]]]
                if (isinstance(json_data, list) and 
                    len(json_data) >= 3 and 
                    json_data[0] == 3):  # The first element should be 3 for the data object
                    
                    # The cards array is nested at json[2][0][0]
                    # json[2] = [[[...cards...]]]
                    # json[2][0] = [[...cards...]]
                    # json[2][0][0] = [...cards...]
                    if (isinstance(json_data[2], list) and 
                        len(json_data[2]) > 0 and
                        isinstance(json_data[2][0], list) and
                        len(json_data[2][0]) > 0):
                        
                        # Try json[2][0][0] first (most nested)
                        if isinstance(json_data[2][0][0], list):
                            cards_array = json_data[2][0][0]
                            if len(cards_array) > 0 and isinstance(cards_array[0], dict):
                                first_item = cards_array[0]
                                if any(key in first_item for key in ["id", "name", "type", "cardVariants"]):
                                    return cards_array
                        
                        # Fallback to json[2][0] if the structure is different
                        cards_array = json_data[2][0]
                        if len(cards_array) > 0:
                            # Check if first item is a card object or if it's a nested array
                            first_item = cards_array[0]
                            if isinstance(first_item, dict):
                                if any(key in first_item for key in ["id", "name", "type", "cardVariants"]):
                                    return cards_array
                            elif isinstance(first_item, list) and len(first_item) > 0:
                                # It's nested one more level
                                if isinstance(first_item[0], dict):
                                    return first_item
        except json.JSONDecodeError:
            continue
    
    raise ValueError("Could not find cards array in response")

def fetch_cards_from_api() -> List[Dict[str, Any]]:
    """
    Fetch cards from the Piltover Archive API.
    Returns a list of card objects.
    """
    url = "https://piltoverarchive.com/api/trpc/cards.search,cards.search?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22searchQuery%22%3A%22%22%2C%22colorIds%22%3A%5B%5D%2C%22type%22%3Anull%2C%22super%22%3Anull%2C%22rarity%22%3Anull%2C%22setName%22%3Anull%2C%22energyRange%22%3A%7B%22min%22%3A0%2C%22max%22%3A12%7D%2C%22mightRange%22%3A%7B%22min%22%3A0%2C%22max%22%3A10%7D%2C%22powerRange%22%3A%7B%22min%22%3A0%2C%22max%22%3A4%7D%2C%22advancedSearchEnabled%22%3Afalse%7D%2C%22meta%22%3A%7B%22values%22%3A%7B%22type%22%3A%5B%22undefined%22%5D%2C%22super%22%3A%5B%22undefined%22%5D%2C%22rarity%22%3A%5B%22undefined%22%5D%2C%22setName%22%3A%5B%22undefined%22%5D%7D%2C%22v%22%3A1%7D%7D%2C%221%22%3A%7B%22json%22%3A%7B%22searchQuery%22%3A%22%22%2C%22colorIds%22%3A%5B%5D%2C%22type%22%3Anull%2C%22super%22%3Anull%2C%22rarity%22%3Anull%2C%22setName%22%3Anull%2C%22energyRange%22%3A%7B%22min%22%3A0%2C%22max%22%3A12%7D%2C%22mightRange%22%3A%7B%22min%22%3A0%2C%22max%22%3A10%7D%2C%22powerRange%22%3A%7B%22min%22%3A0%2C%22max%22%3A4%7D%2C%22advancedSearchEnabled%22%3Atrue%7D%2C%22meta%22%3A%7B%22values%22%3A%7B%22type%22%3A%5B%22undefined%22%5D%2C%22super%22%3A%5B%22undefined%22%5D%2C%22rarity%22%3A%5B%22undefined%22%5D%2C%22setName%22%3A%5B%22undefined%22%5D%7D%2C%22v%22%3A1%7D%7D%7D"
    
    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "priority": "u=1, i",
        "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "trpc-accept": "application/jsonl",
        "referer": "https://piltoverarchive.com/cards"
    }
    
    print("Fetching cards from API...", file=sys.stderr)
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    cards_array = extract_cards_array(response.text)
    print(f"Fetched {len(cards_array)} cards from API", file=sys.stderr)
    return cards_array

def simplify_card(card: Dict[str, Any]) -> Dict[str, Any]:
    """
    Creates a simplified card object with all variants sorted.
    The variants array contains all variants sorted, with the normal variantNumber first.
    The variantImages array contains imageUrls in the same order as variants.
    """
    all_variants = card.get("cardVariants", []) or []
    
    # Create a mapping from normalized variantNumber to imageUrl
    variant_to_image = {}
    for variant in all_variants:
        variant_number = variant.get("variantNumber", "")
        if variant_number:
            normalized = normalize_variant_number(variant_number)
            image_url = variant.get("imageUrl", "")
            variant_to_image[normalized] = image_url
    
    # Sort all variants (returns normalized variant numbers)
    sorted_variant_numbers = sort_variants(all_variants)
    
    # Find the normal variant from the original variants (before normalization)
    # We need to find one that matches the pattern, then normalize it
    original_normal = get_normal_variant_number(card)
    normal_variant = normalize_variant_number(original_normal) if original_normal else None
    
    # If we found a normal variant, make sure it's in the sorted list and put it first
    # If it's not in the sorted list (shouldn't happen), find the first matching one from sorted list
    if normal_variant and normal_variant not in sorted_variant_numbers:
        # Find first variant in sorted list that matches the pattern
        for vn in sorted_variant_numbers:
            if isinstance(vn, str) and SET_VARIANT_PATTERN.match(vn):
                normal_variant = vn
                break
    
    # Build variants array: all sorted variants, but ensure normal variant is first if it exists
    variants_array = sorted_variant_numbers.copy()
    if normal_variant and normal_variant in variants_array:
        # Remove normal variant from its current position and put it first
        variants_array.remove(normal_variant)
        variants_array.insert(0, normal_variant)
    
    # Hardcode support for the 6 runes: add "b" variant if it doesn't exist
    # The 6 runes are: OGN-042 (Calm), OGN-089 (Mind), OGN-214 (Order), 
    #                  OGN-126 (Body), OGN-166 (Chaos), OGN-007 (Fury)
    rune_base_ids = {"OGN-042", "OGN-089", "OGN-214", "OGN-126", "OGN-166", "OGN-007"}
    card_type = card.get("type")
    if card_type == "Rune" and normal_variant and normal_variant in rune_base_ids:
        # Check if "b" variant exists
        b_variant = f"{normal_variant}b"
        if b_variant not in variants_array:
            # Add "b" variant after "a" variant (or at the end if no "a" variant)
            a_variant = f"{normal_variant}a"
            if a_variant in variants_array:
                # Insert "b" after "a"
                a_index = variants_array.index(a_variant)
                variants_array.insert(a_index + 1, b_variant)
            else:
                # No "a" variant, add "b" at the end
                variants_array.append(b_variant)
            
            # Add image URL for "b" variant
            b_image_url = f"https://cdn.piltoverarchive.com/cards/{b_variant}.webp"
            variant_to_image[b_variant] = b_image_url
    
    # Build variantImages array in the same order as variants_array
    variant_images = []
    for variant_number in variants_array:
        image_url = variant_to_image.get(variant_number, "")
        variant_images.append(image_url)
    
    # Get release date from the primary variant's set
    release_date = None
    if original_normal:
        # Find the variant object that matches the primary variant number
        for variant in all_variants:
            variant_number = variant.get("variantNumber", "")
            if variant_number == original_normal:
                release_date = get_release_date(variant)
                break
    
    return {
        "name": card.get("name"),
        "description": card.get("description"),
        "variantNumber": normal_variant,
        "variants": variants_array,
        "variantImages": variant_images,
        "type": card.get("type"),
        "super": card.get("super"),
        "energy": card.get("energy"),
        "power": card.get("power"),
        "might": card.get("might"),
        "colors": extract_colors(card),
        "tags": normalize_list(card.get("tags")),
        "releaseDate": release_date,
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description="Extract simplified card JSON.")
    parser.add_argument("--in", dest="infile", required=False, help="Path to input JSON file (optional, fetches from API by default)")
    parser.add_argument("--out", dest="outfile", required=True, help="Path to output JSON")
    args = parser.parse_args(argv)

    # Fetch from API by default (preferred), otherwise load from local file if --in is provided
    if args.infile:
        raw = load_json(args.infile)
        # Support either a top-level list or an object with a 'cards' field
        cards = raw
        if isinstance(raw, dict) and "cards" in raw:
            cards = raw["cards"]
        
        if not isinstance(cards, list):
            print("Input must be a list of card objects or an object with 'cards' list.", file=sys.stderr)
            sys.exit(1)
    else:
        # Fetch from API
        cards = fetch_cards_from_api()

    simplified = [simplify_card(card) for card in cards]
    dump_json(simplified, args.outfile)
    print(f"Wrote {len(simplified)} cards to {args.outfile}")

if __name__ == "__main__":
    main()
