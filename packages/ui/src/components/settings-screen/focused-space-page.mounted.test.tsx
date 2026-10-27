// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import {
	type FocusedSpace,
	FocusedSpacePage,
} from "@workspace/ui/components/settings-screen/focused-space-page"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"

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
		value={{ name, colour: BLOT_HUES.blue }}
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

type ColourPageOptions = {
	space: FocusedSpace
	value: SpaceSettingsValue
	onValueChange?: (value: SpaceSettingsValue) => void
}

const colourPageOf = ({
	space,
	value,
	onValueChange = () => undefined,
}: ColourPageOptions) => (
	<FocusedSpacePage
		onValueChange={onValueChange}
		space={space}
		spaceId="space-release-desk"
		value={value}
	/>
)

const colourFieldIn = (container: HTMLElement) =>
	container.querySelector<HTMLElement>('[data-slot="colour-field"]')

const BLUE_DESK: SpaceSettingsValue = {
	name: "Release desk",
	colour: BLOT_HUES.blue,
}

const INVITATION = {
	state: "invitation",
	hostEmail: "priya@example.com",
	expiresAt: Date.UTC(2026, 10, 2),
} as const

describe("FocusedSpacePage colour", () => {
	it("draws the Space colour field right under the name, with its mark", () => {
		const { container } = render(
			colourPageOf({
				space: YOURS,
				value: BLUE_DESK,
			}),
		)
		const field = colourFieldIn(container)

		expect(
			field?.previousElementSibling?.contains(screen.getByLabelText("Name")),
		).toBe(true)
		expect(
			field?.querySelectorAll('[data-slot="space-tint"]').length,
		).toBeGreaterThan(0)
	})

	it("reports a preset pick once, with the current name and the preset colour", () => {
		const onValueChange = vi.fn()
		render(
			colourPageOf({
				space: YOURS,
				value: BLUE_DESK,
				onValueChange,
			}),
		)

		fireEvent.click(screen.getByRole("radio", { name: "Green" }))

		expect(onValueChange).toHaveBeenCalledTimes(1)
		expect(onValueChange).toHaveBeenCalledWith({
			name: "Release desk",
			colour: BLOT_HUES.green,
		})
	})

	it("reports a hue that matches no preset as it is, and shows the hue hint", () => {
		const onValueChange = vi.fn()
		render(
			colourPageOf({
				space: YOURS,
				value: { name: "Release desk" },
				onValueChange,
			}),
		)

		fireEvent.click(screen.getByRole("radio", { name: "Your hue" }))

		expect(onValueChange).toHaveBeenCalledTimes(1)
		expect(onValueChange).toHaveBeenCalledWith({
			name: "Release desk",
			colour: 320,
		})
		expect(screen.getByText(/^Any hue\./)).toBeTruthy()
	})

	it("shows the preset of the value it mounts with, and follows a new value", () => {
		const { rerender } = render(
			colourPageOf({
				space: YOURS,
				value: { name: "Release desk", colour: BLOT_HUES.orange },
			}),
		)

		expect(
			screen.getByRole<HTMLInputElement>("radio", { name: "Orange" }).checked,
		).toBe(true)

		rerender(
			colourPageOf({
				space: YOURS,
				value: { name: "Release desk", colour: BLOT_HUES.pink },
			}),
		)

		expect(
			screen.getByRole<HTMLInputElement>("radio", { name: "Pink" }).checked,
		).toBe(true)
		expect(
			screen.getByRole<HTMLInputElement>("radio", { name: "Orange" }).checked,
		).toBe(false)
	})

	it.each([
		["joined, not connected", { ...JOINED, isConnected: false }],
		["invitation", INVITATION],
	] as const)("draws no colour field for a %s Space", (_state, space) => {
		const { container } = render(
			colourPageOf({
				space,
				value: { name: "Harbor", colour: BLOT_HUES.orange },
			}),
		)

		expect(colourFieldIn(container)).toBeNull()
	})
})
