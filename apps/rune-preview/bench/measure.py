import datetime
import glob
import json
import os
import platform
import re
import signal
import sqlite3
import statistics
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ElementTree

from devhost import DevHost
from fabricate import END_MARKER, TITLE, existing

BENCH = os.path.dirname(os.path.abspath(__file__))
PREVIEW_ROOT = os.path.dirname(BENCH)
REPO = os.path.dirname(os.path.dirname(PREVIEW_ROOT))
PROBE = os.path.join(BENCH, "probe")
PREVIEW = os.path.join(PREVIEW_ROOT, "target", "release", "kiroshi-rune-preview")
PREVIEW_APP = os.path.join(BENCH, "build", "Kiroshi Rune Preview.app")
DEV_APP = os.path.join(REPO, "apps", "app", "src-tauri", "target", "release", "bundle", "macos", "Kiroshi Dev.app")
DEV_EXECUTABLE = os.path.join(DEV_APP, "Contents", "MacOS", "Kiroshi")
INSTALLED_EXECUTABLE = "/Applications/Kiroshi.app/Contents/MacOS/Kiroshi"
DEV_LOCAL_STORAGE = "~/Library/WebKit/com.kiroshi.app.dev/WebsiteData/Default/*/*/LocalStorage/localstorage.sqlite3"
RESULTS = os.path.join(BENCH, "results.json")
TRACES = os.path.join(BENCH, "traces")

