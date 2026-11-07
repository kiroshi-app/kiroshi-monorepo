use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

use rune::image::{Image, ImageCache};
use rune::{El, Icon, TextEdit, col};

use super::SceneState;
use crate::strings::Language;
use crate::surfaces::s11_applications::HAIRLINE;
use crate::surfaces::s11_applications::catalogue::{
	Catalogue, CatalogueApplication, Category, Setup, catalogue,
};
use crate::surfaces::s11_applications::identity::{Identity, meta_line, verified_pill};
use crate::surfaces::s11_applications::install::{
	InstallPage, Installable, KeyField, install_page,
};
use crate::surfaces::s11_applications::mark::{Mark, MarkSize, mark};
use crate::surfaces::s11_applications::panel::{
	Application, Applications, Connection, ConnectionReason, Owner, applications,
};
use crate::surfaces::s11_applications::search::search_field;
use crate::surfaces::s11_applications::secrets::{Scope, Secret, Secrets, secrets};
use crate::tokens::{RADIUS_2XL, SPACING, Tokens};

const MARK_SIDE: f32 = 36.0;
const MARK_SCALE: f32 = 2.0;
const LINEAR_MARK: &str = "#5e6ad2";
const GITHUB_MARK: &str = "#24292f";
const NOTION_MARK: &str = "#191919";
const SENTRY_MARK: &str = "#362d59";
const FIGMA_MARK: &str = "#a259ff";
const POSTGRES_MARK: &str = "#336791";
const SLACK_MARK: &str = "#4a154b";
const GRANOLA_MARK: &str = "#1f6f43";
const INSTALL_AGENT: Owner = Owner::Agent("Rei");
const INSTALL_SPACE: Owner = Owner::Space("Atlas");
const GRANOLA_TOOLS: [&str; 6] = [
	"list_meetings",
	"get_meeting",
	"get_transcript",
	"search_notes",
	"list_folders",
	"get_attendees",
];
const SENTRY_TOOLS: [&str; 5] =
	["find_issues", "get_issue_details", "search_events", "find_releases", "get_trace"];
const SLACK_TOOLS: [&str; 5] =
	["list_channels", "read_messages", "post_message", "search_messages", "list_members"];
const AGENT: Owner = Owner::Agent("Repository archivist");
const SPACE: Owner = Owner::Space("Release desk");

thread_local! {
	static PICTURES: (ImageCache, RefCell<HashMap<&'static str, Image>>) =
		(ImageCache::new(Arc::new(|| {})), RefCell::default());
}

fn picture(colour: &'static str) -> Image {
	PICTURES.with(|(cache, pictures)| {
		pictures
			.borrow_mut()
			.entry(colour)
			.or_insert_with(|| {
				let svg = format!(
					r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" fill="{colour}"/></svg>"#
				);
				let image = cache.svg(svg.into_bytes(), MARK_SIDE, MARK_SCALE);
				if let Err(failure) = image.wait() {
					eprintln!("the {colour} mark didn't decode: {}", failure.0);
				}
				image
			})
			.clone()
	})
}

fn unreachable_picture() -> Image {
	PICTURES.with(|(cache, _)| {
		let image = cache.load(UNREACHABLE);
		let _ = image.wait();
		image
	})
}

fn padded(t: &Tokens, content: El) -> El {
	rune_kit::root(
		col().w_full().h_full().fill(t.card).padding(STORY_PADDING).items_start().child(content),
		Vec::new(),
	)
}

fn bordered(t: &Tokens, content: El) -> El {
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.fill(t.card)
			.radius(RADIUS_2XL)
			.border(HAIRLINE, t.border)
			.clip_rounded(RADIUS_2XL)
			.child(content),
		Vec::new(),
	)
}

fn query(s: &mut SceneState) -> &mut TextEdit {
	&mut s.edit
}

const PANEL_INSET: f32 = SPACING * 5.0;
const NARROW_FRAME: f32 = SPACING * 80.0;
const STORY_PADDING: f32 = SPACING * 4.0;
const SEARCH_FRAME: f32 = SPACING * 96.0;
const THEME_CELL_PADDING: f32 = SPACING * 6.0;
const UNREACHABLE: &[u8] = b"NotAnImage";
static DRAWN_MARK: Icon = Icon {
	name: "s11-drawn-mark",
	view: 24.0,
	body: r#"<path d="M12 2 2 20h20L12 2Z" fill="currentColor"/>"#,
};

