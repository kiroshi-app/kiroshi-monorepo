import crypto from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const VECTORS = join(ROOT, "apps/app/src-tauri/tests/vectors")
const WORD_LIST = "bip39-english.txt"
const OUTPUT = join(VECTORS, "v2-crypto.json")

const ED25519_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex")
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex")
const X25519_PKCS8 = Buffer.from("302e020100300506032b656e04220420", "hex")
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex")

const ZERO_SHARED_SECRET = "ERR_CRYPTO_OPERATION_FAILED"
const MASK_32 = 0xffffffff
const POLY1305_PRIME = (1n << 130n) - 5n
const POLY1305_CLAMP = 0x0ffffffc0ffffffc0ffffffc0fffffffn

type Device = {
	signingSeed: Buffer
	agreementSecret: Buffer
	signingPublic: Buffer
	agreementPublic: Buffer
	deviceId: Buffer
}

type FrameInput = {
	instance: string
	to: Buffer | null
	keyId: number
	ctr: bigint
	challenge: Buffer | null
}

type SealedBox = { ephemeralPublic: Buffer; sealed: Buffer }

const sha256 = (bytes: Buffer) =>
	crypto.createHash("sha256").update(bytes).digest()
const label = (name: string) => sha256(Buffer.from(`kiroshi/v2/vector/${name}`))
const hex = (bytes: Buffer) => bytes.toString("hex")

const u16be = (value: number) => {
	const bytes = Buffer.alloc(2)
	bytes.writeUInt16BE(value)
	return bytes
}
const u32be = (value: number) => {
	const bytes = Buffer.alloc(4)
	bytes.writeUInt32BE(value)
	return bytes
}
const u64be = (value: bigint) => {
	const bytes = Buffer.alloc(8)
	bytes.writeBigUInt64BE(value)
	return bytes
}
const u64le = (value: bigint) => {
	const bytes = Buffer.alloc(8)
	bytes.writeBigUInt64LE(value)
	return bytes
}

const rotateLeft = (value: number, by: number) =>
	((value << by) | (value >>> (32 - by))) & MASK_32

const quarterRound = (
	state: Uint32Array,
	a: number,
	b: number,
	c: number,
	d: number,
) => {
	state[a] = (state[a] + state[b]) & MASK_32
	state[d] = rotateLeft(state[d] ^ state[a], 16)
	state[c] = (state[c] + state[d]) & MASK_32
	state[b] = rotateLeft(state[b] ^ state[c], 12)
	state[a] = (state[a] + state[b]) & MASK_32
	state[d] = rotateLeft(state[d] ^ state[a], 8)
	state[c] = (state[c] + state[d]) & MASK_32
	state[b] = rotateLeft(state[b] ^ state[c], 7)
}

const chachaBlock = (key: Buffer, counter: number, nonce: Buffer) => {
	const initial = new Uint32Array(16)
	initial.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574])
	for (let word = 0; word < 8; word++)
		initial[4 + word] = key.readUInt32LE(4 * word)
	initial[12] = counter
	for (let word = 0; word < 3; word++)
		initial[13 + word] = nonce.readUInt32LE(4 * word)
	const working = initial.slice()
	for (let round = 0; round < 10; round++) {
		quarterRound(working, 0, 4, 8, 12)
		quarterRound(working, 1, 5, 9, 13)
		quarterRound(working, 2, 6, 10, 14)
		quarterRound(working, 3, 7, 11, 15)
		quarterRound(working, 0, 5, 10, 15)
		quarterRound(working, 1, 6, 11, 12)
		quarterRound(working, 2, 7, 8, 13)
		quarterRound(working, 3, 4, 9, 14)
	}
	const block = Buffer.alloc(64)
	for (let word = 0; word < 16; word++)
		block.writeUInt32LE((working[word] + initial[word]) >>> 0, 4 * word)
	return block
}

