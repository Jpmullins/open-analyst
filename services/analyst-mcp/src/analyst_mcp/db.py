from __future__ import annotations

import re


IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def quoted_identifier(value: str) -> str:
    if not IDENTIFIER_RE.fullmatch(value):
        raise ValueError(f"invalid postgres identifier: {value!r}")
    return f'"{value}"'


def qualified_table(schema: str, table: str) -> str:
    return f"{quoted_identifier(schema)}.{quoted_identifier(table)}"