fn ignore<E>(_: &mut SceneState, _: E) {}

fn framed(t: &Tokens, content: El) -> El {
	rune_kit::root(
		col().w_full().h_full().fill(t.card).padding(PANEL_INSET).child(content),
		Vec::new(),
	)
}

fn secret(name: &str, defined_in: Scope, served_from: Scope) -> Secret {
	Secret { name: name.to_owned(), defined_in, served_from, overrides: None, is_unset: false }
}

fn agent_secrets() -> Vec<Secret> {
	vec![
		secret("ATLAS_TOKEN", Scope::Space, Scope::Space),
		Secret {
			overrides: Some(Scope::Space),
			..secret("ATLAS_REGION", Scope::Agent, Scope::Agent)
		},
		secret("BOT_SEED", Scope::Agent, Scope::Agent),
		secret("LEDGER_KEY", Scope::Agent, Scope::Application),
	]
}

fn secrets_scene(t: &Tokens, scope: Scope, entries: &[Secret], pending: bool, failed: bool) -> El {
	let panel = Secrets {
		scope,
		entries,
		is_pending: pending,
		has_failed_to_read: failed,
		language: Language::En,
	};
	framed(t, secrets(t, &panel, ignore))
}

fn with_agent_secrets(first: Secret) -> Vec<Secret> {
	std::iter::once(first).chain(agent_secrets()).collect()
}

pub(super) fn secrets_default(t: &Tokens, _: &SceneState) -> El {
	secrets_scene(t, Scope::Agent, &agent_secrets(), false, false)
}

pub(super) fn secrets_empty(t: &Tokens, _: &SceneState) -> El {
	secrets_scene(t, Scope::Agent, &[], false, false)
}

pub(super) fn secrets_loading(t: &Tokens, _: &SceneState) -> El {
	secrets_scene(t, Scope::Agent, &[], true, false)
}

pub(super) fn secrets_unreadable(t: &Tokens, _: &SceneState) -> El {
	secrets_scene(t, Scope::Agent, &[], false, true)
}

pub(super) fn secrets_unreadable_with_entries(t: &Tokens, _: &SceneState) -> El {
	secrets_scene(t, Scope::Agent, &agent_secrets(), false, true)
}

pub(super) fn secrets_space_scope(t: &Tokens, _: &SceneState) -> El {
	let entries = [
		secret("ATLAS_TOKEN", Scope::Space, Scope::Space),
		secret("ATLAS_REGION", Scope::Space, Scope::Agent),
		secret("LEDGER_KEY", Scope::Space, Scope::Application),
	];
	secrets_scene(t, Scope::Space, &entries, false, false)
}

pub(super) fn secrets_server_scope(t: &Tokens, _: &SceneState) -> El {
	let entries = [
		secret("ATLAS_TOKEN", Scope::Space, Scope::Space),
		Secret {
			overrides: Some(Scope::Agent),
			..secret("LEDGER_KEY", Scope::Application, Scope::Application)
		},
		secret("SERVER_TIMEOUT_MS", Scope::Application, Scope::Application),
	];
	secrets_scene(t, Scope::Application, &entries, false, false)
}

pub(super) fn secrets_long_content(t: &Tokens, _: &SceneState) -> El {
	let long = secret(
		"NIGHTLY_INGESTION_PIPELINE_INSPECTOR_DEAD_LETTER_QUEUE_URL",
		Scope::Agent,
		Scope::Application,
	);
	secrets_scene(t, Scope::Agent, &with_agent_secrets(long), false, false)
}

pub(super) fn secrets_unset_needs_value(t: &Tokens, _: &SceneState) -> El {
	let unset = Secret {
		overrides: Some(Scope::Space),
		is_unset: true,
		..secret(
			"NIGHTLY_INGESTION_PIPELINE_INSPECTOR_DEAD_LETTER_QUEUE_TOKEN",
			Scope::Agent,
			Scope::Agent,
		)
	};
	secrets_scene(t, Scope::Agent, &with_agent_secrets(unset), false, false)
}

pub(super) fn secrets_unset_served_elsewhere(t: &Tokens, _: &SceneState) -> El {
	let unset = Secret { is_unset: true, ..secret("MAILER_API_KEY", Scope::Agent, Scope::Space) };
	secrets_scene(t, Scope::Agent, &with_agent_secrets(unset), false, false)
}

