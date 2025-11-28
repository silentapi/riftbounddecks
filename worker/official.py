#!/usr/bin/env python3
import io
import json
import logging
import os
import re
from argparse import ArgumentParser, Namespace
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import boto3
from botocore.exceptions import BotoCoreError, ClientError
import requests
from bs4 import BeautifulSoup

RIFTBOUND_URL = "https://riftbound.leagueoflegends.com/en-us/card-gallery/"
DEFAULT_RELEASE_DATE = "9999-12-31"
RELEASE_DATES_BY_SET = {
    "SFD": "2026-02-13",
    "OGN": "2025-10-31",
    "OGS": "2025-10-31",
}

DEFAULT_OUTPUT_DIR = Path(os.environ.get("WORKER_OUTPUT_DIR", "/output"))
STATIC_IMG_SUBPATH = "img"


class ImageStats:
    def __init__(self) -> None:
        self.total_variants = 0
        self.new_images = 0
        self.missing_image_urls = 0

class StructuredFormatter(logging.Formatter):
    """Custom formatter that handles structured logging with clean timestamps."""
    
    # Standard LogRecord attributes to exclude from structured output
    _STANDARD_ATTRS = {
        "name", "msg", "args", "created", "filename", "funcName",
        "levelname", "levelno", "lineno", "module", "msecs",
        "message", "pathname", "process", "processName", "relativeCreated",
        "thread", "threadName", "exc_info", "exc_text", "stack_info",
        "asctime"
    }
    
    def __init__(self):
        super().__init__()
        self.datefmt = "%Y-%m-%d %H:%M:%S"
    
    def format(self, record: logging.LogRecord) -> str:
        # Format timestamp
        timestamp = self.formatTime(record, self.datefmt)
        
        # Format level as lowercase in brackets
        level = f"[{record.levelname.lower()}]"
        
        # Get the message
        message = record.getMessage()
        
        # Extract structured data (custom attributes not in standard set)
        # Filter out None values and unwanted keys like taskName
        extra_dict = {
            k: v for k, v in record.__dict__.items()
            if k not in self._STANDARD_ATTRS
            and v is not None
            and k != "taskName"
        }
        
        if extra_dict:
            # Format extra data with quotes and spaces: "key = value"
            extra_parts = []
            for key, value in sorted(extra_dict.items()):
                if isinstance(value, (dict, list)):
                    # For complex types, use JSON but keep it compact
                    value_str = json.dumps(value, ensure_ascii=False)
                    if len(value_str) > 100:
                        value_str = value_str[:97] + "..."
                    extra_parts.append(f'"{key} = {value_str}"')
                elif isinstance(value, str) and len(value) > 100:
                    # Truncate long strings
                    extra_parts.append(f'"{key} = {value[:97]}..."')
                else:
                    extra_parts.append(f'"{key} = {value}"')
            extra_str = " ".join(extra_parts)
            return f"{timestamp} {level} {message} {extra_str}"
        
        return f"{timestamp} {level} {message}"


class StructuredLogger:
    """Wrapper around standard logger that supports structured logging with dict as second arg."""
    
    def __init__(self, logger: logging.Logger):
        self._logger = logger
    
    def _log(self, level: int, msg: str, *args, **kwargs):
        """Internal logging method that handles structured data."""
        # Check if second positional arg is a dict (structured data)
        if args and isinstance(args[0], dict):
            extra = args[0]
            # Pass the dict as extra kwargs to the logger
            self._logger.log(level, msg, extra=extra)
        else:
            # Standard logging
            self._logger.log(level, msg, *args, **kwargs)
    
    def info(self, msg: str, *args, **kwargs):
        self._log(logging.INFO, msg, *args, **kwargs)
    
    def warning(self, msg: str, *args, **kwargs):
        self._log(logging.WARNING, msg, *args, **kwargs)
    
    def error(self, msg: str, *args, **kwargs):
        self._log(logging.ERROR, msg, *args, **kwargs)
    
    def debug(self, msg: str, *args, **kwargs):
        self._log(logging.DEBUG, msg, *args, **kwargs)
    
    def critical(self, msg: str, *args, **kwargs):
        self._log(logging.CRITICAL, msg, *args, **kwargs)


