"""
Build src/data/refact-data.json from the challenge data pack.

Reads the two workbooks Refact is built on, straight out of the zip:
  06 · industrial symbiosis (RUH2): factories, byproducts, needs, the
       matching simulator and the agent's ranked opportunities
  07 · waste classification and transport violations (DMM2): records,
       trips, GPS, sites, vehicles, drone observations and ranked cases

Only what the interface shows is kept, in plain JSON with English keys.
Evaluation-only material (gold matches, violation labels, reference
answers) is left out: it belongs to the judges, not to the product.

Factories that did not consent to data sharing are anonymised here, once,
so no screen can leak a name by accident.

Run from frontend/:

    pip install openpyxl
    python scripts/build_data.py "path/to/الحزمة الاولى من البيانات للتحديات 1 الى 10.zip"
"""

from __future__ import annotations

import io
import json
import re
import sys
import zipfile
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "refact-data.json"

# Classification of each free-text stream onto the material taxonomy (T06),
# as the classification agent resolves it through the synonyms table (T07).
# These agree with every pairing the matching simulator scores.
BYPRODUCT_MATERIAL = {
    "BP-201-01": "PL-HDPE",
    "BP-122-01": "EN-HEAT",
    "BP-233-01": "MT-FE",
    "BP-305-01": "OIL-USED",
    "BP-144-01": "PAP-OCC",
    "BP-STP-01": "WT-TSE",
    "BP-520-01": "MIN-GYP",
    "BP-201-02": "PL-LDPE",  # «نايلون» resolves to LDPE film (T07)
}
NEED_MATERIAL = {
    "ND-317-01": "PL-PE-REC",
    "ND-415-01": "WT-TSE",
    "ND-350-01": "PL-PET",
    "ND-090-01": "MT-FE",
    "ND-412-01": "OIL-USED",
    "ND-178-01": None,  # burner fuel: a virgin input, not in the taxonomy
    "ND-366-01": "PAP-OCC",
    "ND-188-01": "EN-HEAT",
    "ND-610-01": "MIN-GYP",
}
NEED_FAMILY_FALLBACK = {"ND-178-01": "oils"}

ANONYMOUS_NAME = "منشأة لم توافق على مشاركة بياناتها"

CLASS_AR = {"General": "عامة", "Industrial": "صناعية", "Hazardous": "خطرة"}


def arabic_reason(text: str | None) -> str | None:
    """Reasons as the interface shows them.

    The source writes pairs as «F-201 ← F-317: …». Under bidi the two Latin
    ids pull the arrow into a left-to-right run, so it renders pointing at
    the supplier; the interface draws supplier and receiver itself, so the
    prefix is dropped. Class names in English become Arabic.
    """
    if text is None:
        return None
    text = re.sub(r"^[A-Z]+-[\w-]+ ← [A-Z]+-[\w-]+:\s*", "", text.strip())
    # the interface says «توفير», not the source's «وفر»
    text = re.sub(r"(?<![\u0600-\u06FF])وفر(?![\u0600-\u06FF])", "توفير", text)
    for en, ar in CLASS_AR.items():
        text = re.sub(rf"معلنة {en}", f"معلنة «{ar}»", text)
    return text.replace("CO2", "CO₂").strip().rstrip("؛").strip()


# --- workbook helpers -------------------------------------------------------

def open_workbook(zf: zipfile.ZipFile, prefix: str):
    for info in zf.infolist():
        name = info.filename
        if not info.flag_bits & 0x800:
            try:
                name = name.encode("cp437").decode("utf-8")
            except UnicodeError:
                pass
        if name.split("-")[0].strip() == prefix:
            return openpyxl.load_workbook(io.BytesIO(zf.read(info)), read_only=True, data_only=True)
    raise SystemExit(f"workbook {prefix} not found in the zip")


def rows_of(ws):
    return [list(r) for r in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in r)]


def sheet(wb, startswith: str):
    for ws in wb.worksheets:
        if ws.title.startswith(startswith):
            return ws
    raise SystemExit(f"sheet {startswith!r} not found")


def table(wb, code: str) -> list[dict]:
    """A T-sheet: title row, note row, header row, then data."""
    rows = rows_of(sheet(wb, code + " "))
    header = [str(h).strip() if h is not None else "" for h in rows[2]]
    out = []
    for r in rows[3:]:
        rec = {}
        for i, h in enumerate(header):
            if h:
                rec[h] = clean(r[i] if i < len(r) else None)
        out.append(rec)
    return out


