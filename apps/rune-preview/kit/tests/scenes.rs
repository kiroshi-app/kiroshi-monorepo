#![cfg(any(target_os = "macos", target_os = "linux"))]

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use kiroshi_rune_kit::scenes::{self, Pointer, Scene, SceneState, Theme};
use rune::tooling::{self, Args};
use rune::{App, FontSmoothing};

const BLESS: &str = "KIROSHI_BLESS";
const FAILED: &str = "failed";
const SCALE: &str = "2";
const SNAP_AT: f64 = 2.0;
const FRAME: f64 = 1.0 / 60.0;
const KEY_STEP: f64 = 0.05;
const GESTURE: f64 = 0.5;
const HOVER: f64 = 0.2;
const AWAY: (f64, f64) = (1.0, 1.0);
const DIFF_INK: [u8; 4] = [255, 0, 64, 255];
const DIFF_FADE: u8 = 4;
const PLATFORMS: [&str; 2] = ["macos", "linux"];
const HERE: usize = if cfg!(target_os = "macos") { 0 } else { 1 };
const PAIRS: &str = "pairs.txt";
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0100_0000_01b3;

type Digests = BTreeMap<String, u64>;
type Pair = [u64; 2];

fn platform() -> &'static str {
	PLATFORMS[HERE]
}

fn captures() -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR")).join("captures")
}

fn baselines() -> PathBuf {
	captures().join(platform())
}

struct Picture {
	width: u32,
	height: u32,
	rgba: Vec<u8>,
}

fn decode(path: &Path) -> Result<Picture, String> {
	let file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
	let mut decoder = png::Decoder::new(std::io::BufReader::new(file));
	decoder.set_transformations(png::Transformations::normalize_to_color8());
	let mut reader = decoder.read_info().map_err(|e| format!("{}: {e}", path.display()))?;
	let mut pixels = vec![0; reader.output_buffer_size().unwrap_or_default()];
	let frame = reader.next_frame(&mut pixels).map_err(|e| format!("{}: {e}", path.display()))?;
	pixels.truncate(frame.buffer_size());
	let rgba = match frame.color_type {
		png::ColorType::Rgba => pixels,
		png::ColorType::Rgb => {
			pixels.as_chunks::<3>().0.iter().flat_map(|&[r, g, b]| [r, g, b, 255]).collect()
		}
		other => return Err(format!("{}: unexpected colour type {other:?}", path.display())),
	};
	Ok(Picture { width: frame.width, height: frame.height, rgba })
}

fn encode(path: &Path, picture: &Picture) -> Result<(), String> {
	let file = File::create(path).map_err(|e| format!("{}: {e}", path.display()))?;
	let mut encoder = png::Encoder::new(BufWriter::new(file), picture.width, picture.height);
	encoder.set_color(png::ColorType::Rgba);
	encoder.set_depth(png::BitDepth::Eight);
	let mut writer = encoder.write_header().map_err(|e| format!("{}: {e}", path.display()))?;
	writer.write_image_data(&picture.rgba).map_err(|e| format!("{}: {e}", path.display()))
}

