use std::process::ExitCode;
use std::sync::{Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::Duration;

use rune::{AppHandle, AppSpec, Cx, El, KeyEvent, Tx, Waker, el};
use rune_kit::shell;

use kiroshi_rune_kit::tokens;
use kiroshi_rune_os::instance::{self, Claim, ClaimError, Endpoint, Forward, Instance};
use kiroshi_rune_os::launch::{self, Launch};
use kiroshi_rune_os::link::{self, Link};
use kiroshi_rune_os::scheme;
use kiroshi_rune_preview::app::App;
use kiroshi_rune_preview::host::Profile;
use kiroshi_rune_preview::navigation::Route;
use kiroshi_rune_preview::surfaces::{s09_routines, s12_person_settings, s15_boards};
use kiroshi_rune_preview::{
	composer, conversations, local, menu, onboarding, scenes, smoke, spike,
};

fn view(s: &App, cx: &mut Cx<App>) -> El {
	let dark = cx.system_dark();
	let t = tokens::Tokens { reduced_motion: cx.is_reduced_motion(), ..tokens::Tokens::new(dark) };
	if let Route::BlockSpike = s.navigation.main_route() {
		return spike::view::view(s, cx, &t);
	}
	let k = t.kit();
	let body = match s.navigation.main_route() {
		Route::Onboarding(step) => onboarding::view(step, s, &k, &t.in_space(Some(tokens::BLUE))),
		Route::Conversations => {
			let viewport = conversations::Viewport {
				inset: cx.titlebar_inset(),
				transcript_height: cx.layout(conversations::TRANSCRIPT).map(|rect| rect[3]),
				composer: composer::Measured {
					surface_width: cx.layout(composer::COMPOSER_SURFACE).map(|rect| rect[2]),
					text_width: cx.layout(composer::COMPOSER_MIRROR).map(|rect| rect[2]),
				},
			};
			conversations::view(s, &k, &t, &viewport)
		}
		Route::BlockSpike
		| Route::Chrome
		| Route::Rail
		| Route::Roster
		| Route::Boot
		| Route::Thread
		| Route::Composer
		| Route::Approvals
		| Route::Missions
		| Route::AgentSettings
		| Route::Applications
		| Route::SpaceSettings
		| Route::Library => el(),
		Route::Routines => s09_routines::view(s, &t),
		Route::PersonSettings => s12_person_settings::view(s, &t),
		Route::Boards => s15_boards::view(s, &t, cx.layout_size(s15_boards::CANVAS)),
	};
	let mut layers = s12_person_settings::layers(s, &t);
	layers.extend(s09_routines::layers(s, &t));
	rune_kit::root(body, layers)
}

const DEV_HOST: &str = "--dev-host";

const SKIP_ONBOARDING: &str = "--skip-onboarding";

const HOST_API: &str = "--host-api";

fn setup(s: &mut App, waker: Waker) {
	let flagged = |flag: &str| launched().flags.iter().any(|arg| arg == flag);
	if flagged(DEV_HOST) {
		s.host_profile = Profile::Dev;
	}
	s.uses_host_api = flagged(DEV_HOST) || flagged(HOST_API);
	if flagged(DEV_HOST) || flagged(SKIP_ONBOARDING) {
		s.navigation.navigate_main(Route::Conversations);
	}
	s.surfaces.s12_person_settings.attach(waker.clone());
	s.surfaces.s09_routines.attach(waker.clone());
	s.setup(waker);
}

fn poll(s: &mut App, seconds: f64, tx: &mut Tx) -> bool {
	let changed = s.poll();
	let changed = s12_person_settings::poll(s, tx) || changed;
	let changed = s09_routines::poll(s, tx) || changed;
	let changed = open_held(s, &mut held_links()) || changed;
	if let Some(after) = s.focus_wake() {
		tx.wake_after(after);
	}
	if !s.tick(seconds) {
		return changed;
	}
	tx.wake_after(Duration::ZERO);
	true
}

fn on_key(s: &mut App, event: &KeyEvent, _: &mut Tx) -> bool {
	if s12_person_settings::key_pressed(s, event) {
		return true;
	}
	if shell::is_sidebar_toggle(event) {
		s.sidebar.toggle();
		return true;
	}
	false
}

const SMOKE_SEND: &str = "--smoke-send";

const SMOKE_READ: &str = "--smoke-read";

const LOCAL_SEND: &str = "--local-send";

const REGISTER_SCHEME: &str = "--register-scheme";

static HELD_LINKS: Mutex<Vec<String>> = Mutex::new(Vec::new());

static WINDOW: OnceLock<AppHandle<App>> = OnceLock::new();

static LAUNCH: OnceLock<Launch> = OnceLock::new();

fn launched() -> &'static Launch {
	LAUNCH.get_or_init(|| launch::split(&std::env::args().collect::<Vec<_>>()))
}

