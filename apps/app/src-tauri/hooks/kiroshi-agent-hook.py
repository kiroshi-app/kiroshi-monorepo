import json
import os
import sys
import uuid

MAX_TEXT_CHARACTERS = 500
MAX_COMMAND_CHARACTERS = 80
TOOL_USED = "PostToolUse"
PATH_TOOLS = ("Edit", "Write", "Read")
MAX_BODY_BYTES = 64 * 1024
DEFAULT_CONFIG = os.path.join(".kiroshi", "agent-hook.json")
BRANCH_PREFIX = "ref: refs/heads/"
GITDIR_PREFIX = "gitdir:"


def parsed(payload):
	try:
		return json.loads(payload)
	except ValueError:
		return None


def read(path):
	try:
		with open(path, encoding="utf-8") as opened:
			return opened.read()
	except OSError:
		return None


def text(value):
	return value if isinstance(value, str) else ""


def sound(value):
	return isinstance(value, str) and value.strip() != "" and "\n" not in value and "\r" not in value


def config():
	named = os.environ.get("KIROSHI_AGENT_HOOK")
	path = named if named else os.path.join(os.path.expanduser("~"), DEFAULT_CONFIG)
	held = parsed(read(path) or "")
	if not isinstance(held, dict):
		return None
	url = held.get("url")
	key = held.get("key")
	if not sound(url) or not sound(key):
		return None
	return url.strip(), key.strip()


def assistant_text(message):
	if not isinstance(message, dict):
		return ""
	content = message.get("content")
	if isinstance(content, str):
		return content.strip()
	if not isinstance(content, list):
		return ""
	spoken = []
	for block in content:
		if not isinstance(block, dict) or block.get("type") != "text":
			continue
		if isinstance(block.get("text"), str):
			spoken.append(block["text"])
	return "\n".join(spoken).strip()


def excerpt(path):
	if not sound(path):
		return ""
	latest = ""
	try:
		with open(path, encoding="utf-8") as transcript:
			for line in transcript:
				entry = parsed(line)
				if not isinstance(entry, dict) or entry.get("type") != "assistant":
					continue
				spoken = assistant_text(entry.get("message"))
				if spoken:
					latest = spoken
	except OSError:
		return ""
	return latest[:MAX_TEXT_CHARACTERS]


def git_directory(start):
	current = os.path.abspath(start)
	while True:
		candidate = os.path.join(current, ".git")
		if os.path.isdir(candidate):
			return candidate
		if os.path.isfile(candidate):
			held = read(candidate) or ""
			if not held.startswith(GITDIR_PREFIX):
				return None
			return os.path.join(current, held[len(GITDIR_PREFIX):].strip())
		parent = os.path.dirname(current)
		if parent == current:
			return None
		current = parent


def branch(start):
	directory = git_directory(start)
	if not directory:
		return ""
	head = (read(os.path.join(directory, "HEAD")) or "").strip()
	return head[len(BRANCH_PREFIX):] if head.startswith(BRANCH_PREFIX) else ""


def target(tool, tool_input):
	held = tool_input if isinstance(tool_input, dict) else {}
	if tool in PATH_TOOLS:
		return text(held.get("file_path"))
	if tool == "Bash":
		return text(held.get("command"))[:MAX_COMMAND_CHARACTERS]
	return tool


def reported(hook, directory):
	event = text(hook.get("hook_event_name"))
	payload = {
		"event": event,
		"sessionId": text(hook.get("session_id")),
		"cwd": directory,
		"branch": branch(directory),
	}
	if event == TOOL_USED:
		tool = text(hook.get("tool_name"))
		payload["tool"] = tool
		payload["target"] = target(tool, hook.get("tool_input"))
		return payload
	payload["excerpt"] = excerpt(hook.get("transcript_path"))
	payload["message"] = text(hook.get("message"))[:MAX_TEXT_CHARACTERS]
	payload["notification"] = text(hook.get("notification_type"))
	return payload


def call():
	hook = parsed(sys.stdin.read())
	if not isinstance(hook, dict) or hook.get("agent_id"):
		return None
	held = config()
	if not held:
		return None
	url, key = held
	directory = text(hook.get("cwd")) or os.getcwd()
	body = json.dumps(reported(hook, directory))
	if len(body.encode("utf-8")) > MAX_BODY_BYTES:
		return None
	return url, key, uuid.uuid4().hex, body


made = call()
if made:
	sys.stdout.write("\n".join(made) + "\n")
