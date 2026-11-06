import argparse
import os
import random
import struct
import time
import uuid
import zlib

from devhost import DevHost

TITLE = "Bench: long conversation"
END_MARKER = "Quokka bench end"
USER_MESSAGES = 280
ASSISTANT_MESSAGES = 2498
BLOCKS = {"table": 53, "mermaid": 31, "code": 49, "math_inline": 1, "math_display": 2, "image": 5}
SPAN_MS = 30 * 86_400_000
WORDS = (
	"nest sync ledger harbour quiet orbit lantern ridge copper meadow signal parcel timber "
	"glacier compass ember lattice pilot cradle summit drift beacon tide mosaic thistle anchor "
	"vessel quarry prairie falcon shingle canopy orchard ripple marble kettle hollow spindle"
).split()
IMAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "chart.png")


def sentence(rng, words):
	text = " ".join(rng.choice(WORDS) for _ in range(words))
	return text[0].upper() + text[1:] + "."


def prose(rng, characters):
	paragraphs, size = [], 0
	while size < characters:
		paragraph = " ".join(sentence(rng, rng.randint(8, 16)) for _ in range(rng.randint(2, 4)))
		paragraphs.append(paragraph)
		size += len(paragraph)
	return "\n\n".join(paragraphs)


def table(rng):
	rows = "\n".join(f"| {rng.choice(WORDS)} | {rng.randint(0, 99)} | {rng.choice(WORDS)} |" for _ in range(rng.randint(3, 6)))
	return f"| name | count | state |\n| --- | ---: | --- |\n{rows}"


def mermaid(rng):
	a, b, c = rng.sample(WORDS, 3)
	return f"```mermaid\nflowchart TD\n\tA[{a}] --> B{{{b}?}}\n\tB -- yes --> C[{c}]\n\tB -- no --> A\n```"


def code(rng):
	name = rng.choice(WORDS)
	return f"```rust\nfn {name}(count: usize) -> usize {{\n\tlet {rng.choice(WORDS)} = count * {rng.randint(2, 9)};\n\t{name}_next({rng.randint(1, 5)})\n}}\n```"


BLOCK_TEXT = {
	"table": table,
	"mermaid": mermaid,
	"code": code,
	"math_inline": lambda rng: f"The share comes to $\\frac{{{rng.randint(1, 9)}}}{{{rng.randint(10, 40)}}}$ of the nests.",
	"math_display": lambda rng: "$$\n\\sum_{i=1}^{n} o_i = \\frac{3n}{4}\n$$",
	"image": lambda rng: f"![chart]({IMAGE})",
}


def write_image():
	width, height = 320, 120
	row = b"\x00" + bytes((40, 110, 200)) * width
	raw = zlib.compress(row * height)
	chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
	header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
	os.makedirs(os.path.dirname(IMAGE), exist_ok=True)
	with open(IMAGE, "wb") as png:
		png.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def assistant_texts(rng):
	slots = rng.sample(range(ASSISTANT_MESSAGES - 1), sum(BLOCKS.values()))
	kinds = [kind for kind, count in BLOCKS.items() for _ in range(count)]
	blocks = dict(zip(slots, kinds))
	texts = []
	for index in range(ASSISTANT_MESSAGES):
		body = prose(rng, max(60, int(rng.lognormvariate(6.1, 0.5))))
		if index in blocks:
			body = f"{body}\n\n{BLOCK_TEXT[blocks[index]](rng)}"
		texts.append(body)
	texts[-1] = f"{texts[-1]}\n\n{END_MARKER}"
	return texts


def existing(host, space_id):
	for conversation in host.invoke("conversation_list", {"spaceId": space_id}):
		if conversation.get("title") == TITLE:
			return conversation["id"]
	return None


def main():
	parser = argparse.ArgumentParser(description="Write the bench conversation into Kiroshi Dev only.")
	parser.add_argument("--seed", type=int, default=1933)
	parser.add_argument("--replace", action="store_true", help="delete the bench conversation of Kiroshi Dev first")
	options = parser.parse_args()
	host = DevHost()
	space = host.invoke("space_list", {})[0]
	held = existing(host, space["id"])
	if held and not options.replace:
		raise SystemExit(f"Kiroshi Dev already holds '{TITLE}': rerun with --replace to rewrite it.")
	if held:
		host.invoke("conversation_delete", {"conversationId": held})
	bot = host.invoke("conversation_bots", {"spaceId": space["id"]})[0]
	write_image()
	conversation = host.invoke(
		"conversation_create",
		{"spaceId": space["id"], "sectionId": None, "title": TITLE, "botIds": [bot["id"]]},
	)
	conversation_id = conversation["id"]
	rng = random.Random(options.seed)
	answers = assistant_texts(rng)
	per_turn = ASSISTANT_MESSAGES / USER_MESSAGES
	total = USER_MESSAGES + ASSISTANT_MESSAGES
	now = int(time.time() * 1000)
	written = 0
	for turn in range(USER_MESSAGES):
		turn_id = str(uuid.uuid4())
		at = lambda: now - SPAN_MS + SPAN_MS * written // total
		host.invoke("conversation_start_turn", {"turn": {"id": turn_id, "conversationId": conversation_id, "startedAt": at()}})
		host.invoke("conversation_append_user_message", {"message": {
			"id": str(uuid.uuid4()), "conversationId": conversation_id, "turnId": turn_id,
			"authorBotId": None, "repliedToMessageId": None,
			"content": sentence(rng, max(3, int(rng.lognormvariate(1.9, 0.9)))), "createdAt": at(),
		}})
		written += 1
		for text in answers[round(turn * per_turn):round((turn + 1) * per_turn)]:
			message_id = str(uuid.uuid4())
			host.invoke("conversation_open_assistant_message", {"message": {
				"id": message_id, "conversationId": conversation_id, "turnId": turn_id,
				"authorBotId": bot["id"], "repliedToMessageId": None, "createdAt": at(),
			}})
			host.invoke("conversation_append_text", {"id": message_id, "delta": text})
			host.invoke("conversation_finalize_message", {"id": message_id, "completion": "complete", "settledText": text})
			written += 1
		host.invoke("conversation_complete_turn", {"id": turn_id, "completedAt": at()})
	print(f"wrote {written} messages into Kiroshi Dev, conversation {conversation_id}")


if __name__ == "__main__":
	main()
