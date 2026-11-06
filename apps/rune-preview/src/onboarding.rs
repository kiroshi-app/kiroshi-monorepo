use rune::{Color, Cursor, El, col, el, icon, row, text};
use rune_kit::Kit;

use crate::app::{App, Screen};
use crate::avatar::Face;
use crate::dev_profile::{ClaudeLogin, ImportChoices, KiroshiSignIn};
use crate::hues::Role;
use crate::icons;
use crate::model::ClaudeItem;
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_CONTROL, SPACING, TEXT_10_MEDIUM, TEXT_BASE_SEMIBOLD, TEXT_COMPACT,
	TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO_MEDIUM, TEXT_COMPACT_SEMIBOLD, TEXT_INITIALS, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_TITLE, TEXT_XS, TEXT_XS_MEDIUM, TEXT_XS_MONO, Tokens,
	tone,
};
use crate::widgets::{Pill, checkbox, field, radio, spinner};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Step {
	Welcome(Page),
	Connect(Connect),
	Import,
	Account(Account),
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Page {
	Companions,
	Conversations,
	Spaces,
	Tools,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Connect {
	LoginFound,
	AnotherAccount,
	NothingFound,
	WaitingForCode,
	KeyField,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Account {
	SignedOut,
	Waiting,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Method {
	SignIn,
	ApiKey,
}

const PAGES: [Page; 4] = [Page::Companions, Page::Conversations, Page::Spaces, Page::Tools];

const CYAN: f32 = 186.0;
const GREEN: f32 = 132.0;
const PINK: f32 = 358.0;
const BLUE: f32 = 257.0;

const CONTENT_HEIGHT: f32 = 352.0;
const CONTROLS_HEIGHT: f32 = 120.0;
const DRAG_STRIP: f32 = 48.0;

impl Step {
	pub fn first() -> Step {
		Step::Welcome(Page::Companions)
	}
}

impl Page {
	fn index(self) -> usize {
		PAGES.iter().position(|page| *page == self).unwrap_or(0)
	}

	fn title(self) -> &'static str {
		match self {
			Page::Companions => "Agents do the work with you",
			Page::Conversations => "Conversations, then missions",
			Page::Spaces => "Spaces keep work apart",
			Page::Tools => "Your tools, where you allow them",
		}
	}

	fn body(self) -> &'static str {
		match self {
			Page::Companions => {
				"Each agent has a name, a job and a memory of its own. Hand it something and it keeps at it, on your computer."
			}
			Page::Conversations => {
				"Talk with one agent or several at once. Long work becomes a mission you can follow while you do something else."
			}
			Page::Spaces => {
				"Each Space has its own agents, conversations and colour. Keep one to yourself, or share it with the people you work with."
			}
			Page::Tools => {
				"Give an agent a Folder to work in, the Applications it may use and the Secrets it needs. Nothing beyond what you hand it."
			}
		}
	}
}

fn go(step: Step) -> impl Fn(&mut App) + 'static {
	move |s: &mut App| s.screen = Screen::Onboarding(step)
}

fn leave_intro(s: &mut App) {
	let found = s.dev_profile.as_ref().is_some_and(|profile| profile.claude.is_some());
	let connect = if found { Connect::LoginFound } else { Connect::NothingFound };
	s.screen = Screen::Onboarding(Step::Connect(connect));
}

fn leave_connect(s: &mut App) {
	let has_import = s.dev_profile.as_ref().is_some_and(|profile| profile.import.is_some());
	let next = if has_import { Step::Import } else { Step::Account(Account::SignedOut) };
	s.screen = Screen::Onboarding(next);
}

fn finish(s: &mut App) {
	s.screen = Screen::Conversations;
}

pub fn view(step: Step, s: &App, k: &Kit, t: &Tokens) -> El {
	match step {
		Step::Welcome(page) => welcome(page, t),
		Step::Connect(connect) => connect_view(connect, s, k, t),
		Step::Import => import(s, t),
		Step::Account(account) => account_view(account, s, t),
	}
}

fn shell(t: &Tokens, gap: f32, content: Vec<El>, controls: Vec<El>) -> El {
	col()
		.key("onboarding")
		.w_full()
		.h_full()
		.fill(t.background)
		.center()
		.px(SPACING * 6.0)
		.child(el().w_full().h(DRAG_STRIP).absolute(0.0, 0.0).window_drag())
		.child(
			col()
				.w_full()
				.h(CONTENT_HEIGHT)
				.items_center()
				.justify_end()
				.gap(gap)
				.children(content),
		)
		.child(
			col()
				.w_full()
				.h(CONTROLS_HEIGHT)
				.items_center()
				.gap(SPACING * 3.0)
				.pt(SPACING * 3.0)
				.children(controls),
		)
}

fn heading(t: &Tokens, title: &str, body: &str, width: f32) -> El {
	col()
		.w(width)
		.gap(SPACING * 2.5)
		.items_center()
		.child(
			text(title.to_owned())
				.font(TEXT_TITLE)
				.color(t.foreground)
				.wrap()
				.align(rune::Align::Center),
		)
		.child(
			text(body.to_owned())
				.font(TEXT_SM)
				.color(t.muted_foreground)
				.wrap()
				.align(rune::Align::Center),
		)
}

fn card(t: &Tokens) -> El {
	col().radius(RADIUS_BUBBLE).border(1.0, t.border).fill(t.card)
}

fn welcome(page: Page, t: &Tokens) -> El {
	let illustration = match page {
		Page::Companions => companions(t),
		Page::Conversations => conversations(t),
		Page::Spaces => spaces(t),
		Page::Tools => tools(t),
	};
	let content = vec![illustration, heading(t, page.title(), page.body(), 420.0)];
	shell(t, SPACING * 8.0, content, welcome_footer(page, t))
}

fn welcome_footer(page: Page, t: &Tokens) -> Vec<El> {
	let at = page.index();
	let blue = tone(BLUE, t.dark, Role::Accent);
	let back = at.checked_sub(1).map(|previous| Step::Welcome(PAGES[previous]));
	let next = PAGES.get(at + 1).map(|next| Step::Welcome(*next));
	let segments = row().gap(SPACING * 1.5).center_y().children((0..PAGES.len()).map(|segment| {
		el().size(44.0, 4.0).radius(2.0).fill(if segment <= at { blue } else { t.border })
	}));
	let arrow = |glyph: &'static rune::Icon, target: Option<Step>, filled: bool| {
		let ink = match (filled, target.is_some()) {
			(true, true) => Color::WHITE,
			(_, false) => t.muted_foreground,
			(false, true) => t.foreground,
		};
		let button = el()
			.size(32.0, 32.0)
			.radius(16.0)
			.center()
			.role("button")
			.child(icon(glyph, 16.0).color(ink));
		let button = match (filled, target.is_some()) {
			(true, true) => button.fill(blue),
			(true, false) => button.fill(t.muted).opacity(0.35),
			(false, true) => button.border(1.0, t.border),
			(false, false) => button.opacity(0.35),
		};
		match target {
			Some(target) => {
				button.cursor(Cursor::Pointer).hover(t.foreground.alpha(0.08)).on_press(go(target))
			}
			None => button,
		}
	};
	let stepper = row()
		.gap(SPACING * 4.0)
		.center_y()
		.pt(SPACING * 3.0)
		.pb(SPACING * 6.0)
		.child(arrow(&icons::PREVIOUS, back, false))
		.child(segments)
		.child(arrow(&icons::NEXT, next, true));
	let action = if next.is_none() {
		Pill::new("Get started").primary(t, leave_intro)
	} else {
		Pill::new("Skip intro").secondary(t, leave_intro)
	};
	vec![col().items_center().child(stepper).child(action)]
}

