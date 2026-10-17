# Relay protocol v2: device keys and end-to-end frames

Protocol v2 encrypts every frame between a host and its members so the
kiroshi-cloud relay carries bytes it can neither read nor forge. The relay is the
adversary: it may drop, reorder, replay, alter or inject frames.

Three files make the contract:

- this document: keys, derivations and byte layouts;
- [`apps/app/src-tauri/tests/vectors/v2-crypto.json`](../../apps/app/src-tauri/tests/vectors/v2-crypto.json):
  test vectors every client checks itself against;
- [`apps/app/src-tauri/tests/vectors/bip39-english.txt`](../../apps/app/src-tauri/tests/vectors/bip39-english.txt):
  the BIP39 English word list the fingerprint reads (SHA-256
  `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`).

The plaintext of a v2 frame is a v1 frame of
[`member-socket.md`](member-socket.md), encoded as UTF-8 JSON.

## Notation

- `||` is byte concatenation.
- `u16be(n)`, `u32be(n)`, `u64be(n)` are `n` as 2, 4 and 8 bytes, big-endian.
- `ascii("…")` is the bytes of the ASCII string, no terminator.
- Every key and public key is its raw 32-byte encoding.
- `HKDF(ikm, salt, info, 32)` is HKDF-SHA256 (RFC 5869), extract then expand to 32 bytes.
- `AEAD` is ChaCha20-Poly1305 IETF (RFC 8439): 32-byte key, 12-byte nonce, 16-byte tag
  appended to the ciphertext.

## Device keys

Every client holds one device identity:

- a signing key pair, Ed25519 (RFC 8032). The private key is the 32-byte seed;
- an agreement key pair, X25519 (RFC 7748). The private key is the 32-byte scalar,
  clamped by the X25519 function, never by the store.

```
device_id = lowercase_hex(SHA-256(signing_public)[0..16])
```

`device_id` is 32 hexadecimal characters. Inside a byte layout it is the 16 raw
bytes, written `device_id_bytes`.

### Storage on the desktop

The keys are created on the first start and never change after: signing out of the
account does not touch them. They are stored as 64 bytes, `signing_seed ||
agreement_scalar`, in one of two places:

- an installed macOS build: the login Keychain, generic password, service = the
  bundle identifier, account `device-keys`;
- the dev profile (bundle identifier ending in `.dev`), Windows and Linux: the file
  `device-keys` in the application data directory, mode 0600 in a 0700 directory.
  The dev profile never calls the Keychain, since an ad-hoc signed dev build would be
  prompted on every rebuild.

Keys are generated only when the Keychain answered "no item", or where no
Keychain is used. Every Keychain failure is logged with its cause.

- The Keychain fails to read and the file holds keys: the file's keys are used.
- The Keychain fails to read and the file holds none: the identity is reported
  unavailable (`Unreadable`) and no key is written anywhere, so a passing Keychain
  failure never replaces the identity.
- The Keychain answers "no item" and the file holds keys, left there by an earlier
  write fallback: the file's keys are used.
- The Keychain fails to write freshly generated keys: they go to the file.

A file or Keychain item that is not 64 bytes is refused and left in place: the
identity is reported unavailable rather than replaced.

### What the desktop exposes

The Tauri command `get_device_identity` answers

```json
{ "deviceId": "…32 hex…", "signingPublicKey": "base64", "agreementPublicKey": "base64", "fingerprint": ["six", "words", "…"] }
```

Base64 is the standard alphabet with padding. No private key ever crosses the
command surface.

## Signatures

Every Ed25519 signature is verified strictly (`verify_strict` in ed25519-dalek):
a non-canonical `S`, a small-order public key or a small-order `R` is refused.

CryptoKit signs with randomness, so two clients never compare signature bytes:
each verifies the other's. The desktop's signatures are deterministic, so the
vector file pins the bytes the desktop produces.

## X25519 is contributory

Every X25519 exchange refuses an all-zero shared secret: a low-order public key
yields one whatever the private key. The vector file lists such points under
`non_contributory_points`; every one of them is refused.

## Subkey

A Space shares one 32-byte `space_key` per `key_id`. Every sender encrypts under
its own subkey:

```
subkey = HKDF(
	ikm  = space_key,
	salt = SUBKEY_SALT,
	info = ascii("kiroshi/v2") || u32be(key_id) || device_id_bytes(sender),
	32)

SUBKEY_SALT = SHA-256(ascii("kiroshi/v2/subkey"))
            = 16397f8b30f5e1c3ad8f362524dfb6aec017d3c65c224be8f2d75450b6c1a595
```

The info is 10 + 4 + 16 = 30 bytes.

## Frame

### On the wire

One WebSocket text frame holding one JSON object:

```json
{ "v": 2, "instance": "space-1", "from": "…32 hex…", "to": "…32 hex…", "key_id": 7, "ctr": 1, "challenge": "base64", "ct": "base64", "sig": "base64" }
```