# Set up logging with custom formatter
handler = logging.StreamHandler()
handler.setFormatter(StructuredFormatter())

_base_logger = logging.getLogger("riftbound-worker")
_base_logger.setLevel(os.environ.get("WORKER_LOG_LEVEL", "INFO"))
_base_logger.addHandler(handler)
_base_logger.propagate = False

# Create structured logger wrapper
logger = StructuredLogger(_base_logger)


class SpacesUploader:
    """Minimal S3-compatible client that uploads JSON and images to a prefix."""

    REQUIRED_ENV_VARS = (
        "SPACES_ENDPOINT",
        "SPACES_KEY",
        "SPACES_SECRET",
        "SPACES_BUCKET",
    )

    def __init__(self) -> None:
        missing = [
            var for var in self.REQUIRED_ENV_VARS if not os.environ.get(var)
        ]
        if missing:
            raise RuntimeError(
                f"Missing required DigitalOcean Spaces env vars: {', '.join(missing)}"
            )

        endpoint = os.environ["SPACES_ENDPOINT"].strip()
        if not endpoint:
            raise RuntimeError("SPACES_ENDPOINT cannot be empty")
        if not endpoint.lower().startswith("http"):
            endpoint = f"https://{endpoint}"

        parsed = urlparse(endpoint)
        if not parsed.scheme or not parsed.netloc:
            raise RuntimeError(f"Invalid SPACES_ENDPOINT: {endpoint}")

        self.endpoint_url = endpoint
        self.bucket = os.environ["SPACES_BUCKET"].strip()
        prefix = (os.environ.get("SPACES_PREFIX") or "").strip().strip("/")
        self.prefix = f"{prefix}/" if prefix else ""
        self.client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=os.environ["SPACES_KEY"].strip(),
            aws_secret_access_key=os.environ["SPACES_SECRET"].strip(),
        )

        base_url = f"{parsed.scheme}://{self.bucket}.{parsed.netloc}"
        if parsed.path and parsed.path not in ("/", ""):
            base_url = f"{base_url}{parsed.path.rstrip('/')}"
        self.public_base_url = base_url.rstrip("/")

    def _prefixed_key(self, relative_path: str) -> str:
        clean_path = relative_path.lstrip("/")
        return f"{self.prefix}{clean_path}" if self.prefix else clean_path

    def build_public_url(self, relative_path: str) -> str:
        key = self._prefixed_key(relative_path)
        return f"{self.public_base_url}/{key}"

    def object_exists(self, relative_path: str) -> bool:
        key = self._prefixed_key(relative_path)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NotFound", "NoSuchKey"):
                return False
            raise

    def upload_stream(
        self,
        stream: io.BytesIO,
        relative_path: str,
        content_type: Optional[str] = None,
    ) -> str:
        key = self._prefixed_key(relative_path)
        stream.seek(0)
        upload_kwargs = {
            "Bucket": self.bucket,
            "Key": key,
            "Body": stream,
            "ACL": "public-read",
        }
        if content_type:
            upload_kwargs["ContentType"] = content_type

        self.client.put_object(**upload_kwargs)
        return f"{self.public_base_url}/{key}"

    def upload_json(self, json_content: str, relative_path: str = "cards.json") -> str:
        stream = io.BytesIO(json_content.encode("utf-8"))
        return self.upload_stream(
            stream,
            relative_path,
            content_type="application/json; charset=utf-8",
        )

    def download_json(self, relative_path: str = "cards.json") -> Optional[List[Dict[str, Any]]]:
        """Download and parse JSON from Spaces. Returns None if file doesn't exist."""
        key = self._prefixed_key(relative_path)
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            content = response["Body"].read().decode("utf-8")
            return json.loads(content)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NotFound", "NoSuchKey"):
                return None
            raise


def resolve_set_folder(set_id: str, variant_number: str) -> str:
    if set_id:
        return set_id
    if variant_number:
        parts = variant_number.split("-", 1)
        if len(parts) > 1 and parts[0]:
            return parts[0]
        return variant_number
    return "unknown"


