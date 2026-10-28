import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

type ConnectionStatusState = "checking" | "ready" | "unavailable" | "crashed"

interface ConnectionStatusProps
	extends Omit<ComponentProps<"div">, "children"> {
	name: string
	state: ConnectionStatusState
	version?: string | null
}

const CONNECTION_STATUS_DOT = {
	checking: "bg-muted-foreground motion-safe:animate-pulse",
	ready: "bg-success",
	unavailable: "bg-destructive",
	crashed: "bg-destructive",
} satisfies Record<ConnectionStatusState, string>

function ConnectionStatus({
	name,
	state,
	version,
	className,
	...props
}: ConnectionStatusProps) {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="connection-status"
			data-state={state}
			className={cn("flex items-center", className)}
			{...props}
		>
			<span
				aria-hidden="true"
				className={cn("size-1.5 rounded-full", CONNECTION_STATUS_DOT[state])}
			/>
			<span role="status" className="sr-only">
				{t(`connection.${state}`, { name })}
				{version ? ` v${version}` : null}
			</span>
		</div>
	)
}

export { ConnectionStatus, type ConnectionStatusState }