fn app<'a>(name: &'a str, display_name: Option<&'a str>, mark: Mark<'a>) -> Application<'a> {
	Application { name, display_name, mark, connection: None, reason: None }
}

fn connected(app: Application, connection: Connection) -> Application {
	Application { connection: Some(connection), ..app }
}

fn applications_scene(
	t: &Tokens,
	s: &SceneState,
	owner: Owner,
	apps: &[Application],
	failed: bool,
) -> El {
	let panel = Applications {
		owner,
		applications: apps,
		query: &s.edit,
		has_failed_to_load: failed,
		can_connect: true,
		language: Language::En,
	};
	framed(t, applications(t, &panel, query, ignore))
}

fn with_marked(t: &Tokens, s: &SceneState, owner: Owner, first: Vec<Application>) -> El {
	let linear = picture(LINEAR_MARK);
	let github = picture(GITHUB_MARK);
	let marked = [
		connected(app("linear", Some("Linear"), Mark::Picture(&linear)), Connection::Connected),
		connected(
			app("github", Some("GitHub"), Mark::Picture(&github)),
			Connection::NeedsAuthorization,
		),
		connected(app("atlas", None, Mark::Absent), Connection::Failed),
	];
	let apps: Vec<Application> = first.into_iter().chain(marked).collect();
	applications_scene(t, s, owner, &apps, false)
}

pub(super) fn applications_agent(t: &Tokens, s: &SceneState) -> El {
	with_marked(t, s, AGENT, Vec::new())
}

pub(super) fn applications_space(t: &Tokens, s: &SceneState) -> El {
	with_marked(t, s, SPACE, Vec::new())
}

pub(super) fn applications_profile(t: &Tokens, s: &SceneState) -> El {
	with_marked(t, s, Owner::Profile, Vec::new())
}

pub(super) fn applications_empty_agent(t: &Tokens, s: &SceneState) -> El {
	applications_scene(t, s, AGENT, &[], false)
}

pub(super) fn applications_empty_space(t: &Tokens, s: &SceneState) -> El {
	applications_scene(t, s, SPACE, &[], false)
}

pub(super) fn applications_empty_profile(t: &Tokens, s: &SceneState) -> El {
	applications_scene(t, s, Owner::Profile, &[], false)
}

pub(super) fn applications_unreadable(t: &Tokens, s: &SceneState) -> El {
	applications_scene(t, s, AGENT, &[], true)
}

fn linear_alone(t: &Tokens, s: &SceneState, connection: Connection) -> El {
	let linear = picture(LINEAR_MARK);
	let apps = [connected(app("linear", Some("Linear"), Mark::Picture(&linear)), connection)];
	applications_scene(t, s, AGENT, &apps, false)
}

pub(super) fn applications_needs_authorization(t: &Tokens, s: &SceneState) -> El {
	let github = picture(GITHUB_MARK);
	let apps = [connected(
		app("github", Some("GitHub"), Mark::Picture(&github)),
		Connection::NeedsAuthorization,
	)];
	applications_scene(t, s, AGENT, &apps, false)
}

pub(super) fn applications_connecting(t: &Tokens, s: &SceneState) -> El {
	linear_alone(t, s, Connection::Connecting)
}

pub(super) fn applications_connected(t: &Tokens, s: &SceneState) -> El {
	linear_alone(t, s, Connection::Connected)
}

fn atlas_failed(t: &Tokens, s: &SceneState, reason: Option<ConnectionReason>) -> El {
	let apps =
		[Application { reason, ..connected(app("atlas", None, Mark::Absent), Connection::Failed) }];
	applications_scene(t, s, AGENT, &apps, false)
}

pub(super) fn applications_failed(t: &Tokens, s: &SceneState) -> El {
	atlas_failed(t, s, None)
}

pub(super) fn applications_failed_with_reason(t: &Tokens, s: &SceneState) -> El {
	atlas_failed(t, s, Some(ConnectionReason::BrowserRefused))
}

pub(super) fn applications_failed_with_long_reason(t: &Tokens, s: &SceneState) -> El {
	let reason = Some(ConnectionReason::Unknown(format!("0x{}", "a3f19b7c".repeat(40))));
	let apps =
		[Application { reason, ..connected(app("atlas", None, Mark::Absent), Connection::Failed) }];
	let panel = Applications {
		owner: AGENT,
		applications: &apps,
		query: &s.edit,
		has_failed_to_load: false,
		can_connect: true,
		language: Language::En,
	};
	framed(t, col().w(NARROW_FRAME).h_full().child(applications(t, &panel, query, ignore)))
}

