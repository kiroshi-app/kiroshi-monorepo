import { describe, expect, it } from "vitest"

import { spaceAvatarStateOf } from "@workspace/ui/components/space-avatar"

describe("spaceAvatarStateOf", () => {
	it("draws a Space with no host mark as local", () => {
		expect(spaceAvatarStateOf()).toBe("local")
		expect(spaceAvatarStateOf(undefined)).toBe("local")
	})

	it("draws a host answering up as online", () => {
		expect(spaceAvatarStateOf("up")).toBe("online")
	})

	it("draws a host answering down as offline", () => {
		expect(spaceAvatarStateOf("down")).toBe("offline")
	})

	it("keeps shared and connecting as they render on main", () => {
		expect(spaceAvatarStateOf("shared")).toBe("shared")
		expect(spaceAvatarStateOf("connecting")).toBe("connecting")
	})
})
