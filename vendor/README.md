# Vendored dependencies

This directory contains third-party Python packages bundled directly into the
repo so the application runs without a `pip install` step at deploy time.

## segno (1.6.1)

Pure-Python QR code generator. Used by `qr_style.py` to render stylized
QR codes (Instagram Glow preset).

- Source: https://github.com/heuer/segno
- License: BSD (3-Clause), copyright Lars Heuer

To upgrade: `pip install segno==<version>` and copy the contents of the
installed `segno/` package over `vendor/segno/`.
