#!/usr/bin/env python3
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

RIFTBOUND_URL = "https://riftbound.leagueoflegends.com/en-us/card-gallery/"
DEFAULT_RELEASE_DATE = "9999-12-31"
RELEASE_DATES_BY_SET = {
    "SFD": "2026-02-13",
    "OGN": "2025-10-31",
    "OGS": "2025-10-31",
}

IMAGE_ROOT = Path(__file__).resolve().parent / "img"


def resolve_set_folder(set_id: str, variant_number: str) -> str:
    if set_id:
        return set_id
    if variant_number:
        parts = variant_number.split("-", 1)
        if len(parts) > 1 and parts[0]:
            return parts[0]
        return variant_number
    return "unknown"


def download_variant_image(url: Optional[str], set_folder: str, variant_number: str) -> str:
    if not url:
        return ""

    IMAGE_ROOT.mkdir(parents=True, exist_ok=True)
    target_dir = IMAGE_ROOT / set_folder
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{variant_number}.png"
    destination = target_dir / filename

    if destination.exists():
        return f"/{set_folder}/{filename}"

    try:
        response = requests.get(url, stream=True, timeout=20)
        response.raise_for_status()
        with destination.open("wb") as fp:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    fp.write(chunk)
    except requests.RequestException as exc:
        print(f"Failed to download {variant_number} image at {url}: {exc}")
        return url or ""

    return f"/{set_folder}/{filename}"


# ------------------ HTTP + HTML ------------------ #

def fetch_html(url: str) -> str:
    resp = requests.get(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; card-scraper/1.0)"},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.text