fn title_badge(t: &Tokens, title: &str) -> El {
	el().px(6.0)
		.radius(7.0)
		.fill(t.foreground.alpha(0.1))
		.child(text(title.to_owned()).font(TEXT_10_MEDIUM).color(t.foreground.alpha(0.8)))
}

fn companions(t: &Tokens) -> El {
	let meet = [
		("Atlas", "Reviews code", CYAN, false),
		("Juniper", "Keeps the docs", GREEN, true),
		("Wren", "Writes release notes", PINK, false),
	];
	row().items_end().gap(28.0).children(meet.into_iter().map(|(name, job, hue, featured)| {
		col()
			.w(140.0)
			.items_center()
			.gap(SPACING * 1.5)
			.pb(if featured { 28.0 } else { 0.0 })
			.child(Face::still(name, Some(hue)).draw(if featured { 132.0 } else { 96.0 }, t.dark))
			.child(
				el().pt(SPACING * 2.0)
					.child(text(name).font(TEXT_COMPACT_MEDIUM).color(t.foreground)),
			)
			.child(title_badge(t, job))
	}))
}

fn bubble(t: &Tokens, words: &str, solid: bool) -> El {
	let (fill, ink) =
		if solid { (t.user_bubble, t.user_bubble_foreground) } else { (t.bubble, t.foreground) };
	el().max_w(340.0)
		.px(SPACING * 3.0)
		.py(SPACING * 2.0)
		.radius(RADIUS_BUBBLE)
		.fill(fill)
		.child(text(words.to_owned()).font(TEXT_SM).color(ink).wrap())
}