const chacha20 = (
	key: Buffer,
	firstCounter: number,
	nonce: Buffer,
	input: Buffer,
) => {
	const output = Buffer.alloc(input.length)
	for (let offset = 0; offset < input.length; offset += 64) {
		const stream = chachaBlock(key, firstCounter + offset / 64, nonce)
		for (let at = offset; at < Math.min(offset + 64, input.length); at++)
			output[at] = input[at] ^ stream[at - offset]
	}
	return output
}

const littleEndian = (bytes: Buffer) =>
	BigInt(`0x${hex(Buffer.from(bytes).reverse()) || "0"}`)

const poly1305 = (oneTimeKey: Buffer, message: Buffer) => {
	const r = littleEndian(oneTimeKey.subarray(0, 16)) & POLY1305_CLAMP
	const s = littleEndian(oneTimeKey.subarray(16, 32))
	let accumulator = 0n
	for (let offset = 0; offset < message.length; offset += 16) {
		const chunk = message.subarray(offset, offset + 16)
		const block = littleEndian(chunk) + (1n << BigInt(8 * chunk.length))
		accumulator = ((accumulator + block) * r) % POLY1305_PRIME
	}
	const tag = (accumulator + s) & ((1n << 128n) - 1n)
	return Buffer.from(tag.toString(16).padStart(32, "0"), "hex").reverse()
}

const paddedTo16 = (bytes: Buffer) =>
	Buffer.concat([bytes, Buffer.alloc((16 - (bytes.length % 16)) % 16)])

const aead = (key: Buffer, nonce: Buffer, plaintext: Buffer, aad: Buffer) => {
	const oneTimeKey = chachaBlock(key, 0, nonce).subarray(0, 32)
	const ciphertext = chacha20(key, 1, nonce, plaintext)
	const authenticated = Buffer.concat([
		paddedTo16(aad),
		paddedTo16(ciphertext),
		u64le(BigInt(aad.length)),
		u64le(BigInt(ciphertext.length)),
	])
	return Buffer.concat([ciphertext, poly1305(oneTimeKey, authenticated)])
}

const ed25519Private = (seed: Buffer) =>
	crypto.createPrivateKey({
		key: Buffer.concat([ED25519_PKCS8, seed]),
		format: "der",
		type: "pkcs8",
	})
const ed25519Public = (raw: Buffer) =>
	crypto.createPublicKey({
		key: Buffer.concat([ED25519_SPKI, raw]),
		format: "der",
		type: "spki",
	})
const x25519Private = (secret: Buffer) =>
	crypto.createPrivateKey({
		key: Buffer.concat([X25519_PKCS8, secret]),
		format: "der",
		type: "pkcs8",
	})
const x25519Public = (raw: Buffer) =>
	crypto.createPublicKey({
		key: Buffer.concat([X25519_SPKI, raw]),
		format: "der",
		type: "spki",
	})
const rawPublic = (key: crypto.KeyObject) =>
	Buffer.from(
		crypto.createPublicKey(key).export({ format: "jwk" }).x ?? "",
		"base64url",
	)
const x25519 = (secret: Buffer, publicKey: Buffer) =>
	crypto.diffieHellman({
		privateKey: x25519Private(secret),
		publicKey: x25519Public(publicKey),
	})
const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer) =>
	Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, 32))

const words = readFileSync(join(VECTORS, WORD_LIST), "utf8")
	.split("\n")
	.filter(Boolean)
if (words.length !== 2048)
	throw new Error(`${WORD_LIST} holds ${words.length} words`)

const fingerprint = (signingPublic: Buffer) => {
	const bits = BigInt(`0x${hex(sha256(signingPublic).subarray(0, 16))}`)
	return Array.from(
		{ length: 6 },
		(_, position) =>
			words[Number((bits >> BigInt(128 - 11 * (position + 1))) & 0x7ffn)],
	)
}

