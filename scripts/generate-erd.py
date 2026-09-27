"""Generate the editable nine-entity Barker-style source diagram."""
from pathlib import Path
from xml.sax.saxutils import escape

boxes = [
    ("CATEGORY", 40, 45, ["# id", "* code", "* type"]),
    ("VENUE", 350, 45, ["# id", "* name", "* address", "o description"]),
    ("SALESPERSON", 755, 45, ["# id", "* first / last name", "o phone"]),
    ("PRODUCT", 1090, 45, ["# id", "* SKU / name", "* wholesale cost", "* minimum price"]),
    ("EVENT", 195, 320, ["# id", "* venue / category", "* date / name", "o description"]),
    ("BOOTH", 505, 320, ["# id", "* event", "* location"]),
    ("SALESPERSON_SHIFT", 825, 320, ["# id", "* booth / salesperson", "* start / end"]),
    ("SALE", 505, 600, ["# id", "* event / shift", "* sale time"]),
    ("PRODUCT_SALE", 970, 600, ["# sale id + line no", "* product / quantity", "* final price"]),
]
width = {name: 260 if name != "SALESPERSON_SHIFT" else 300 for name, _, _, _ in boxes}
height = 174
parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1410 840" role="img" aria-label="Foxcore nine entity Barker conceptual ERD">',
         '<rect width="1410" height="840" fill="#f8f7f3"/>',
         '<defs><marker id="one" markerWidth="14" markerHeight="14" refX="2" refY="7" orient="auto-start-reverse"><path d="M3 2 V12 M7 2 V12" stroke="#2c625a" stroke-width="2"/></marker><marker id="many" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto"><path d="M2 2 L12 7 L2 12 M2 7 H12" stroke="#2c625a" stroke-width="2" fill="none"/></marker></defs>',
         '<text x="40" y="27" font-family="Arial" font-size="18" font-weight="bold" fill="#172f2c">Foxcore Retail · Barker conceptual ERD</text>',
         '<g stroke="#2c625a" stroke-width="2.5" fill="none">']
paths = [
    "M170 219 L170 252 L245 252 L245 320",  # category-event
    "M480 219 L480 252 L385 252 L385 320",  # venue-event
    "M455 407 L505 407",  # event-booth
    "M765 407 L825 407",  # booth-shift
    "M885 219 L885 320",  # salesperson-shift
    "M955 494 L955 548 L635 548 L635 600",  # shift-sale
    "M325 494 L325 548 L585 548 L585 600",  # event-sale
    "M765 687 L970 687",  # sale-line
    "M1220 219 L1220 548 L1100 548 L1100 600",  # product-line
]
parts += [f'<path d="{p}" marker-start="url(#one)" marker-end="url(#many)"/>' for p in paths]
parts.append('</g>')
for name, x, y, fields in boxes:
    w = width[name]
    parts += [f'<g id="{name.lower()}">', f'<rect x="{x}" y="{y}" width="{w}" height="{height}" rx="10" fill="#fff" stroke="#2c625a" stroke-width="2"/>',
              f'<path d="M{x} {y+46} H{x+w}" stroke="#2c625a" stroke-width="2"/>',
              f'<text x="{x+14}" y="{y+29}" font-family="Arial" font-size="18" font-weight="bold" fill="#163831">{escape(name)}</text>']
    for i, field in enumerate(fields):
        parts.append(f'<text x="{x+14}" y="{y+73+i*26}" font-family="Arial" font-size="16" fill="#283d39">{escape(field)}</text>')
    parts.append('</g>')
parts += ['<text x="40" y="802" font-family="Arial" font-size="16" fill="#455c56"># identifier · * mandatory · o optional · parent relationship 1 : child 0..N (EVENT : BOOTH and SALE : PRODUCT_SALE are 1..N after opening/posting)</text>',
          '<text x="40" y="824" font-family="Arial" font-size="13" fill="#455c56">B Exhibit 1 core entities; physical FK and all fields: db/migrations/001_core.sql. Editable SVG source.</text>', '</svg>']
Path('docs/diagrams/core-barker.svg').write_text('\n'.join(parts), encoding='utf-8')