pub(super) fn applications_unanswered(t: &Tokens, s: &SceneState) -> El {
	let linear = picture(LINEAR_MARK);
	let apps = [
		connected(app("linear", Some("Linear"), Mark::Picture(&linear)), Connection::Connected),
		app("ledger", None, Mark::Absent),
	];
	applications_scene(t, s, AGENT, &apps, false)
}

pub(super) fn applications_without_display_name(t: &Tokens, s: &SceneState) -> El {
	let linear = picture(LINEAR_MARK);
	let apps = [
		connected(app("linear", Some("Linear"), Mark::Picture(&linear)), Connection::Connected),
		app("atlas", None, Mark::Absent),
	];
	applications_scene(t, s, AGENT, &apps, false)
}

pub(super) fn applications_long_content(t: &Tokens, s: &SceneState) -> El {
	let linear = picture(LINEAR_MARK);
	let first = vec![
		connected(
			app(
				"linear-enterprise",
				Some("Linear Enterprise workspace for the platform reliability guild"),
				Mark::Picture(&linear),
			),
			Connection::Connected,
		),
		app("nightly-ingestion-pipeline-inspector", None, Mark::Absent),
	];
	with_marked(t, s, AGENT, first)
}

fn identity_scene(t: &Tokens, identity: Identity) -> El {
	padded(t, meta_line(t, identity, Language::En).unwrap_or_else(col))
}

const SMITHERY: Identity = Identity {
	source: Some("Smithery"),
	use_count: Some(12110),
	host: None,
	package_identity: None,
};

pub(super) fn identity_source_and_uses(t: &Tokens, _: &SceneState) -> El {
	identity_scene(t, SMITHERY)
}

pub(super) fn identity_one_use(t: &Tokens, _: &SceneState) -> El {
	identity_scene(t, Identity { use_count: Some(1), ..SMITHERY })
}

pub(super) fn identity_hosted_result(t: &Tokens, _: &SceneState) -> El {
	identity_scene(
		t,
		Identity {
			host: Some("slack.run.tools"),
			package_identity: Some("https://slack.run.tools/mcp"),
			..SMITHERY
		},
	)
}

pub(super) fn identity_package_result(t: &Tokens, _: &SceneState) -> El {
	identity_scene(
		t,
		Identity {
			source: Some("MCP registry"),
			use_count: None,
			host: None,
			package_identity: Some("npx -y @kwn/granola-transcripts"),
		},
	)
}

pub(super) fn identity_nothing_to_say(t: &Tokens, _: &SceneState) -> El {
	identity_scene(t, Identity::default())
}

pub(super) fn identity_verified(t: &Tokens, _: &SceneState) -> El {
	padded(t, verified_pill(t, Language::En))
}

fn mark_scene(t: &Tokens, shown: Mark, size: MarkSize) -> El {
	padded(t, mark(t, shown, size))
}

fn linear_mark(t: &Tokens, size: MarkSize) -> El {
	let linear = picture(LINEAR_MARK);
	mark_scene(t, Mark::Picture(&linear), size)
}

pub(super) fn mark_with_mark(t: &Tokens, _: &SceneState) -> El {
	linear_mark(t, MarkSize::Md)
}

pub(super) fn mark_card(t: &Tokens, _: &SceneState) -> El {
	linear_mark(t, MarkSize::Card)
}

pub(super) fn mark_small(t: &Tokens, _: &SceneState) -> El {
	linear_mark(t, MarkSize::Sm)
}

pub(super) fn mark_extra_small(t: &Tokens, _: &SceneState) -> El {
	linear_mark(t, MarkSize::Xsm)
}

pub(super) fn mark_inline(t: &Tokens, _: &SceneState) -> El {
	linear_mark(t, MarkSize::Inline)
}

pub(super) fn mark_without_mark(t: &Tokens, _: &SceneState) -> El {
	mark_scene(t, Mark::Absent, MarkSize::Md)
}

pub(super) fn mark_with_drawn_mark(t: &Tokens, _: &SceneState) -> El {
	mark_scene(t, Mark::Drawn(&DRAWN_MARK), MarkSize::Md)
}

