// @vitest-environment happy-dom

import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import {
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"

import { createFakeNotificationPort } from "./fake-notification-port"
import type { NotificationPort } from "./notification-port"
import { startNotificationSource } from "./notification-source"

import { initialChatState } from "../chat/chat-state"
import { createSpokenWords } from "../conversations/spoken-words"
import { createFakeMissions } from "../missions/fake-missions"

const CLICK_FAILURE_TITLE =
	"Notifications won’t open their conversation. Restart Kiroshi to fix it."

const REVEAL_FAILURE_TITLE =
	"Couldn’t bring Kiroshi to the front. Switch to it yourself."

const CONTROL_TITLE = "Positive control"

const failingReveal = () => Promise.reject(new Error("window is gone"))

const throwingReveal = (): Promise<void> => {
	throw new Error("window is gone")
}

const SWITCHES = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const idleChat = {
	stateFor: () => initialChatState,
	subscribe: () => () => undefined,
}

const idleRuntimes = {
	heldFor: () => null,
	subscribe: () => () => undefined,
}

const emptyRoster = {
	getState: () => ({ rosters: {}, conversations: [], conversationRosters: {} }),
	subscribe: () => () => undefined,
	spaceOfConversation: () => undefined,
	hostSpaceIdOf: (spaceRowId: string) => spaceRowId,
	select: () => undefined,
	selectConversation: () => undefined,
}

type Watch = {
	notifications: NotificationPort
	raiseWindow?: () => Promise<void>
}

const watchAlongside = async ({
	notifications,
	raiseWindow = async () => undefined,
}: Watch) => {
	render(createElement(NoticeSurface))

	startNotificationSource({
		chat: idleChat,
		runtimes: idleRuntimes,
		roster: emptyRoster,
		spaces: { select: () => undefined },
		joinedSpaces: {
			getState: () => ({ joinedSpaces: [] }),
			selectSpace: () => undefined,
		},
		missions: createFakeMissions(),
		spokenWords: createSpokenWords(),
		notifications,
		switches: () => SWITCHES,
		hasFocus: () => false,
		watchFocus: async () => () => undefined,
		raiseWindow,
		playChime: () => undefined,
		reportFailure: raiseFailureNotice,
	})
	await Promise.resolve()
}

const noticesOnScreen = () => {
	const surface = screen.getByRole("region", { name: "Notices" })

	return [
		...within(surface).queryAllByRole("alertdialog", { hidden: true }),
		...within(surface).queryAllByRole("dialog", { hidden: true }),
	]
}

afterEach(() => {
	cleanup()
})

it("shows the reader why clicking a notification stopped working", async () => {
	const notifications = createFakeNotificationPort()
	notifications.onActivate = () => Promise.reject(new Error("no listener"))

	await watchAlongside({ notifications })

	const [notice] = await waitFor(() => {
		const notices = noticesOnScreen()
		expect(notices).toHaveLength(1)
		return notices
	})

	expect(within(notice).getByText(CLICK_FAILURE_TITLE)).toBeTruthy()
	expect(within(notice).getByText("no listener")).toBeTruthy()
})

it("leaves the surface empty while every subscription holds", async () => {
	await watchAlongside({ notifications: createFakeNotificationPort() })

	expect(noticesOnScreen()).toEqual([])
})

it("shows the reader why the window stayed behind on a notification click", async () => {
	const notifications = createFakeNotificationPort()

	await watchAlongside({
		notifications,
		raiseWindow: failingReveal,
	})

	notifications.activate({ kind: "bot", id: "bot-one" })

	const [notice] = await waitFor(() => {
		const notices = noticesOnScreen()
		expect(notices).toHaveLength(1)
		return notices
	})

	expect(within(notice).getByText(REVEAL_FAILURE_TITLE)).toBeTruthy()
	expect(within(notice).getByText("window is gone")).toBeTruthy()
})

it("reports a reveal failure once however many notifications are clicked", async () => {
	const notifications = createFakeNotificationPort()

	await watchAlongside({
		notifications,
		raiseWindow: failingReveal,
	})

	notifications.activate({ kind: "bot", id: "bot-one" })
	notifications.activate({ kind: "conversation", id: "room-one" })

	await waitFor(() => {
		expect(noticesOnScreen()).toHaveLength(1)
	})
})

it("shows the reader why a reveal that threw on the spot stayed behind", async () => {
	const notifications = createFakeNotificationPort()

	await watchAlongside({
		notifications,
		raiseWindow: throwingReveal,
	})

	notifications.activate({ kind: "bot", id: "bot-one" })
	notifications.activate({ kind: "conversation", id: "room-one" })

	const [notice] = await waitFor(() => {
		const notices = noticesOnScreen()
		expect(notices).toHaveLength(1)
		return notices
	})

	expect(within(notice).getByText(REVEAL_FAILURE_TITLE)).toBeTruthy()
	expect(within(notice).getByText("window is gone")).toBeTruthy()
})

it("leaves the surface empty when a click reveals the window", async () => {
	const notifications = createFakeNotificationPort()

	await watchAlongside({ notifications })

	notifications.activate({ kind: "bot", id: "bot-one" })
	raiseFailureNotice({ title: CONTROL_TITLE })

	await screen.findAllByText(CONTROL_TITLE)

	const notices = noticesOnScreen()

	expect(notices).toHaveLength(1)
	expect(within(notices[0]).getByText(CONTROL_TITLE)).toBeTruthy()
})
