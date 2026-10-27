// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { FocusedSpacePage } from "@workspace/ui/components/settings-screen/focused-space-page"

import "@workspace/ui/lib/i18n"

const YOURS = { state: "yours", isShared: false } as const

const JOINED = {
	state: "joined",
	hostName: "Jordan Lee",
	isConnected: true,
} as const

type PageOptions = {
	spaceId: string
	name: string
	spaceHost?: SpaceHost
}

const pageOf = ({ spaceId, name, spaceHost }: PageOptions) => (
	<FocusedSpacePage
		onValueChange={() => undefined}
		space={spaceHost ? JOINED : YOURS}
		spaceHost={spaceHost}
		spaceId={spaceId}
		value={{ name, colour: "blue" }}
	/>
)

const arcsIn = (container: HTMLElement) =>
	[
		...container.querySelectorAll(
			'[data-slot="space-avatar"] [data-theme="light"] circle',
		),
	].map((circle) =>
		["cx", "cy", "r"].map((attribute) => circle.getAttribute(attribute)),
	)

afterEach(cleanup)

describe("FocusedSpacePage avatar", () => {
	it("keeps the anchor corner and arc radii of a Space through a rename", () => {
		const { container, rerender } = render(
			pageOf({ spaceId: "space-release-desk", name: "Release desk" }),
		)
		const before = arcsIn(container)
		expect(before).toHaveLength(3)

		rerender(pageOf({ spaceId: "space-release-desk", name: "Launch room" }))

		expect(arcsIn(container)).toEqual(before)
	})

	it("draws two Spaces sharing one name with their own arcs", () => {
		const first = arcsIn(
			render(pageOf({ spaceId: "space-release-desk", name: "Desk" })).container,
		)
		cleanup()
		const second = arcsIn(
			render(pageOf({ spaceId: "space-harbor", name: "Desk" })).container,
		)

		expect(second).not.toEqual(first)
	})

	it.each([
		["connecting", "connecting"],
		["down", "offline"],
	] as const)(
		"draws a %s host passed in, over what the page infers, with no pill",
		(spaceHost, state) => {
			const { container } = render(
				pageOf({ spaceId: "space-harbor", name: "Harbor", spaceHost }),
			)

			expect(
				container.querySelector<HTMLElement>('[data-slot="space-avatar"]')
					?.dataset.state,
			).toBe(state)
			expect(container.querySelector('[data-slot="host-pill"]')).toBeNull()
		},
	)
})