pub(super) fn mark_with_unreachable_mark(t: &Tokens, _: &SceneState) -> El {
	let unreachable = unreachable_picture();
	mark_scene(t, Mark::Picture(&unreachable), MarkSize::Md)
}

pub(super) fn search_field_story(t: &Tokens, s: &SceneState) -> El {
	padded(t, col().w(SEARCH_FRAME).child(search_field(t, &s.edit, Language::En, query)))
}

pub(super) fn search_field_theme_cell(t: &Tokens, s: &SceneState) -> El {
	let field = col().w(SEARCH_FRAME).child(search_field(t, &s.edit, Language::En, query));
	padded(t, col().padding(THEME_CELL_PADDING).child(field))
}

#[derive(Clone, Copy, Default)]
struct CatalogueState {
	is_loading: bool,
	has_failed: bool,
	has_partly_failed: bool,
	is_stale: bool,
}

fn catalogue_scene(
	t: &Tokens,
	s: &SceneState,
	category: Category,
	applications: &[CatalogueApplication],
	state: CatalogueState,
) -> El {
	let page = Catalogue {
		category,
		query: &s.edit,
		applications,
		is_loading: state.is_loading,
		has_failed: state.has_failed,
		has_partly_failed: state.has_partly_failed,
		is_stale: state.is_stale,
		language: Language::En,
	};
	bordered(t, catalogue(t, &page, query, ignore))
}

fn listed<'a>(
	id: &'a str,
	name: &'a str,
	description: Option<&'a str>,
	setup: Setup,
	mark: Mark<'a>,
) -> CatalogueApplication<'a> {
	CatalogueApplication { id, name, description, setup, mark }
}

fn directory(t: &Tokens, s: &SceneState, category: Category, state: CatalogueState) -> El {
	let marks = [LINEAR_MARK, GITHUB_MARK, NOTION_MARK, SENTRY_MARK, FIGMA_MARK, POSTGRES_MARK]
		.map(picture);
	let typed = s.edit.text.trim().to_lowercase();
	let everything = [
		listed(
			"linear",
			"Linear",
			Some("Reads and files issues, projects and cycles."),
			Setup::SignIn,
			Mark::Picture(&marks[0]),
		),
		listed(
			"github",
			"GitHub",
			Some("Opens pull requests and reads repositories."),
			Setup::SignIn,
			Mark::Picture(&marks[1]),
		),
		listed(
			"notion",
			"Notion",
			Some("Searches pages and writes into databases."),
			Setup::SignIn,
			Mark::Picture(&marks[2]),
		),
		listed(
			"sentry",
			"Sentry",
			Some("Pulls the errors and traces behind a release."),
			Setup::ApiKey,
			Mark::Picture(&marks[3]),
		),
		listed(
			"figma",
			"Figma",
			Some("Reads frames, components and their tokens."),
			Setup::ApiKey,
			Mark::Picture(&marks[4]),
		),
		listed(
			"postgres",
			"Postgres",
			Some("Runs read-only queries against a local database."),
			Setup::Nothing,
			Mark::Picture(&marks[5]),
		),
	];
	let shown: Vec<CatalogueApplication> = everything
		.into_iter()
		.filter(|application| application.name.to_lowercase().contains(&typed))
		.collect();
	catalogue_scene(t, s, category, &shown, state)
}

pub(super) fn catalogue_at_rest(t: &Tokens, s: &SceneState) -> El {
	directory(t, s, Category::Everything, CatalogueState::default())
}

pub(super) fn catalogue_category_selected(t: &Tokens, s: &SceneState) -> El {
	directory(t, s, Category::DeveloperTools, CatalogueState::default())
}

pub(super) fn catalogue_on_this_machine_selected(t: &Tokens, s: &SceneState) -> El {
	directory(t, s, Category::OnThisMachine, CatalogueState::default())
}

pub(super) fn catalogue_partly_unreadable(t: &Tokens, s: &SceneState) -> El {
	directory(
		t,
		s,
		Category::Everything,
		CatalogueState { has_partly_failed: true, ..CatalogueState::default() },
	)
}

pub(super) fn catalogue_served_stale(t: &Tokens, s: &SceneState) -> El {
	directory(
		t,
		s,
		Category::Everything,
		CatalogueState { is_stale: true, ..CatalogueState::default() },
	)
}

