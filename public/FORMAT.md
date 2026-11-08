# You file format, version 2

The UTF-8 JSON envelope has app `you`, version `2`, kdf (name `PBKDF2`, hash `SHA-256`, iterations `600000`, salt), cipher (name `AES-GCM`, iv), and data. Salt, iv and data use standard base64. The salt is 16 random bytes; the IV is 12 random bytes. Data includes the 16-byte GCM authentication tag appended to ciphertext. No additional authenticated data is supplied. The decrypted UTF-8 JSON is the complete profile (name, cards, links and optional updatedAt and id).

The passphrase is normalized to Unicode NFC and encoded as UTF-8. PBKDF2-SHA-256 derives a 32-byte AES-256-GCM key. A wrong passphrase or damaged ciphertext fails authentication. There is no passphrase recovery.

Python example (requires the `cryptography` package):

```python
import base64, getpass, json, unicodedata
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

with open(input('File path: '), encoding='utf-8') as f:
    e = json.load(f)
assert e['app'] == 'you' and e['version'] == 2
assert e['kdf']['name'] == 'PBKDF2' and e['kdf']['hash'] == 'SHA-256'
assert e['cipher']['name'] == 'AES-GCM'
b64 = base64.b64decode
password = unicodedata.normalize('NFC', getpass.getpass()).encode('utf-8')
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
    salt=b64(e['kdf']['salt']), iterations=e['kdf']['iterations']).derive(password)
profile = json.loads(AESGCM(key).decrypt(b64(e['cipher']['iv']), b64(e['data']), None))
print('Opened', len(profile['cards']), 'cards')
```

Keep the passphrase and any readable output private. This example reads in memory and does not write the decrypted life record to disk. Earlier version 1 files were unencrypted JSON and require no decryption.
