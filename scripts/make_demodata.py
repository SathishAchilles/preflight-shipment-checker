"""Curated demo bookings for presentations: realistic sellers across every route, mostly ready to go,
with one clear example of each kind of problem and a one-click fix for each.

Usage: python3 make_demodata.py <judges template .xlsx>   (writes ../assets/Preflight_Demo_Bookings.xlsx)
Ready dates run 01-12-2026 to 11-12-2026; regenerate with later dates after that.
"""
import copy, datetime, math, sys
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = load_workbook(sys.argv[1] if len(sys.argv) > 1 else 'Case2_Shipment_Booking_Test_Data_Format.xlsx')
B, I = wb['Bookings'], wb['Items']

bookings, items, expected = [], [], []


def item(sku, desc, hs, price, upc, cartons, uw, coo):
    return {'sku': sku, 'desc': desc, 'hs': hs, 'qty': upc * cartons, 'price': price, 'upc': upc, 'cartons': cartons, 'uw': uw, 'coo': coo}


def add(bid, seller, origin, city, country, dtype, date, prio, pallets, its, appt, story, status, shows, gross=None, declared=None):
    net = sum(i['qty'] * i['uw'] for i in its)
    gross = gross if gross is not None else int(math.ceil((net + 25 * pallets) / 10.0) * 10)  # goods + ~25 kg per pallet, rounded up
    declared = declared if declared is not None else round(sum(i['qty'] * i['price'] for i in its), 2)
    cartons = sum(i['cartons'] for i in its)
    bookings.append([bid, seller, origin, 'United Kingdom', city, country, dtype, date, prio, pallets, cartons, declared, 'GBP', gross, appt])
    for i in its:
        items.append([bid, i['sku'], i['desc'], i['hs'], i['qty'], i['price'], i['upc'], i['cartons'], i['uw'], i['coo']])
    expected.append([bid, seller, story, status, shows])


# ---- Ready to go
add('S-01', 'Kettle & Co', 'London', 'Berlin', 'Germany', 'Warehouse', '01-12-2026', 'Cheapest', 1,
    [item('TPT-01', 'Stoneware teapot, 1 litre', 691200, 15, 6, 40, 1.6, 'United Kingdom')], 'Yes',
    'Clean booking', 'Green', 'Cleared, Carrier A')
add('S-02', 'Harbour Linen', 'Leeds', 'Paris', 'France', 'Business address', '02-12-2026', 'Balanced', 1,
    [item('TT-01', 'Cotton tea towel, set of 2', 630291, 4, 25, 24, 0.08, 'India'),
     item('NAP-01', 'Linen napkin set of 4', 630251, 11, 20, 20, 0.3, 'United Kingdom')], 'No',
    'Two items, business address (no slot needed)', 'Green', 'Balanced pick: Carrier B')
add('S-03', 'Pennine Pottery', 'Manchester', 'Lyon', 'France', 'Business address', '03-12-2026', 'Most reliable', 4,
    [item('PLT-01', 'Stoneware dinner plate, 27 cm', 691200, 6, 12, 75, 1.4, 'United Kingdom')], 'No',
    'Heavy load spread over 4 pallets', 'Green', 'Carrier C, 340 kg a pallet')
add('S-04', 'Cobble Lane Pantry', 'Manchester', 'Rotterdam', 'Netherlands', 'Warehouse', datetime.datetime(2026, 12, 4), 'Balanced', 1,
    [item('BWL-01', 'Ceramic serving bowl', '6912.00', 10, 6, 20, 1.1, 'UK'),
     item('TEA-02', 'Black tea, loose leaf 250 g', '090240', 4, 40, 10, 0.27, 'India')], 'yes',
    'Spreadsheet-style values (Excel date, “6912.00”, “UK”, “yes”)', 'Green', 'To check: 4 tidied values')
add('S-05', 'Fernwood Toys', 'Birmingham', 'Hamburg', 'Germany', 'Warehouse', '05-12-2026', 'Fastest', 2,
    [item('PZ-01', 'Wooden jigsaw puzzle, 500 pieces', 950300, 9, 20, 30, 0.6, 'United Kingdom')], 'Yes',
    'Fastest carrier, within its 400 kg limit', 'Green', 'Carrier C express')
add('S-06', 'Confetti & Co', 'London', 'Amsterdam', 'Netherlands', 'Business address', '06-12-2026', 'Cheapest', 1,
    [item('PP-01', 'Party poppers, box of 50', 950590, 8, 10, 20, 0.4, 'China')], 'No',
    'Party poppers: fireworks for road freight', 'Green', 'Good to know: possible dangerous goods')
