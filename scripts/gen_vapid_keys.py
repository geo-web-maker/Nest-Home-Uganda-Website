#!/usr/bin/env python3
"""Prints a VAPID key pair for browser mail notifications.

Paste the public key into Mail settings > "Push public key" and the private key into "Push private key",
then switch "Browser notifications" on. Keep the private key secret. Needs: pip install py-vapid
"""
from base64 import urlsafe_b64encode

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

vapid = Vapid()
vapid.generate_keys()
raw_public = vapid.public_key.public_bytes(
    serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
)
raw_private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
b64 = lambda data: urlsafe_b64encode(data).rstrip(b"=").decode()
print("Public key :", b64(raw_public))
print("Private key:", b64(raw_private))
