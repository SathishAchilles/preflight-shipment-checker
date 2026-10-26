"""Build the dangerous-goods list (categories + keywords) from the research catalogue and engine.js R-06 lists."""
import csv, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]

NAMES = [
    'Fireworks', 'Flares and smoke signals', 'Ammunition and cartridges', 'Airbags and seatbelt pretensioners',
    'Flammable gas cartridges, lighters and LPG', 'Acetylene', 'Non-flammable gas cylinders', 'Fire extinguishers',
    'Gas struts and springs', 'Refrigerating machines', 'Toxic gases', 'Flammable liquids', 'Polyester resin kits',
    'Matches and firelighters', 'Flammable solids and metal powders', 'Self-heating (charcoal)', 'Water-reactive',
    'Oxidisers (pool chlorine)', 'Hydrogen peroxide', 'Organic peroxides', 'Toxic (pesticides)', 'Infectious substances',
    'Radioactive', 'Wet and lead-acid batteries', 'Corrosive cleaners and acids', 'Mercury articles',
    'Sodium-ion batteries', 'Battery-powered vehicles', 'Fuelled engines', 'Dry ice', 'Life-saving appliances',
    'Chemical and first-aid kits', 'Environmentally hazardous', 'Other class 9 (asbestos, EPS beads, castor beans, battery storage)',
    'NiMH batteries', 'Magnets (air only)',
]

# R-06 keywords as they exist today in scripts/engine.js (DG_DEFINITE lines 159-163, DG_POSSIBLE lines 164-168).
R06 = [
    ('R06-LI-D', 'R-06 definite (Red)', '9', 'Lithium batteries', '3480, 3481, 3090, 3091', 'lithium, li-ion, li-po, li-polymer, lifepo4, 18650, 21700, cr2032, cr2025, cr2016, cr123a, power bank, e-cigarette, vape, vape pen, e-bike, e-scooter, hoverboard'),
    ('R06-AE-D', 'R-06 definite (Red)', '2', 'Aerosols', '1950', 'aerosol, spray can, spray paint, hair spray, deodorant spray, body spray, cooking oil spray, spray deodorant, spray polish, spray adhesive, spray lubricant, spray foam, spray starch, compressed gas, compressed air, pressurised can, pressurised canister, co2 cartridge, co2 canister, cream charger, nitrous canister, dry shampoo, wd-40, shaving foam'),
    ('R06-FL-D', 'R-06 definite (Red)', '3', 'Flammable liquids', '1266, 1090, 1203, 1202, 1170, 1993', 'flammable, inflammable, perfume, eau de parfum, eau de toilette, eau de cologne, cologne, nail polish, nail varnish, acetone, petrol, gasoline, diesel, kerosene, paraffin oil, lighter fluid, lighter refill, lighter gas, methylated spirits, white spirit, turpentine, thinners, ethanol, isopropyl, rubbing alcohol, hand sanitiser, hand sanitizer, solvent-based, fuel, lamp oil, meths'),
    ('R06-LI-P', 'R-06 possible (Amber)', '9', 'Lithium batteries (may contain)', '3480, 3481', 'battery, batteries, rechargeable, bluetooth speaker, wireless earbuds, wireless headphones, smartwatch, fitness tracker, cordless, laptop, smartphone, mobile phone, tablet, drone'),
    ('R06-AE-P', 'R-06 possible (Amber)', '2', 'Aerosols (may be pressurised)', '1950', 'spray, mist'),
    ('R06-FL-P', 'R-06 possible (Amber)', '3', 'Flammable liquids (may contain)', '1263, 1133, 1197, 3065, 1266', 'paint, varnish, glue, adhesive, essential oil, reed diffuser, diffuser oil, fragrance oil, vodka, whisky, whiskey, gin, rum, liqueur, brandy, spirits, alcohol, lighter, resin, camping gas'),
]
R06_GUARDS = ['no', 'non', 'without', 'free of', 'zero', 'not', 'excluding', 'free', 'not included', 'excluded', 'not supplied', 'sold separately']
R06_NOT_BEFORE = {'R06-LI-P': ['laptop bag', 'laptop sleeve', 'laptop stand', 'laptop case', 'phone case', 'phone cover', 'phone holder', 'tablet case', 'tablet cover'],
                  'R06-AE-P': ['spray bottle'], 'R06-FL-P': ['lighter weight', 'lighter colour', 'lighter shade']}

def split_terms(cell):
    cell = cell.strip()
    if cell in ('', '-', 'see section 5'):
        return []
    quoted = re.findall(r'"([^"]+)"', cell)
    if quoted:
        return [q.strip() for q in quoted]
    return [t.strip() for t in re.split(r',\s*', cell) if t.strip()]

lines = open(SRC, encoding='utf-8').read().splitlines()
start = next(i for i, l in enumerate(lines) if l.startswith('| class | keywords'))
rows = []
for l in lines[start + 2:]:
    if not l.startswith('|'):
        break
    rows.append([c.strip() for c in l.strip('|').split(' | ')])
assert len(rows) == len(NAMES), (len(rows), len(NAMES))

cats, kws = [], []
for cid, tier, cls, name, un, words in R06:
    cats.append({'id': cid, 'tier': tier, 'adr_class': cls, 'category': name, 'un_numbers': un, 'proper_shipping_name': '',
                 'not_dangerous_when': 'see R-06 negation rules', 'already_r06': 'Y', 'route_flag': '', 'confidence': 'keywords live in engine.js; UN numbers [I] (not in engine)',
                 'source': 'scripts/engine.js DG_DEFINITE/DG_POSSIBLE'})
    for w in split_terms(words):
        kws.append({'category_id': cid, 'keyword': w, 'kind': 'trigger'})
    for g in R06_NOT_BEFORE.get(cid, []):
        kws.append({'category_id': cid, 'keyword': g, 'kind': 'guard'})
for g in R06_GUARDS:
    kws.append({'category_id': 'R06-ALL', 'keyword': g, 'kind': 'negation'})

for n, (r, name) in enumerate(zip(rows, NAMES), 1):
    cls, words, guards, un, psn, thr, r06, route, label = r
    cid = f'ADR-{n:02d}'
    tier = 'Air only (not flagged on road)' if cls == 'air-only' else 'ADR advisory (planned)'
    cats.append({'id': cid, 'tier': tier, 'adr_class': cls, 'category': name, 'un_numbers': un, 'proper_shipping_name': psn,
                 'not_dangerous_when': re.sub(r'\*\*', '', thr), 'already_r06': r06.replace('*', ''), 'route_flag': route if route != '-' else '',
                 'confidence': label, 'source': 'research_notes/UK EU road dangerous goods/dg_catalogue.md §3'})
    for w in split_terms(words):
        kws.append({'category_id': cid, 'keyword': w, 'kind': 'trigger'})
    for g in split_terms(guards):
        kws.append({'category_id': cid, 'keyword': g, 'kind': 'guard'})

with open(f'{OUT}/dangerous_goods_categories.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(cats[0])); w.writeheader(); w.writerows(cats)
with open(f'{OUT}/dangerous_goods_keywords.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(kws[0])); w.writeheader(); w.writerows(kws)
from collections import Counter
print('categories', len(cats), Counter(c['tier'] for c in cats))
print('keywords', len(kws), Counter(k['kind'] for k in kws))