fn overlapping(t: &Tokens, faces: &[(&str, f32)], size: f32) -> El {
	row().children(faces.iter().enumerate().map(|(index, &(name, hue))| {
		Face::still(name, Some(hue)).draw(size, t.dark).ml(if index > 0 { -6.0 } else { 0.0 })
	}))
}

fn conversations(t: &Tokens) -> El {
	let thread = card(t)
		.w_full()
		.gap(SPACING * 3.5)
		.padding(18.0)
		.child(
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.child(el().w(44.0).child(overlapping(
					t,
					&[("Juniper", GREEN), ("Wren", PINK)],
					24.0,
				)))
				.child(text("Launch week").font(TEXT_COMPACT_SEMIBOLD).color(t.foreground)),
		)
		.child(row().w_full().justify_end().child(bubble(
			t,
			"Can you two get the docs ready for Friday?",
			true,
		)))
		.child(
			row()
				.items_end()
				.gap(SPACING * 2.0)
				.child(Face::still("Wren", Some(PINK)).draw(24.0, t.dark))
				.child(bubble(t, "On it. I\u{2019}ll run the release notes as a mission.", false)),
		);
	let status = row()
		.h(24.0)
		.px(10.0)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(12.0)
		.fill(t.muted)
		.child(el().size(6.0, 6.0).radius(3.0).fill(t.primary))
		.child(text("Working").font(TEXT_XS_MEDIUM).color(t.foreground));
	let mission = row()
		.w_full()
		.gap(SPACING * 3.0)
		.center_y()
		.px(18.0)
		.py(14.0)
		.radius(RADIUS_BUBBLE)
		.border(1.0, t.border)
		.fill(t.card)
		.child(Face::still("Wren", Some(PINK)).draw(32.0, t.dark))
		.child(
			col()
				.grow(1.0)
				.gap(2.0)
				.child(
					text("Release notes for 2.4").font(TEXT_COMPACT_SEMIBOLD).color(t.foreground),
				)
				.child(
					text("Mission · Wren · 3 of 5 sections drafted")
						.font(TEXT_XS)
						.color(t.muted_foreground),
				),
		)
		.child(status);
	col().w(440.0).gap(SPACING * 3.0).child(thread).child(mission)
}

fn space_avatar(t: &Tokens, name: &str, hue: f32) -> El {
	let initial: String = name.chars().take(1).collect();
	el().size(36.0, 36.0)
		.radius(RADIUS_CONTROL)
		.fill(tone(hue, t.dark, Role::ConversationIcon))
		.center()
		.child(text(initial).font(TEXT_BASE_SEMIBOLD).color(tone(
			hue,
			t.dark,
			Role::ConversationIconForeground,
		)))
}

