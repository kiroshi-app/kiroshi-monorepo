// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { MissionStatus } from "@workspace/ui/components/mission"
import {
	MissionCard,
	type MissionCardProps,
} from "@workspace/ui/components/mission-card"
import { MissionProperties } from "@workspace/ui/components/mission-properties"
import { SidebarProvider } from "@workspace/ui/components/ui/sidebar"

import "@workspace/ui/lib/i18n"

const NOW = new Date("2026-03-04T09:30:00Z").getTime()

const BLANK_STATUS: MissionStatus = { text: " \n\t ", writtenAt: NOW - 240_000 }

const TICKET = {
	externalId: "OPE-30",
	title: "Mission thread screen",
	platform: "linear",
	url: "https://linear.example/kiroshi/issue/OPE-30",
}

const BOT = { name: "Ada Martin", seed: "bot-ada" }

const CARD: Omit<MissionCardProps, "density" | "onOpen"> = {
	id: "mission-ope-30",
	identity: { id: BOT.seed, name: BOT.name },
	objective: "Ship the mission card",
	ticket: TICKET,
	tools: ["GitHub"],
	state: "waiting_human",
	isWorking: false,
	isClosed: false,
	timestamp: "2d",
}

const STATUS_SLOTS =
	'[data-slot="mission-status"], [data-slot="mission-status-time"]'

const open = () => {}

afterEach(cleanup)

describe("a mission status holding only whitespace", () => {
	it("draws no status and no time on the card", () => {
		const { container } = render(
			<MissionCard
				{...CARD}
				density="card"
				now={NOW}
				onOpen={open}
				status={BLANK_STATUS}
			/>,
		)

		expect(container.querySelectorAll(`${STATUS_SLOTS}, time`)).toHaveLength(0)
	})

	it("draws no status and no time on the row", () => {
		const { container } = render(
			<SidebarProvider>
				<ul>
					<MissionCard
						{...CARD}
						density="row"
						now={NOW}
						onOpen={open}
						status={BLANK_STATUS}
					/>
				</ul>
			</SidebarProvider>,
		)

		expect(container.querySelectorAll(`${STATUS_SLOTS}, time`)).toHaveLength(0)
	})

	it("draws no status, no Activity row and no status time in the properties", () => {
		const { container } = render(
			<MissionProperties
				now={NOW}
				openedAt={NOW - 5_400_000}
				status={BLANK_STATUS}
				ticket={TICKET}
			/>,
		)

		expect(container.querySelectorAll(STATUS_SLOTS)).toHaveLength(0)
		expect(
			container.querySelectorAll('[data-property="activity"]'),
		).toHaveLength(0)
		expect(container.querySelectorAll("time")).toHaveLength(0)
	})

	it.each(["row", "card"] as const)(
		"draws no status on the %s given no instant to read it at",
		(density) => {
			const status: MissionStatus = { text: "Running", writtenAt: NOW }
			const { container, queryByText } = render(
				<SidebarProvider>
					<ul>
						<MissionCard
							{...CARD}
							density={density}
							onOpen={open}
							status={status}
						/>
					</ul>
				</SidebarProvider>,
			)

			expect(queryByText("Running")).toBeNull()
			expect(container.querySelectorAll(STATUS_SLOTS)).toHaveLength(0)
		},
	)
})
