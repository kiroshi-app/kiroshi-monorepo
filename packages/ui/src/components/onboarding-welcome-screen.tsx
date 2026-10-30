"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { hueOf } from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	OnboardingContent,
	OnboardingControls,
	OnboardingHeading,
	OnboardingShell,
} from "@workspace/ui/components/onboarding-shell"
import { OnboardingWelcomeFooter } from "@workspace/ui/components/onboarding-welcome-footer"
import { SpaceAvatar } from "@workspace/ui/components/space-avatar"
import { cn } from "@workspace/ui/lib/utils"

type OnboardingWelcomeStep = "companions" | "conversations" | "spaces" | "tools"

type OnboardingWelcomeScreenProps = {
	step: OnboardingWelcomeStep
	onSkip: () => void
	onBack: () => void
	onNext: () => void
}

const STEPS: OnboardingWelcomeStep[] = [
	"companions",
	"conversations",
	"spaces",
	"tools",
]

const ATLAS_HUE = hueOf("cyan")
const JUNIPER_HUE = hueOf("green")
const WREN_HUE = hueOf("pink")

const COMPANIONS = [
	{ id: "atlas", hue: ATLAS_HUE, isFeatured: false },
	{ id: "juniper", hue: JUNIPER_HUE, isFeatured: true },
	{ id: "wren", hue: WREN_HUE, isFeatured: false },
] as const

const CARD_CLASS = "rounded-bubble border border-border bg-card"

const CompanionsIllustration = () => {
	const { t } = useTranslation("chat")

	return (
		<div className="flex max-w-full flex-wrap items-end justify-center gap-x-7 gap-y-4">
			{COMPANIONS.map(({ id, hue, isFeatured }) => (
				<div
					className={cn(
						"flex w-35 flex-col items-center gap-1.5 text-center",
						isFeatured && "pb-7",
					)}
					key={id}
				>
					<BotIdentityAvatar
						hue={hue}
						name={t(`onboarding.intro.companions.${id}.name`)}
						size={isFeatured ? 132 : 96}
					/>
					<p className="pt-2 font-medium text-compact text-foreground leading-4.5">
						{t(`onboarding.intro.companions.${id}.name`)}
					</p>
					<BotTitleBadge
						className="grow-0 basis-auto whitespace-normal rounded-[calc(var(--spacing)*1.75)] py-0 leading-3.5"
						title={t(`onboarding.intro.companions.${id}.job`)}
					/>
				</div>
			))}
		</div>
	)
}

const ConversationsIllustration = () => {
	const { t } = useTranslation("chat")
	const juniper = t("onboarding.intro.companions.juniper.name")
	const wren = t("onboarding.intro.companions.wren.name")

	return (
		<div className="flex w-110 max-w-full flex-col gap-3">
			<div className={cn("flex flex-col gap-3.5 p-4.5", CARD_CLASS)}>
				<div className="flex items-center gap-2">
					<div className="flex w-11 shrink-0 items-center">
						<BotIdentityAvatar hue={JUNIPER_HUE} name={juniper} size={24} />
						<BotIdentityAvatar
							className="-ms-1.5"
							hue={WREN_HUE}
							name={wren}
							size={24}
						/>
					</div>
					<p className="min-w-0 font-semibold text-compact text-foreground leading-4.5">
						{t("onboarding.intro.conversations.thread")}
					</p>
				</div>
				<MessageBubble
					align="end"
					className="max-w-75 self-end"
					variant="solid"
				>
					<MessageBubbleContent>
						{t("onboarding.intro.conversations.ask")}
					</MessageBubbleContent>
				</MessageBubble>
				<div className="flex items-end gap-2">
					<BotIdentityAvatar hue={WREN_HUE} name={wren} size={24} />
					<MessageBubble className="min-w-0 max-w-80" variant="soft">
						<MessageBubbleContent>
							{t("onboarding.intro.conversations.reply")}
						</MessageBubbleContent>
					</MessageBubble>
				</div>
			</div>
			<div className={cn("flex items-center gap-3 px-4.5 py-3.5", CARD_CLASS)}>
				<BotIdentityAvatar hue={WREN_HUE} name={wren} size={32} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<p className="font-semibold text-compact text-foreground leading-4.5">
						{t("onboarding.intro.conversations.mission")}
					</p>
					<p className="text-muted-foreground text-xs">
						{t("onboarding.intro.conversations.missionDetail")}
					</p>
				</div>
				<span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 font-medium text-foreground text-xs">
					<span
						aria-hidden="true"
						className="size-1.5 rounded-full bg-primary"
					/>
					{t("onboarding.intro.conversations.status")}
				</span>
			</div>
		</div>
	)
}

