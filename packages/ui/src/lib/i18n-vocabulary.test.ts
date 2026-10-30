import { describe, expect, it } from "vitest"

import { en } from "@workspace/ui/lib/i18n-en"
import { fr } from "@workspace/ui/lib/i18n-fr"

const RETIRED_WORD = /\b(companions?|compagnons?)\b/i
const PLACEHOLDER = /\{\{[^}]*\}\}/g

type CatalogueNode = string | { readonly [key: string]: CatalogueNode }

type Entry = { key: string; value: string }

const entriesOf = (node: CatalogueNode, path: string): Entry[] =>
	typeof node === "string"
		? [{ key: path, value: node }]
		: Object.entries(node).flatMap(([key, child]) =>
				entriesOf(child, path ? `${path}.${key}` : key),
			)

const keysSayingRetiredWord = (catalogue: CatalogueNode) =>
	entriesOf(catalogue, "")
		.filter(({ value }) => RETIRED_WORD.test(value.replace(PLACEHOLDER, "")))
		.map(({ key, value }) => `${key}: ${value}`)

describe("the catalogue vocabulary", () => {
	it.each([
		["en", en],
		["fr", fr],
	] as const)("says agent, never companion, in %s", (_, catalogue) => {
		expect(keysSayingRetiredWord(catalogue)).toEqual([])
	})
})
