# Address field rules

Measured against Certification with `validateOnly: true`, one field changed at a
time against a baseline that validates cleanly, so every rejection is
attributable to the field under test. Probes: `tooling/probe_charlimits.py`,
`tooling/probe_charsets.py`.

Characters are tested inside a generated string (`Te<char>st Name`), never a
hand-written word — an earlier pass used real place names and several of them
did not contain the character they claimed to test (`Mérida` for í, `Bogotá`
for ó), which produced false passes. The probe now asserts the character is
present before sending.

## Length

| field | max | error at max+1 |
|---|---|---|
| `attentionTo` | **40** | `9001-47 Receiver attentionTo: max allowed length is 40.` |
| `streetAddress` (per line) | **40** | `9001-22 Invalid receiver address: Maximum 3 lines and 40 characters per line.` |
| `city` | **40** | `9001-24 Receiver city: Max length is 40.` |

`streetAddress` is capped at **3 lines** as well as 40 characters per line.
`provinceStateCode`, `postalZipCode` and `phoneNumber` are coded fields
validated by format, so a length probe says nothing useful about them.

## Character acceptance

Tested per character across three lanes — domestic (CA→CA), southbound (CA→US)
and international (CA→DE) — and three fields (`attentionTo`, `streetAddress`,
`city`). **The result is identical in all nine combinations**: the allow-list
does not vary by lane or by field.

### Accepted

```
á  â  à  ä  æ  ç  è  é  ê  ï  ô  ù  û  ü  œ      Ä  Ü  Æ
```

### Rejected — all `9001-133 Invalid characters found`

| set | rejected |
|---|---|
| German | **ö  Ö  ß** |
| Spanish | **ñ  Ñ  í  ó  ú  ¡  ¿** |
| Nordic | **å  Å  ø  Ø** |
| Polish / Czech | ł ś ż ą č š ž ř ė |
| Other Latin | ã õ ı ğ ð ý Þ |
| Non-Latin | Cyrillic, Greek, CJK, Arabic |

Symbols accepted: `-  '  .  #  /  &  ,  (  %  @  "`. Rejected: `*`.

## The defect

The accepted set is essentially the **French** repertoire. Everything else in
Latin-1 is refused, and the inconsistencies inside that are hard to defend:

- **ö is rejected while ä and ü are accepted.** Those three are one alphabet.
  A shipment to **Köln** or **Österreich** cannot be addressed, but **München**
  can. This is not a code-page limit: `œ` (U+0153, Latin Extended-A) is
  accepted while `ö` (U+00F6, well inside Latin-1) is not.
- **á is accepted while í, ó and ú are rejected.** Same alphabet, same
  diacritic, four different letters, one arbitrary survivor.
- **ñ is rejected.** Mexico is a USMCA partner and the API has a USMCA document
  type; *Muñoz* and *Martínez* are ordinary names that cannot be shipped to.
- **å and ø are rejected**, while `æ` — the third letter of the same Danish and
  Norwegian set — is accepted.

The uniformity across lanes makes this worse rather than better: the same
allow-list is applied to an international shipment **to Germany** as to a
domestic one, so the destination country is not considered at all.

Recommended severity: High. It is not a cosmetic limit — it makes real
destinations unaddressable, and it fails silently at validation with a generic
message that does not name the offending character.

## What this means for the suite

- A 40-character boundary test on each free-text field, at 40 (pass) and 41
  (fail), for both sender and receiver.
- French accents are a **pass** case, not a negative test.
- `ö`, `ñ`, `ß`, `å`, `ø` and `*` are the negative cases worth asserting, and
  the first five should be filed as one defect rather than accepted as a rule.
