"use client"

import { useTranslation } from "react-i18next"

import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import {
	INNER,
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"
import { OnboardingDragStrip } from "@workspace/ui/components/onboarding-shell"
import { Button } from "@workspace/ui/components/ui/button"
import {
	ACCOUNT_ACTION_CLASS,
	AccountCard,
	AccountIntro,
	type AccountState,
	SignInActions,
} from "@workspace/ui/components/user-settings-dialog/account-panel"
import { cn } from "@workspace/ui/lib/utils"

type OnboardingAccountScreenProps = {
	account: AccountState
	image?: string
	onSignIn: () => void
	onCancel: () => void
	onCopySignInLink: () => void
	onSkip: () => void
	onContinue: () => void
}

const SKIP_CLASS =
	"relative rounded-xs font-medium text-compact text-foreground leading-4.5 underline decoration-1 underline-offset-2 outline-offset-2 after:absolute after:-inset-1"

const RING_VIEW_BOX = `0 ${OUTER.halfWidth - OUTER.halfHeight} ${OUTER.halfWidth * 2} ${OUTER.halfHeight * 2}`

const RING_PATH = `${roundedHexagonPath(OUTER)} ${roundedHexagonPath(INNER, OUTER.halfWidth)}`

const KiroshiRing = () => (
	<svg
		aria-hidden="true"
		className="pointer-events-none h-29 w-32 shrink-0 text-foreground"
		data-slot="onboarding-account-mark"
		fill="currentColor"
		viewBox={RING_VIEW_BOX}
	>
		<path d={RING_PATH} fillRule="evenodd" />
	</svg>
)

const SIGNED_OUT_INTRO = {
	title: "account.signedOut.title",
	body: "account.onboarding.body",
} as const

const SIGNED_IN_INTRO = {
	title: "account.onboarding.signedIn.title",
	body: "account.onboarding.signedIn.body",
} as const

const OnboardingAccountScreen = ({
	account,
	image,
	onSignIn,
	onCancel,
	onCopySignInLink,
	onSkip,
	onContinue,
}: OnboardingAccountScreenProps) => {
	const { t } = useTranslation("settings")
	const intro =
		account.status === "signedIn" ? SIGNED_IN_INTRO : SIGNED_OUT_INTRO

	return (
		<FullWindowLayout
			data-slot="onboarding-account-screen"
			data-status={account.status}
		>
			<OnboardingDragStrip />
			<FullWindowContent className="gap-5 p-6">
				<div className="flex flex-col items-center gap-8">
					<KiroshiRing />
					<AccountIntro
						body={t(intro.body)}
						layout="screen"
						title={t(intro.title)}
					/>
				</div>
				{account.status === "signedIn" ? (
					<div className="flex w-110 max-w-full flex-col gap-5">
						<AccountCard
							email={account.email}
							image={image}
							name={account.name}
							plan={account.plan}
						/>
						<Button
							className={cn(ACCOUNT_ACTION_CLASS.screen, "self-center")}
							onClick={onContinue}
							size="lg"
						>
							{t("account.onboarding.signedIn.continue")}
						</Button>
					</div>
				) : (
					<>
						<SignInActions
							isWaiting={account.status === "waiting"}
							layout="screen"
							onCancel={onCancel}
							onCopySignInLink={onCopySignInLink}
							onSignIn={onSignIn}
						/>
						<div className="flex justify-center pt-1">
							<button className={SKIP_CLASS} onClick={onSkip} type="button">
								{t("account.onboarding.skip")}
							</button>
						</div>
					</>
				)}
			</FullWindowContent>
		</FullWindowLayout>
	)
}

export { OnboardingAccountScreen, type OnboardingAccountScreenProps }
