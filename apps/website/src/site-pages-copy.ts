import { REPOSITORY_URL, WEBSITE_COPY } from "./copy"

export const SUPPORT_EMAIL = "support@kiroshi.app"

const RELAY_HOST = "api.kiroshi.app"

const REPOSITORY_ADDRESS = REPOSITORY_URL.replace(/^https:\/\//, "")

const { pro } = WEBSITE_COPY.pricing

export const SITE_PAGES_COPY = {
	footerNavigation: "Site",
	homeLink: "Kiroshi home",
	privacy: {
		navLabel: "Privacy",
		title: "Privacy policy",
		sections: [
			{
				heading: "Who we are",
				body: [
					"Kiroshi, an independent project run from France by Steve Puget, is responsible for the personal data this policy describes.",
					"This policy covers the Kiroshi desktop app, the Kiroshi iPhone app, the relay at api.kiroshi.app and the website kiroshi.app.",
					"The desktop app is free and keeps everything on your computer. The online mode is the Pro plan, free during the beta: it covers the relay at api.kiroshi.app, Spaces reached from outside your local network, and the iPhone app.",
				],
			},
			{
				heading: "The short version",
				body: [
					[
						"Your conversations, files, skills and memory live on your computer. Kiroshi's servers don't store them.",
						"What the agent works on goes to the model provider you configured, under your own account with it.",
						"In the online mode, the relay stores your account, your sessions and your Spaces. It passes messages along without storing them, end-to-end encrypted, so it can't read them.",
						"Kiroshi runs no analytics, no crash reporting and no tracking of its own. The agent, which the desktop app runs, sends its own usage data to the model provider you configured.",
						"You can delete your account in the iPhone app only, and some data stays behind. Both are explained below.",
					],
				],
			},
			{
				heading: "Your account",
				body: [
					"You sign in with Google, with Apple, or with a code or a link sent to your email address. The relay then stores:",
					[
						"your email address, your name and the address of your profile picture as Google or Apple share them, whether your email address is verified, and your plan;",
						"if you sign in with Google or Apple, your account id there and the access, refresh and ID tokens they issue, stored without extra encryption. The ID token also carries your email address and your name;",
						"for each session, a session token, your IP address, your browser's or app's user agent, a device name, the platform, and when the session started and was last used, to the minute;",
						"for a sign-in by email, the code, stored hashed, or the link, filed under your email address;",
						"for each request to sign the desktop app in, your computer's name, the platform, a local callback address, a hashed secret, and who approved it;",
						"for each of your devices, its public keys, whether you approved it, and when it was added and last active.",
					],
					"The desktop app sends your computer's name as its device name, and that name often includes your first name. The iPhone app sends \"iPhone\". You see the list of your devices, and whoever approves a desktop sign-in on kiroshi.app/authorize sees that computer's name.",
					"On the iPhone, the app keeps your session token in the Keychain. It keeps your last Space, and the list of accounts that accepted message routing, in its settings on the device.",
				],
			},
			{
				heading: "Spaces and members",
				body: [
					"When you share a Space online, the relay stores its name, its owner and its creation date, and its members see them.",
					"When the owner invites someone, the relay stores the invited email address, who invited them, the dates of the invitation and of joining, the role, and the invitations withdrawn. The owner sees the email addresses and names of the members. The person invited sees the email address of the owner.",
					"Inviting an email address creates an account for it on the relay, on the Pro plan and with an empty name, before that person has agreed to anything. Kiroshi sends that person no email. That account stays after the Space is deleted, and after the owner's account is deleted.",
					"When you join a Space, your name and your profile picture go to the computer that hosts it. On your own computer, what you receive from a joined Space is held in memory until the app quits, and profile pictures stay in the app's web cache.",
				],
			},
			{
				heading: "Messages and conversations",
				body: [
					"On your computer, the app keeps your Spaces, companions, conversations, messages, missions, routines and their runs in a database in the app's data folder, com.kiroshi.app, with no time limit. Attachments, up to 10 MB each and 20 per message, are kept beside it until you delete the conversation.",
					"Skills, memory and plugins are kept in git repositories on your computer. Removing a line from a skill or from memory leaves that line in the git history.",
					"In a Space shared online, messages between members and the computer that hosts the Space go through the relay: their text, tool output, profile pictures and photos sent from the iPhone. The relay adds the id of the sending device, forwards each message between the computer that hosts the Space and the devices of its members, and writes none of it anywhere.",
					"Messages are end-to-end encrypted between devices, and protected by TLS on their way to and from api.kiroshi.app. The relay can't read them.",
					"A message you send in someone else's Space runs on the computer that hosts the Space and with the model provider its host configured. Its content reaches that provider under the host's account, and the computer that hosts the Space keeps your name and your messages with no time limit.",
					"The iPhone app stores no messages. Photos you pick go through the relay to the computer that hosts the Space.",
				],
			},
			{
				heading: "What the relay can and cannot read",
				body: [
					"The relay stores:",
					[
						"your account;",
						"the id and name of each Space shared online;",
						"the email address of each member of a Space;",
						"your plan;",
						"the public keys of your devices.",
					],
					"The relay distributes:",
					[
						"the public keys of your devices, to your other devices and to the computer that hosts each Space you joined;",
						"invitations, to the email address invited.",
					],
					"Because the relay hands out the keys, adding a device to your account shows its fingerprint on the new device and on the one that approves it, for you to compare. When they match, no key was swapped on the way.",
					"The relay can't read the content of anything that travels end-to-end encrypted between devices:",
					[
						"conversations;",
						"missions;",
						"approvals;",
						"avatars;",
						"the roster of a Space, its list of devices.",
					],
					"The host of a Space is always a computer a person controls, never a Kiroshi server: your computer for a Space you share, its owner's computer for a Space you joined.",
				],
			},
			{
				heading: "Your model provider",
				body: [
					"The desktop app runs the agent on your computer. Everything the agent works on goes to the model provider you configured: your conversations, skills, memory, files and tool results. It goes under your own account, with the subscription or key you entered, for example a Claude subscription or an Anthropic API key. Kiroshi has no model provider key of its own and doesn't route this traffic through its servers, so the provider's terms govern that data.",
					"If you sign in to the model provider through the agent, the agent keeps that sign-in itself, outside Kiroshi's folder, under its own rules.",
					"The agent keeps transcripts of its sessions on your computer, outside Kiroshi's folder, under its own retention.",
					"The agent sends usage telemetry and error reports to the model provider you configured. Kiroshi doesn't turn them off.",
				],
			},
			{
				heading: "Applications and secrets",
				body: [
					"Applications connect the agent to other services. The desktop app reads their catalogue from api.kiroshi.app, which only sees your IP address, and checks their packages with npm and PyPI. When you connect an application, you sign in with its provider directly, and the content of every tool call goes to that provider.",
					"The key or token of your model provider, your relay session token, the sign-in tokens and client secrets of your applications, and the Secrets you enter in Settings are stored on your computer in plain-text files that only your user account can read. They aren't in your system's keychain. Each application only receives its own secrets. They stay until you delete them in Settings or sign out.",
				],
			},
			{
				heading: "The website and sign-in",
				body: [
					"kiroshi.app sets no cookies of its own and runs no analytics script.",
					"Every visit makes your browser contact api.github.com, for the latest release behind the download button, and unavatar.io, for the author's picture. Both receive your IP address.",
					"When you sign in on kiroshi.app, your session token is kept in your browser's localStorage. It's a full session, renewed while you use it, and any script running on the page can read it. It stays until you sign out or the session expires. While you approve a desktop sign-in, the id of that request is kept in sessionStorage.",
					"Signing in with Google or Apple sets sign-in cookies on api.kiroshi.app.",
					"The website is a static site hosted on Render, which keeps access logs for a limited time.",
				],
			},
			{
				heading: "Logs",
				body: [
					"The relay is hosted on Render, and its logs go to Render, which keeps them for a limited time. They record:",
					[
						"the method, path and status code of every request that fails;",
						"the full error when the relay itself fails;",
						"your account id when a sign-in with Apple fails;",
						"the Space, the account and the reason when the relay refuses a message.",
					],
					"The relay's own log lines carry no IP address, and the relay writes no line per request.",
					"To limit abuse, the relay holds your IP address and email address in memory for 1 to 10 minutes.",
					"The desktop app sends no analytics and no crash reports, and keeps the agent's error output in memory only. The iPhone app has no analytics SDK and no tracking: its privacy manifest declares your email address, name, user ID and other content you create, linked to you, and no tracking.",
				],
			},
			{
				heading: "Third parties",
				body: [
					[
						"The model provider you configured, with the account or key you entered (for example Anthropic when you use a Claude subscription): everything the agent works on, under your account, or the host's in someone else's Space, plus the agent's usage telemetry and error reports.",
						"Render: hosts the relay and its logs, and the website with its access logs.",
						"Resend: your email address, with the sign-in code or link it delivers.",
						"Apple: your sign-in when you use Sign in with Apple.",
						"Google: your sign-in when you use Sign in with Google.",
						"GitHub: your IP address when the desktop app checks for updates and when you visit kiroshi.app, and for missions, the repository, branch and pull request, with your GitHub token when you've set one.",
						"unavatar.io: your IP address when you visit kiroshi.app.",
						"npm and PyPI: the desktop app's checks of an application's package.",
						"The provider of each application you connect: your sign-in with it and the content of every tool call to it.",
					],
					"Kiroshi takes no payment during the beta, so no payment provider receives anything.",
				],
			},
			{
				heading: "How long we keep things",
				body: [
					[
						"Your account and your Google or Apple tokens: until you delete your account.",
						"Sessions: a session lasts 7 days and renews while you use it. Expired sessions aren't cleared, so a session, with its IP address, user agent and device name, stays until you sign it out or delete your account.",
						"Sign-in codes and links: valid for 5 minutes and deleted once used. Unused ones are never cleared.",
						"The public keys of your devices: until you remove the device, refuse its request or delete your account. Signing out doesn't remove them, and a request no one approves stays after it expires.",
						"Desktop sign-in requests: valid for 10 minutes and never cleared. Approved ones go with your account. Pending, cancelled or expired ones stay, with the computer's name, even after your account is deleted.",
						"Spaces: until the owner deletes the Space or their account.",
						"Memberships: until the member is removed, the Space is deleted or the account is deleted. An account created by an invitation stays after the Space.",
						"Messages passing through the relay: in memory, only while the connection is open.",
						"Abuse limits: in memory, for 1 to 10 minutes.",
						"Relay logs and website access logs: for a limited time, kept by Render.",
						"On your computer: until you delete them. Only the values routines use to avoid repeating a run are cleared, after 30 days.",
						"On the computer that hosts a Space: the messages of its members, with their names, with no time limit.",
						"On the iPhone: your session token and last Space until you sign out, and the list of accounts that accepted message routing until you delete your account.",
						"On kiroshi.app: your session token until you sign out or the session expires.",
					],
				],
			},
			{
				heading: "Deleting your account",
				body: [
					"You can delete your account from Settings in the iPhone app. The desktop app and kiroshi.app can't delete an account: they can only sign sessions out.",
					"Deleting your account removes your account, your Google or Apple tokens, your sessions, your approved desktop sign-in requests, your devices with their public keys, the Spaces you own and your memberships. It leaves behind:",
					[
						"your Google grant, which Kiroshi never revokes;",
						"your Apple grant, if Kiroshi's request to revoke it fails;",
						"unused sign-in codes and links, filed under your email address;",
						"pending, cancelled or expired desktop sign-in requests, with your computer's name;",
						"relay logs that carry your account id, until Render's retention removes them;",
						"your messages in other people's Spaces, with your name, on the computer that hosts the Space.",
					],
				],
			},
			{
				heading: "Your rights",
				body: [
					"French law governs this policy, and the GDPR applies. You have the right to access your data, to have it corrected or erased, to receive it in a portable format, and to object to its use. To use any of these rights, write to support@kiroshi.app.",
					"You can also complain to the CNIL, the French data protection authority.",
				],
			},
			{
				heading: "Children",
				body: "You must be at least 16 to use Kiroshi.",
			},
			{
				heading: "Changes to this policy",
				body: [
					"When this policy changes, the new version replaces this page and the date below changes with it.",
					"Last updated: 19 October 2026.",
				],
			},
			{
				heading: "Contact",
				body: "For any question about this policy or your data, write to support@kiroshi.app.",
			},
		],
	},
	terms: {
		navLabel: "Terms",
		title: "Terms of Use",
		sections: [
			{
				heading: "Who provides the service",
				body: [
					"Kiroshi is an independent project run from France by Steve Puget. In these terms, “we” and “us” mean Kiroshi.",
					"These terms cover Kiroshi’s hosted service and your Kiroshi account. If you don’t agree with them, don’t create an account or use the online mode.",
				],
			},
			{
				heading: "What the service is",
				body: [
					"Kiroshi is a desktop app where you talk with Companions in Conversations. The desktop app is free to use locally, on your computer and in Spaces shared on your own network.",
					`The online mode runs through our relay at ${RELAY_HOST}. It lets you host a Space for people who aren’t on your network and join a Space off your local network.`,
					"The iPhone app is part of the online mode. It signs in to your Kiroshi account and reaches your Spaces through the relay.",
				],
			},
			{
				heading: "Accounts and eligibility",
				body: [
					"You must be at least 16 to create a Kiroshi account.",
					"You need an account for the online mode and the iPhone app. The desktop app works locally without one.",
				],
			},
			{
				heading: "The Pro plan and the beta",
				body: [
					`The online mode is the Pro plan. Pro is priced per user: ${pro.price} ${pro.period} billed yearly, or ${pro.monthlyPrice} ${pro.period} billed monthly.`,
					"Pro is free during the beta. Payment isn’t set up, so you can’t be charged.",
					"If paid billing starts, we’ll announce it before it applies to an existing account. Nothing about Pro is promised beyond the beta.",
				],
			},
			{
				heading: "Acceptable use",
				body: [
					"Use Kiroshi lawfully. Don’t use the relay to harm other people, to get into accounts or systems you’re not allowed to use, or to disrupt the service for others.",
					"You’re responsible for what your Companions do, in your Conversations and through the Applications you give them.",
					"You’re responsible for the Secrets you store in Kiroshi, and for having the right to use them.",
				],
			},
			{
				heading: "Your content and the model provider",
				body: [
					"You bring your own model provider account, for example a Claude subscription or an Anthropic API key. Kiroshi doesn’t resell model usage.",
					"What your Companions send to the model provider falls under that provider’s terms, not these.",
					"In the online mode, your Conversations pass through the relay to reach the people in your Space and your iPhone.",
				],
			},
			{
				heading: "The open-source code",
				body: [
					`Kiroshi’s source code is published under the MIT license at ${REPOSITORY_ADDRESS}.`,
					"These terms govern the hosted service and your account. They never change the license of the code.",
				],
			},
			{
				heading: "Availability and changes to the service",
				body: [
					"The online mode is in beta. The relay can be unavailable at times.",
					"We can change, add or remove features of the service.",
				],
			},
			{
				heading: "Termination",
				body: [
					"You can delete your account at any time from the app. Deleting it in the app deletes it on the relay.",
					"We can suspend or close your account if you breach these terms.",
					"Once your account is closed, the online mode stops for you. The desktop app stays free to use locally.",
				],
			},
			{
				heading: "Warranties and limitation of liability",
				body: [
					"The service is provided as it is, during a beta, with no warranty beyond what the law requires.",
					"As far as the law allows, we aren’t liable for what your Companions do, for what the model provider does, or for loss caused by the service being unavailable.",
					"Nothing in these terms limits the rights French law gives you as a consumer and that can’t be waived.",
				],
			},
			{
				heading: "Governing law",
				body: "These terms are governed by French law. Any dispute goes to the courts of France.",
			},
			{
				heading: "Changes to these terms",
				body: [
					"We can update these terms. The date below shows when they last changed.",
					"Last updated 15 October 2026.",
				],
			},
		],
		contact: {
			heading: "Contact",
			body: "Questions about these terms or your account go to this address.",
		},
	},
	support: {
		navLabel: "Support",
		title: "Support",
		topics: {
			heading: "What to write to us about",
			body: "Write to us about a bug, a question about how Kiroshi works, a privacy request, or billing once the Pro plan is paid.",
		},
		contact: {
			heading: "How to reach us",
			body: "Email us at the address below. For bugs and feature requests, you can also open an issue on GitHub.",
			issuesLink: "Open an issue on GitHub",
		},
		details: {
			heading: "What helps us answer",
			body: "Tell us the app version, your operating system and its version (macOS, Windows, Linux or iOS), what happened, and what you expected to happen.",
		},
		privacy: {
			heading: "Privacy and account deletion",
			body: "Send privacy requests (access to your data, deletion of your account, or any question about your data) to the same address. You can also delete your account yourself from Settings in the iPhone app.",
		},
		response: {
			heading: "When we answer",
			body: "One person reads and answers every message, within a few working days.",
		},
		operator: {
			heading: "Who runs Kiroshi",
			body: "Kiroshi, an independent project run from France by Steve Puget.",
		},
	},
}
