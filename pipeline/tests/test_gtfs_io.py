import zipfile
import io

import pytest

from gtfs_io import read_csv_rows, write_csv_rows, write_gtfs_zip, safe_extract_zip


def test_read_csv_rows_missing_file_returns_empty_list(tmp_path):
    assert read_csv_rows(tmp_path / "does-not-exist.txt") == []


def test_read_csv_rows_reads_rows_as_dicts(tmp_path):
    p = tmp_path / "stops.txt"
    p.write_text("stop_id,stop_name\n1,Plaza Nueva\n2,Deusto\n", encoding="utf-8")
    rows = read_csv_rows(p)
    assert rows == [
        {"stop_id": "1", "stop_name": "Plaza Nueva"},
        {"stop_id": "2", "stop_name": "Deusto"},
    ]


def test_write_csv_rows_removes_file_when_rows_empty(tmp_path):
    p = tmp_path / "frequencies.txt"
    p.write_text("stale content", encoding="utf-8")
    write_csv_rows(p, [])
    assert not p.exists()


def test_write_csv_rows_unions_columns_across_rows(tmp_path):
    p = tmp_path / "trips.txt"
    write_csv_rows(p, [{"trip_id": "1"}, {"trip_id": "2", "block_id": "b1"}])
    rows = read_csv_rows(p)
    # The column missing from the first row is present (empty) once a later
    # row introduces it - no column silently dropped.
    assert rows == [
        {"trip_id": "1", "block_id": ""},
        {"trip_id": "2", "block_id": "b1"},
    ]


def test_write_gtfs_zip_only_includes_files_that_exist(tmp_path):
    out_dir = tmp_path / "gtfs"
    out_dir.mkdir()
    (out_dir / "stops.txt").write_text("stop_id\n1\n", encoding="utf-8")
    (out_dir / "routes.txt").write_text("route_id\nA\n", encoding="utf-8")
    zip_path = tmp_path / "cache" / "city.gtfs.zip"

    write_gtfs_zip(zip_path, out_dir)

    assert zip_path.exists()
    with zipfile.ZipFile(zip_path) as zf:
        assert set(zf.namelist()) == {"stops.txt", "routes.txt"}


class TestSafeExtractZip:
    def test_extracts_a_legitimate_archive(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("stops.txt", "stop_id,stop_name\n1,A\n")
            zf.writestr("routes.txt", "route_id\n1\n")
        buf.seek(0)

        dest = tmp_path / "out"
        with zipfile.ZipFile(buf) as zf:
            safe_extract_zip(zf, dest)

        assert sorted(p.name for p in dest.iterdir()) == ["routes.txt", "stops.txt"]

    def test_rejects_path_traversal(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("../../evil.txt", "pwned")
        buf.seek(0)

        with zipfile.ZipFile(buf) as zf:
            with pytest.raises(ValueError):
                safe_extract_zip(zf, tmp_path / "out")

    def test_rejects_absolute_path_entry(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("/tmp/evil.txt", "pwned")
        buf.seek(0)

        with zipfile.ZipFile(buf) as zf:
            with pytest.raises(ValueError):
                safe_extract_zip(zf, tmp_path / "out")