| Key | Type | Meaning |
| --- | --- | --- |
| `v` | number | Always `2`. |
| `instance` | string | The hosted Space instance the frame belongs to. At most 65535 UTF-8 bytes. |
| `from` | string | `device_id` of the sender. |
| `to` | string, optional | `device_id` of the one recipient; absent for a frame to every member. |
| `key_id` | number | The `space_key` the subkey comes from. u32. |
| `ctr` | number | The sender's counter under this `key_id`. u64, kept below 2^53 so a JSON number carries it exactly. |
| `challenge` | string, optional | 32 bytes, base64. |
| `ct` | string | The ciphertext bytes, base64. |
| `sig` | string | 64 bytes, base64. |

### AAD: canonical header bytes

| Offset | Length | Field |
| --- | --- | --- |
| 0 | 1 | `0x02` (`v`) |
| 1 | 2 | `u16be(L)`, `L` the UTF-8 byte length of `instance` |
| 3 | L | `instance`, UTF-8, no normalisation |
| 3+L | 16 | `device_id_bytes(from)` |
| 19+L | 1 | `0x01` when `to` is present, `0x00` when absent |
| | 16 or 0 | `device_id_bytes(to)` when present, nothing when absent |
| | 4 | `u32be(key_id)` |
| | 8 | `u64be(ctr)` |
| | 1 | `0x01` when `challenge` is present, `0x00` when absent |
| | 32 or 0 | `challenge` when present, nothing when absent |

An AAD is 33 + L bytes with neither optional field, 81 + L bytes with both.

### Seal

```
subkey           = subkey(space_key, key_id, from)
nonce            = 0x00000000 || u64be(ctr)
ciphertext_bytes = nonce || AEAD(subkey, nonce, plaintext, aad = AAD)
sig              = Ed25519_sign(signing_private(from), AAD || ciphertext_bytes)
```

`ct` carries `ciphertext_bytes`: 12 + plaintext length + 16 bytes. A sender never
reuses a `ctr` under one `key_id`: the nonce is the counter.

### Open

In this order, every step refusing the frame with a typed error:

1. `ctr` is greater than the last `ctr` accepted from `from` under `key_id`
   (`Replay`).
2. `from` is the `device_id` of the signing key the receiver holds for that sender
   (`ForeignSender`).
3. `sig` verifies strictly over `AAD || ciphertext_bytes` (`ForgedSignature`).
4. `ciphertext_bytes` holds at least 28 bytes (`Truncated`) and starts with
   `0x00000000 || u64be(ctr)` (`NonceMismatch`).
5. The AEAD opens under `subkey(space_key, key_id, from)` with the AAD
   (`Unauthentic`).

Only a frame that passes every step records its `ctr` as the last accepted.

## Sealed box

Anonymous encryption to an X25519 public key:

```
ephemeral        = a fresh X25519 key pair, used once
shared           = X25519(ephemeral_private, recipient_public)   refused when not contributory
key              = HKDF(ikm = shared, salt = ephemeral_public || recipient_public,
                        info = ascii("kiroshi/v2/sealed-box"), 32)
nonce            = 12 random bytes
sealed           = ephemeral_public || nonce || AEAD(key, nonce, plaintext, aad = empty)
```

A sealed box is 32 + 12 + plaintext length + 16 bytes. The recipient computes
`X25519(recipient_private, ephemeral_public)`, refuses it when not contributory,
then derives the same key.

## Join payload

A member joining a Space proves it holds the invitation secret and hands the host
its two public keys:

```
mac     = HMAC-SHA256(key = invitation_secret, signing_public || agreement_public)
payload = signing_public || agreement_public || mac                      96 bytes
sealed  = sealed_box(host_agreement_public, payload)
```

The host refuses a payload that is not 96 bytes or whose `mac` does not verify,
compared in constant time.

## Fingerprint

Six words a person compares between two screens:

```
bits    = the first 66 bits of SHA-256(signing_public), most significant bit first
word[i] = WORDS[bits[11·i .. 11·i + 11]]   for i in 0..6
```

`WORDS` is the BIP39 English list, 2048 words, index 0 = `abandon`.

## Test vectors

`v2-crypto.json` was produced from the inputs it lists with Node's OpenSSL
primitives, independently of the Rust code, and the Rust suite checks the Rust
code against it. Every byte string is lowercase hex; `ctr` is a decimal string.

| Key | What a client checks |
| --- | --- |
| `devices` | From `signing_seed` and `agreement_secret`: both public keys, `device_id`, `fingerprint`. |
| `subkeys` | `subkey` from `space_key`, `key_id`, `device_id`. |
| `frames` | `aad` from `header`; `subkey`; opening `ciphertext` returns `plaintext`; `sig` verifies against `signing_public`. A client with deterministic Ed25519 also reproduces `ciphertext` and `sig`. |
| `sealed_boxes` | Opening `sealed` with `recipient_secret` returns `plaintext`; sealing with `ephemeral_secret` and `nonce` reproduces `sealed`. |
| `join_payloads` | Opening `sealed` with `host_secret` and `secret` returns the two public keys; `payload` is their layout. |
| `non_contributory_points` | Every point is refused as an X25519 public key. |

The Swift-made signature vector is added by the iPhone client.