fn hover(at: f64, key: &str) -> String {
	format!(r#"{{"t": {at}, "type": "move", "key": "{key}"}}"#)
}

fn key_press(at: f64, key: char) -> String {
	let (name, is_shifted) = match key {
		'←' => ("Left".to_owned(), false),
		'→' => ("Right".to_owned(), false),
		'↑' => ("Up".to_owned(), false),
		'↓' => ("Down".to_owned(), false),
		'⏎' => ("Enter".to_owned(), false),
		'⎋' => ("Escape".to_owned(), false),
		'⇥' => ("Tab".to_owned(), false),
		'⇤' => ("Tab".to_owned(), true),
		other => (other.to_string(), false),
	};
	format!(r#"{{"t": {at}, "type": "key", "name": "{name}", "shift": {is_shifted}}}"#)
}

fn script(scene: &Scene, beside: &Path) -> Option<PathBuf> {
	let last_frame = SNAP_AT - FRAME;
	let mut events: Vec<String> = (0..scene.tabs)
		.map(|press| {
			format!(r#"{{"t": {}, "type": "key", "name": "Tab"}}"#, press as f64 * KEY_STEP)
		})
		.collect();
	let gesture_at = scene.tabs as f64 * KEY_STEP;
	let keys_from = match scene.pointer {
		Pointer::Taps(key) => {
			events.push(hover(gesture_at, key));
			let tap_at = gesture_at + HOVER;
			events.push(format!(r#"{{"t": {tap_at}, "type": "tap", "key": "{key}"}}"#));
			tap_at + GESTURE
		}
		Pointer::RightClicks(key) => {
			events.push(hover(gesture_at, key));
			let click_at = gesture_at + HOVER;
			events
				.push(format!(r#"{{"t": {click_at}, "type": "secondary-click", "key": "{key}"}}"#));
			click_at + GESTURE
		}
		Pointer::Drags(key, dx, dy) => {
			events.push(format!(
				r#"{{"t": {gesture_at}, "type": "drag", "key": "{key}", "dx": {dx}, "dy": {dy}}}"#
			));
			gesture_at + GESTURE
		}
		Pointer::Away | Pointer::EntersAtSnap(_) | Pointer::LeavesAtSnap(_) => gesture_at,
	};
	events.extend(
		scene
			.keys
			.chars()
			.enumerate()
			.map(|(press, key)| key_press(keys_from + press as f64 * KEY_STEP, key)),
	);
	match scene.pointer {
		Pointer::Away | Pointer::Taps(_) | Pointer::RightClicks(_) | Pointer::Drags(..) => {}
		Pointer::EntersAtSnap(key) => events.push(hover(last_frame, key)),
		Pointer::LeavesAtSnap(key) => {
			events.push(hover(0.0, key));
			events.push(format!(
				r#"{{"t": {last_frame}, "type": "move", "x": {}, "y": {}}}"#,
				AWAY.0, AWAY.1
			));
		}
	}
	if events.is_empty() {
		return None;
	}
	let path = beside.with_extension("json");
	fs::write(&path, format!(r#"{{"events": [{}]}}"#, events.join(", ")))
		.expect("the key script is written");
	Some(path)
}

fn render(scene: &'static Scene, theme: Theme, out: &Path) {
	let size = format!("{}x{}", scene.size.0, scene.size.1);
	let snap_at = SNAP_AT.to_string();
	let mut argv: Vec<String> = ["scenes", "--snap"].map(String::from).to_vec();
	argv.push(out.display().to_string());
	argv.extend(
		["--theme", theme.name(), "--size", &size, "--scale", SCALE, "--at", &snap_at]
			.map(String::from),
	);
	if let Some(keys) = script(scene, out) {
		argv.extend(["--script".to_owned(), keys.display().to_string()]);
	}
	let app = App::new(scenes::spec(scene))
		.init(move || SceneState::new(scene))
		.font_smoothing(FontSmoothing::On)
		.tab_visits_controls(true);
	tooling::headless(app, Args::parse_from(argv));
}

fn differences(actual: &Picture, expected: &Picture) -> Option<Picture> {
	if (actual.width, actual.height) != (expected.width, expected.height) {
		return Some(Picture {
			width: actual.width,
			height: actual.height,
			rgba: actual.rgba.clone(),
		});
	}
	let mut differs = false;
	let rgba = actual
		.rgba
		.as_chunks::<4>()
		.0
		.iter()
		.zip(expected.rgba.as_chunks::<4>().0)
		.flat_map(|(a, e)| {
			if a == e {
				[a[0] / DIFF_FADE, a[1] / DIFF_FADE, a[2] / DIFF_FADE, 255]
			} else {
				differs = true;
				DIFF_INK
			}
		})
		.collect();
	differs.then_some(Picture { width: actual.width, height: actual.height, rgba })
}

fn check(
	scene: &'static Scene,
	theme: Theme,
	bless: bool,
	rendered: &Path,
	failed: &Path,
) -> Option<String> {
	let name = scene.baseline(theme);
	let out = rendered.join(&name);
	render(scene, theme, &out);
	let baseline = baselines().join(&name);
	if bless {
		fs::copy(&out, &baseline).expect("the baseline is rewritten");
		return None;
	}
	let keep_actual = || {
		fs::create_dir_all(failed).expect("the failed folder exists");
		fs::copy(&out, failed.join(&name)).expect("the actual image is kept");
	};
	if !baseline.exists() {
		keep_actual();
		return Some(format!(
			"{name}: no baseline in {}; {BLESS}=1 writes it",
			baselines().display()
		));
	}
	let (actual, expected) = match (decode(&out), decode(&baseline)) {
		(Ok(actual), Ok(expected)) => (actual, expected),
		(Err(failure), _) | (_, Err(failure)) => return Some(failure),
	};
	let diff = differences(&actual, &expected)?;
	keep_actual();
	let diff_path = failed.join(name.replace(".png", "-diff.png"));
	if let Err(failure) = encode(&diff_path, &diff) {
		return Some(failure);
	}
	Some(format!("{name}: differs from its baseline; see {}", diff_path.display()))
}

fn orphans() -> Vec<String> {
	let registered: BTreeSet<String> = scenes::every_scene()
		.flat_map(|scene| scene.themes.iter().map(|&theme| scene.baseline(theme)))
		.collect();
	let Ok(entries) = fs::read_dir(baselines()) else { return Vec::new() };
	entries
		.filter_map(|entry| entry.ok()?.file_name().into_string().ok())
		.filter(|name| name.ends_with(".png") && !registered.contains(name))
		.map(|name| format!("{name}: a baseline no registered scene names"))
		.collect()
}

fn digest(bytes: &[u8]) -> u64 {
	bytes.iter().fold(FNV_OFFSET, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(FNV_PRIME))
}

fn held(platform: &str) -> Result<Digests, String> {
	let folder = captures().join(platform);
	let mut digests = Digests::new();
	for entry in fs::read_dir(&folder).map_err(|e| format!("{}: {e}", folder.display()))? {
		let path = entry.map_err(|e| format!("{}: {e}", folder.display()))?.path();
		let Some(name) = path.file_name().and_then(|name| name.to_str()) else { continue };
		if !name.ends_with(".png") {
			continue;
		}
		let bytes = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
		digests.insert(name.to_owned(), digest(&bytes));
	}
	Ok(digests)
}

fn held_on_both() -> Result<[Digests; 2], String> {
	Ok([held(PLATFORMS[0])?, held(PLATFORMS[1])?])
}

fn recorded_pair(line: &str) -> Option<(String, Pair)> {
	let mut fields = line.split(' ');
	let name = fields.next()?.to_owned();
	let macos = u64::from_str_radix(fields.next()?, 16).ok()?;
	let linux = u64::from_str_radix(fields.next()?, 16).ok()?;
	Some((name, [macos, linux]))
}

fn recorded_pairs() -> Result<BTreeMap<String, Pair>, String> {
	let path = captures().join(PAIRS);
	fs::read_to_string(&path)
		.map_err(|e| format!("{}: {e}", path.display()))?
		.lines()
		.map(|line| {
			recorded_pair(line)
				.ok_or_else(|| format!("{}: unreadable line {line:?}", path.display()))
		})
		.collect()
}

fn pair_after_bless(held: Pair, recorded: Option<Pair>, blessed: usize) -> Pair {
	let counterpart = 1 - blessed;
	match recorded {
		Some(pair) if pair[counterpart] == held[counterpart] => pair,
		_ => held,
	}
}

fn record_pairs() -> Result<(), String> {
	let held = held_on_both()?;
	let recorded = recorded_pairs()?;
	let lines: String = held[0]
		.iter()
		.filter_map(|(name, &macos)| {
			let both = [macos, *held[1].get(name)?];
			let pair = pair_after_bless(both, recorded.get(name).copied(), HERE);
			Some(format!("{name} {:016x} {:016x}\n", pair[0], pair[1]))
		})
		.collect();
	let path = captures().join(PAIRS);
	fs::write(&path, lines).map_err(|e| format!("{}: {e}", path.display()))
}

fn parity_failure(name: &str, held: [Option<u64>; 2], recorded: Option<Pair>) -> Option<String> {
	let behind = |platform: usize, state: &str, cause: &str| {
		let (lagging, ahead) = (PLATFORMS[platform], PLATFORMS[1 - platform]);
		Some(format!("{lagging}/{name}: {state}, {ahead}/{name} {cause}"))
	};
	match (held, recorded) {
		([Some(macos), Some(linux)], Some(pair)) if pair == [macos, linux] => None,
		([Some(_), None], _) => behind(1, "missing", "has no counterpart"),
		([None, Some(_)], _) => behind(0, "missing", "has no counterpart"),
		([Some(_), Some(linux)], Some(pair)) if pair[1] == linux => {
			behind(1, "stale", "was rewritten without it")
		}
		([Some(macos), Some(_)], Some(pair)) if pair[0] == macos => {
			behind(0, "stale", "was rewritten without it")
		}
		_ => Some(format!(
			"{name}: {PAIRS} holds no pair of the baselines both platforms hold; {BLESS}=1 records it"
		)),
	}
}

fn parity_failures() -> Result<Vec<String>, String> {
	let held = held_on_both()?;
	let recorded = recorded_pairs()?;
	let names: BTreeSet<&String> = held.iter().flat_map(Digests::keys).collect();
	Ok(names
		.into_iter()
		.filter_map(|name| {
			let held = [held[0].get(name).copied(), held[1].get(name).copied()];
			parity_failure(name, held, recorded.get(name).copied())
		})
		.collect())
}

#[test]
fn every_registered_scene_matches_its_baseline() {
	let bless = std::env::var_os(BLESS).is_some();
	let rendered = Path::new(env!("CARGO_TARGET_TMPDIR")).join("scenes").join(platform());
	let failed = baselines().join(FAILED);
	fs::create_dir_all(&rendered).expect("the render folder exists");
	if failed.exists() {
		fs::remove_dir_all(&failed).expect("the last run's failures are cleared");
	}
	if bless {
		fs::create_dir_all(baselines()).expect("the baseline folder exists");
	}
	let mut failures: Vec<String> = scenes::every_scene()
		.flat_map(|scene| scene.themes.iter().map(move |&theme| (scene, theme)))
		.filter_map(|(scene, theme)| check(scene, theme, bless, &rendered, &failed))
		.collect();
	failures.extend(orphans());
	if bless {
		failures.extend(record_pairs().err());
	}
	assert!(failures.is_empty(), "{} scene failures:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn every_baseline_matches_its_counterpart_on_the_other_platform() {
	if std::env::var_os(BLESS).is_some() {
		return;
	}
	let failures = parity_failures().unwrap_or_else(|failure| vec![failure]);
	assert!(failures.is_empty(), "{} parity failures:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn a_baseline_rewritten_alone_fails_parity_until_its_counterpart_is_recorded() {
	const NAME: &str = "scene-light.png";
	let failure = |held: Pair, recorded| parity_failure(NAME, held.map(Some), Some(recorded));
	for (rewritten, counterpart) in [(0, 1), (1, 0)] {
		let recorded = [1, 1];
		let mut held = recorded;
		held[rewritten] = 2;
		let after_first = pair_after_bless(held, Some(recorded), rewritten);
		let stale = failure(held, after_first).expect("the counterpart is behind");
		assert!(stale.starts_with(&format!("{}/{NAME}: stale", PLATFORMS[counterpart])), "{stale}");
		held[counterpart] = 2;
		let after_second = pair_after_bless(held, Some(after_first), counterpart);
		assert_eq!(failure(held, after_second), None);
	}
}

#[test]
fn every_scene_id_is_unique_and_kebab_case() {
	let mut seen = BTreeSet::new();
	for scene in scenes::every_scene() {
		assert!(seen.insert(scene.id), "{} is registered twice", scene.id);
		assert!(
			scene.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
			"{} is not a kebab-case story id",
			scene.id
		);
	}
}
