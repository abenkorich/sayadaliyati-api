"""Extract MIPH workbooks without evaluating formulas or modifying the source."""
import argparse
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import openpyxl


def clean(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(value))).strip() if value is not None else None


def extract(path, version, source_url):
    content = Path(path).read_bytes()
    checksum = hashlib.sha256(content).hexdigest()
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=False)
    records = []
    counts = {}
    statuses = {"Nomenclature": "CURRENT", "Non Renouvelés": "NOT_RENEWED", "Retraits": "WITHDRAWN"}
    fields = {
        "registrationNumber": ("N°ENREGISTREMENT", 150),
        "name": ("NOM DE MARQUE", 255),
        "genericName": ("DENOMINATION COMMUNE INTERNATIONALE", 255),
        "dosageForm": ("FORME", 100),
        "strength": ("DOSAGE", 10000),
        "packageSize": ("CONDITIONNEMENT", 10000),
    }
    for sheet in workbook:
        matches = [v for k, v in statuses.items() if sheet.title.strip().startswith(k)]
        if len(matches) != 1:
            raise ValueError(f"Unrecognized sheet: {sheet.title}")
        status = matches[0]
        headers = None
        count = 0
        for row_number, cells in enumerate(sheet.iter_rows(), 1):
            values = [c.value for c in cells]
            if not any(v is not None for v in values):
                continue
            if headers is None:
                if "N°ENREGISTREMENT" in values:
                    headers = [clean(v) for v in values]
                    for header, _ in fields.values():
                        if headers.count(header) != 1:
                            raise ValueError(f"Missing/duplicate header {header} in {sheet.title}")
                continue
            raw = {header: (v.isoformat() if isinstance(v, (date, datetime)) else v)
                   for header, v in zip(headers, values) if header}
            errors = []
            if any(c.data_type == "f" for c in cells):
                errors.append("formula_in_source_row")
            if any(c.data_type == "e" for c in cells):
                errors.append("excel_error_in_source_row")
            candidate = {}
            for field, (header, limit) in fields.items():
                value = clean(raw.get(header))
                candidate[field] = value or None
                if not value:
                    errors.append(f"missing_{field}")
                elif len(value) > limit:
                    errors.append(f"too_long_{field}")
            registration = raw.get("N°ENREGISTREMENT")
            if not isinstance(registration, str):
                errors.append("registration_not_text")
            holder = clean(raw.get("LABORATOIRES DETENTEUR DE LA DECISION D'ENREGISTREMENT"))
            if not holder:
                errors.append("missing_registration_holder")
            strength = candidate["strength"]
            strength_cell = cells[headers.index("DOSAGE")]
            # Excel percentage formatting supplies an explicit unit. General numbers do not.
            if isinstance(strength_cell.value, (int, float)) and re.fullmatch(r"0(?:\.0+)?%", strength_cell.number_format):
                strength = format(Decimal(str(strength_cell.value)) * 100, 'f')
                if '.' in strength:
                    strength = strength.rstrip('0').rstrip('.')
                candidate["strength"] = strength = strength + '%'
            if strength and not any(c.isalpha() or c == '%' for c in strength):
                errors.append("strength_without_unit_requires_review")
            candidate.update({"brandName": candidate["name"],
                              "normalizedName": (candidate["name"] or "").lower(),
                              "country": "DZ", "source": "MIPH",
                              "sourceVersion": version,
                              "sourceChecksum": checksum,
                              "regulatoryStatus": status,
                              "registrationHolder": holder,
                              "holderCountry": clean(raw.get("PAYS DU LABORATOIRE DETENTEUR DE LA DECISION D'ENREGISTREMENT")),
                              "status": "ACTIVE" if status == "CURRENT" else "INACTIVE"})
            records.append({"sheet": sheet.title, "row": row_number,
                            "regulatoryStatus": status, "registrationHolder": holder,
                            "rawNumberFormats": {h: c.number_format for h, c in zip(headers, cells) if h},
                            "raw": raw, "candidate": candidate, "issues": errors})
            count += 1
        if headers is None:
            raise ValueError(f"No header in {sheet.title}")
        counts[sheet.title] = count
    workbook.close()
    if len(counts) != 3:
        raise ValueError("Expected current, non-renewed and withdrawn sheets")
    registrations = Counter(r["candidate"]["registrationNumber"] for r in records)
    for record in records:
        if registrations[record["candidate"]["registrationNumber"]] > 1:
            record["issues"].append("duplicate_registration_requires_review")
        # Keep complex presentations verbatim; do not manufacture package counts or doses.
    return {"formatVersion": 1, "source": "MIPH", "sourceVersion": version,
            "sourceUrl": source_url, "sourceFilename": Path(path).name,
            "sha256": checksum,
            "stagedAt": datetime.now(timezone.utc).isoformat(),
            "sheetCounts": counts, "records": records}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--version", required=True)
    parser.add_argument("--source-url", required=True)
    args = parser.parse_args()
    print(json.dumps(extract(args.file, args.version, args.source_url), ensure_ascii=False))
