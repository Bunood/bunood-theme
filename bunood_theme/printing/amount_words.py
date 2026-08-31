"""Arabic SAR print wording, without changing any invoice amount.

The caller supplies the number already rounded for display by Frappe. Reuse
num2words 0.5.14's Arabic currency converter, with narrow grammar corrections:
one/two, separated halalas, and its broken hundred-plus-small-unit scale groups.
No numeral tables, monetary rounding or stored `in_words` values live here.
"""

from decimal import Decimal

from num2words.lang_AR import Num2Word_AR


def _join(parts):
    return " و".join(parts)


def _riyals(number):
    if number == 0:
        return "صفر ريال سعودي"
    if number == 1:
        return "ريال سعودي واحد"
    if number == 2:
        return "ريالان سعوديان"

    # Upstream produces e.g. 'مائة و ألف ألف ريال' for 101,000.
    # Split only affected scale groups into complete, unambiguous currency
    # phrases; let upstream continue to own every number and scale name.
    scale = 1000
    while scale <= number:
        group = (number // scale) % 1000
        if group >= 100 and 1 <= group % 100 <= 10:
            lower = (group % 100) * scale + number % scale
            return _join([_riyals(number - lower), _riyals(lower)])
        if group and group % 100 == 0 and number % scale:
            # Upstream incorrectly adds tanween after hundreds of a scale:
            # 'مائة ألفاً وثلاثة'. Keep its correct exact-hundred phrase.
            lower = number % scale
            return _join([_riyals(number - lower), _riyals(lower)])
        if group == 2 and number // scale >= 1000 and not number % scale:
            # A terminal dual directly qualifies the currency: ألفا ريال,
            # not the standalone ألفان used by upstream in combined groups.
            lower = 2 * scale
            return _join([_riyals(number - lower), _riyals(lower)])
        scale *= 1000

    # 'مائة ريال سعودي وريال واحد', not 'مائة و واحد ريال'. Do not
    # replace واحد/اثنان globally: 21/22 need their cardinal forms.
    if number % 100 in (1, 2):
        remainder = number % 100
        last = "ريال واحد" if remainder == 1 else "ريالان سعوديان"
        return _join([_riyals(number - remainder), last])

    converter = Num2Word_AR()  # mutable locale state must never be shared
    converter.currency_unit = (
        "ريال سعودي", "ريالان سعوديان", "ريالات سعودية", "ريالًا سعوديًا",
    )
    return converter.convert(Decimal(number)).strip().replace(" و ", " و")


def _halalas(number):
    if number == 1:
        return "هللة واحدة"
    if number == 2:
        return "هللتان"
    if number == 8:
        return "ثماني هللات"
    # Upstream knows feminine cardinal agreement. Its fractional-only output
    # starts with a conjunction even without a major unit; remove only that.
    words = Num2Word_AR().to_currency(Decimal(number) / 100, currency="SR")
    return words.strip().removeprefix("و ").strip().replace(" و ", " و")


def arabic_sar_words(display_amount):
    """Spell a signed, already formatted SAR amount (at most two decimals).

    Reject unsupported precision/range instead of silently truncating halalas
    or spelling an approximate number. The print adapter omits wording then;
    the native numeric total remains authoritative and visible.
    """
    amount = Decimal(str(display_amount))
    if not amount.is_finite() or abs(amount) >= Decimal(10) ** 15:
        raise ValueError("SAR words require a finite amount below 10^15")
    if amount != amount.quantize(Decimal("0.01")):
        raise ValueError("SAR words require whole halalas")
    negative = amount < 0
    amount = abs(amount)
    riyals = int(amount)
    halalas = int((amount - riyals) * 100)
    parts = [_riyals(riyals)] if riyals or not halalas else []
    if halalas:
        parts.append(_halalas(halalas))
    return ("سالب " if negative else "") + _join(parts) + " فقط لا غير"