fn rune_args() -> Vec<String> {
	launched().flags.iter().skip(1).cloned().collect()
}

fn held_links() -> MutexGuard<'static, Vec<String>> {
	HELD_LINKS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn routed(s: &mut App, held: &mut Vec<String>, raw: &str) -> bool {
	match link::parse(raw) {
		Ok(Link::Conversation(id)) => {
			open_or_hold(s, held, id);
			true
		}
		Ok(Link::Join(_)) => {
			eprintln!(
				"a kiroshi://join link arrived: Rune has no join screen yet, so it goes nowhere"
			);
			false
		}
		Err(rejected) => {
			eprintln!("a kiroshi link was ignored: {rejected}");
			false
		}
	}
}

fn open_or_hold(s: &mut App, held: &mut Vec<String>, id: String) {
	let Some(ready) = s.ready() else { return held.push(id) };
	if !ready.conversations.iter().any(|conversation| conversation.id == id) {
		return eprintln!("a kiroshi link names conversation {id}, unknown here: the view stays");
	}
	s.open(&id);
}

fn open_held(s: &mut App, held: &mut Vec<String>) -> bool {
	if held.is_empty() || s.ready().is_none() {
		return false;
	}
	std::mem::take(held).into_iter().for_each(|id| open_or_hold(s, held, id));
	true
}

fn on_open_url(s: &mut App, raw: &str, _: &mut Tx) {
	if routed(s, &mut held_links(), raw)
		&& let Some(window) = WINDOW.get()
	{
		window.focus();
	}
}

fn route_all(window: &AppHandle<App>, links: Vec<String>) {
	window.update(move |s, _| {
		let mut held = held_links();
		for raw in &links {
			routed(s, &mut held, raw);
		}
	});
}

fn forwarded(window: &AppHandle<App>, forward: Forward) {
	match forward.activation_token {
		Some(token) => window.activate(token),
		None => window.focus(),
	}
	route_all(window, forward.links);
}

fn data_profile(args: &[String]) -> Option<String> {
	let flagged = |flag: &str| args.iter().any(|arg| arg == flag);
	if flagged(DEV_HOST) {
		return Some(format!("host {}", Profile::Dev.app_name()));
	}
	if flagged(HOST_API) {
		return Some(format!("host {}", Profile::Installed.app_name()));
	}
	match local::data_folder() {
		Ok(folder) => Some(format!("local {}", folder.display())),
		Err(failure) => {
			eprintln!("this window runs without single instance: {failure}");
			None
		}
	}
}

fn claimed(launch: &Launch) -> Result<Option<Instance>, ExitCode> {
	if rune::tooling::Args::parse_from(rune_args()).headless() {
		return Ok(None);
	}
	let Some(profile) = data_profile(&launch.flags) else { return Ok(None) };
	match instance::claim(&Endpoint::of_profile(&profile), &Forward::of_launch(&launch.links)) {
		Ok(Claim::First(instance)) => Ok(Some(instance)),
		Ok(Claim::Forwarded) => Err(ExitCode::SUCCESS),
		Err(failure @ (ClaimError::Endpoint(_) | ClaimError::ForeignOwner(_))) => {
			eprintln!("this window runs without single instance: {failure}");
			Ok(None)
		}
		Err(failure @ ClaimError::Forward(_)) => {
			eprintln!("{failure}");
			Err(ExitCode::FAILURE)
		}
	}
}

fn register_scheme(args: &[String]) -> ExitCode {
	let carried: Vec<&str> = [DEV_HOST, HOST_API]
		.into_iter()
		.filter(|flag| args.iter().any(|arg| arg == flag))
		.collect();
	match scheme::register(&carried) {
		Ok(()) => {
			eprintln!("kiroshi:// links now open this preview");
			ExitCode::SUCCESS
		}
		Err(failure) => {
			eprintln!("the kiroshi scheme was not registered: {failure}");
			ExitCode::FAILURE
		}
	}
}

fn action(args: &[String]) -> Option<ExitCode> {
	if let Some(at) = args.iter().position(|arg| arg == SMOKE_SEND) {
		let Some(text) = args.get(at + 1) else {
			eprintln!("{SMOKE_SEND} needs the text to send");
			return Some(ExitCode::FAILURE);
		};
		return Some(smoke::run(text));
	}
	if args.iter().any(|arg| arg == SMOKE_READ) {
		return Some(smoke::read());
	}
	if let Some(at) = args.iter().position(|arg| arg == LOCAL_SEND) {
		let Some(text) = args.get(at + 1) else {
			eprintln!("{LOCAL_SEND} needs the text to send");
			return Some(ExitCode::FAILURE);
		};
		return Some(local::send_and_read(text));
	}
	if args.iter().any(|arg| arg == REGISTER_SCHEME) {
		return Some(register_scheme(args));
	}
	None
}

