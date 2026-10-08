"""Reads the OpenAI key from the macOS login Keychain into memory. Never print it."""
import subprocess

KEYCHAIN = "/Users/daniel/Library/Keychains/login.keychain-db"


def openai_key() -> str:
    out = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-a", "daniel", "-s", "OpenAI API", "-w", KEYCHAIN],
        capture_output=True, text=True,
    )
    if out.returncode != 0 or not out.stdout.strip():
        raise SystemExit("Could not read the OpenAI key from the Keychain (is it unlocked?)")
    return out.stdout.strip()
