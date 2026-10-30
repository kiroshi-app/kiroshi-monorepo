"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
	INNER,
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"
import {
	OnboardingContent,
	OnboardingControls,
	OnboardingSecondaryButton,
	OnboardingShell,
} from "@workspace/ui/components/onboarding-shell"
import { Button } from "@workspace/ui/components/ui/button"
import {
	ACCOUNT_ACTION_CLASS,
	AccountCard,
	AccountIntro,
	type AccountState,
	SignInActions,
} from "@workspace/ui/components/user-settings-dialog/account-panel"

type OnboardingAccountScreenProps = {
	account: AccountState
	image?: string
	onSignIn: () => void
	onCancel: () => void
	onCopySignInLink: () => void
	onSkip: () => void
	onContinue: () => void
}

const RING_VIEW_BOX = `0 ${OUTER.halfWidth - OUTER.halfHeight} ${OUTER.halfWidth * 2} ${OUTER.halfHeight * 2}`

const OUTER_PATH = roundedHexagonPath(OUTER)

const INNER_PATH = roundedHexagonPath(INNER)

const INNER_OFFSET = OUTER.halfWidth - INNER.halfWidth

const KiroshiRing = () => {
	const holeId = useId()

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none h-29 w-32 shrink-0 text-foreground"
			data-slot="onboarding-account-mark"
			fill="currentColor"
			viewBox={RING_VIEW_BOX}
		>
			<mask id={holeId}>
				<path d={OUTER_PATH} fill="white" />
				<path
					d={INNER_PATH}
					fill="black"
					transform={`translate(${INNER_OFFSET} ${INNER_OFFSET})`}
				/>
			</mask>
			<path d={OUTER_PATH} mask={`url(#${holeId})`} />
		</svg>
	)
}

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
		<OnboardingShell
			data-slot="onboarding-account-screen"
			data-status={account.status}
		>
			<OnboardingContent className="gap-5">
				<div className="flex flex-col items-center gap-8">
					<KiroshiRing />
					<AccountIntro
						body={t(intro.body)}
						layout="screen"
						title={t(intro.title)}
					/>
				</div>
				{account.status === "signedIn" ? (
					<div className="flex w-110 max-w-full flex-col">
						<AccountCard
							email={account.email}
							image={image}
							name={account.name}
							plan={account.plan}
						/>
					</div>
				) : null}
			</OnboardingContent>
			<OnboardingControls>
				{account.status === "signedIn" ? (
					<Button
						className={ACCOUNT_ACTION_CLASS.screen}
						onClick={onContinue}
						size="lg"
					>
						{t("account.onboarding.signedIn.continue")}
					</Button>
				) : (
					<>
						<SignInActions
							isWaiting={account.status === "waiting"}
							layout="screen"
							onCancel={onCancel}
							onCopySignInLink={onCopySignInLink}
							onSignIn={onSignIn}
						/>
						<OnboardingSecondaryButton onClick={onSkip}>
							{t("account.onboarding.skip")}
						</OnboardingSecondaryButton>
					</>
				)}
			</OnboardingControls>
		</OnboardingShell>
	)
}

export { OnboardingAccountScreen, type OnboardingAccountScreenProps }