fn spaces(t: &Tokens) -> El {
	let space = |name: &'static str, detail: &'static str, hue: f32, members: &[(&str, f32)]| {
		card(t)
			.grow(1.0)
			.min_w(144.0)
			.gap(SPACING * 3.5)
			.padding(18.0)
			.child(
				row()
					.gap(SPACING * 3.0)
					.center_y()
					.child(space_avatar(t, name, hue))
					.child(text(name).font(TEXT_SM_SEMIBOLD).color(t.foreground)),
			)
			.child(
				row()
					.gap(SPACING * 2.0)
					.center_y()
					.child(overlapping(t, members, 24.0))
					.child(text(detail).font(TEXT_XS).color(t.muted_foreground)),
			)
	};
	row()
		.w(520.0)
		.gap(SPACING * 3.0)
		.child(space("Work", "Shared with 3 people", BLUE, &[("Atlas", CYAN), ("Wren", PINK)]))
		.child(space("Personal", "Only you", GREEN, &[("Juniper", GREEN)]))
}

fn tools(t: &Tokens) -> El {
	let tool = |glyph: &'static rune::Icon,
	            name: &'static str,
	            detail: &'static str,
	            mono: bool| {
		card(t)
			.grow(1.0)
			.min_w(144.0)
			.gap(SPACING * 3.5)
			.padding(18.0)
			.child(
				el().size(40.0, 40.0)
					.radius(RADIUS_CONTROL)
					.fill(t.muted)
					.center()
					.child(icon(glyph, 20.0).color(t.foreground)),
			)
			.child(
				col().gap(2.0).child(text(name).font(TEXT_SM_SEMIBOLD).color(t.foreground)).child(
					text(detail)
						.font(if mono { TEXT_XS_MONO } else { TEXT_XS })
						.color(t.muted_foreground)
						.wrap(),
				),
			)
	};
	row()
		.w(520.0)
		.gap(SPACING * 3.0)
		.child(tool(&icons::FOLDER, "Folders", "~/Code/orbit-web", true))
		.child(tool(&icons::SERVER, "Applications", "GitHub, Linear, Notion", false))
		.child(tool(&icons::CODE, "Secrets", "LINEAR_API_KEY", true))
}

fn initials_of(email: &str) -> String {
	let local = email.split('@').next().unwrap_or("");
	let mut parts = local.split(['.', '_', '+', '-']).filter(|part| !part.is_empty());
	let first = parts.next().unwrap_or("");
	let initials: String = match parts.next() {
		Some(second) => first.chars().take(1).chain(second.chars().take(1)).collect(),
		None => first.chars().take(2).collect(),
	};
	initials.to_uppercase()
}

fn login_card(t: &Tokens, login: &ClaudeLogin) -> El {
	col()
		.w(360.0)
		.items_center()
		.gap(SPACING * 1.5)
		.radius(16.0)
		.border(1.0, t.border)
		.fill(t.card)
		.px(SPACING * 6.0)
		.py(SPACING * 7.0)
		.child(
			el().size(88.0, 88.0)
				.radius(44.0)
				.fill(t.muted)
				.center()
				.mb(10.0)
				.child(text(initials_of(&login.email)).font(TEXT_INITIALS).color(t.foreground)),
		)
		.child(text(login.email.clone()).font(TEXT_BASE_SEMIBOLD).color(t.foreground))
		.child(
			text(format!("{} · found in Claude Code", login.plan))
				.font(TEXT_XS)
				.color(t.muted_foreground),
		)
}

fn connect_view(connect: Connect, s: &App, k: &Kit, t: &Tokens) -> El {
	match connect {
		Connect::LoginFound => login_found(s, t),
		Connect::AnotherAccount => method_choice(
			s,
			t,
			"How do you want to connect?",
			"Sign in again with a different one.",
		),
		Connect::NothingFound => method_choice(
			s,
			t,
			"Connect the model provider",
			"Your agents need a model to think with. Use your Claude subscription, or a key.",
		),
		Connect::WaitingForCode => waiting_for_code(s, k, t),
		Connect::KeyField => key_field(s, k, t),
	}
}

fn login_found(s: &App, t: &Tokens) -> El {
	let login = s.dev_profile.as_ref().and_then(|profile| profile.claude.as_ref());
	let mut content: Vec<El> = login.map(|login| login_card(t, login)).into_iter().collect();
	content.push(heading(
		t,
		"Use the account already on your computer?",
		"Signed in with your Claude subscription, under your own login.",
		480.0,
	));
	let controls = vec![
		Pill::new("Use this account").primary(t, leave_connect),
		Pill::new("Use another account").secondary(t, go(Step::Connect(Connect::AnotherAccount))),
	];
	shell(t, SPACING * 8.0, content, controls)
}