# ---- Worth a check
add('S-07', 'Marlow Kitchen', 'London', 'Frankfurt', 'Germany', 'Warehouse', '07-12-2026', 'Fastest', 1,
    [item('WB-01', 'Stainless steel water bottle, 750 ml', 732393, 8, 24, 10, 0.35, 'China')], 'No',
    'Warehouse delivery with no slot booked', 'Amber', 'R-08 · Mark appointment as booked')
add('S-08', 'Saffron Lane', 'Birmingham', 'Paris', 'France', 'Business address', '08-12-2026', 'Most reliable', 1,
    [item('SPT-01', 'Brass spice tin set', 741810, 18, 12, 10, 0.7, None),
     item('TT-02', 'Cotton tea towel', 630291, 4, 25, 8, 0.08, 'India')], 'No',
    'Spice tins have no country of origin', 'Amber', 'R-09 · add where it was made')
add('S-09', 'Pebble Audio', 'Leeds', 'Berlin', 'Germany', 'Warehouse', '09-12-2026', 'Balanced', 1,
    [item('SPK-01', 'Portable Bluetooth speaker', 851822, 25, 10, 10, 0.9, 'China')], 'Yes',
    'Speaker may hold a lithium battery', 'Amber', 'R-06 · confirm battery-free or remove')
# ---- Must fix
add('S-10', 'Ironside Cookware', 'Birmingham', 'Frankfurt', 'Germany', 'Warehouse', '10-12-2026', 'Cheapest', 3,
    [item('CAS-01', 'Enamelled cast iron casserole dish, 24 cm', 732392, 30, 4, 60, 6.2, 'China')], 'Yes',
    '550 kg a pallet, over Carrier A’s 500 kg', 'Red', 'R-05 · Switch to Carrier B (£660)', gross=1650)
add('S-11', 'Bean & Brew', 'Leeds', 'Amsterdam', 'Netherlands', 'Warehouse', '11-12-2026', 'Cheapest', 1,
    [item('COF-01', 'Coffee beans, not roasted, 1 kg bag', 90111, 12, 10, 20, 1.0, 'Vietnam')], 'Yes',
    'Excel dropped the leading zero (90111)', 'Red', 'R-01 · Use 090111')
add('S-12', 'Lumen Candles', 'Manchester', 'Rotterdam', 'Netherlands', 'Business address', '11-12-2026', 'Fastest', 2,
    [item('CAN-01', 'Soy wax candle in glass jar', 340600, 5, 12, 50, 0.45, 'United Kingdom'),
     item('CAN-02', 'Tealight candles, 50-pack', 340600, 4, 10, 20, 0.6, 'China')], 'No',
    'Declared £3,000 but the items add up to £3,800', 'Red', 'R-02 · Set declared value to £3,800', declared=3000)

# The demo file has no grey template example row (row 3), so no notice appears when it loads.
for ws in (B, I):
    for c in range(1, ws.max_column + 1):
        ws.cell(3, c).value = None
for r, row in enumerate(bookings, start=4):
    for c, v in enumerate(row, start=1):
        cell = B.cell(r, c, v)
        if isinstance(v, datetime.datetime):
            cell.number_format = 'DD-MM-YYYY'
for r, row in enumerate(items, start=4):
    for c, v in enumerate(row, start=1):
        cell = I.cell(r, c, v)
        if c == 4 and isinstance(v, str):
            cell.number_format = '@'

E = wb.create_sheet('Expected results', 2)
E['A1'] = 'Demo bookings — what Preflight shows for each (valid until 01-12-2026, when the first ready date passes).'
E['A1'].font = Font(name='Arial', bold=True, size=11)
hdr = ['Booking ID', 'Seller', 'What it shows', 'Expected status', 'Highlights']
for c, h in enumerate(hdr, 1):
    x = E.cell(2, c, h)
    x.font = Font(name='Arial', bold=True, color='FFFFFF')
    x.fill = PatternFill('solid', fgColor='1F3864')
    x.alignment = Alignment(vertical='center', wrap_text=True)
fills = {'Red': 'F8D7D3', 'Amber': 'FCEBC7', 'Green': 'D6EFDF'}
thin = Side(style='thin', color='C9D2DA')
for r, row in enumerate(expected, 3):
    for c, v in enumerate(row, 1):
        x = E.cell(r, c, v)
        x.font = Font(name='Arial', size=10)
        x.alignment = Alignment(wrap_text=True, vertical='top')
        x.border = Border(top=thin, bottom=thin, left=thin, right=thin)
    E.cell(r, 4).fill = PatternFill('solid', fgColor=fills[row[3]])
for c, w in enumerate([12, 22, 48, 14, 40], 1):
    E.column_dimensions[get_column_letter(c)].width = w
E.freeze_panes = 'A3'
wb.save('../assets/Preflight_Demo_Bookings.xlsx')
print(len(bookings), 'bookings,', len(items), 'item rows')