pub(super) fn catalogue_loading(t: &Tokens, s: &SceneState) -> El {
	catalogue_scene(
		t,
		s,
		Category::Everything,
		&[],
		CatalogueState { is_loading: true, ..CatalogueState::default() },
	)
}

pub(super) fn catalogue_unreadable(t: &Tokens, s: &SceneState) -> El {
	catalogue_scene(
		t,
		s,
		Category::Everything,
		&[],
		CatalogueState { has_failed: true, ..CatalogueState::default() },
	)
}

pub(super) fn catalogue_nothing_matched(t: &Tokens, s: &SceneState) -> El {
	catalogue_scene(t, s, Category::Everything, &[], CatalogueState::default())
}

pub(super) fn catalogue_category_empty(t: &Tokens, s: &SceneState) -> El {
	catalogue_scene(t, s, Category::Travel, &[], CatalogueState::default())
}

fn single(t: &Tokens, s: &SceneState, application: CatalogueApplication) -> El {
	catalogue_scene(t, s, Category::Everything, &[application], CatalogueState::default())
}

pub(super) fn catalogue_card_name_too_long(t: &Tokens, s: &SceneState) -> El {
	let slack = picture(SLACK_MARK);
	single(
		t,
		s,
		listed(
			"smithery/slack",
			"a-very-long-application-name-that-keeps-going-on-and-on-well-past-the-width-of-the-card-it-is-drawn-in",
			Some("Reads channels and posts messages as you."),
			Setup::SignIn,
			Mark::Picture(&slack),
		),
	)
}

pub(super) fn catalogue_card_description_clamps(t: &Tokens, s: &SceneState) -> El {
	single(
		t,
		s,
		listed(
			"smithery/inbox-reader",
			"inbox-reader",
			Some(
				"Reads every channel, every thread and every message ever written, then writes back where it is allowed to, which takes a long sentence to say.",
			),
			Setup::SignIn,
			Mark::Absent,
		),
	)
}

pub(super) fn catalogue_card_without_description(t: &Tokens, s: &SceneState) -> El {
	single(t, s, listed("io.github.kwn/linkboard", "linkboard", None, Setup::SignIn, Mark::Absent))
}

pub(super) fn catalogue_setup_unavailable(t: &Tokens, s: &SceneState) -> El {
	single(
		t,
		s,
		listed(
			"smithery/queried",
			"Queried",
			Some("Asks for a key its url would carry."),
			Setup::Unavailable,
			Mark::Absent,
		),
	)
}

fn field_value(s: &mut SceneState, _: usize) -> &mut TextEdit {
	&mut s.edit
}

fn installable<'a>(
	id: &'a str,
	name: &'a str,
	package_identity: &'a str,
	setup: Setup,
) -> Installable<'a> {
	Installable {
		id,
		name,
		description: None,
		package_identity,
		setup,
		mark: Mark::Absent,
		source: None,
		use_count: None,
		is_verified: false,
		host: None,
		tools: None,
		fields: &[],
		refusal: None,
	}
}

fn install_scene(t: &Tokens, owner: Owner, application: &Installable, is_installing: bool) -> El {
	let page = InstallPage {
		category: Category::Everything,
		application,
		owner,
		is_installing,
		is_installed: false,
		failure: None,
		language: Language::En,
	};
	bordered(t, install_page(t, &page, field_value, ignore))
}