fn main() -> ExitCode {
	let launch = launched();
	if launch.dropped > 0 {
		eprintln!(
			"{} arguments after {} were not kiroshi links: dropped, and no smoke, send or register action runs",
			launch.dropped,
			launch::LINKS_FOLLOW
		);
	} else if let Some(exit) = action(&launch.flags) {
		return exit;
	}
	let instance = match claimed(launch) {
		Ok(instance) => instance,
		Err(exit) => return exit,
	};
	let spec = AppSpec {
		setup: Some(setup),
		poll: Some(poll),
		on_key: Some(on_key),
		min_size: Some((720.0, 520.0)),
		scenes: scenes::SCENES,
		fonts: tokens::FONTS,
		families: tokens::FAMILIES,
		..AppSpec::new("Kiroshi (Rune preview)", (1180.0, 780.0), App::new, view)
	};
	let app = rune::App::new(spec)
		.chrome(conversations::CHROME)
		.on_open_url(on_open_url)
		.args(rune_args());
	let window = WINDOW.get_or_init(|| app.handle());
	route_all(window, launch.links.clone());
	if let Some(instance) = instance
		&& let Err(failure) = instance.serve(|forward| forwarded(window, forward))
	{
		eprintln!("this window takes no forwarded launch: {failure}");
	}
	app.on_ready(move |_| menu::install(window)).run();
	ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
	use super::*;

	fn loaded(s: &mut App) {
		let (_, thread) =
			scenes::SCENES.iter().find(|(name, _)| *name == "thread").expect("the thread scene");
		thread(s);
	}

	fn opened(s: &App) -> Option<&str> {
		s.thread.as_ref().map(|thread| thread.conversation_id.as_str())
	}

	fn another_conversation(s: &App) -> String {
		let ready = s.ready().expect("a loaded workspace");
		let other = ready
			.conversations
			.iter()
			.find(|conversation| Some(conversation.id.as_str()) != opened(s));
		other.expect("a second conversation").id.clone()
	}

	#[test]
	fn a_conversation_link_opens_its_conversation() {
		let mut s = App::new();
		loaded(&mut s);
		let target = another_conversation(&s);
		let mut held = Vec::new();

		let is_routed = routed(&mut s, &mut held, &format!("kiroshi://conversation/{target}"));

		assert!(is_routed);
		assert_eq!(opened(&s), Some(target.as_str()));
		assert!(held.is_empty());
	}

	#[test]
	fn a_link_before_the_list_loads_is_held_then_opened() {
		let mut s = App::new();
		let mut probe = App::new();
		loaded(&mut probe);
		let target = another_conversation(&probe);
		let mut held = Vec::new();

		routed(&mut s, &mut held, &format!("kiroshi://conversation/{target}"));
		let before = (opened(&s).map(str::to_owned), open_held(&mut s, &mut held));
		loaded(&mut s);
		let is_opened = open_held(&mut s, &mut held);

		assert_eq!(before, (None, false));
		assert!(is_opened);
		assert_eq!(opened(&s), Some(target.as_str()));
		assert!(held.is_empty());
	}

	#[test]
	fn an_unknown_conversation_keeps_the_current_view() {
		let mut s = App::new();
		loaded(&mut s);
		let current = opened(&s).map(str::to_owned);
		let mut held = Vec::new();

		routed(&mut s, &mut held, "kiroshi://conversation/not-in-this-space");

		assert_eq!(opened(&s).map(str::to_owned), current);
		assert!(held.is_empty());
	}

	#[test]
	fn a_rejected_or_join_link_changes_nothing() {
		let mut s = App::new();
		loaded(&mut s);
		let current = opened(&s).map(str::to_owned);
		let mut held = Vec::new();
		let target = another_conversation(&s);

		let rejected = routed(&mut s, &mut held, &format!("kiroshi://conversation/{target}?x=1"));
		let join = routed(&mut s, &mut held, "kiroshi://join?invitation=inv_1");
		let elsewhere = routed(&mut App::new(), &mut held, "https://kiroshi.app/conversation/a");

		assert_eq!((rejected, join, elsewhere), (false, false, false));
		assert_eq!(opened(&s).map(str::to_owned), current);
		assert!(held.is_empty());
	}
}