fn method_choice(s: &App, t: &Tokens, title: &str, body: &str) -> El {
	let option = |method: Method, label: &'static str, description: &'static str| {
		let chosen = s.connect_method == method;
		row()
			.key(format!("method-{label}"))
			.w_full()
			.items_start()
			.gap(SPACING * 3.0)
			.px(SPACING * 4.0)
			.py(SPACING * 3.5)
			.radius(RADIUS_CONTROL)
			.border(1.0, if chosen { t.primary } else { t.border })
			.fill(t.card)
			.cursor(Cursor::Pointer)
			.role("radio")
			.label(label)
			.checked(chosen)
			.on_press(move |s: &mut App| s.connect_method = method)
			.child(el().pt(1.0).child(radio(t, chosen)))
			.child(
				col()
					.grow(1.0)
					.shrink()
					.gap(2.0)
					.child(text(label).font(TEXT_SM_MEDIUM).color(t.foreground))
					.child(text(description).font(TEXT_COMPACT).color(t.muted_foreground).wrap()),
			)
	};
	let choices = col()
		.w(420.0)
		.gap(SPACING * 2.0)
		.pb(SPACING * 5.0)
		.child(option(
			Method::SignIn,
			"Sign in with Claude",
			"Opens your browser once. Works with your Pro or Max subscription.",
		))
		.child(option(
			Method::ApiKey,
			"Paste an API key",
			"Pay per use, with nothing to sign in to.",
		));
	let next = match s.connect_method {
		Method::SignIn => Connect::WaitingForCode,
		Method::ApiKey => Connect::KeyField,
	};
	shell(
		t,
		SPACING * 6.0,
		vec![heading(t, title, body, 480.0), choices],
		vec![Pill::new("Continue").primary(t, go(Step::Connect(next)))],
	)
}

fn labelled(t: &Tokens, label: &str, field: El) -> El {
	col()
		.w_full()
		.gap(SPACING * 2.5)
		.child(text(label.to_owned()).font(TEXT_COMPACT_MEDIUM).color(t.foreground))
		.child(field)
}

fn waiting_for_code(s: &App, k: &Kit, t: &Tokens) -> El {
	let status = row()
		.w_full()
		.justify_center()
		.center_y()
		.gap(SPACING * 2.0)
		.pb(SPACING * 1.5)
		.child(spinner(t.input, t.muted_foreground))
		.child(
			text("Waiting for you to sign in, in your browser…")
				.font(TEXT_COMPACT)
				.color(t.muted_foreground),
		);
	let code = field(t, k, &s.onboarding_code, "Code from Claude", false, |s: &mut App| {
		&mut s.onboarding_code
	});
	let below = col()
		.w(420.0)
		.gap(SPACING * 2.5)
		.pt(SPACING * 7.0)
		.pb(SPACING * 5.0)
		.child(status)
		.child(labelled(t, "Paste the code Claude gave you", code));
	let content = vec![
		heading(
			t,
			"Sign in with Claude",
			"Your browser opened claude.ai. Sign in there with your Pro or Max subscription, then paste the code it shows you.",
			480.0,
		),
		below,
	];
	let secondary = row()
		.justify_center()
		.child(Pill::new("Open the sign-in page again").secondary(t, |_: &mut App| {}))
		.child(Pill::new("Paste a key instead").secondary(t, go(Step::Connect(Connect::KeyField))));
	let controls = vec![
		Pill::new("Continue").disabled(s.onboarding_code.text.is_empty()).primary(t, leave_connect),
		secondary,
	];
	shell(t, 0.0, content, controls)
}

fn key_field(s: &App, k: &Kit, t: &Tokens) -> El {
	let key =
		field(t, k, &s.onboarding_key, "sk-ant-…", true, |s: &mut App| &mut s.onboarding_key);
	let content = vec![
		heading(
			t,
			"Paste your Anthropic API key",
			"Pay per use, with nothing to sign in to. Create a key in the Anthropic Console.",
			480.0,
		),
		col().w(420.0).pt(SPACING * 7.0).pb(SPACING * 5.0).child(labelled(t, "Key", key)),
	];
	let controls = vec![
		Pill::new("Continue").disabled(s.onboarding_key.text.is_empty()).primary(t, leave_connect),
		Pill::new("Sign in instead").secondary(t, go(Step::Connect(Connect::WaitingForCode))),
	];
	shell(t, 0.0, content, controls)
}

