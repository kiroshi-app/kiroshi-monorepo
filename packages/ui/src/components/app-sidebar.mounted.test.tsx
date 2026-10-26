// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	AppSidebar,
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarSection,
	type Space,
} from "@workspace/ui/components/app-sidebar"
import { blotTint } from "@workspace/ui/components/companion-colour"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import "@workspace/ui/lib/i18n"

const ATLAS: AppSidebarBot = {
	id: "atlas",
	name: "Atlas",
	lastMessage: "Pulled the three papers.",
	timestamp: "09:24",
	badge: "attention",
}

const REVIEW: AppSidebarConversation = {
	id: "review",
	name: "Launch review",
	participants: [ATLAS],
	lastMessage: "Both green.",
	timestamp: "09:20",
	badge: "done",
}

const AVATARS =
	'[data-slot="bot-identity-avatar"], [data-slot="conversation-subject-icon"]'

const dotsInRoster = () => {
	const { container } = render(
		<WorkspaceShell
			sidebar={<AppSidebar bots={[ATLAS]} conversations={[REVIEW]} />}
		>
			{null}
		</WorkspaceShell>,
	)

	return [
		...container.querySelectorAll<HTMLElement>(
			'[data-slot="bot-activity-dot"]',
		),
	]
}

const badgesOf = (dots: HTMLElement[]) => dots.map((dot) => dot.dataset.badge)

const onAvatars = (dots: HTMLElement[]) =>
	dots.map((dot) => Boolean(dot.closest(AVATARS)))

describe("AppSidebar roster badge placement mounted", () => {
	afterEach(cleanup)

	it("draws the companion and conversation dots outside the avatars", () => {
		const dots = dotsInRoster()

		expect(badgesOf(dots)).toEqual([REVIEW.badge, ATLAS.badge])
		expect(onAvatars(dots)).toEqual([false, false])
	})
})

const SPACES: Space[] = [
	{ id: "personal", name: "Personal", colour: "blue" },
	{ id: "vocca", name: "Vocca", colour: "green" },
	{ id: "labs", name: "Labs", colour: "red" },
]

const RESEARCH: AppSidebarSection = {
	id: "research",
	name: "Research",
	position: 0,
}

const FILED: AppSidebarBot = {
	...ATLAS,
	sectionId: RESEARCH.id,
	pinPosition: 1,
}

const researchHeaderIn = (container: HTMLElement) => {
	const name = container.querySelector<HTMLElement>(
		'[data-slot="roster-section-name"]',
	)
	if (!name?.parentElement) throw new Error("No section header on screen")
	return name.parentElement
}

const shellOnSpace = (selectedSpaceId: string) => (
	<WorkspaceShell
		sidebar={
			<AppSidebar
				bots={[FILED]}
				botsBySpaceId={{ personal: [FILED], vocca: [], labs: [] }}
				collapsedSectionIds={[RESEARCH.id]}
				sectionsBySpaceId={{ personal: [RESEARCH], vocca: [], labs: [] }}
				selectedSpaceId={selectedSpaceId}
				spaces={SPACES}
			/>
		}
	>
		{null}
	</WorkspaceShell>
)

describe("AppSidebar section collapse across spaces mounted", () => {
	afterEach(cleanup)

	it("keeps a section shut once the reader leaves the space and comes back", () => {
		const { container, rerender } = render(shellOnSpace("personal"))

		expect(researchHeaderIn(container).getAttribute("aria-expanded")).toBe(
			"false",
		)

		rerender(shellOnSpace("labs"))

		expect(
			container.querySelector('[data-slot="roster-section-name"]'),
		).toBeNull()

		cleanup()
		const { container: revisited } = render(shellOnSpace("personal"))

		expect(researchHeaderIn(revisited).getAttribute("aria-expanded")).toBe(
			"false",
		)
	})
})

const AT_NINE = 1_700_000_000_000

const BEACON: AppSidebarBot = {
	id: "beacon",
	name: "Beacon",
	lastActivityAt: AT_NINE + 2_000,
}

const OLDER_ATLAS: AppSidebarBot = { ...ATLAS, lastActivityAt: AT_NINE }

const MIDDLE_REVIEW: AppSidebarConversation = {
	...REVIEW,
	lastActivityAt: AT_NINE + 1_000,
}

const rowNamesIn = (container: HTMLElement) =>
	[
		...container.querySelectorAll<HTMLElement>('[data-slot="roster-row-name"]'),
	].map((name) => name.textContent)

describe("AppSidebar merged roster order mounted", () => {
	afterEach(cleanup)

	it("interleaves companions and conversations by their last activity", () => {
		const { container } = render(
			<WorkspaceShell
				sidebar={
					<AppSidebar
						bots={[BEACON, OLDER_ATLAS]}
						conversations={[MIDDLE_REVIEW]}
					/>
				}
			>
				{null}
			</WorkspaceShell>,
		)

		expect(rowNamesIn(container)).toEqual([
			BEACON.name,
			MIDDLE_REVIEW.name,
			OLDER_ATLAS.name,
		])
	})
})

const railLogoIn = (container: HTMLElement) => {
	const logo = container.querySelector<HTMLElement>(
		'[data-slot="app-rail"] [data-slot="space-dot"]',
	)
	if (!logo) throw new Error("No rail logo on screen")
	return logo
}

const shellWithSpace = (space?: Space) => (
	<WorkspaceShell
		sidebar={
			<AppSidebar
				bots={[ATLAS]}
				conversations={[REVIEW]}
				selectedSpaceId="personal"
				space={space}
				spaces={SPACES}
			/>
		}
	>
		{null}
	</WorkspaceShell>
)

describe("AppSidebar rail logo colour mounted", () => {
	afterEach(cleanup)

	it("paints the logo with the space it is handed, not the selected entry of the list", () => {
		const { container } = render(shellWithSpace(SPACES[2]))

		expect(railLogoIn(container).style.backgroundColor).toBe(blotTint("red"))
	})

	it("leaves the logo untinted while no space is handed, whatever the list selects", () => {
		const { container } = render(shellWithSpace())

		expect(railLogoIn(container).style.backgroundColor).toBe("")
	})
})
