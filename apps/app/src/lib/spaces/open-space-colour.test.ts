// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useLayoutEffect } from "react"
import { afterEach, expect, it } from "vitest"

import {
	createJoinedSpacesController,
	type JoinedSpacesController,
	joinedRowIdOf,
	openSpaceColourOf,
} from "./joined-spaces-controller"
import {
	createSpacesController,
	type SpacesController,
} from "./spaces-controller"

import type { JoinedSpace } from "../bindings"
import { useControllerState } from "../use-controller"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { createQueryTestWrapper } from "../query/query-test-wrapper"
import { useSpaceTint } from "../theme/use-space-tint"

const STUDIO: JoinedSpace = {
	id: "joined-studio",
	hostUrl: "wss://cloud.kiroshi.test/instances/studio/relay/member",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
	hostedBy: null,
	colour: "purple",
}

const tintOnRoot = () => ({
	attribute: document.documentElement.getAttribute("data-space-tint"),
	property: document.documentElement.style.getPropertyValue("--space-tint"),
})

const tintOf = (colour: string) => ({
	attribute: colour,
	property: `var(--bot-blot-${colour})`,
})

type Tint = ReturnType<typeof tintOnRoot>

type TintedWorkspace = {
	spaces: SpacesController
	joined: JoinedSpacesController
	onCommit: (tint: Tint) => void
}

const useTintedWorkspace = ({ spaces, joined, onCommit }: TintedWorkspace) => {
	useSpaceTint(
		openSpaceColourOf(useControllerState(spaces), useControllerState(joined)),
	)
	useLayoutEffect(() => {
		onCommit(tintOnRoot())
	})
}

const stopWatching: (() => void)[] = []

afterEach(() => {
	cleanup()
	for (const stop of stopWatching.splice(0)) stop()
})

const mountTintedWorkspace = async () => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	await store.updateSpace(home.id, home.name, "cyan")
	const { queryClient } = createQueryTestWrapper()
	const spaces = createSpacesController(store, { queryClient })
	await spaces.load(home.id)
	let listed = [STUDIO]
	let announceChange: () => void = () => undefined
	const joined = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts: {
			getState: () => ({ active: null, connections: {} }),
			connect: async () => undefined,
			activate: async () => undefined,
			forget: () => undefined,
		},
		transport: {
			list: async () => listed,
			remove: async () => undefined,
			onChanged: async (listener) => {
				announceChange = listener
				return () => undefined
			},
			onRemoved: async () => () => undefined,
		},
	})
	stopWatching.push(joined.watch())
	await waitFor(() => expect(joined.getState().joinedSpaces).toEqual([STUDIO]))

	const committedTints: Tint[] = []
	renderHook(useTintedWorkspace, {
		initialProps: {
			spaces,
			joined,
			onCommit: (tint: Tint) => committedTints.push(tint),
		},
	})

	const switchTo = (rowId: string) => {
		committedTints.length = 0
		act(() => joined.selectSpace(rowId))
		return committedTints
	}
	const changeStudioColour = async (colour: JoinedSpace["colour"]) => {
		listed = [{ ...STUDIO, colour }]
		await act(async () => announceChange())
	}

	return { home, switchTo, changeStudioColour }
}

it("paints html with the open joined Space colour, follows its changes, and returns to the owned colour", async () => {
	const { home, switchTo, changeStudioColour } = await mountTintedWorkspace()

	expect(tintOnRoot()).toEqual(tintOf("cyan"))

	expect(switchTo(joinedRowIdOf(STUDIO.id))).toEqual([tintOf("purple")])

	await changeStudioColour("orange")

	await waitFor(() => expect(tintOnRoot()).toEqual(tintOf("orange")))

	expect(switchTo(home.id)).toEqual([tintOf("cyan")])
})
