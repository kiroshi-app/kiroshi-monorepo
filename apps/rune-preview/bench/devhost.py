import json
import os
import subprocess
import urllib.error
import urllib.request

DEV_IDENTIFIER = "com.kiroshi.app.dev"
TOKEN = os.path.expanduser(f"~/Library/Application Support/{DEV_IDENTIFIER}/host/token")


def is_dev_host(executable):
	name = executable.rsplit("/", 1)[-1]
	bundled = executable.endswith(".app/Contents/MacOS/Kiroshi")
	return name == "Kiroshi" and (executable.endswith("Kiroshi Dev.app/Contents/MacOS/Kiroshi") or not bundled)


def listening_ports():
	listed = subprocess.run(
		["lsof", "-nP", "-iTCP@127.0.0.1", "-sTCP:LISTEN", "-Fpn"], capture_output=True, text=True
	).stdout
	pid, ports = None, []
	for line in listed.splitlines():
		if line.startswith("p"):
			pid = line[1:]
		elif line.startswith("n") and pid:
			executable = subprocess.run(["ps", "-o", "comm=", "-p", pid], capture_output=True, text=True).stdout.strip()
			if is_dev_host(executable):
				ports.append(int(line.rsplit(":", 1)[1]))
	return ports


class DevHost:
	def __init__(self):
		with open(TOKEN) as held:
			self.token = held.read().strip()
		for port in listening_ports():
			self.port = port
			try:
				self.invoke("space_list", {})
				return
			except (OSError, SystemExit):
				continue
		raise SystemExit("Kiroshi Dev isn't running: start it, then run this again.")

	def invoke(self, command, arguments):
		request = urllib.request.Request(
			f"http://127.0.0.1:{self.port}/api/invoke/{command}",
			data=json.dumps(arguments).encode(),
			headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
		)
		try:
			with urllib.request.urlopen(request, timeout=30) as answer:
				body = answer.read()
		except urllib.error.HTTPError as refused:
			raise SystemExit(f"{command} answered {refused.code}: {refused.read().decode()[:400]}") from refused
		return json.loads(body) if body else None