const SPACES = [
	{
		id: "orbit",
		hue: hueOf("blue"),
		companions: [
			{ id: "atlas", hue: ATLAS_HUE },
			{ id: "juniper", hue: JUNIPER_HUE },
		],
	},
	{
		id: "newsletter",
		hue: hueOf("orange"),
		companions: [{ id: "wren", hue: WREN_HUE }],
	},
] as const

const SpacesIllustration = () => {
	const { t } = useTranslation("chat")

	return (
		<div className="flex w-110 max-w-full flex-wrap gap-3">
			{SPACES.map(({ id, hue, companions }) => (
				<div
					className={cn(
						"flex min-w-36 flex-1 flex-col gap-3.5 p-4.5",
						CARD_CLASS,
					)}
					key={id}
				>
					<div className="flex items-center gap-3">
						<SpaceAvatar
							colour={hue}
							name={t(`onboarding.intro.spaces.${id}.name`)}
							size={36}
							spaceId={id}
						/>
						<p className="min-w-0 break-words font-semibold text-foreground text-sm">
							{t(`onboarding.intro.spaces.${id}.name`)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex shrink-0 items-center">
							{companions.map((companion, index) => (
								<BotIdentityAvatar
									className={cn(index > 0 && "-ms-1.5")}
									hue={companion.hue}
									key={companion.id}
									name={t(`onboarding.intro.companions.${companion.id}.name`)}
									size={24}
								/>
							))}
						</div>
						<p className="min-w-0 text-muted-foreground text-xs">
							{t(`onboarding.intro.spaces.${id}.detail`)}
						</p>
					</div>
				</div>
			))}
		</div>
	)
}

const TOOLS = [
	{ id: "folders", Icon: Icons.Folder, isMono: true },
	{ id: "applications", Icon: Icons.Server, isMono: false },
	{ id: "secrets", Icon: Icons.Json, isMono: true },
] as const

const ToolsIllustration = () => {
	const { t } = useTranslation("chat")

	return (
		<div className="flex w-130 max-w-full flex-wrap gap-3">
			{TOOLS.map(({ id, Icon, isMono }) => (
				<div
					className={cn(
						"flex min-w-36 flex-1 flex-col gap-3.5 p-4.5",
						CARD_CLASS,
					)}
					key={id}
				>
					<span className="grid size-10 place-items-center rounded-control bg-muted">
						<Icon aria-hidden="true" className="size-5 text-foreground" />
					</span>
					<div className="flex flex-col gap-0.5">
						<p className="font-semibold text-foreground text-sm">
							{t(`onboarding.intro.tools.${id}`)}
						</p>
						<p
							className={cn(
								"break-words text-muted-foreground text-xs",
								isMono && "font-mono",
							)}
						>
							{t(`onboarding.intro.tools.${id}Detail`)}
						</p>
					</div>
				</div>
			))}
		</div>
	)
}

const ILLUSTRATIONS: Record<OnboardingWelcomeStep, () => ReactNode> = {
	companions: CompanionsIllustration,
	conversations: ConversationsIllustration,
	spaces: SpacesIllustration,
	tools: ToolsIllustration,
}

const OnboardingWelcomeScreen = ({
	step,
	onSkip,
	onBack,
	onNext,
}: OnboardingWelcomeScreenProps) => {
	const { t } = useTranslation("chat")
	const Illustration = ILLUSTRATIONS[step]
	const position = STEPS.indexOf(step) + 1

	return (
		<OnboardingShell data-step={step} data-slot="onboarding-welcome-screen">
			<OnboardingContent className="gap-10 pb-7">
				<Illustration />
				<OnboardingHeading
					body={t(`onboarding.intro.${step}.body`)}
					title={t(`onboarding.intro.${step}.title`)}
					variant="welcome"
				/>
			</OnboardingContent>
			<OnboardingControls>
				<OnboardingWelcomeFooter
					onBack={onBack}
					onNext={onNext}
					onSkip={onSkip}
					step={position}
					total={STEPS.length}
				/>
			</OnboardingControls>
		</OnboardingShell>
	)
}

export {
	OnboardingWelcomeScreen,
	type OnboardingWelcomeScreenProps,
	type OnboardingWelcomeStep,
}