RUNS = 3
END_WORD = END_MARKER.split()[0]
CONTENT_PANE_MIN_X = 0.2
LAUNCH_TIMEOUT_S = 60
SETTLE_S = 5
REST_SETTLE_S = 10
REST_INTERVAL_S = 60
PROFILE_S = 20
COST_CENTRES = 3
PREVIEW_INFO = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>kiroshi-rune-preview</string>
<key>CFBundleIdentifier</key><string>com.kiroshi.rune-preview.bench</string>
<key>CFBundleName</key><string>Kiroshi Rune Preview</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
"""
LOCKED_REASON = (
	"the screen was locked: Rune lays out and draws no covered window, where WebKit keeps painting, "
	"so the two sides don't run the same way"
)


def run(command, **options):
	return subprocess.run(command, capture_output=True, text=True, **options)


def load():
	one, five, fifteen = os.getloadavg()
	return {"one_minute": round(one, 2), "five_minutes": round(five, 2), "fifteen_minutes": round(fifteen, 2)}


def machine():
	sysctl = lambda name: run(["sysctl", "-n", name]).stdout.strip()
	return {
		"model": sysctl("hw.model"),
		"cpus": int(sysctl("hw.ncpu")),
		"memory_gib": int(sysctl("hw.memsize")) // 2**30,
		"macos": platform.mac_ver()[0],
	}


def not_measured(*reasons):
	return {"status": "not measured", "reasons": list(reasons)}


def build():
	if not os.path.exists(PROBE) or os.path.getmtime(PROBE) < os.path.getmtime(f"{PROBE}.swift"):
		subprocess.run(["swiftc", "-O", f"{PROBE}.swift", "-o", PROBE], check=True)
	subprocess.run(["cargo", "build", "--release", "--quiet"], cwd=PREVIEW_ROOT, check=True)
	if not os.path.exists(DEV_EXECUTABLE):
		raise SystemExit("Kiroshi Dev isn't built: build apps/app's release bundle with the dev identifier first.")
	executable = os.path.join(PREVIEW_APP, "Contents", "MacOS", "kiroshi-rune-preview")
	os.makedirs(os.path.dirname(executable), exist_ok=True)
	with open(os.path.join(PREVIEW_APP, "Contents", "Info.plist"), "w") as info:
		info.write(PREVIEW_INFO)
	if not os.path.islink(executable):
		os.symlink(PREVIEW, executable)


def probe_says(*arguments):
	return run([PROBE, *arguments]).returncode == 0


def window(pid):
	found = run([PROBE, "window", str(pid)])
	return found.stdout.strip() if found.returncode == 0 else None


def shows(window_id, needle, path, min_x=0.0):
	captured = run(["screencapture", "-x", "-o", "-l", window_id, path])
	return captured.returncode == 0 and probe_says("ocr", path, needle, str(min_x))


def webkit_helpers(pid):
	found = run([PROBE, "helpers", str(pid)])
	if found.returncode != 0:
		raise SystemExit(f"the WebKit helpers of pid {pid} couldn't be listed")
	return [int(helper) for helper in found.stdout.split()]


def pids_of(command_line):
	return [int(pid) for pid in run(["pgrep", "-f", f"^{re.escape(command_line)}$"]).stdout.split()]


def dev_processes():
	return [int(pid) for pid in run(["pgrep", "-f", re.escape(os.path.join(DEV_APP, "Contents", "MacOS"))]).stdout.split()]


def preview_processes():
	return [int(pid) for pid in run(["pgrep", "-f", f"^{re.escape(PREVIEW)}( |$)"]).stdout.split()]


def is_alive(pid):
	try:
		os.kill(pid, 0)
	except ProcessLookupError:
		return False
	return True


def stop(pids):
	for pid in pids:
		if is_alive(pid):
			os.kill(pid, signal.SIGTERM)
	deadline = time.monotonic() + 30
	while any(is_alive(pid) for pid in pids):
		if time.monotonic() > deadline:
			raise SystemExit(f"processes {pids} didn't exit within 30 s after SIGTERM")
		time.sleep(0.2)


def stop_dev():
	stop(dev_processes())


class Side:
	def __init__(self, name, bundle, command_line, arguments=()):
		self.name, self.bundle, self.command_line, self.arguments = name, bundle, command_line, list(arguments)

	def open(self):
		subprocess.run(["open", "-n", self.bundle, "--args", *self.arguments], check=True, capture_output=True)
		deadline = time.monotonic() + LAUNCH_TIMEOUT_S
		while not (pids := pids_of(self.command_line)):
			if time.monotonic() > deadline:
				raise SystemExit(f"{self.name} didn't start within {LAUNCH_TIMEOUT_S} s")
			time.sleep(0.01)
		return pids[0]


KIROSHI_DEV = Side("kiroshi_dev", DEV_APP, DEV_EXECUTABLE)
PREVIEW_ON_DEV = Side("preview", PREVIEW_APP, f"{PREVIEW} --dev-host", ["--dev-host"])
PREVIEW_ON_INSTALLED = Side("preview", PREVIEW_APP, f"{PREVIEW} --skip-onboarding", ["--skip-onboarding"])


class Launch:
	def __init__(self, side):
		self.side, self.load_before, self.started = side, load(), time.monotonic()
		self.pid = side.open()
		self.window_id = None
		while self.window_id is None:
			self.give_up_after_timeout("no window")
			self.window_id = window(self.pid)
		self.first_frame_ms = round(self.elapsed_ms())

	def elapsed_ms(self):
		return (time.monotonic() - self.started) * 1000

	def give_up_after_timeout(self, what):
		if self.elapsed_ms() > LAUNCH_TIMEOUT_S * 1000:
			stop([self.pid])
			raise SystemExit(f"{what} for {self.side.name} within {LAUNCH_TIMEOUT_S} s")

	def wait_until_shown(self, needle, min_x, scratch):
		previous_capture_ms = self.elapsed_ms()
		while True:
			capture_ms = self.elapsed_ms()
			if shows(self.window_id, needle, os.path.join(scratch, "frame.png"), min_x):
				return {
					"conversation_displayed_ms": round(capture_ms),
					"conversation_resolution_ms": round(capture_ms - previous_capture_ms),
				}
			self.give_up_after_timeout(f"'{needle}' never showed")
			previous_capture_ms = capture_ms


def seed_dev_tab(conversation_id):
	tab = json.dumps({"tabs": [{"href": f"/?conversation={conversation_id}", "isPinned": False}], "activeIndex": 0})
	for path in glob.glob(os.path.expanduser(DEV_LOCAL_STORAGE)):
		origin = os.path.join(os.path.dirname(os.path.dirname(path)), "origin")
		if os.path.exists(origin) and b"tauri" in open(origin, "rb").read():
			with sqlite3.connect(path) as storage:
				storage.execute(
					"insert into ItemTable(key, value) values (?, ?)", ("spaceTabs:personal", tab.encode("utf-16-le"))
				)
			return
	raise SystemExit("Kiroshi Dev's webview storage wasn't found: launch Kiroshi Dev once, then run this again.")


def wait_for_dev_host():
	deadline = time.monotonic() + LAUNCH_TIMEOUT_S
	while True:
		try:
			return DevHost()
		except (SystemExit, FileNotFoundError):
			if time.monotonic() > deadline:
				raise
			time.sleep(0.5)


def prepare_dev():
	if dev_processes():
		raise SystemExit("Kiroshi Dev is already running: quit it, then run this again.")
	KIROSHI_DEV.open()
	host = wait_for_dev_host()
	space_id = host.invoke("space_list", {})[0]["id"]
	conversation_id = existing(host, space_id)
	if conversation_id is None:
		stop_dev()
		raise SystemExit(f"Kiroshi Dev holds no '{TITLE}': run bench/fabricate.py first.")
	preferences = host.invoke("user_preferences", {})
	host.invoke("user_set_preferences", {"preferences": {**preferences, "showWhatsNew": False}})
	host.invoke("user_mark_onboarding_import_seen", {})
	stop_dev()
	seed_dev_tab(conversation_id)
	return conversation_id


def median_by_side(runs, field):
	return {
		side: round(statistics.median(entry[field] for entry in runs if entry["side"] == side))
		for side in (KIROSHI_DEV.name, PREVIEW_ON_DEV.name)
	}


def cold_run(side, attempt, scratch, locked):
	launched = Launch(side)
	shown = {} if locked else launched.wait_until_shown(END_WORD, 0.0, scratch)
	return {
		"side": side.name, "run": attempt + 1, "first_frame_ms": launched.first_frame_ms, **shown,
		"load_before": launched.load_before, "load_after": load(),
	}


def cold_start(scratch, locked):
	conversation_id = prepare_dev()
	runs = []
	for attempt in range(RUNS):
		time.sleep(SETTLE_S)
		runs.append(cold_run(KIROSHI_DEV, attempt, scratch, locked))
		stop_dev()
	KIROSHI_DEV.open()
	wait_for_dev_host()
	for attempt in range(RUNS):
		time.sleep(SETTLE_S)
		runs.append(cold_run(PREVIEW_ON_DEV, attempt, scratch, locked))
		stop(preview_processes())
	stop_dev()
	displayed = not_measured(LOCKED_REASON) if locked else {
		"tool": (
			f"screencapture -l of that window, recognised by Vision (fast) as holding '{END_WORD}', "
			"the last word of the last message; resolution: the gap to the previous capture"
		),
		"unit": "ms from open",
		"median": median_by_side(runs, "conversation_displayed_ms"),
		"median_resolution_ms": median_by_side(runs, "conversation_resolution_ms"),
	}
	return {
		"subject": f"Kiroshi Dev release bundle against the preview with --dev-host, on '{TITLE}' ({conversation_id})",
		"launch": "open -n on an app bundle on both sides (the preview through a bundle linking its release binary)",
		"conditions": (
			"process cold, file cache warm; Kiroshi Dev starts its own host and opens the conversation from its "
			"restored tab; the preview starts against Kiroshi Dev's host already running and finds the longest "
			"conversation itself"
		),
		"first_frame": {
			"tool": "the pid's first layer-0 window over 10,000 pt² in CGWindowListCopyWindowInfo, polled",
			"unit": "ms from open",
			"median": median_by_side(runs, "first_frame_ms"),
		},
		"conversation_displayed": displayed,
		"runs": runs,
	}


def read_installed_longest():
	checked = run([PREVIEW, "--smoke-read"], timeout=180)
	if checked.returncode != 0:
		raise SystemExit(f"the read-only check failed: {checked.stderr.strip()[:400]}")
	writes = re.search(r"requests: (\d+), writes: (\d+)", checked.stdout)
	title = re.search(r"^longest title: (.+)$", checked.stdout, re.MULTILINE)
	messages = re.search(r"\((\d+) messages", checked.stdout)
	if not writes or writes.group(2) != "0" or not title or not messages:
		raise SystemExit("the read-only check didn't end on zero writes and a longest conversation")
	return {"title": title.group(1).strip(), "messages": int(messages.group(1)), "requests": int(writes.group(1))}


def footprint(pids):
	with tempfile.NamedTemporaryFile(suffix=".json") as report:
		arguments = [argument for pid in pids for argument in ("-p", str(pid))]
		subprocess.run(
			["footprint", "--noCategories", "-f", "bytes", "-j", report.name, *arguments],
			check=True, capture_output=True,
		)
		processes = json.load(open(report.name))["processes"]
	if len(processes) != len(pids):
		raise SystemExit(f"footprint answered for {len(processes)} of {len(pids)} processes")
	return round(sum(process["footprint"] for process in processes) / 2**20, 1)


def cpu_seconds(pids):
	listed = run(["ps", "-o", "time=", "-p", ",".join(str(pid) for pid in pids)]).stdout.split()
	if len(listed) != len(pids):
		raise SystemExit(f"ps answered for {len(listed)} of {len(pids)} processes")
	total = 0.0
	for entry in listed:
		seconds = 0.0
		for part in entry.split(":"):
			seconds = seconds * 60 + float(part)
		total += seconds
	return total


def title_needle(title):
	return " ".join(title.split()[:3])


def at_rest_blockers(scratch, installed, longest, locked):
	reasons = [LOCKED_REASON] if locked else []
	if len(installed) != 1:
		return [*reasons, f"{len(installed)} installed Kiroshi processes are running, one is needed"]
	installed_window = window(installed[0])
	if installed_window is None or not shows(
		installed_window, title_needle(longest["title"]), os.path.join(scratch, "installed.png"), CONTENT_PANE_MIN_X
	):
		reasons.append(
			"the installed Kiroshi window shows another conversation than its longest, and the bench sends it no "
			"input; open that conversation in Kiroshi by hand, then run measure.py again"
		)
	return reasons


def at_rest(scratch, longest, locked):
	installed = pids_of(INSTALLED_EXECUTABLE)
	blockers = at_rest_blockers(scratch, installed, longest, locked)
	if blockers:
		return not_measured(*blockers), not_measured(*blockers)
	memory_runs, cpu_runs = [], []
	for attempt in range(RUNS):
		launched = Launch(PREVIEW_ON_INSTALLED)
		launched.wait_until_shown(title_needle(longest["title"]), CONTENT_PANE_MIN_X, scratch)
		time.sleep(REST_SETTLE_S)
		sides = {"installed": [installed[0], *webkit_helpers(installed[0])], "preview": [launched.pid]}
		before = load()
		memory = {side: footprint(pids) for side, pids in sides.items()}
		memory_runs.append({"run": attempt + 1, **{f"{side}_mib": value for side, value in memory.items()}, "load": before})
		spent = {side: cpu_seconds(pids) for side, pids in sides.items()}
		time.sleep(REST_INTERVAL_S)
		cpu = {
			side: round((cpu_seconds(pids) - spent[side]) / REST_INTERVAL_S * 100, 2) for side, pids in sides.items()
		}
		cpu_runs.append({
			"run": attempt + 1, **{f"{side}_percent": value for side, value in cpu.items()},
			"load_before": before, "load_after": load(),
		})
		stop([launched.pid])
	subject = (
		f"installed Kiroshi on its longest conversation ({longest['messages']} messages) against the preview "
		"on the same conversation, both left untouched"
	)
	median = lambda entries, field: {
		side: statistics.median(entry[f"{side}_{field}"] for entry in entries) for side in ("installed", "preview")
	}
	return {
		"subject": subject,
		"tool": (
			"footprint --noCategories, phys_footprint summed: Kiroshi plus its WebKit helpers (by responsible pid) "
			"against the preview process; agents excluded on both sides"
		),
		"unit": "MiB",
		"median": median(memory_runs, "mib"),
		"runs": memory_runs,
	}, {
		"subject": subject,
		"tool": f"ps -o time, CPU time of the same process sets over the same {REST_INTERVAL_S} s window, both sides at once",
		"unit": "% of one core",
		"median": median(cpu_runs, "percent"),
		"runs": cpu_runs,
	}


def scroll_frame_times(locked):
	reasons = [
		"synthetic scrolling never reaches the installed Kiroshi, so the same scroll can't run on both sides",
	]
	if not probe_says("trusted"):
		reasons.append("Accessibility isn't granted to the shell running the bench")
	if locked:
		reasons.append(LOCKED_REASON)
	return not_measured(*reasons)


def parsed_samples(path):
	pids, binaries, frames, backtraces, weights = {}, {}, {}, {}, {}

	def known(table, element, parse):
		reference = element.get("ref")
		return table[reference] if reference else table.setdefault(element.get("id"), parse(element))

	def frame_of(element):
		binary = element.find("binary")
		return element.get("name"), known(binaries, binary, lambda found: found.get("name")) if binary is not None else "?"

	pid_of = lambda element: int(element.find("pid").text)
	backtrace_of = lambda element: [known(frames, frame, frame_of) for frame in element.findall("frame")]
	for _, element in ElementTree.iterparse(path):
		if element.tag != "row":
			continue
		thread_process = element.find("thread/process")
		if thread_process is not None:
			known(pids, thread_process, pid_of)
		process = element.find("process")
		trace = element.find("tagged-backtrace")
		trace = trace if trace is not None else element.find("backtrace")
		weight = element.find("weight")
		if process is not None and trace is not None and weight is not None:
			stack = known(backtraces, trace, backtrace_of)
			if stack:
				yield known(pids, process, pid_of), stack[0], known(weights, weight, lambda found: int(found.text))
		element.clear()


def cost_centres(scratch, locked):
	os.makedirs(TRACES, exist_ok=True)
	trace = os.path.join(TRACES, "kiroshi-dev-cold-start.trace")
	subprocess.run(["rm", "-rf", trace], check=True)
	recording = subprocess.Popen(
		["xctrace", "record", "--template", "Time Profiler", "--all-processes", "--time-limit", f"{PROFILE_S}s",
		 "--output", trace, "--no-prompt"],
		stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
	)
	for line in recording.stdout:
		if "Ctrl-C to stop" in line:
			break
	launched = Launch(KIROSHI_DEV)
	launched.wait_until_shown(END_WORD, 0.0, scratch)
	roles = {
		member: run(["ps", "-o", "comm=", "-p", str(member)]).stdout.strip().rsplit("/", 1)[-1]
		for member in [launched.pid, *webkit_helpers(launched.pid)]
	}
	recording.communicate()
	stop_dev()
	exported = os.path.join(scratch, "time-profile.xml")
	with open(exported, "w") as out:
		subprocess.run(
			["xctrace", "export", "--input", trace, "--xpath",
			 '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]'],
			stdout=out, check=True,
		)
	by_centre, total = {}, 0
	for sampled, (symbol, binary), nanoseconds in parsed_samples(exported):
		if sampled not in roles:
			continue
		total += nanoseconds
		centre = by_centre.setdefault((roles[sampled], binary), {"ns": 0, "symbols": {}})
		centre["ns"] += nanoseconds
		centre["symbols"][symbol] = centre["symbols"].get(symbol, 0) + nanoseconds
	ranked = sorted(by_centre.items(), key=lambda item: item[1]["ns"], reverse=True)[:COST_CENTRES]
	heaviest = lambda symbols: [name for name, _ in sorted(symbols.items(), key=lambda item: item[1], reverse=True)[:3]]
	return {
		"subject": (
			f"Kiroshi Dev opened onto '{TITLE}' until its last word shows, inside a {PROFILE_S} s recording"
			f"{', screen locked' if locked else ''}"
		),
		"tool": (
			"xctrace record --template 'Time Profiler' --all-processes, samples of Kiroshi Dev and its WebKit "
			"helpers, self time grouped by process and leaf binary"
		),
		"trace": os.path.relpath(trace, REPO),
		"sampled_ms": round(total / 1e6),
		"top": [
			{
				"process": process,
				"binary": binary,
				"self_ms": round(centre["ns"] / 1e6),
				"share_percent": round(centre["ns"] / total * 100, 1),
				"heaviest_symbols": heaviest(centre["symbols"]),
			}
			for (process, binary), centre in ranked
		],
	}


def measure(scratch):
	locked = probe_says("locked")
	longest = read_installed_longest()
	memory, cpu = at_rest(scratch, longest, locked)
	return {
		"measured_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
		"machine": machine(),
		"screen_locked": locked,
		"runs_per_measure": RUNS,
		"machine_load": "os.getloadavg() before and after every run",
		"installed_read": {
			"tool": "kiroshi-rune-preview --smoke-read", "requests": longest["requests"], "writes": 0,
			"longest_conversation_messages": longest["messages"],
		},
		"cold_start": cold_start(scratch, locked),
		"memory": memory,
		"cpu_at_rest": cpu,
		"scroll_frame_times": scroll_frame_times(locked),
		"key_press_to_glyph": not_measured("left out of this stage by decision"),
		"tauri_cost_centres": cost_centres(scratch, locked),
	}


def main():
	build()
	try:
		with tempfile.TemporaryDirectory() as scratch:
			results = measure(scratch)
	finally:
		stop(dev_processes() + preview_processes())
	with open(RESULTS, "w") as written:
		json.dump(results, written, indent="\t", ensure_ascii=False)
		written.write("\n")
	print(f"wrote {os.path.relpath(RESULTS, REPO)}")


if __name__ == "__main__":
	main()
