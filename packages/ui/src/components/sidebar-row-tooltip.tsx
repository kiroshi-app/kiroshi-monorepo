import { formatSentDate } from "@workspace/ui/components/message"

const CARD = "flex min-w-0 flex-col gap-2"

const GROUP = "flex flex-col gap-1"

const HEADING = "font-medium"

const MESSAGE = "line-clamp-4"

type SidebarRowTooltipFields = {
	heading: string
	agents?: string
	message?: string
	spokenAt?: number
}

const describeSidebarRowTooltip = ({
	heading,
	agents,
	message,
	spokenAt,
}: SidebarRowTooltipFields) =>
	[
		heading,
		agents,
		message,
		spokenAt === undefined ? undefined : formatSentDate(spokenAt),
	]
		.filter(Boolean)
		.join("\n")

const SidebarRowTooltip = ({
	heading,
	agents,
	message,
	spokenAt,
}: SidebarRowTooltipFields) => (
	<span className={CARD} data-slot="sidebar-row-tooltip">
		<span className={GROUP}>
			<span className={HEADING} data-slot="sidebar-row-tooltip-heading">
				{heading}
			</span>
			{agents ? (
				<span data-slot="sidebar-row-tooltip-agents">{agents}</span>
			) : null}
		</span>
		{message || spokenAt !== undefined ? (
			<span className={GROUP}>
				{message ? (
					<span className={MESSAGE} data-slot="sidebar-row-tooltip-message">
						{message}
					</span>
				) : null}
				{spokenAt === undefined ? null : (
					<time
						data-slot="sidebar-row-tooltip-time"
						dateTime={new Date(spokenAt).toISOString()}
					>
						{formatSentDate(spokenAt)}
					</time>
				)}
			</span>
		) : null}
	</span>
)

export {
	describeSidebarRowTooltip,
	SidebarRowTooltip,
	type SidebarRowTooltipFields,
}