const IMPORT_HUES: [f32; 4] = [BLUE, GREEN, PINK, CYAN];

fn import(s: &App, t: &Tokens) -> El {
	let Some(choices) = s.dev_profile.as_ref().and_then(|profile| profile.import.as_ref()) else {
		return account_view(Account::SignedOut, s, t);
	};
	let content = vec![
		heading(
			t,
			"Bring in your Claude Code setup",
			"Found in ~/.claude on your computer. Everything is selected; uncheck what you\u{2019}d rather leave behind.",
			480.0,
		),
		col().w(584.0).px(SPACING * 3.0).child(import_list(s, t, choices)),
	];
	let count = s.import_selected.len();
	let label =
		if count == 1 { "Import 1 item".to_owned() } else { format!("Import {count} items") };
	let controls = vec![
		Pill::new(&label).disabled(count == 0).primary(t, go(Step::Account(Account::SignedOut))),
		Pill::new("Skip for now").secondary(t, go(Step::Account(Account::SignedOut))),
	];
	shell(t, SPACING * 5.0, content, controls)
}

enum Media {
	Agent(f32),
	Glyph(&'static rune::Icon),
}

struct ImportRow<'a> {
	item: &'a ClaudeItem,
	title: String,
	detail: String,
	media: Media,
	kind: &'static str,
}

fn import_list(s: &App, t: &Tokens, choices: &ImportChoices) -> El {
	let mut rows: Vec<ImportRow> = choices
		.agents
		.iter()
		.enumerate()
		.map(|(index, agent)| ImportRow {
			item: agent,
			title: agent.name.clone(),
			detail: agent.description.clone(),
			media: Media::Agent(IMPORT_HUES[index % IMPORT_HUES.len()]),
			kind: "Agent",
		})
		.collect();
	if let Some(claude_md) = &choices.claude_md {
		rows.push(ImportRow {
			item: claude_md,
			title: "CLAUDE.md".to_owned(),
			detail: claude_md.description.clone(),
			media: Media::Glyph(&icons::FILE),
			kind: "Instructions",
		});
	}
	if let Some(first) = choices.skills.first() {
		let names: Vec<&str> = choices.skills.iter().map(|skill| skill.name.as_str()).collect();
		let count = choices.skills.len();
		rows.push(ImportRow {
			item: first,
			title: if count == 1 { "1 skill".to_owned() } else { format!("{count} skills") },
			detail: names.join(", "),
			media: Media::Glyph(&icons::SKILL),
			kind: "Skills",
		});
	}
	rows.into_iter().enumerate().fold(
		col().w_full().radius(14.0).border(1.0, t.border).fill(t.card),
		|list, (index, row)| {
			let list =
				if index > 0 { list.child(el().w_full().h(1.0).fill(t.border)) } else { list };
			list.child(import_row(s, t, row))
		},
	)
}

fn import_row(s: &App, t: &Tokens, row_: ImportRow) -> El {
	let key = row_.item.key.clone();
	let checked = s.import_selected.contains(&row_.item.key);
	let media = match row_.media {
		Media::Agent(hue) => Face::still(&row_.title, Some(hue)).draw(28.0, t.dark),
		Media::Glyph(glyph) => icon(glyph, 16.0).color(t.muted_foreground),
	};
	let title_font =
		if row_.kind == "Instructions" { TEXT_COMPACT_MONO_MEDIUM } else { TEXT_COMPACT_MEDIUM };
	row()
		.key(format!("import-{}", row_.item.key))
		.w_full()
		.center_y()
		.gap(SPACING * 3.5)
		.px(SPACING * 3.5)
		.py(11.0)
		.cursor(Cursor::Pointer)
		.role("checkbox")
		.label(row_.title.as_str())
		.checked(checked)
		.on_press(move |s: &mut App| s.toggle_import(&key))
		.child(checkbox(t, checked))
		.child(el().size(28.0, 28.0).center().child(media))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.gap(2.0)
				.child(text(row_.title).font(title_font).color(t.foreground))
				.child(text(row_.detail).font(TEXT_XS).color(t.muted_foreground).wrap()),
		)
		.child(text(row_.kind).font(TEXT_XS).color(t.muted_foreground))
}