def upload_variant_image(
    url: Optional[str],
    set_folder: str,
    variant_number: str,
    uploader: SpacesUploader,
) -> Tuple[str, bool]:
    if not url:
        return "", False

    normalized_folder = set_folder.strip("/") if set_folder else ""
    relative_parts = [STATIC_IMG_SUBPATH]
    if normalized_folder:
        relative_parts.append(normalized_folder)
    relative_parts.append(f"{variant_number}.png")
    relative_path = "/".join(relative_parts)

    if uploader.object_exists(relative_path):
        return uploader.build_public_url(relative_path), False

    try:
        with requests.get(url, stream=True, timeout=20) as response:
            response.raise_for_status()
            buffer = io.BytesIO()
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    buffer.write(chunk)
            buffer.seek(0)
            content_type = response.headers.get("Content-Type", "image/png")
            return (
                uploader.upload_stream(buffer, relative_path, content_type=content_type),
                True,
            )
    except requests.RequestException as exc:
        logger.warning("Failed to download variant image", {"variant": variant_number, "url": url, "error": str(exc)})
        return url or "", False
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Failed to upload variant image to Spaces", {"variant": variant_number, "error": str(exc)})
        return url or "", False


def store_variant_image_static(
    url: Optional[str],
    set_folder: str,
    variant_number: str,
    output_root: Path,
) -> Tuple[str, bool]:
    if not url:
        return ""

    normalized_folder = set_folder.strip("/") if set_folder else ""
    relative_parts = [part for part in (normalized_folder, f"{variant_number}.png") if part]
    relative_path = "/".join(relative_parts)
    img_root = output_root / STATIC_IMG_SUBPATH
    destination = img_root / relative_path

    if destination.exists():
        return f"/{STATIC_IMG_SUBPATH}/{relative_path}", False

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with requests.get(url, stream=True, timeout=20) as response:
            response.raise_for_status()
            with destination.open("wb") as fp:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        fp.write(chunk)
        return f"/{STATIC_IMG_SUBPATH}/{relative_path}", True
    except requests.RequestException as exc:
        logger.warning("Failed to download variant image for static output", {"variant": variant_number, "url": url, "error": str(exc)})
        return url or "", False


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


def map_card_variant(
    card: Dict[str, Any],
    image_handler: Callable[[Optional[str], str, str], str],
) -> Dict[str, Any]:
    """Build intermediate metadata for a single card variant."""
    variant_number = build_variant_number(card)
    release_date = get_release_date_for_card(card)
    set_id = card.get("set", {}).get("value", {}).get("id")
    if not isinstance(set_id, str):
        set_id = ""
    set_folder = resolve_set_folder(set_id, variant_number)
    variant_image_url = card.get("cardImage", {}).get("url")
    variant_image = image_handler(variant_image_url, set_folder, variant_number)

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

def fetch_cards(image_handler: Callable[[Optional[str], str, str], str]):
    logger.info("Pulling card gallery HTML", {"url": RIFTBOUND_URL})
    html = fetch_html(RIFTBOUND_URL)
    logger.info("Parsing Next.js payload")
    data = extract_next_data(html)

    items = get_cards_from_blades(data) or find_cards_items_recursive(data)
    if items is None:
        raise RuntimeError("Could not locate cards.items in JSON")

    logger.info("Discovered card variants", {"variants": len(items)})
    variant_entries = [
        map_card_variant(card, image_handler) for card in items if isinstance(card, dict)
    ]
    return assemble_cards_by_name(variant_entries)


def write_cards_json_static(cards: List[Dict[str, Any]], output_root: Path) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    cards_path = output_root / "cards.json"
    cards_path.write_text(json.dumps(cards, ensure_ascii=False), encoding="utf-8")
    return cards_path


def make_spaces_image_handler(
    uploader: SpacesUploader, stats: ImageStats
) -> Callable[[Optional[str], str, str], str]:
    def handler(url: Optional[str], set_folder: str, variant_number: str) -> str:
        stats.total_variants += 1

        if not url:
            stats.missing_image_urls += 1
            return ""

        image_url, is_new = upload_variant_image(
            url, set_folder, variant_number, uploader
        )
        if is_new:
            stats.new_images += 1
        return image_url

    return handler


