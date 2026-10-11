import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { listen } from "./index"

import {
	commands,
	HOSTING_CHANGED_EVENT,
	type HostingChanged,
	type HostingState,
} from "../bindings"
import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"

type HostingControllerState = {
	hosting: HostingState | undefined
}

export type HostedSpace = {
	id: string
	name: string
}

export type HostingTransport = {
	read: (spaceId: string) => Promise<HostingState>
	start: (spaceId: string) => Promise<HostingState>
	stop: (spaceId: string) => Promise<HostingState>
	onChanged: (
		listener: (changed: HostingChanged) => void,
	) => Promise<() => void>
}

type HostingController = {
	getState: () => HostingControllerState
	subscribe: (listener: () => void) => () => void
	watch: (space: HostedSpace) => () => void
	start: () => void
	stop: () => void
}

type HostingControllerOptions = {
	transport?: HostingTransport
	reportFailure?: (message: NoticeMessage) => void
}

const answerOf = async (
	pending: ReturnType<typeof commands.hostingStart>,
): Promise<HostingState> => {
	const result = await pending
	if (result.status === "error") {
		throw new Error(result.error.kind)
	}
	return result.data
}

const hostingTransport: HostingTransport = {
	read: commands.hostingState,
	start: (spaceId) => answerOf(commands.hostingStart(spaceId)),
	stop: (spaceId) => answerOf(commands.hostingStop(spaceId)),
	onChanged: (listener) =>
		listen<HostingChanged>(HOSTING_CHANGED_EVENT, (event) =>
			listener(event.payload),
		),
}

const failureOf = (space: HostedSpace): NoticeMessage => ({
	title: i18n.t("settings:space.hosting.failed.title", { name: space.name }),
	description: i18n.t("settings:space.hosting.failed.description"),
})

const stopFailureOf = (space: HostedSpace): NoticeMessage => ({
	title: i18n.t("settings:space.hosting.stopFailed.title", {
		name: space.name,
	}),
	description: i18n.t("settings:space.hosting.stopFailed.description"),
})

type Attempt = {
	isReported: boolean
}

type Session = {
	space: HostedSpace
	hasSettled: boolean
	attempt: Attempt | null
}

export const createHostingController = ({
	transport = hostingTransport,
	reportFailure = failureReporterIn("hosting-controller"),
}: HostingControllerOptions = {}): HostingController => {
	const stateStore = createStore<HostingControllerState>({
		hosting: undefined,
	})
	let current: Session | null = null
	let lastWatchedId: string | null = null

	const reportAttempt = (attempt: Attempt, notice: NoticeMessage) => {
		if (attempt.isReported) return
		attempt.isReported = true
		reportFailure(notice)
	}

	const settle = (
		session: Session,
		hosting: HostingState,
		attempt: Attempt | null,
	) => {
		const wasFailed = stateStore.getState().hosting?.kind === "failed"
		session.hasSettled = true
		stateStore.setState({ hosting })
		if (hosting.kind !== "failed") return
		if (attempt) {
			reportAttempt(attempt, failureOf(session.space))
		} else if (!wasFailed) {
			reportFailure(failureOf(session.space))
		}
	}

	const read = (session: Session) => {
		void transport.read(session.space.id).then(
			(hosting) => {
				if (current === session && !session.hasSettled) {
					settle(session, hosting, null)
				}
			},
			() => {
				if (current === session) reportFailure(failureOf(session.space))
			},
		)
	}

	const watch = (space: HostedSpace) => {
		const session: Session = { space, hasSettled: false, attempt: null }
		current = session
		if (lastWatchedId !== space.id) {
			stateStore.setState({ hosting: undefined })
		}
		lastWatchedId = space.id
		read(session)
		const detach = transport
			.onChanged((changed) => {
				if (current === session && changed.spaceId === space.id) {
					settle(session, changed.state, session.attempt)
				}
			})
			.catch(() => reportFailure(failureOf(space)))
		return () => {
			if (current === session) current = null
			void detach.then((unlisten) => unlisten?.())
		}
	}

	const command =
		(
			run: (spaceId: string) => Promise<HostingState>,
			rejectionOf: (space: HostedSpace) => NoticeMessage,
		) =>
		() => {
			const session = current
			if (!session) return
			const attempt: Attempt = { isReported: false }
			session.attempt = attempt
			void run(session.space.id)
				.then(
					(hosting) => {
						if (current === session) settle(session, hosting, attempt)
					},
					() => {
						if (current === session) {
							reportAttempt(attempt, rejectionOf(session.space))
						}
					},
				)
				.finally(() => {
					if (session.attempt === attempt) session.attempt = null
				})
		}

	return {
		getState: stateStore.getState,
		subscribe: stateStore.subscribe,
		watch,
		start: command(transport.start, failureOf),
		stop: command(transport.stop, stopFailureOf),
	}
}