fn granola<'a>(mark: &'a Image, name: &'a str, tools: &'a [&'a str]) -> Installable<'a> {
	Installable {
		description: Some("Reads your meeting notes and transcripts."),
		mark: Mark::Picture(mark),
		tools: Some(tools),
		..installable("granola", name, "https://mcp.granola.ai/mcp", Setup::SignIn)
	}
}

pub(super) fn install_signs_you_in(t: &Tokens, _: &SceneState) -> El {
	let mark = picture(GRANOLA_MARK);
	install_scene(t, INSTALL_AGENT, &granola(&mark, "Granola", &GRANOLA_TOOLS), false)
}

pub(super) fn install_long_content(t: &Tokens, _: &SceneState) -> El {
	let mark = picture(GRANOLA_MARK);
	let tools: Vec<String> = (1..=40).map(|index| format!("tool_number_{index}")).collect();
	let tools: Vec<&str> = tools.iter().map(String::as_str).collect();
	let name = "a-very-long-application-name-that-keeps-going-on-and-on-well";
	install_scene(t, INSTALL_AGENT, &granola(&mark, name, &tools), false)
}

fn sentry_scene(t: &Tokens, s: &SceneState, owner: Owner, is_installing: bool) -> El {
	let mark = picture(SENTRY_MARK);
	let fields = [KeyField {
		name: "Authorization",
		description: Some("A Sentry user auth token."),
		is_concealed: true,
		is_revealed: false,
		value: &s.edit,
	}];
	let sentry = Installable {
		description: Some("Pulls the errors and traces behind a release."),
		mark: Mark::Picture(&mark),
		tools: Some(&SENTRY_TOOLS),
		fields: &fields,
		..installable("sentry", "Sentry", "https://mcp.sentry.dev/mcp", Setup::ApiKey)
	};
	install_scene(t, owner, &sentry, is_installing)
}

pub(super) fn install_needs_api_key(t: &Tokens, s: &SceneState) -> El {
	sentry_scene(t, s, INSTALL_AGENT, false)
}

pub(super) fn install_running(t: &Tokens, s: &SceneState) -> El {
	sentry_scene(t, s, INSTALL_AGENT, true)
}

pub(super) fn install_for_space(t: &Tokens, s: &SceneState) -> El {
	sentry_scene(t, s, INSTALL_SPACE, false)
}

pub(super) fn install_asks_for_every_value(t: &Tokens, s: &SceneState) -> El {
	let fields = [
		KeyField {
			name: "GODOT_PATH",
			description: Some("Path to the Godot executable."),
			is_concealed: false,
			is_revealed: false,
			value: &s.edit,
		},
		KeyField {
			name: "GODOT_PROJECT_PATH",
			description: Some("Path to the folder holding project.godot."),
			is_concealed: false,
			is_revealed: false,
			value: &s.edit,
		},
	];
	let godot = Installable {
		fields: &fields,
		..installable(
			"io.github.DiegoBr4nd/godot-gut-mcp",
			"godot-gut-mcp",
			"io.github.DiegoBr4nd/godot-gut-mcp",
			Setup::ApiKey,
		)
	};
	install_scene(t, INSTALL_AGENT, &godot, false)
}

pub(super) fn install_nothing_to_set_up(t: &Tokens, _: &SceneState) -> El {
	let tasklog =
		installable("io.github.kwn/tasklog", "tasklog", "npx -y @kwn/tasklog-mcp", Setup::Nothing);
	install_scene(t, INSTALL_AGENT, &tasklog, false)
}

pub(super) fn install_empty_tool_list(t: &Tokens, _: &SceneState) -> El {
	let meshvault = Installable {
		description: Some("Stores and serves mesh assets."),
		tools: Some(&[]),
		..installable("meshvault", "Meshvault", "https://mcp.meshvault.dev/mcp", Setup::Nothing)
	};
	install_scene(t, INSTALL_AGENT, &meshvault, false)
}

pub(super) fn install_refused(t: &Tokens, _: &SceneState) -> El {
	let queried = Installable {
		description: Some("Asks for a key its url would carry."),
		source: Some("Smithery"),
		host: Some("queried.run.tools"),
		tools: Some(&["search_records", "read_record"]),
		refusal: Some(
			"the required field \"apiKey\" names no header to carry it, and a key must never travel in a url",
		),
		..installable(
			"smithery/queried",
			"Queried",
			"https://queried.run.tools/mcp",
			Setup::Unavailable,
		)
	};
	install_scene(t, INSTALL_AGENT, &queried, false)
}

fn slack_scene(t: &Tokens, setup: Setup) -> El {
	let mark = picture(SLACK_MARK);
	let slack = Installable {
		description: Some("Reads channels and posts messages as you."),
		mark: Mark::Picture(&mark),
		source: Some("Smithery"),
		use_count: Some(12110),
		is_verified: true,
		host: Some("slack.run.tools"),
		tools: Some(&SLACK_TOOLS),
		..installable("smithery/slack", "Slack", "https://slack.run.tools/mcp", setup)
	};
	install_scene(t, INSTALL_AGENT, &slack, false)
}

pub(super) fn install_runs_on_its_host(t: &Tokens, _: &SceneState) -> El {
	slack_scene(t, Setup::SignIn)
}

pub(super) fn install_hosted_nothing_to_set_up(t: &Tokens, _: &SceneState) -> El {
	slack_scene(t, Setup::Nothing)
}
