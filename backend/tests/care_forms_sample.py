"""Sample data for care form tests (shapes match the context builder, not the database)."""
from datetime import date
from pathlib import Path

import app.modules.care_forms as _pkg

MARK = (Path(_pkg.__file__).parent / "brand" / "bloomwell-mark-ondark.svg").read_text().replace("<svg ", '<svg width="14mm" height="15.5mm" ', 1)
ORG = {"name": "Bloomwell Home Care Uganda Limited", "short_name": "Bloomwell", "city": "Kampala", "phone": "0787 499 988", "privacy_email": "privacy@bhcug.com", "pdpo_ref": "", "mark_svg": MARK}
NURSE = {"name": "Amina Nakato", "unmc_number": "A-12345", "unmc_category": "Registered nurse", "unmc_licence_expiry": date(2099, 6, 30)}
MAMA = {"name": "Mary Kisakye", "dob": "29 years", "record_id": "C-1", "type": "Mama", "phone": "0700 000 111", "email": "mary@example.com", "language": "Luganda",
        "address": "12 Ntinda Road, Ntinda", "caregiver": {"name": "Sam", "relationship": "Husband", "phone": "0700 000 222", "hours": "Evenings"},
        "emergency": {"name": "John", "relationship": "Brother", "phone": "0700 000 333"}}
BABY = {**MAMA, "name": "Baby Kisakye", "type": "Baby"}