const deviceOf = (index: number): Device => {
	const signingSeed = label(`signing/${index}`)
	const agreementSecret = label(`agreement/${index}`)
	const signingPublic = rawPublic(ed25519Private(signingSeed))
	return {
		signingSeed,
		agreementSecret,
		signingPublic,
		agreementPublic: rawPublic(x25519Private(agreementSecret)),
		deviceId: sha256(signingPublic).subarray(0, 16),
	}
}
const devices = [0, 1, 2].map(deviceOf)

const SUBKEY_SALT = sha256(Buffer.from("kiroshi/v2/subkey"))
const spaceKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index))
const subkeyOf = (keyId: number, deviceId: Buffer) =>
	hkdf(
		spaceKey,
		SUBKEY_SALT,
		Buffer.concat([Buffer.from("kiroshi/v2"), u32be(keyId), deviceId]),
	)

const optional = (field: Buffer | null) =>
	field ? Buffer.concat([Buffer.from([1]), field]) : Buffer.from([0])

const aadOf = (from: Buffer, input: FrameInput) =>
	Buffer.concat([
		Buffer.from([2]),
		u16be(Buffer.byteLength(input.instance)),
		Buffer.from(input.instance, "utf8"),
		from,
		optional(input.to),
		u32be(input.keyId),
		u64be(input.ctr),
		optional(input.challenge),
	])

const frameOf = (sender: Device, input: FrameInput, plaintext: Buffer) => {
	const subkey = subkeyOf(input.keyId, sender.deviceId)
	const aad = aadOf(sender.deviceId, input)
	const nonce = Buffer.concat([Buffer.alloc(4), u64be(input.ctr)])
	const ciphertext = Buffer.concat([nonce, aead(subkey, nonce, plaintext, aad)])
	const signed = Buffer.concat([aad, ciphertext])
	const sig = crypto.sign(null, signed, ed25519Private(sender.signingSeed))
	if (!crypto.verify(null, signed, ed25519Public(sender.signingPublic), sig))
		throw new Error("the frame signature does not verify")
	return {
		space_key: hex(spaceKey),
		subkey: hex(subkey),
		signing_seed: hex(sender.signingSeed),
		signing_public: hex(sender.signingPublic),
		header: {
			v: 2,
			instance: input.instance,
			from: hex(sender.deviceId),
			to: input.to ? hex(input.to) : null,
			key_id: input.keyId,
			ctr: input.ctr.toString(),
			challenge: input.challenge ? hex(input.challenge) : null,
		},
		aad: hex(aad),
		plaintext: hex(plaintext),
		ciphertext: hex(ciphertext),
		sig: hex(sig),
	}
}

const sealedBoxOf = (
	ephemeralSecret: Buffer,
	nonce: Buffer,
	recipientPublic: Buffer,
	plaintext: Buffer,
): SealedBox => {
	const ephemeralPublic = rawPublic(x25519Private(ephemeralSecret))
	const key = hkdf(
		x25519(ephemeralSecret, recipientPublic),
		Buffer.concat([ephemeralPublic, recipientPublic]),
		Buffer.from("kiroshi/v2/sealed-box"),
	)
	const sealed = Buffer.concat([
		ephemeralPublic,
		nonce,
		aead(key, nonce, plaintext, Buffer.alloc(0)),
	])
	return { ephemeralPublic, sealed }
}

const isRefused = (point: string) => {
	try {
		return x25519(devices[1].agreementSecret, Buffer.from(point, "hex")).equals(
			Buffer.alloc(32),
		)
	} catch (error) {
		if ((error as { code?: string }).code === ZERO_SHARED_SECRET) return true
		throw error
	}
}

const LOW_ORDER_POINTS = [
	"0000000000000000000000000000000000000000000000000000000000000000",
	"0100000000000000000000000000000000000000000000000000000000000000",
	"e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
	"5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157",
	"ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
	"edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
	"eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
]
const contributory = LOW_ORDER_POINTS.filter((point) => !isRefused(point))
if (contributory.length > 0)
	throw new Error(`contributory points listed: ${contributory.join(", ")}`)

