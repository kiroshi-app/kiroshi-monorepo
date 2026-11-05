import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { useTranslation } from "react-i18next"

import type { BoardRouting } from "@workspace/ui/components/board-view"
import { Icons } from "@workspace/ui/components/icons"
import { RadioGroup } from "@workspace/ui/components/ui/radio-group"

const BOARD_ROUTINGS: readonly BoardRouting[] = ["straight", "elbow"]

const ROUTING_GLYPH: Record<BoardRouting, typeof Icons.ConnectorElbow> = {
	straight: Icons.ConnectorStraight,
	elbow: Icons.ConnectorElbow,
}

type BoardConnectorFlyoutProps = {
	routing: BoardRouting
	onRoutingChange: (routing: BoardRouting) => void
}

const BoardConnectorFlyout = ({
	routing,
	onRoutingChange,
}: BoardConnectorFlyoutProps) => {
	const { t } = useTranslation("common")

	return (
		<RadioGroup
			aria-label={t("board.connectorFlyout.label")}
			className="flex w-auto gap-1 rounded-[10px] bg-board-control p-1 shadow-board-control"
			data-slot="board-connector-flyout"
			onValueChange={(value: BoardRouting) => onRoutingChange(value)}
			value={routing}
		>
			{BOARD_ROUTINGS.map((option) => {
				const Glyph = ROUTING_GLYPH[option]
				return (
					<RadioPrimitive.Root
						className="flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 font-medium text-board-control-foreground text-compact leading-4 outline-none transition-none focus-visible:ring-3 focus-visible:ring-ring/30 data-checked:bg-board-control-selected data-checked:font-semibold data-checked:text-primary"
						data-slot="board-connector-option"
						key={option}
						value={option}
					>
						<Glyph aria-hidden="true" className="size-4 shrink-0" />
						{t(`board.connectorFlyout.routing.${option}`)}
					</RadioPrimitive.Root>
				)
			})}
		</RadioGroup>
	)
}

export { BoardConnectorFlyout, type BoardConnectorFlyoutProps }
