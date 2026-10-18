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
{ "v": 2, "instance": "space-1", "from": "…relay device uuid…", "to": "…relay device uuid…", "key_id": 7, "ctr": 1, "challenge": "base64", "ct": "base64", "sig": "base64" }
```

| Key | Type | Meaning |
| --- | --- | --- |
| `v` | number | Always `2`. |
| `instance` | string | The hosted Space instance the frame belongs to. At most 65535 UTF-8 bytes. |
| `from` | string | Relay device id of the sender, written by the relay, never by the sender. |
| `to` | string, optional | Relay device id of the one recipient; absent for a frame to every member. |
| `key_id` | number | The `space_key` the subkey comes from. u32. |
| `ctr` | number | The sender's counter under this `key_id`. u64, kept below 2^53 so a JSON number carries it exactly. |
| `challenge` | string, optional | 32 bytes, base64. |
| `ct` | string | The ciphertext bytes, base64. |
| `sig` | string | 64 bytes, base64. |

### Wire addressing

The relay knows a device by the id `POST /devices` answered when that device
registered its two public keys, a UUID: its relay device id. The wire carries
relay device ids only; the AAD and the subkey carry the 32-hex `device_id` only.
Each side maps one to the other through the roster of the Space, which holds both
ids of every device with its public keys.

- A sender never writes `from`. The relay splices `"from":"<relay device id>"` in
  front of the frame, after its opening brace.
- The host opens its relay socket with `?device=<its relay device id>`, and so does a
  member: the desktop reads its own relay device id from its row of the roster set it
  holds, or from `POST /devices` before its join.
- A host frame for one member carries `to` set to that member's relay device id,
  and the AAD `to` set to that member's `device_id`. An answer to a call or a
  `relay_resume`, the frames that `relay_resume` replays, and a hello answer go
  to the one device that sent the call. An event carries no `to`.
- A member frame goes to the host alone and carries no `to`, on the wire or in the
  AAD.
- A receiver resolves the wire `from` to a roster row by its relay device id, then
  builds the AAD and the subkey from that row's `device_id`. The wire `from` names
  a key the receiver already holds and is trusted for nothing else: a frame whose
  `from` resolves to no roster row is dropped.

The host drops a frame that is not `"v": 2`, resolves to no roster row or fails a
step of Open. It sends nothing back and logs one line naming the Space, the wire
`from` and the typed error, never the frame.

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

A sender persists its last `ctr` per `key_id` before the frame leaves, so a restart
never reuses a nonce. A sender that cannot read back the last `ctr` of a `key_id`
never sends under that `key_id` again.

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

A receiver persists its last accepted `ctr` per (`from`, `key_id`), so a frame
replayed after a restart is refused.

### Hello and challenge

The challenge binds every member frame to the host socket it is read on, so a
frame recorded on an earlier socket never runs again.

- A member's first frame on a socket is a hello: the plaintext `{"hello":{}}`,
  with no `challenge`.
- The host answers every hello with a frame sealed to that device whose plaintext
  is `{"hello":{}}` and whose header carries a fresh random 32-byte `challenge`.
  The host holds that challenge for that device, in place of any it held before,
  until the host socket ends.
- A member carries the last challenge received from the host in the header of
  every later frame on that socket.
- A member frame other than a hello that carries no challenge, or a challenge
  other than the one the host holds for its device, is stale: the host drops it,
  runs nothing, and answers a hello sealed to that device.
  - When the host holds a challenge for that device, the answer carries that held
    challenge, unchanged. A member with several frames in flight under a replaced
    challenge gets the same challenge back for each of them, and its resends
    under it run.
  - When the host holds no challenge for that device, it draws a fresh one, holds
    it, and the answer carries it.

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

## Invitation accept

A member joins a Space by accepting its invitation on the relay. No link, no
secret and no key leaves the device for it: the host reads the member device keys
from the relay device list, and trusts the roster it signs.

```
POST /invitations/{invitationId}/accept        bearer of the invited account
```

`GET /invitations` lists the pending invitations of the account, each carrying
`id`, `instanceId`, `instanceName`, `inviterEmail`, `invitedAt` and `expiresAt`.

| Answer | Meaning | Desktop answer |
| --- | --- | --- |
| 200 `{ instanceId, name }` | The account is now a member of the instance | the join below |
| 409 `ALREADY_JOINED` | The account already accepted it | the join below, on the listed `instanceId` |
| 410 `INVITATION_EXPIRED` | The invitation outlived its `expiresAt` | `invitationExpired` |
| 410 `INVITATION_WITHDRAWN` | The host took it back | `invitationWithdrawn` |
| 410 `INVITATION_USED` | It was already accepted | `invitationUsed` |
| 403 `INVITATION_EMAIL_MISMATCH` | It names another email than the account | `invitationOtherEmail` |
| 404 | No such invitation | `noInvitation` |
| unreachable, any other status | | `couldNotAccept` |

The Tauri command is `invitation_accept(invitationId)`. On every refusal of the
accept the desktop stores no joined Space.

A link `kiroshi://join?invitation=<invitationId>`, the id matching
`[A-Za-z0-9_-]{1,128}`, opens the app and hands that invitation id to the front,
which accepts it the same way. Any other `kiroshi://join` URL is ignored.

