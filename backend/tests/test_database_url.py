import pytest

from app.db import normalize_database_url


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (
            "postgres://shop:secret@db.example.test:5432/shoppasto",
            "postgresql+psycopg://shop:secret@db.example.test:5432/shoppasto",
        ),
        (
            "postgresql://shop:secret@db.example.test:5432/shoppasto",
            "postgresql+psycopg://shop:secret@db.example.test:5432/shoppasto",
        ),
        (
            "postgresql://shop:secret@ep-example-pooler.us-east-2.aws.neon.tech/shoppasto?sslmode=require&channel_binding=require",
            "postgresql+psycopg://shop:secret@ep-example-pooler.us-east-2.aws.neon.tech/shoppasto?sslmode=require&channel_binding=require",
        ),
        (
            "postgresql+psycopg://shop:secret@db.example.test:5432/shoppasto",
            "postgresql+psycopg://shop:secret@db.example.test:5432/shoppasto",
        ),
    ],
)
def test_normalize_database_url_for_psycopg(value, expected):
    assert normalize_database_url(value) == expected
