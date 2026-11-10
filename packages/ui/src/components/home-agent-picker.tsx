"use client"

import { Menu } from "@base-ui/react/menu"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"

type HomeAgent = {
	id: string
	name: string
	role?: string
	hue?: number | null
	image?: string
}

type HomeAgentPickerProps = {
	agents: HomeAgent[]
	selected?: HomeAgent
	onSelectAgent: (id: string) => void
}

const CHIP =
	"group/chip flex h-8 min-w-0 shrink items-center gap-1.5 rounded-2xl bg-foreground/5 ps-1.5 pe-2 font-medium text-compact text-soft-foreground leading-4 outline-none hover:bg-foreground/8 focus-visible:ring-3 focus-visible:ring-ring/30 data-popup-open:bg-foreground/12"

const MENU =
	"flex w-72 flex-col gap-0.5 rounded-2xl border border-foreground/10 bg-prompt-surface p-1.5 shadow-popover outline-none"

const PICKER_ALIGN_OFFSET = 48

const ITEM =
	"flex cursor-default items-center gap-2.5 rounded-[10px] p-2 outline-none data-highlighted:bg-foreground/6"

const HomeAgentPicker = ({
	agents,
	selected,
	onSelectAgent,
}: HomeAgentPickerProps) => {
	const { t } = useTranslation("chat")

	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label={selected ? undefined : t("home.composer.agents")}
				className={CHIP}
				data-slot="home-agent-chip"
			>
				{selected ? (
					<>
						<span aria-hidden="true" className="flex shrink-0">
							<BotIdentityAvatar
								hue={selected.hue}
								image={selected.image}
								name={selected.name}
								seed={selected.id}
								size={20}
							/>
						</span>
						<span className="min-w-0 truncate">{selected.name}</span>
					</>
				) : null}
				<Icons.Expand
					aria-hidden="true"
					className="size-3 shrink-0 group-data-popup-open/chip:rotate-180"
				/>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner
					align="end"
					alignOffset={PICKER_ALIGN_OFFSET}
					className="z-50"
					sideOffset={8}
				>
					<Menu.Popup className={MENU} data-slot="home-agent-menu">
						<Menu.Group className="flex flex-col gap-0.5">
							<Menu.GroupLabel className="p-2 font-medium text-muted-foreground text-xs leading-4">
								{t("home.composer.agents")}
							</Menu.GroupLabel>
							<Menu.RadioGroup
								className="flex flex-col gap-0.5"
								onValueChange={(id: string) => onSelectAgent(id)}
								value={selected?.id ?? null}
							>
								{agents.map((agent) => (
									<Menu.RadioItem
										className={ITEM}
										closeOnClick
										key={agent.id}
										value={agent.id}
									>
										<span aria-hidden="true" className="flex shrink-0">
											<BotIdentityAvatar
												hue={agent.hue}
												image={agent.image}
												name={agent.name}
												seed={agent.id}
												size={24}
											/>
										</span>
										<span className="flex min-w-0 grow basis-0 items-center gap-1.5">
											<span className="min-w-0 truncate font-medium text-foreground text-sm leading-4.5">
												{agent.name}
											</span>
											<BotTitleBadge title={agent.role} variant="line" />
										</span>
										<span className="flex size-4 shrink-0 items-center justify-center">
											<Menu.RadioItemIndicator>
												<Icons.Check
													aria-hidden="true"
													className="size-4 text-primary"
												/>
											</Menu.RadioItemIndicator>
										</span>
									</Menu.RadioItem>
								))}
							</Menu.RadioGroup>
						</Menu.Group>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	)
}

export { type HomeAgent, HomeAgentPicker, type HomeAgentPickerProps }