## Join frames

A device outside the roster holds no subkey: its join frame is not a sealed v2
frame and carries no `key_id`, `ctr`, `ct` or `sig`.

### join (device to host)

```json
{ "v": 2, "instance": "…", "from": "…relay device id…", "join": {} }
```

`join` is an empty object: the device proves nothing in it. As on every frame,
the relay splices `from`. The device sends it on the member socket of the instance
right after the accept, and again on every connection of that socket while it
holds no key for the Space.

### joined (host to device)

```json
{ "v": 2, "instance": "…", "to": "…relay device id…", "joined": "base64" }
```

```
answer = UTF-8 JSON key handover (below)
joined = sealed_box(device_agreement_public, answer)
```

`device_agreement_public` is the one the relay device list carries for `to`. No
mac guards it. The device opens the box, then verifies the roster set signature
with the `signing_public_key` of the host row of that set:

- On a first join the device trusts that host row. The 6-word
  [Fingerprint](#fingerprint) of the host stays the manual check.
- When the device already holds a roster for the instance, a host row that differs
  from the held one is refused as `badSignature`, and the held roster is kept.
- A roster that does not list the device itself is refused as `notInRoster`, and
  no key is stored.

The host builds every key handover by reading the current `key_id` and
`space_key` first, then the roster. A device removed after the roster read is
followed by a rotation to a key later than the one read; a device removed before
it is not in the roster. A rekey goes only to the devices of the roster read after
its key.

The key handover, the same JSON in `joined` and `rekey`:

```json
{ "key_id": 1, "space_key": "base64, 32 bytes", "roster": { "…": "signed roster set" } }
```

### join_refused (host to device)

```json
{ "v": 2, "instance": "…", "to": "…relay device id…", "join_refused": "pending" }
```

`"pending"`: the host has not admitted the device yet. Nothing in it is
authenticated: the relay may forge or drop it, and the worst it achieves is a
device that keeps waiting.

### Waiting for the host

When the host is offline, answers `"pending"`, or sends no `joined` within the
answer bound, the desktop stores the joined Space anyway and answers it with
`state: "waitingForHost"`. Every joined Space the device holds no key for is
listed that way, and `joined_space_connect` answers `waitingForHost`. While the
account is signed in, the desktop keeps one member socket per such Space, resends
the `join` frame on every connection, and reconnects with the relay backoff. The
first verified `joined` stores the key and the roster, closes that socket, and
announces the Space changed; it is then listed `state: "online"`.

## Signed roster set

```json
{
  "space_id": "…",
  "host": "…32 hex device_id of the host…",
  "key_id": 2,
  "version": 7,
  "rows": [
    { "device_id": "…32 hex…", "relay_device_id": "…", "account_id": "…", "signing_public_key": "base64", "agreement_public_key": "base64", "fingerprint": "six words", "added_at": 1767225600000, "signature": "base64" }
  ],
  "sig": "base64"
}
```

- `space_id` is the host's own id for the Space, the one every row signature
  covers. It is not the `instance`.
- `rows` holds every roster row, the host's own included, each with the row
  signature the host made when it stored it, ordered by `device_id`.
- `version` grows by one on every change of the roster: a device admitted, a
  device or a member removed, the host row rewritten. A device keeps the highest
  version it verified and refuses a lower one.
- `key_id` is the Space key the set was handed with.

### Row signature

```
row_bytes = ascii("kiroshi/v2/roster")
         || u64be(len(space_id))             || space_id
         || u64be(len(device_id))            || ascii(device_id)
         || u64be(len(relay_device_id))      || relay_device_id
         || u64be(len(account_id))           || account_id
         || u64be(32)                        || signing_public_key
         || u64be(32)                        || agreement_public_key
         || u64be(len(fingerprint))          || fingerprint
         || i64be(added_at)
signature = Ed25519_sign(host_signing_private, row_bytes)
```

Strings are UTF-8, `device_id` its 32 hex characters, `added_at` milliseconds
since the Unix epoch. A row verifies when its signature verifies under the host
signing key and `device_id` is the `device_id` of `signing_public_key`.

### Set signature

```
set_bytes = ascii("kiroshi/v2/roster-set")
         || u64be(len(space_id)) || space_id
         || u64be(version)
         || u32be(key_id)
         || u64be(n)
         || device_id_bytes(d1) || … || device_id_bytes(dn)
sig = Ed25519_sign(host_signing_private, set_bytes)
```

`d1 … dn` are the `device_id`s of every row, sorted by their 16 raw bytes in
ascending order. A device accepts a set only when every row verifies, `host`
names a row, and `sig` verifies under the `signing_public_key` of that row. A set
with a row added, removed or swapped fails `sig`.

## Key rotation

Removing a member (`hosting_remove_member`, once the relay answered) or one device
(`hosting_remove_device`) deletes the matching roster rows, then the host stores a
fresh random `space_key` under `key_id + 1`, starts its `ctr` and seals every
later frame under it. A removed device keeps the old `space_key` and gets nothing
sealed under the new one; its frames resolve to no roster row and are dropped.
The host device cannot be removed.

Withdrawing a pending invitation (`hosting_withdraw_invitation`, once the relay
answered) is a removal too: a device admitted through that invitation's link is
rostered under the invited account while the invitation is still pending. The host
deletes every join secret and every roster row of that account, then rotates the
key as above when at least one roster row was deleted. A withdrawal that deletes
no roster row leaves `key_id` unchanged.

The transaction that deletes roster rows also marks the Space as owing a
rotation, and storing the new key clears the mark. When the new key cannot be
stored, the rows stay deleted, the mark stays, and the command answers
`keyNotRotated`. While the mark stays, the host rotates before it answers any
members or devices command on that Space (`hosting_members`,
`hosting_invite_member`, `hosting_withdraw_invitation`, `hosting_remove_member`,
`hosting_join_link`, `hosting_device_link`, `hosting_devices`,
`hosting_remove_device`) and when its socket for that Space comes online, so a
failed rotation is never left behind by a retry that finds nothing to remove.

When that rotation fails as the socket comes online, the host ends the socket
session before it seals any frame on it, so it never serves frames under a key a
removed device holds. The relay connection is retried with the usual backoff,
and each new session tries the rotation again.

### rekey (host to device)

On a rotation the host sends one rekey frame to every remaining device of the
roster other than its own:

```json
{ "v": 2, "instance": "…", "to": "…relay device id…", "rekey": "base64", "sig": "base64" }
```

```
rekey     = sealed_box(device_agreement_public, key handover)
rekey_sig = ascii("kiroshi/v2/rekey")
         || u64be(len(instance))  || instance
         || device_id_bytes(to)
         || u64be(len(rekey))     || rekey
sig       = Ed25519_sign(host_signing_private, rekey_sig)
```

`to` in the signed bytes is the recipient's `device_id`, not its relay device id.
A device verifies `sig` under the host signing key it holds before it opens the
box, then accepts the handover only when its roster set verifies with a `version`
at least the one it holds and a `key_id` above the one it holds.

A rostered device that sends a frame under a `key_id` lower than the current one
missed a rekey: the host drops the frame and sends that device its rekey frame
again. A frame under a `key_id` above the current one is dropped with nothing
sent.

## Fingerprint

Six words a person compares between two screens:

```
bits    = the first 66 bits of SHA-256(signing_public), most significant bit first
word[i] = WORDS[bits[11·i .. 11·i + 11]]   for i in 0..6
```

`WORDS` is the BIP39 English list, 2048 words, index 0 = `abandon`.

## Test vectors

`v2-crypto.json` is written by
[`scripts/generate-v2-vectors.ts`](../../scripts/generate-v2-vectors.ts), from the
repository root:

```sh
bun scripts/generate-v2-vectors.ts
```

The generator derives every value from the inputs it lists with bun's `node:crypto`
and its own ChaCha20-Poly1305, independently of the Rust code, and formats the file
with Biome. Run on an unchanged generator, it rewrites the committed file byte for
byte. The Rust suite checks the Rust code against the file. Every byte string is
lowercase hex; `ctr` is a decimal string.

| Key | What a client checks |
| --- | --- |
| `devices` | From `signing_seed` and `agreement_secret`: both public keys, `device_id`, `fingerprint`. |
| `subkeys` | `subkey` from `space_key`, `key_id`, `device_id`. |
| `frames` | `aad` from `header`; `subkey`; opening `ciphertext` returns `plaintext`; `sig` verifies against `signing_public`. A client with deterministic Ed25519 also reproduces `ciphertext` and `sig`. |
| `sealed_boxes` | Opening `sealed` with `recipient_secret` returns `plaintext`; sealing with `ephemeral_secret` and `nonce` reproduces `sealed`. |
| `join_payloads` | Opening `sealed` with `host_secret` and `secret` returns the two public keys; `payload` is their layout. |
| `non_contributory_points` | Every point is refused as an X25519 public key. |

The Swift-made signature vector is added by the iPhone client.
