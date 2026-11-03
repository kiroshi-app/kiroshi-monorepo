import { describe, expect, it } from "vitest"

import { createFreelyNamed } from "./library-document-writes"

import type { LibraryItem } from "../bindings"

const UNTITLED = "Untitled"

type HostRules = {
	taken?: string[]
	isInvalid?: (name: string) => boolean
}

const fakeCreate = ({ taken = [], isInvalid = () => false }: HostRules) => {
	const tried: string[] = []
	const create = async (name: string): Promise<LibraryItem> => {
		tried.push(name)
		if (isInvalid(name)) {
			throw { kind: "invalidName", name }
		}
		if (taken.includes(name)) {
			throw { kind: "alreadyExists", name }
		}
		return {
			name,
			kind: "document",
			path: `/library/${name}`,
			bytes: 0,
			modifiedAt: 0,
			createdAt: 0,
		}
	}
	return { create, tried }
}

describe("the name of a new Library document", () => {
	it("is its starting title plus .md", async () => {
		const { create } = fakeCreate({})

		const item = await createFreelyNamed(create, "Project brief", UNTITLED)

		expect(item.name).toBe("Project brief.md")
	})

	it("is Untitled when the title is empty", async () => {
		const { create } = fakeCreate({})

		const item = await createFreelyNamed(create, "  ", UNTITLED)

		expect(item.name).toBe("Untitled.md")
	})

	it("counts up from 2 until a name is free", async () => {
		const { create, tried } = fakeCreate({
			taken: ["Notes.md", "Notes 2.md"],
		})

		const item = await createFreelyNamed(create, "Notes", UNTITLED)

		expect(item.name).toBe("Notes 3.md")
		expect(tried).toEqual(["Notes.md", "Notes 2.md", "Notes 3.md"])
	})

	it("falls back to Untitled when the host refuses the title", async () => {
		const { create } = fakeCreate({
			taken: ["Untitled.md"],
			isInvalid: (name) => name.includes("/"),
		})

		const item = await createFreelyNamed(create, "Notes 11/03", UNTITLED)

		expect(item.name).toBe("Untitled 2.md")
	})

	it("fails when even Untitled is refused", async () => {
		const { create } = fakeCreate({ isInvalid: () => true })

		await expect(createFreelyNamed(create, "", UNTITLED)).rejects.toEqual({
			kind: "invalidName",
			name: "Untitled.md",
		})
	})

	it("fails on any other refusal", async () => {
		const create = async (): Promise<LibraryItem> => {
			throw { kind: "unknownSpace", id: "space" }
		}

		await expect(createFreelyNamed(create, "Notes", UNTITLED)).rejects.toEqual({
			kind: "unknownSpace",
			id: "space",
		})
	})
})