const call = Buffer.from(
	JSON.stringify({ id: 7, command: "conversation_list", args: {} }),
)
const boxEphemeral = label("ephemeral/0")
const boxNonce = label("nonce/0").subarray(0, 12)
const boxPlaintext = Buffer.from("kiroshi sealed box")
const box = sealedBoxOf(
	boxEphemeral,
	boxNonce,
	devices[1].agreementPublic,
	boxPlaintext,
)

const invitation = label("invitation")
const [joiner, , host] = devices
const joinerKeys = Buffer.concat([joiner.signingPublic, joiner.agreementPublic])
const payload = Buffer.concat([
	joinerKeys,
	crypto.createHmac("sha256", invitation).update(joinerKeys).digest(),
])
const joinEphemeral = label("ephemeral/1")
const joinNonce = label("nonce/1").subarray(0, 12)
const joinBox = sealedBoxOf(
	joinEphemeral,
	joinNonce,
	host.agreementPublic,
	payload,
)

const subkeyCases: [number, Device][] = [
	[0, devices[0]],
	[0x01020304, devices[0]],
	[7, devices[1]],
]

const vectors = {
	protocol: 2,
	encoding: "every byte string is lowercase hex; ctr is a decimal string",
	word_list: WORD_LIST,
	devices: devices.map((device) => ({
		signing_seed: hex(device.signingSeed),
		signing_public: hex(device.signingPublic),
		agreement_secret: hex(device.agreementSecret),
		agreement_public: hex(device.agreementPublic),
		device_id: hex(device.deviceId),
		fingerprint: fingerprint(device.signingPublic),
	})),
	subkeys: subkeyCases.map(([keyId, device]) => ({
		space_key: hex(spaceKey),
		key_id: keyId,
		device_id: hex(device.deviceId),
		subkey: hex(subkeyOf(keyId, device.deviceId)),
	})),
	frames: [
		frameOf(
			devices[0],
			{
				instance: "space-1",
				to: devices[1].deviceId,
				keyId: 0x01020304,
				ctr: 1n,
				challenge: Buffer.from(
					Array.from({ length: 32 }, (_, index) => 0xa0 + index),
				),
			},
			call,
		),
		frameOf(
			devices[1],
			{
				instance: "",
				to: null,
				keyId: 0,
				ctr: 2n ** 40n + 5n,
				challenge: null,
			},
			Buffer.alloc(0),
		),
	],
	sealed_boxes: [
		{
			recipient_secret: hex(devices[1].agreementSecret),
			recipient_public: hex(devices[1].agreementPublic),
			ephemeral_secret: hex(boxEphemeral),
			ephemeral_public: hex(box.ephemeralPublic),
			nonce: hex(boxNonce),
			plaintext: hex(boxPlaintext),
			sealed: hex(box.sealed),
		},
	],
	join_payloads: [
		{
			secret: hex(invitation),
			signing_public: hex(joiner.signingPublic),
			agreement_public: hex(joiner.agreementPublic),
			payload: hex(payload),
			host_secret: hex(host.agreementSecret),
			host_public: hex(host.agreementPublic),
			ephemeral_secret: hex(joinEphemeral),
			nonce: hex(joinNonce),
			sealed: hex(joinBox.sealed),
		},
	],
	non_contributory_points: LOW_ORDER_POINTS,
}

writeFileSync(OUTPUT, `${JSON.stringify(vectors, null, "\t")}\n`)

const formatted = Bun.spawnSync(
	["bun", "x", "biome", "format", "--write", OUTPUT],
	{
		cwd: ROOT,
		stdout: "inherit",
		stderr: "inherit",
	},
)
if (formatted.exitCode !== 0)
	throw new Error(`biome left ${OUTPUT} unformatted`)