def clean(v):
    if isinstance(v, str):
        v = v.strip()
        if v in ("", "—", "-"):
            return None
        if v in ("True", "TRUE"):
            return True
        if v in ("False", "FALSE"):
            return False
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if hasattr(v, "isoformat"):
        return v.isoformat(sep=" ")[:16] if hasattr(v, "hour") and (v.hour or v.minute) else v.isoformat()[:10]
    return v


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(v, 4) if isinstance(v, float) else v
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def yes(v) -> bool:
    return v is True or (isinstance(v, str) and v.startswith("نعم"))


def simulator_rows(wb, sheet_name: str, header_first: str, id_pattern: str):
    """Rows of a simulator block, keyed by the block's own header names."""
    rows = rows_of(sheet(wb, sheet_name))
    header_i = next(i for i, r in enumerate(rows) if str(r[0]).strip() == header_first)
    header = [str(h).strip() if h is not None else "" for h in rows[header_i]]
    out = []
    for r in rows[header_i + 1:]:
        first = str(r[0]).strip() if r[0] is not None else ""
        if not re.fullmatch(id_pattern, first):
            if out:
                break
            continue
        out.append({h: r[i] for i, h in enumerate(header) if h and i < len(r)})
    return out


# --- 06 · symbiosis -----------------------------------------------------------