def make_static_image_handler(
    output_root: Path, stats: ImageStats
) -> Callable[[Optional[str], str, str], str]:
    def handler(url: Optional[str], set_folder: str, variant_number: str) -> str:
        stats.total_variants += 1

        if not url:
            stats.missing_image_urls += 1
            return ""

        image_url, is_new = store_variant_image_static(
            url, set_folder, variant_number, output_root
        )
        if is_new:
            stats.new_images += 1
        return image_url

    return handler


def load_existing_cards(mode: str, uploader: Optional[SpacesUploader] = None, output_root: Optional[Path] = None) -> Optional[List[Dict[str, Any]]]:
    """Load existing cards.json from the appropriate location based on mode."""
    if mode == "spaces" and uploader:
        return uploader.download_json("cards.json")
    elif mode == "static" and output_root:
        cards_path = output_root / "cards.json"
        if cards_path.exists():
            try:
                content = cards_path.read_text(encoding="utf-8")
                return json.loads(content)
            except (json.JSONDecodeError, IOError) as exc:
                logger.warning("Failed to load existing cards.json", {"error": str(exc), "path": str(cards_path)})
                return None
    return None


def compare_cards(old_cards: Optional[List[Dict[str, Any]]], new_cards: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compare old and new cards and return a summary of changes."""
    if old_cards is None:
        # First run - all cards are "added"
        added_names = [card["name"] for card in new_cards]
        return {
            "added": len(new_cards),
            "updated": 0,
            "removed": 0,
            "unchanged": 0,
            "total_variants_added": sum(len(card.get("variants", [])) for card in new_cards),
            "total_variants_removed": 0,
            "added_names": added_names,
            "updated_names": [],
            "removed_names": [],
            "is_first_run": True,
        }

    # Create lookup dictionaries by card name
    old_by_name = {card["name"]: card for card in old_cards}
    new_by_name = {card["name"]: card for card in new_cards}

    added = []
    updated = []
    removed = []
    unchanged = []

    # Find added and updated cards
    for name, new_card in new_by_name.items():
        if name not in old_by_name:
            added.append(name)
        else:
            old_card = old_by_name[name]
            # Compare cards - only check meaningful fields (ignore variantImages which may change)
            # Compare key fields that matter for card identity and gameplay
            fields_to_compare = [
                "name", "description", "variantNumber", "variants", 
                "type", "super", "energy", "power", "might", 
                "colors", "tags", "releaseDate"
            ]
            
            is_different = False
            for field in fields_to_compare:
                old_val = old_card.get(field)
                new_val = new_card.get(field)
                # Handle list comparison (order might differ but content same)
                if isinstance(old_val, list) and isinstance(new_val, list):
                    if set(old_val) != set(new_val):
                        is_different = True
                        break
                elif old_val != new_val:
                    is_different = True
                    break
            
            if is_different:
                updated.append(name)
            else:
                unchanged.append(name)

    # Find removed cards
    for name in old_by_name:
        if name not in new_by_name:
            removed.append(name)

    # Calculate variant changes
    total_variants_added = 0
    total_variants_removed = 0
    
    # Count variants for added cards
    for name in added:
        if name in new_by_name:
            total_variants_added += len(new_by_name[name].get("variants", []))
    
    # Count variant changes for updated cards
    for name in updated:
        if name in new_by_name and name in old_by_name:
            old_variants = len(old_by_name[name].get("variants", []))
            new_variants = len(new_by_name[name].get("variants", []))
            if new_variants > old_variants:
                total_variants_added += new_variants - old_variants
            elif new_variants < old_variants:
                total_variants_removed += old_variants - new_variants
    
    # Count variants for removed cards
    for name in removed:
        if name in old_by_name:
            total_variants_removed += len(old_by_name[name].get("variants", []))

    return {
        "added": len(added),
        "updated": len(updated),
        "removed": len(removed),
        "unchanged": len(unchanged),
        "total_variants_added": max(0, total_variants_added),
        "total_variants_removed": max(0, total_variants_removed),
        "added_names": added,  # Full list for logging
        "updated_names": updated,  # Full list for logging
        "removed_names": removed,  # Full list for logging
        "is_first_run": False,
    }


def format_change_summary(diff: Dict[str, Any], new_count: int) -> str:
    """Format a human-readable multiline summary of card changes with headers."""
    lines = [
        "=" * 60,
        "Card Changes Summary",
        "=" * 60,
        f"New:        {diff['added']:>6}",
        f"Updated:    {diff['updated']:>6}",
        f"Deleted:    {diff['removed']:>6}",
        f"Unchanged:  {diff['unchanged']:>6}",
        "-" * 60,
        f"Total:      {new_count:>6}",
        "=" * 60,
    ]
    return "\n".join(lines)


def log_card_changes(diff: Dict[str, Any]) -> None:
    """Log individual card names as they are found (added/updated/removed only)."""
    # Log added cards
    for name in diff.get("added_names", []):
        logger.info(f"Added {name}")
    
    # Log updated cards
    for name in diff.get("updated_names", []):
        logger.info(f"Updated {name}")
    
    # Log removed cards
    for name in diff.get("removed_names", []):
        logger.info(f"Deleted {name}")


def log_summary(mode: str, card_count: int, stats: ImageStats, output_target: str) -> None:
    logger.info(
        "Worker run complete",
        {
            "mode": mode,
            "cards": card_count,
            "total_variant_entries": stats.total_variants,
            "new_images": stats.new_images,
            "missing_image_urls": stats.missing_image_urls,
            "output": output_target,
        },
    )


def parse_args() -> Namespace:
    parser = ArgumentParser(description="Riftbound card scraper worker")
    parser.add_argument(
        "--mode",
        choices=["spaces", "static"],
        default="spaces",
        help="Where to publish cards data (Spaces or static /output directory)",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Root directory for static output mode (mounted by the user)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logger.info("Worker starting", {"mode": args.mode, "output_dir": args.output_dir})
    stats = ImageStats()

    if args.mode == "spaces":
        uploader = SpacesUploader()
        # Load existing cards for comparison
        old_cards = load_existing_cards(args.mode, uploader=uploader)
        cards = fetch_cards(make_spaces_image_handler(uploader, stats))
        cards_json = json.dumps(cards, ensure_ascii=False)
        cards_url = uploader.upload_json(cards_json, "cards.json")
        logger.info("Cards data uploaded to Spaces", {"url": cards_url, "card_count": len(cards)})
        log_summary(args.mode, len(cards), stats, cards_url)
        
        # Compare and log changes
        diff = compare_cards(old_cards, cards)
        # Add separator before changes if there are any
        has_changes = diff["added"] > 0 or diff["updated"] > 0 or diff["removed"] > 0
        if has_changes:
            logger.info("=" * 60)
        # Log individual card changes first
        log_card_changes(diff)
        # Then log the summary at the end (multiline format)
        change_summary = format_change_summary(diff, len(cards))
        # Log each line of the summary separately to preserve formatting
        for line in change_summary.split("\n"):
            logger.info(line)
        logger.info(f"Cards data uploaded to {cards_url}")
        return

    output_root = Path(args.output_dir)
    # Load existing cards for comparison
    old_cards = load_existing_cards(args.mode, output_root=output_root)
    cards = fetch_cards(make_static_image_handler(output_root, stats))
    cards_path = write_cards_json_static(cards, output_root)
    logger.info("Cards data written to static output", {"path": str(cards_path), "card_count": len(cards)})
    log_summary(args.mode, len(cards), stats, str(cards_path))
    
    # Compare and log changes
    diff = compare_cards(old_cards, cards)
    # Add separator before changes if there are any
    has_changes = diff["added"] > 0 or diff["updated"] > 0 or diff["removed"] > 0
    if has_changes:
        logger.info("=" * 60)
    # Log individual card changes first
    log_card_changes(diff)
    # Then log the summary at the end (multiline format)
    change_summary = format_change_summary(diff, len(cards))
    # Log each line of the summary separately to preserve formatting
    for line in change_summary.split("\n"):
        logger.info(line)
    logger.info(f"Cards data written to {cards_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logger.error(f"Worker failed: {exc}")
        raise