def extract_next_data(html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    script = soup.find("script", id="__NEXT_DATA__")
    if script is None or not script.string:
        raise RuntimeError("Could not find __NEXT_DATA__ script tag")
    return json.loads(script.string)


# ------------------ Locating cards.items ------------------ #

def get_cards_from_blades(data: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """
    Use the known structure:
      data["props"]["pageProps"]["page"]["blades"]
      → blade where type == "riftboundCardGallery"
      → blade["cards"]["items"]
    """
    try:
        blades = data["props"]["pageProps"]["page"]["blades"]
    except (KeyError, TypeError):
        return None

    if not isinstance(blades, list):
        return None

    for blade in blades:
        if isinstance(blade, dict) and blade.get("type") == "riftboundCardGallery":
            cards_block = blade.get("cards", {})
            if isinstance(cards_block, dict) and isinstance(cards_block.get("items"), list):
                return cards_block["items"]

    return None


def find_cards_items_recursive(node: Any) -> Optional[List[Dict[str, Any]]]:
    """Fallback: recursively search for 'cards': {'items': [...]} anywhere."""
    if isinstance(node, dict):
        cards = node.get("cards")
        if isinstance(cards, dict) and isinstance(cards.get("items"), list):
            return cards["items"]

        for v in node.values():
            result = find_cards_items_recursive(v)
            if result is not None:
                return result

    elif isinstance(node, list):
        for item in node:
            result = find_cards_items_recursive(item)
            if result is not None:
                return result

    return None


# ------------------ Helpers ------------------ #

def html_to_text(html_fragment: str) -> str:
    if not html_fragment:
        return ""
    soup = BeautifulSoup(html_fragment, "html.parser")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    text = soup.get_text()
    return translate_description_tokens(text)


RUNE_TYPES = {"order", "chaos", "fury", "mind", "calm", "body", "rainbow"}
DESCRIPTION_REPLACEMENTS = {
    ":rb_exhaust:": "[Exhaust]",
    ":rb_might:": "[Might]",
}


def translate_description_tokens(text: str) -> str:
    """Translate symbol placeholders to readable bracketed tokens."""
    if not isinstance(text, str):
        return text

    text = re.sub(
        r":rb_energy_(\d+):",
        lambda match: f"[{int(match.group(1))}]",
        text,
    )

    def rune_replacer(match: re.Match[str]) -> str:
        rune_name = match.group(1).lower()
        if rune_name in RUNE_TYPES:
            return f"[{rune_name.capitalize()}]"
        return match.group(0)

    text = re.sub(r":rb_rune_([a-zA-Z]+):", rune_replacer, text)

    for token, replacement in DESCRIPTION_REPLACEMENTS.items():
        text = text.replace(token, replacement)

    return text


def get_stat(card: Dict[str, Any], key: str) -> int:
    """
    Safely pull numeric stats like 'energy', 'power', 'might'.
    """
    block = card.get(key)
    if not isinstance(block, dict):
        return 0
    value = block.get("value")
    if isinstance(value, dict) and isinstance(value.get("id"), int):
        return int(value["id"])
    return 0


def normalize_variant_number(value: str) -> str:
    """Ensure '*' suffixes are treated as 's' so variant IDs remain consistent."""
    if isinstance(value, str) and value.endswith("*"):
        return f"{value[:-1]}s"
    return value


def build_variant_number(card: Dict[str, Any]) -> str:
    """
    Prefer publicCode (e.g. 'OGN-066a/298' → 'OGN-066a'),
    otherwise use set.id + collectorNumber.
    """
    public_code = card.get("publicCode")
    if isinstance(public_code, str) and "/" in public_code:
        return normalize_variant_number(public_code.split("/")[0])

    collector = card.get("collectorNumber")
    set_id = card.get("set", {}).get("value", {}).get("id")

    if isinstance(set_id, str) and isinstance(collector, int):
        return normalize_variant_number(f"{set_id}-{collector:03d}")

    fallback_id = card.get("id")
    if isinstance(fallback_id, str):
        return normalize_variant_number(fallback_id)
    if isinstance(fallback_id, int):
        return normalize_variant_number(str(fallback_id))

    return "UNKNOWN"


def extract_colors(card: Dict[str, Any]) -> List[str]:
    values = card.get("domain", {}).get("values", [])
    if not isinstance(values, list):
        return []
    return [
        v.get("label")
        for v in values
        if isinstance(v, dict) and isinstance(v.get("label"), str)
    ]


def extract_tags(card: Dict[str, Any]) -> List[str]:
    """
    Handles both:
      "tags": { "tags": ["Ahri", "Ionia"] }
    and:
      "tags": { "values": [{ "label": "Piltover" }, ...] }
    """
    tags_block = card.get("tags") or card.get("traits") or {}
    if not isinstance(tags_block, dict):
        return []

    tags: List[str] = []

    # Case 1: "tags": ["Ahri", "Ionia"]
    raw_tags = tags_block.get("tags")
    if isinstance(raw_tags, list):
        for t in raw_tags:
            if isinstance(t, str):
                tags.append(t)
            elif isinstance(t, dict):
                label = t.get("label")
                if isinstance(label, str):
                    tags.append(label)

    # Case 2: "values": [{ "label": "Piltover" }, ...]
    values = tags_block.get("values")
    if isinstance(values, list):
        for v in values:
            if isinstance(v, dict):
                label = v.get("label")
                if isinstance(label, str):
                    tags.append(label)

    # Deduplicate while preserving order
    seen = set()
    deduped: List[str] = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            deduped.append(t)

    return deduped


def extract_type(card: Dict[str, Any]) -> str:
    type_list = card.get("cardType", {}).get("type") or []
    if isinstance(type_list, list) and type_list:
        label = type_list[0].get("label")
        if isinstance(label, str):
            return label
    return ""


def extract_super(card: Dict[str, Any]) -> Optional[str]:
    """
    Primary: from card.cardType.superType[0].label (e.g. "Champion")
    Fallback: older "super" / "superType" blocks if they exist.
    """
    card_type = card.get("cardType", {})

    # New structure: "superType": [{ "id": "champion", "label": "Champion", ... }]
    super_list = card_type.get("superType") or card_type.get("superTypes")
    if isinstance(super_list, list) and super_list:
        first = super_list[0]
        if isinstance(first, dict):
            label = first.get("label")
            if isinstance(label, str):
                return label

    # Fallback to any older "super" / "superType" blocks on the card root
    for key in ("super", "superType"):
        blk = card.get(key)
        if isinstance(blk, dict):
            value = blk.get("value", {})
            label = value.get("label") or blk.get("label")
            if isinstance(label, str):
                return label

    return None


def extract_description(card: Dict[str, Any]) -> str:
    rich = card.get("text", {}).get("richText", {})
    body = rich.get("body")
    if not isinstance(body, str):
        return ""
    return html_to_text(body)


# ------------------ Map to output ------------------ #

def get_release_date_for_card(card: Dict[str, Any]) -> str:
    """Determine the release date based on the card's set id."""
    set_id = card.get("set", {}).get("value", {}).get("id")
    if isinstance(set_id, str):
        return RELEASE_DATES_BY_SET.get(set_id, DEFAULT_RELEASE_DATE)
    return DEFAULT_RELEASE_DATE


def map_card_variant(card: Dict[str, Any]) -> Dict[str, Any]:
    """Build intermediate metadata for a single card variant."""
    variant_number = build_variant_number(card)
    release_date = get_release_date_for_card(card)
    set_id = card.get("set", {}).get("value", {}).get("id")
    if not isinstance(set_id, str):
        set_id = ""
    set_folder = resolve_set_folder(set_id, variant_number)
    variant_image_url = card.get("cardImage", {}).get("url")
    variant_image = download_variant_image(variant_image_url, set_folder, variant_number)

    return {
        "name": card.get("name", ""),
        "description": extract_description(card),
        "variantNumber": variant_number,
        "variantImage": variant_image,
        "type": extract_type(card),
        "super": extract_super(card),
        "energy": get_stat(card, "energy"),
        "power": get_stat(card, "power"),
        "might": get_stat(card, "might"),
        "colors": extract_colors(card),
        "tags": extract_tags(card),
        "releaseDate": release_date,
        "setId": set_id,
    }


def parse_variant_components(variant_number: str) -> Tuple[int, str]:
    """Extract the numeric piece and suffix for deterministic ordering."""
    if "-" not in variant_number:
        return 0, variant_number.lower()

    _, rest = variant_number.split("-", 1)
    digits = "".join(ch for ch in rest if ch.isdigit())
    if digits:
        number = int(digits)
        suffix = rest[len(digits) :].lower()
    else:
        number = 0
        suffix = rest.lower()

    return number, suffix


def variant_sort_key(entry: Dict[str, Any]) -> Tuple[str, str, int, str, str]:
    """Sorting key that orders variants by release, set, numeric, and suffix."""
    release_date = entry["releaseDate"]
    set_id = entry.get("setId") or entry["variantNumber"].split("-", 1)[0]
    number, suffix = parse_variant_components(entry["variantNumber"])
    return release_date, set_id, number, suffix, entry["variantNumber"]


def assemble_cards_by_name(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group variants by name so only a single entry exists per card."""
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        grouped[entry["name"]].append(entry)

    final_cards: List[Dict[str, Any]] = []
    for name in sorted(grouped):
        sorted_variants = sorted(grouped[name], key=variant_sort_key)
        base_variant = sorted_variants[0]
        last_variant = sorted_variants[-1]
        seen_variants = set()
        variants: List[str] = []
        variant_images: List[str] = []

        for variant_entry in sorted_variants:
            variant_code = variant_entry["variantNumber"]
            if variant_code in seen_variants:
                continue
            seen_variants.add(variant_code)
            variants.append(variant_code)
            variant_images.append(variant_entry["variantImage"] or "")

        final_cards.append(
            {
                "name": base_variant["name"],
                "description": last_variant["description"],
                "variantNumber": base_variant["variantNumber"],
                "variants": variants,
                "variantImages": variant_images,
                "type": last_variant["type"],
                "super": last_variant["super"],
                "energy": last_variant["energy"],
                "power": last_variant["power"],
                "might": last_variant["might"],
                "colors": last_variant["colors"],
                "tags": last_variant["tags"],
                "releaseDate": base_variant["releaseDate"],
            }
        )

    return final_cards


# ------------------ Main ------------------ #

def fetch_cards():
    html = fetch_html(RIFTBOUND_URL)
    data = extract_next_data(html)

    items = get_cards_from_blades(data) or find_cards_items_recursive(data)
    if items is None:
        raise RuntimeError("Could not locate cards.items in JSON")

    variant_entries = [
        map_card_variant(card) for card in items if isinstance(card, dict)
    ]
    return assemble_cards_by_name(variant_entries)


if __name__ == "__main__":
    cards = fetch_cards()
    print(json.dumps(cards, indent=2, ensure_ascii=False))