def build_symbiosis(wb):
    cities = table(wb, "T01")
    factories = table(wb, "T02")
    consent = {f["factory_id"]: bool(f["data_sharing_consent"]) for f in factories}

    # Activities that already name a kind of facility keep their own noun:
    # «ورشة صيانة…», not «مصنع ورشة صيانة…».
    facility_nouns = ("ورشة", "مستودع", "محطة", "مصنع", "مركز")

    def factory_view(f):
        shared = consent[f["factory_id"]]
        activity = f["activity_ar"]
        name = activity if activity.startswith(facility_nouns) else f"مصنع {activity.removeprefix('تصنيع ')}"
        return {
            "id": f["factory_id"] if shared else None,
            "key": f["factory_id"],
            "name": name if shared else ANONYMOUS_NAME,
            "activity": activity if shared else None,
            "isic": str(f["activity_isic"]) if shared else None,
            "lat": num(f["lat"]) if shared else None,
            "lon": num(f["lon"]) if shared else None,
            "city": f["city"],
            "size": f["size_class"],
            "consent": shared,
            "hazLicense": f["haz_license"],
        }

    taxonomy = [
        {
            "code": t["mat_code"],
            "ewc": t["ewc_code"],
            "nameAr": t["name_ar"],
            "nameEn": t["name_en"],
            "family": t["family"],
            "hazardous": bool(t["hazardous"]),
            "unit": t["unit"],
            "canSubstitute": t["can_substitute"],
            "maxKm": num(t["max_km"]),
        }
        for t in table(wb, "T06")
    ]
    tax = {t["code"]: t for t in taxonomy}

    byproducts = []
    for b in table(wb, "T03"):
        code = BYPRODUCT_MATERIAL[b["byproduct_id"]]
        byproducts.append({
            "id": b["byproduct_id"],
            "factory": b["factory_id"],
            "text": b["description_text"],
            "quantity": num(b["quantity_month"]),
            "unit": b["unit"],
            "quality": b["quality"],
            "hazardous": bool(b["hazardous"]),
            "declaredEwc": b["ewc_code"],
            "material": code,
            "ewc": b["ewc_code"] or tax[code]["ewc"],
            "ewcInferred": b["ewc_code"] is None,
            "family": tax[code]["family"],
            "route": b["current_route"],
            "routeCost": num(b["current_cost_sar_unit"]),
            "frequency": b["frequency"],
        })

    needs = []
    for n in table(wb, "T04"):
        code = NEED_MATERIAL[n["need_id"]]
        needs.append({
            "id": n["need_id"],
            "factory": n["factory_id"],
            "text": n["material_text"],
            "quantity": num(n["quantity_month"]),
            "unit": n["unit"],
            "minQuality": n["min_quality"],
            "acceptsSecondary": bool(n["accepts_secondary"]),
            "source": n["current_source"],
            "price": num(n["current_price_sar_unit"]),
            "spec": n["spec_text"],
            "material": code,
            "family": tax[code]["family"] if code else NEED_FAMILY_FALLBACK[n["need_id"]],
        })

    # The agent's ranked opportunities (T17), with the working from the
    # matching simulator alongside (same pairs, same order: P1 = OP-01 ...).
    sim = simulator_rows(wb, "محاكي المطابقة", "الزوج", r"P\d+")
    opportunities = []
    for o, s in zip(table(wb, "T17"), sim):
        assert s["المورد"] and s["المستقبل"]
        rank = o["impact_rank"]
        opportunities.append({
            "id": o["opp_id"],
            "byproduct": o["byproduct_id"],
            "need": o["need_id"],
            "supplier": s["المورد"],
            "receiver": s["المستقبل"],
            "score": num(o["match_score"]),
            "quantity": num(o["quantity_month"]),
            "unit": o["unit"],
            "coverage": num(s["تغطية الطلب"]),
            "distanceKm": round(num(s["المسافة كم"]), 1),
            "maxKm": num(s["أقصى مسافة"]),
            "materialMatch": num(s["تطابق المادة"]),
            "textSimilarity": num(s["تشابه نصي"]),
            "qualityOk": bool(num(s["الجودة كافية؟"])),
            "hazardous": yes(s["خطرة؟"]),
            "receiverLicensed": None if s["المستقبل مرخص؟"] in (None, "—") else yes(s["المستقبل مرخص؟"]),
            "valuePerUnit": round(num(s["الوفر الصافي ريال/وحدة"]), 2),
            "netValue": num(o["net_value_sar_month"]),
            "co2": round(num(o["co2_t_month"]), 2),
            "landfillDiverted": num(o["landfill_diverted_t_month"]),
            "currentlyLandfilled": yes(s["يُردم حالياً؟"]),
            "feasible": yes(s["مجدية ومسموحة؟"]),
            "exclusion": None if yes(s["مجدية ومسموحة؟"]) else str(s["مجدية ومسموحة؟"]).replace("لا: ", ""),
            "compliant": bool(o["compliance_ok"]),
            "rank": rank if isinstance(rank, int) else None,
            "similarityRank": s["ترتيب التشابه"] if isinstance(s["ترتيب التشابه"], int) else None,
            "reason": arabic_reason(o["reason_ar"]),
        })

    feasible = [o for o in opportunities if o["feasible"]]
    top5_agent = sorted(feasible, key=lambda o: o["rank"])[:5]
    top5_text = sorted([o for o in opportunities if o["similarityRank"]], key=lambda o: o["similarityRank"])[:5]
    summary = {
        "pairs": len(opportunities),
        "feasible": len(feasible),
        "excludedCompliance": sum(1 for o in opportunities if not o["compliant"]),
        "excludedMaterial": sum(1 for o in opportunities if o["compliant"] and not o["feasible"]),
        "monthlySavings": sum(o["netValue"] for o in feasible),
        "annualSavings": 12 * sum(o["netValue"] for o in feasible),
        "landfillDiverted": sum(o["landfillDiverted"] for o in feasible),
        "co2": round(sum(o["co2"] for o in feasible), 1),
        "precisionAgent": sum(1 for o in top5_agent if o["feasible"]) / 5,
        "precisionText": sum(1 for o in top5_text if o["feasible"]) / 5,
    }

    return {
        "cities": [{"id": c["city_id"], "name": c["city_name_ar"], "lat": num(c["lat"]), "lon": num(c["lon"])} for c in cities],
        "city": "RUH2",
        "factories": [factory_view(f) for f in factories],
        "taxonomy": taxonomy,
        "qualitySpecs": [
            {"material": q["mat_code"], "grade": q["grade"], "contaminationMax": num(q["contamination_max_pct"]),
             "moistureMax": num(q["moisture_max_pct"]), "note": q["other_ar"]}
            for q in table(wb, "T08")
        ],
        "hazardousRules": [
            {"material": h["mat_code"], "ewc": h["ewc_code"], "transportLicense": h["transport_license"],
             "receiverLicense": h["receiver_license"], "manifest": bool(h["manifest_required"]),
             "prohibited": h["prohibited_uses_ar"], "storage": h["storage_ar"]}
            for h in table(wb, "T09")
        ],
        "providers": [
            {"id": p["provider_id"], "name": p["name_ar"], "service": p["service"],
             "materials": (p["mat_codes"] or "").split("|"), "city": p["city"], "licenseExpiry": p["license_expiry"]}
            for p in table(wb, "T10")
        ],
        "prices": [
            {"month": p["month"], "material": p["mat_code"], "virgin": num(p["virgin_price_sar"]),
             "secondary": num(p["secondary_price_sar"]), "source": p["source"]}
            for p in table(wb, "T11")
        ],
        "manifests": [
            {"id": m["manifest_id"], "month": m["month"], "byproduct": m["byproduct_id"], "quantity": num(m["quantity"]),
             "unit": m["unit"], "destination": m["destination"], "provider": m["provider_id"], "cost": num(m["cost_sar"])}
            for m in table(wb, "T13")
        ],
        "exchanges": [
            {"id": e["exchange_id"], "supplier": e["supplier"], "receiver": e["receiver"], "material": e["mat_code"],
             "start": e["start_date"], "status": e["status"], "stopReason": e["stop_reason_ar"]}
            for e in table(wb, "T14")
        ],
        "byproducts": byproducts,
        "needs": needs,
        "opportunities": opportunities,
        "cards": [
            {"factory": c["factory_id"], "role": c["role"], "text": arabic_reason(c["card_ar"])}
            for c in table(wb, "T18") if consent.get(c["factory_id"], False)
        ],
        "summary": summary,
    }


