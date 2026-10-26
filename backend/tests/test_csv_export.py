import csv
import io

from app.modules.care_ops.rules import csv_safe


def test_csv_formula_prefixes():
    for value in ("=1+1", "+cmd", "-cmd", "@cmd"):
        assert csv_safe(value).startswith("'")


def test_csv_quotes_commas_and_headers():
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["Name", "Note"])
    writer.writerow(["A", 'a, "quote"'])
    rows = list(csv.reader(io.StringIO(stream.getvalue())))
    assert rows[0] == ["Name", "Note"]
    assert rows[1][1] == 'a, "quote"'
