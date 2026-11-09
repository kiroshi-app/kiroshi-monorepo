"use client"

import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { GreetingPeriod } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"

const GREETING = "flex items-center justify-center gap-3 pb-3"

type HomeGreetingProps = {
	agent: HomeAgent
	period: GreetingPeriod
	firstName?: string
}

const HomeGreeting = ({ agent, period, firstName }: HomeGreetingProps) => {
	const { t } = useTranslation("chat")
	const greeting = firstName
		? t(`home.greeting.${period}`, { name: firstName })
		: t(`home.greeting.${period}Unnamed`)

	return (
		<div className={GREETING} data-slot="home-greeting">
			<BotIdentityAvatar
				hue={agent.hue}
				image={agent.image}
				name={agent.name}
				seed={agent.id}
				size={36}
			/>
			<h1 className="min-w-0 text-balance font-normal text-3xl text-foreground tracking-[-0.02em] wrap-break-word">
				{greeting}
			</h1>
		</div>
	)
}

const HomeGreetingSkeleton = () => (
	<div className={GREETING} data-slot="home-greeting-skeleton">
		<Skeleton className="size-9 rounded-lg bg-foreground/6" />
		<Skeleton className="h-7 w-75 max-w-full rounded-md bg-foreground/6" />
	</div>
)

export { HomeGreeting, type HomeGreetingProps, HomeGreetingSkeleton }