# --- 07 · compliance ---------------------------------------------------------

def build_compliance(wb):
    facilities = table(wb, "T02")
    records = table(wb, "T03")
    sim_records = {r["السجل"]: r for r in simulator_rows(wb, "محاكي الكشف", "السجل", r"R-\d+")}
    sim_trips = {t["الرحلة"]: t for t in simulator_rows(wb, "محاكي الكشف", "الرحلة", r"T-\d+")}

    # Indicator weights and thresholds: the simulator's parameter block.
    params = rows_of(sheet(wb, "محاكي الكشف"))
    weights, thresholds = {}, {}
    for r in params[3:13]:
        if r[0] and isinstance(r[4], (int, float)):
            thresholds[str(r[0]).strip()] = r[4]
        if len(r) > 10 and r[6] and isinstance(r[10], (int, float)):
            weights[str(r[6]).strip()] = r[10]

    out_records = []
    for r in records:
        s = sim_records[r["record_id"]]
        out_records.append({
            "id": r["record_id"],
            "facility": r["facility_id"],
            "date": r["record_date"],
            "text": r["description"],
            "photo": r["photo_url"] is not None,
            "declared": r["declared_class"],
            "tons": num(r["tons"]),
            "declaredEwc": r["declared_ewc"],
            "container": r["container"],
            "pHazardous": num(s["احتمال خطرة"]),
            "predicted": s["المتوقع"],
            "confidence": num(s["الثقة"]),
            "review": yes(s["مراجعة؟"]),
            "misdeclared": yes(s["معلن خطأ؟"]),
            "requirements": s.get("الاشتراطات حسب الفئة المتوقعة"),
        })

    transport = table(wb, "T06")
    gate = {g["vehicle_id"]: g for g in table(wb, "T11")}
    trips = []
    for t in transport:
        s = sim_trips[t["trip_id"]]
        points = {
            "weight": num(s["وزن"]),
            "classification": num(s["تصنيف"]),
            "site": num(s["موقع"]),
            "license": num(s["ترخيص"]),
            "stop": num(s["توقف"]),
            "tracker": num(s["تتبع"]),
            "deviation": num(s["انحراف"]),
            "dumping": num(s["رمي/درون"]),
        }
        g = gate.get(t["vehicle_id"])
        reasons = [
            arabic_reason(x)
            for x in str(s["السبب المرئي"] or "").split("؛")
            if x.strip() and x.strip() != "لا مؤشرات"
        ]
        trips.append({
            "id": t["trip_id"],
            "vehicle": t["vehicle_id"],
            "record": t["record_id"],
            "declared": t["declared_class"],
            "predicted": s["الفئة الفعلية"],
            "loaded": num(t["loaded_tons"]),
            "delivered": num(t["delivered_tons"]),
            "site": t["site_id"],
            "depart": t["depart_time"],
            "arrive": t["arrive_time"],
            "transporter": t["transporter_id"],
            "stopMinutes": num(s["توقف خارج د"]),
            "trackerGapMinutes": num(s["انقطاع د"]),
            "deviation": num(s["انحراف %"]),
            "points": points,
            "score": num(s["الدرجة"]),
            "suspicious": yes(s["مشبوهة؟"]),
            "rank": s["الترتيب"] if isinstance(s["الترتيب"], int) else None,
            "droneLinked": yes(s["رُبطت برصد درون؟"]),
            "gateNet": num(g["net_t"]) if g and g["site_id"] == t["site_id"] else None,
            "reasons": reasons,
        })

    report_rows = rows_of(sheet(wb, "نموذج تقرير الامتثال"))
    recommendations = [str(r[0]).strip() for r in report_rows if re.match(r"^\d\)", str(r[0]).strip())]

    return {
        "city": "DMM2",
        "date": "2025-05-18",
        "facilities": [
            {"id": f["facility_id"], "city": f["city_id"], "activity": f["activity_ar"], "isic": str(f["isic4"]),
             "lat": num(f["lat"]), "lon": num(f["lon"]), "hazGenerator": bool(f["haz_generator"]),
             "lastInspection": f["last_inspection"], "violations12m": num(f["violations_12m"])}
            for f in facilities
        ],
        "records": out_records,
        "wasteClasses": [
            {"id": c["subclass_id"], "class": c["class"], "name": c["name_ar"], "ewc": c["ewc_examples"],
             "transportLicense": c["transport_license"], "allowedSites": (c["allowed_sites"] or "").split("|"),
             "container": c["container_ar"], "maxStorageDays": num(c["max_storage_days"])}
            for c in table(wb, "T05")
        ],
        "trips": trips,
        "gps": [
            {"vehicle": p["vehicle_id"], "time": p["timestamp"], "lat": num(p["lat"]), "lon": num(p["lon"]),
             "speed": num(p["speed_kmh"]), "ignition": bool(p["ignition"]), "signal": bool(p["signal_ok"])}
            for p in table(wb, "T07")
        ],
        "gpsTrip": "T-5523",
        "sites": [
            {"id": s["site_id"], "name": s["name_ar"], "lat": num(s["lat"]), "lon": num(s["lon"]),
             "accepts": (s["accepted_classes"] or "").split("|"), "geofenceM": num(s["geofence_m"]),
             "weighbridge": bool(s["has_weighbridge"])}
            for s in table(wb, "T08")
        ],
        "vehicles": [
            {"id": v["vehicle_id"], "transporter": v["transporter_id"], "type": v["vehicle_type"],
             "capacity": num(v["capacity_t"]), "hazLicensed": bool(v["haz_licensed"]), "gps": bool(v["gps_installed"])}
            for v in table(wb, "T09")
        ],
        "transporters": [
            {"id": t["transporter_id"], "name": t["name_ar"], "licenses": (t["licenses"] or "").split("|"),
             "licenseExpiry": t["license_expiry"], "violations12m": num(t["violations_12m"])}
            for t in table(wb, "T10")
        ],
        "geofences": [
            {"id": z["zone_id"], "type": z["zone_type"], "name": z["name_ar"]} for z in table(wb, "T12")
        ],
        "drone": [
            {"id": d["obs_id"], "time": d["obs_time"], "lat": num(d["lat"]), "lon": num(d["lon"]),
             "label": d["label"], "areaM2": num(d["area_m2"]), "confidence": num(d["confidence"])}
            for d in table(wb, "T13")
        ],
        "generation": [
            {"facility": g["facility_id"], "month": g["month"], "class": g["class"], "declared": num(g["tons_declared"]),
             "productionIndex": num(g["production_index"]), "expected": num(g["tons_expected"])}
            for g in table(wb, "T14")
        ],
        "cases": [
            {"id": c["case_id"], "trip": c["entity_id"], "score": num(c["risk_score"]), "rank": c["risk_rank"],
             "predicted": c["predicted_class"], "confidence": num(c["class_confidence"]),
             "action": c["recommended_action_ar"], "review": bool(c["needs_human_review"])}
            for c in table(wb, "T18")
        ],
        "weights": weights,
        "thresholds": thresholds,
        "recommendations": recommendations,
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    with zipfile.ZipFile(sys.argv[1]) as zf:
        symbiosis = build_symbiosis(open_workbook(zf, "06"))
        compliance = build_compliance(open_workbook(zf, "07"))
    data = {
        "source": "الحزمة الأولى من البيانات للتحديات 1 إلى 10 (التحديان 06 و07) — بيانات اصطناعية",
        "symbiosis": symbiosis,
        "compliance": compliance,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    s = symbiosis["summary"]
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    print(f"06: {len(symbiosis['factories'])} factories, {len(symbiosis['byproducts'])} byproducts, "
          f"{len(symbiosis['needs'])} needs, {s['feasible']}/{s['pairs']} feasible, "
          f"{s['monthlySavings']:,} SAR/month, {s['landfillDiverted']} t diverted, {s['co2']} t CO2, "
          f"P@5 agent {s['precisionAgent']} vs text {s['precisionText']}")
    c = compliance
    print(f"07: {len(c['records'])} records ({sum(r['misdeclared'] for r in c['records'])} misdeclared, "
          f"{sum(r['review'] for r in c['records'])} review), {len(c['trips'])} trips "
          f"({sum(t['suspicious'] for t in c['trips'])} suspicious), {len(c['gps'])} gps points, "
          f"weights {c['weights']}, {len(c['recommendations'])} recommendations")


if __name__ == "__main__":
    main()