fn account_intro(t: &Tokens, title: &str, body: &str) -> El {
	col()
		.items_center()
		.gap(SPACING * 8.0)
		.child(
			el().size(128.0, 116.0)
				.center()
				.child(icon(&icons::KIROSHI_RING, 128.0).color(t.foreground)),
		)
		.child(heading(t, title, body, 420.0))
}

fn account_view(account: Account, s: &App, t: &Tokens) -> El {
	if let Some(signed_in) = s.dev_profile.as_ref().and_then(|profile| profile.kiroshi.as_ref()) {
		return signed_in_view(t, signed_in);
	}
	let intro = account_intro(
		t,
		"Sign in to Kiroshi",
		"Optional. Host a space for people who aren\u{2019}t on your network, or join one someone hosts for you.",
	);
	let controls = match account {
		Account::SignedOut => vec![
			Pill::new("Sign in with your browser")
				.trailing(&icons::EXTERNAL_LINK)
				.primary(t, go(Step::Account(Account::Waiting))),
			Pill::new("Skip for now").secondary(t, finish),
		],
		Account::Waiting => vec![
			row()
				.gap(SPACING * 2.0)
				.child(waiting_for_browser(t))
				.child(Pill::new("Cancel").outline(t, go(Step::Account(Account::SignedOut)))),
			text("Finish in your browser. Kiroshi picks it up from there.")
				.font(TEXT_COMPACT)
				.color(t.muted_foreground),
			row()
				.gap(SPACING)
				.child(
					text("Browser didn\u{2019}t open?")
						.font(TEXT_COMPACT)
						.color(t.muted_foreground),
				)
				.child(
					col()
						.gap(1.0)
						.child(
							text("Copy the sign-in link")
								.font(TEXT_COMPACT_MEDIUM)
								.color(t.foreground),
						)
						.child(el().w_full().h(1.0).fill(t.foreground)),
				),
			Pill::new("Skip for now").secondary(t, finish),
		],
	};
	shell(t, SPACING * 5.0, vec![intro], controls)
}

fn waiting_for_browser(t: &Tokens) -> El {
	let ink = if t.dark { t.primary_foreground } else { Color::WHITE };
	row()
		.h(SPACING * 10.0)
		.px(SPACING * 6.0)
		.gap(SPACING * 1.5)
		.radius(SPACING * 5.0)
		.center()
		.fill(t.primary)
		.opacity(0.6)
		.child(spinner(ink.alpha(0.4), ink))
		.child(text("Waiting for your browser…").font(TEXT_SM_MEDIUM).color(ink))
}

fn signed_in_view(t: &Tokens, signed_in: &KiroshiSignIn) -> El {
	let name = signed_in.email.split('@').next().unwrap_or("").to_owned();
	let mut account_card =
		row()
			.w(440.0)
			.center_y()
			.gap(SPACING * 3.0)
			.radius(14.0)
			.border(1.0, t.border)
			.padding(14.0)
			.child(el().size(40.0, 40.0).radius(20.0).fill(t.person_avatar).center().child(
				text(initials_of(&signed_in.email)).font(TEXT_SM_MEDIUM).color(t.foreground),
			))
			.child(
				col().grow(1.0).child(text(name).font(TEXT_SM_MEDIUM).color(t.foreground)).child(
					text(signed_in.email.clone()).font(TEXT_COMPACT).color(t.muted_foreground),
				),
			);
	if let Some(plan) = &signed_in.plan {
		let label = if plan == "pro" { "Pro" } else { "Free" };
		account_card = account_card.child(text(label).font(TEXT_SM).color(t.foreground));
	}
	let intro = account_intro(
		t,
		"You\u{2019}re signed in",
		"Your conversations stay on your computer. The account only connects you to spaces and devices beyond your network.",
	);
	shell(
		t,
		SPACING * 5.0,
		vec![intro, account_card],
		vec![Pill::new("Continue").primary(t, finish)],
	)
}
