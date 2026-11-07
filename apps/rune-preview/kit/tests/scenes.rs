#![cfg(any(target_os = "macos", target_os = "linux"))]

use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use kiroshi_rune_kit::scenes::{self, Pointer, SCENES, Scene, SceneState, THEMES, Theme};
use rune::tooling::{self, Args};
use rune::{App, FontSmoothing};

const BLESS: &str = "KIROSHI_BLESS";
const FAILED: &str = "failed";
const SCALE: &str = "2";
const SNAP_AT: f64 = 2.0;
const FRAME: f64 = 1.0 / 60.0;
const KEY_STEP: f64 = 0.05;
const AWAY: (f64, f64) = (1.0, 1.0);
const DIFF_INK: [u8; 4] = [255, 0, 64, 255];
const DIFF_FADE: u8 = 4;

fn platform() -> &'static str {
	if cfg!(target_os = "macos") { "macos" } else { "linux" }
}

fn baselines() -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR")).join("captures").join(platform())
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

fn script(scene: &Scene, beside: &Path) -> Option<PathBuf> {
	let last_frame = SNAP_AT - FRAME;
	let mut events: Vec<String> = (0..scene.tabs)
		.map(|press| {
			format!(r#"{{"t": {}, "type": "key", "name": "Tab"}}"#, press as f64 * KEY_STEP)
		})
		.collect();
	match scene.pointer {
		Pointer::Away => {}
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
	let registered: BTreeSet<String> =
		SCENES.iter().flat_map(|scene| THEMES.map(|theme| scene.baseline(theme))).collect();
	let Ok(entries) = fs::read_dir(baselines()) else { return Vec::new() };
	entries
		.filter_map(|entry| entry.ok()?.file_name().into_string().ok())
		.filter(|name| name.ends_with(".png") && !registered.contains(name))
		.map(|name| format!("{name}: a baseline no registered scene names"))
		.collect()
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
	let mut failures: Vec<String> = SCENES
		.iter()
		.flat_map(|scene| THEMES.map(|theme| (scene, theme)))
		.filter_map(|(scene, theme)| check(scene, theme, bless, &rendered, &failed))
		.collect();
	failures.extend(orphans());
	assert!(failures.is_empty(), "{} scene failures:\n{}", failures.len(), failures.join("\n"));
}

#[test]
fn every_scene_id_is_unique_and_kebab_case() {
	let mut seen = BTreeSet::new();
	for scene in SCENES {
		assert!(seen.insert(scene.id), "{} is registered twice", scene.id);
		assert!(
			scene.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
			"{} is not a kebab-case story id",
			scene.id
		);
	}
}
