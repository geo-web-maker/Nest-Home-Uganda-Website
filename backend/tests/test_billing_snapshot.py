from app.modules.billing import rules


def sample():
    return {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0001",
        "currency": "UGX",
        "bill_to": {"name": "Mrs. A. Nakato"},
        "items": [
            {
                "description": "Home care",
                "quantity": 2,
                "unit_price_ugx": 100000,
                "amount_ugx": 200000,
            }
        ],
        "total_ugx": 200000,
        "document_date": "2026-11-13",
    }


def test_canonical_json_and_hash_are_stable():
    snapshot = sample()
    assert rules.canonical_snapshot(snapshot) == rules.canonical_snapshot(
        dict(reversed(list(snapshot.items())))
    )
    assert rules.snapshot_hash(snapshot) == rules.snapshot_hash(snapshot)
    assert len(rules.snapshot_hash(snapshot)) == 64
    assert rules.verify_code(rules.snapshot_hash(snapshot)) == rules.snapshot_hash(snapshot)[:16]


def test_changing_any_printed_field_changes_hash():
    original = sample()
    baseline = rules.snapshot_hash(original)
    changed = sample()
    changed["bill_to"]["name"] = "Mrs. B. Nakato"
    assert rules.snapshot_hash(changed) != baseline
    changed = sample()
    changed["items"][0]["description"] = "Different service"
    assert rules.snapshot_hash(changed) != baseline
    changed = sample()
    changed["total_ugx"] += 1
    assert rules.snapshot_hash(changed) != baseline


def test_verify_code_is_not_part_of_snapshot():
    snapshot = sample()
    digest = rules.snapshot_hash(snapshot)
    assert "verify_code" not in snapshot
    assert rules.verify_code(digest) == digest[:16]


def test_each_document_field_contributes_to_the_snapshot_hash():
    cases = [
        ("reference", "BHC-INV-2026-0002"),
        ("currency", "UGX2"),
        ("doc_type", "receipt"),
        ("schema_version", 2),
        ("document_date", "2026-11-14"),
        ("total_ugx", 200001),
    ]
    baseline = rules.snapshot_hash(sample())
    for key, value in cases:
        changed = sample()
        changed[key] = value
        assert rules.snapshot_hash(changed) != baseline
