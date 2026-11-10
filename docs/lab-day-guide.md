# Lab Day Guide — getting the automatic deploy working

**Goal for the day:** after this, every time code is merged into `main`, GitHub
automatically deploys QueueLess to the lab PC, and the app opens at
**http://10.50.80.174:8080**.

**Time needed:** about 30 minutes.
**Sudo needed:** none. Everything runs as your normal user.

---

## What is going on (read once)

- The deploy job on GitHub is **waiting** because nobody is there to do the work.
- The **runner** is a small GitHub program we install on the lab PC. It keeps asking
  GitHub "is there a job for me?". When there is one, it downloads our code and runs
  `docker compose up` on the lab PC.
- The lab PC is on the campus network (10.50.x.x), so GitHub cannot reach it.
  The runner always connects **out** to GitHub, so no ports need to be opened.
- We use two scripts so you don't type many commands:
  - `scripts/setup-deploy-secrets.sh` → run on **your laptop**
  - `scripts/lab-runner-setup.sh` → run on the **lab PC (10.50.80.174)**

Use the PC **10.50.80.174** (it has Docker and Git). The other PC, 10.50.80.173,
is only for testing the app in a browser at the end.

---

## Part A — Tonight at home (5 minutes, on your laptop)

### A1. Make sure you are on the right branch

Open a terminal in the `Queueless` folder:

```bash
git checkout feat/lab-runner-script
git pull
```

### A2. Make sure the GitHub CLI is logged in

```bash
gh auth status
```

- If it says **Logged in to github.com as danit-x** → good.
- If not → run `gh auth login` and follow the questions (GitHub.com → HTTPS → login with browser).

### A3. Create the passwords on GitHub

```bash
bash scripts/setup-deploy-secrets.sh
```

What you should see:

```text
==> Secrets
  POSTGRES_PASSWORD created (random value, not shown)
  JWT_SECRET created (random value, not shown)
==> Variables
  CLIENT_ORIGIN = http://10.50.80.174:8080
==> Runner registration token
Now run this on the lab PC ...
```

- The passwords are created **once** and saved inside GitHub. You never need to know them.
- **Ignore the token it prints tonight.** It expires after 1 hour. You will get a new one at the lab.

### A4. Check

Open https://github.com/danit-x/Queueless/settings/secrets/actions
You should see `POSTGRES_PASSWORD` and `JWT_SECRET` listed. Done for tonight.

---

## Part B — At the lab (on the lab PC 10.50.80.174)

### B1. Log in and open a terminal

Log in to 10.50.80.174 with your normal lab account and open **Terminal**
(Ctrl + Alt + T usually works).

### B2. Confirm it is the right PC

```bash
hostname -I
```

The first address must be **10.50.80.174**. If it is not, you are on the wrong PC.

### B3. Check that Docker works for you

```bash
docker ps
```

- A table appears (even an empty one) → good, go on.
- `permission denied ... docker.sock` → **stop**. Your account is not allowed to use
  Docker. Only the lab admin can fix it (they add you to the `docker` group).
  Nothing else will work until then.

### B4. Get a fresh registration token

The token is a one-time password that lets the runner join our repo. It lasts 1 hour.
Pick **one** way:

**Option 1 (easiest): from your laptop at the lab**

```bash
bash scripts/setup-deploy-secrets.sh
```

It says "already exists - kept as is" for the passwords (that is correct, it does not
change them) and prints two lines at the bottom, like:

```text
curl -fsSL https://raw.githubusercontent.com/danit-x/Queueless/feat/lab-runner-script/scripts/lab-runner-setup.sh -o lab-runner-setup.sh
bash lab-runner-setup.sh AB12CD34EF56...
```

Get these two lines onto the lab PC (send them to yourself by email / WhatsApp Web /
a private GitHub gist, or type carefully).

**Option 2: from a browser on the lab PC**

1. Open https://github.com/danit-x/Queueless/settings/actions/runners/new and log in.
2. Choose **Linux** and **x64**.
3. In the **Configure** box, find `--token XXXXXXXX`. Copy only the token part.
4. Log out of GitHub in that browser when finished (it's a shared PC).

### B5. Download the setup script on the lab PC

```bash
cd ~
curl -fsSL https://raw.githubusercontent.com/danit-x/Queueless/feat/lab-runner-script/scripts/lab-runner-setup.sh -o lab-runner-setup.sh
```

No output means it worked. Check with `ls` — you should see `lab-runner-setup.sh`.

### B6. Run the setup script with your token

```bash
bash lab-runner-setup.sh PASTE_YOUR_TOKEN_HERE
```

The script does 5 steps and prints `OK:` after each:

| Step | What it does |
| --- | --- |
| 1/5 Checking this PC | Docker, Compose, Git, curl work for your user |
| 2/5 Downloading | Downloads the GitHub runner into `~/actions-runner` and checks the file is genuine |
| 3/5 Registering | Connects the runner to our GitHub repo as `queueless-lab` |
| 4/5 Starting | Starts it in the background (`nohup`) and writes a log to `~/actions-runner/runner.log` |
| 5/5 Auto-start | Adds a crontab line so it starts again after the PC reboots |

If you see `ERROR:` it tells you why — see **Troubleshooting** below.
Running the script again is safe; finished steps are skipped.

### B7. Check the runner on GitHub

Open https://github.com/danit-x/Queueless/settings/actions/runners

You should see **queueless-lab** with a green dot: **Idle** or **Active**.

### B8. Watch the deploy run

Open https://github.com/danit-x/Queueless/actions

- **Deploy to Lab Server** should change from *Queued* to *In progress* (yellow) within a minute.
- The first run takes **5–10 minutes** because it builds the Docker images on the lab PC.
- Green tick = success.

On the lab PC you can watch it live:

```bash
tail -f ~/actions-runner/runner.log
```

(Press Ctrl + C to stop watching — this does **not** stop the runner.)

If the old queued run does not start, open it and click **Re-run all jobs**, or go to
**Actions → Deploy to Lab Server → Run workflow**.

### B9. Open the app

On the lab PC:

```bash
curl http://localhost:8080/api/health
```

Expected: something with `"status":"ok"`.

Then in a browser, from the **other** PC (10.50.80.173) or your laptop on the lab network:

- http://10.50.80.174:8080 → the QueueLess app
- http://10.50.80.174:8080/api/health → `"status":"ok"`

If it opens on the lab PC itself but **not** from the other PC, the lab network is
blocking port 8080 — ask the admin which port is allowed.

### B10. Take screenshots for the report (evidence)

Save them in a folder, we will add them to `docs/evidence/`:

1. GitHub **Runners** page showing `queueless-lab` Idle.
2. GitHub **Actions** page showing the green **Deploy to Lab Server** run.
3. Inside that run: the step list, all green.
4. The app open in a browser at `http://10.50.80.174:8080`.
5. `/api/health` showing `"status":"ok"`.
6. The lab PC terminal showing `docker ps` with the queueless containers running.

### B11. Before you leave — check the runner survives logout

Some labs kill all your programs when you log out. Test it:

1. Log out of the lab PC.
2. On your phone or laptop, refresh https://github.com/danit-x/Queueless/settings/actions/runners
3. Wait one minute.
   - Still **Idle** (green) → perfect, you are done.
   - **Offline** (grey) → the lab kills programs on logout. Log back in, run
     `bash lab-runner-setup.sh` again (no token needed the second time), and **lock
     the screen instead of logging out**. Tell Claude — we'll document this limitation
     in the report (it's a good LO-3 point about no-sudo constraints).

---

## Troubleshooting

| What you see | What it means | What to do |
| --- | --- | --- |
| `ERROR: Do not run this with sudo` | You typed `sudo` | Run without `sudo` |
| `ERROR: Your user cannot use Docker` | Not in the docker group | Ask the lab admin; nothing else works without it |
| `ERROR: 'docker compose' plugin is missing` | Old Docker install | Ask the lab admin |
| `ERROR: No token given` | Forgot the token | `bash lab-runner-setup.sh <TOKEN>` |
| Registration fails with `404` / `Not Found` / token error | Token expired (over 1 hour) or mistyped | Get a new token (B4) and run B6 again |
| `error 403` / `GitHub API not reachable` | GitHub API limit on the shared campus IP | Fixed: the script now falls back to a pinned runner version. `git pull` and run again |
| Download itself fails with 403 | Campus network blocks GitHub downloads | See **Manual runner download** below |
| Runner shows **Offline** on GitHub | Runner process stopped | `bash lab-runner-setup.sh` again (it restarts it) |
| Deploy fails, log mentions password / `authentication failed` | An old Postgres volume from a manual test uses a different password | `docker volume ls` → send the list to Claude before deleting anything |
| Deploy fails, other reason | — | Open the failed run, copy its link, send it to Claude |
| App works on lab PC, not from other PCs | Port 8080 blocked on the lab network | Ask the admin which port is allowed |

### Manual runner download

Only if the script's download fails. Copy-paste on the lab PC, then run the
setup script again (it will say `Already downloaded`):

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -fL -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-linux-x64-2.338.2.tar.gz
echo "baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40  runner.tar.gz" | sha256sum -c -
tar xzf runner.tar.gz && rm runner.tar.gz
cd ~/Queueless && bash scripts/lab-runner-setup.sh PASTE_TOKEN_HERE
```

`sha256sum` must print `runner.tar.gz: OK`. If `curl` also gives 403, download
the same file on your laptop, copy it to `~/actions-runner/runner.tar.gz`
(USB or `scp`), and continue from the `sha256sum` line.

### Useful commands on the lab PC

```bash
tail -f ~/actions-runner/runner.log                         # watch the runner
pgrep -af Runner.Listener                                    # is it running?
pkill -u $USER -f actions-runner/bin/Runner.Listener         # stop it
docker ps                                                    # running containers
crontab -l                                                   # see the auto-start line
```

---

## When you're done

Tell Claude **"runner is up"** (and the deploy run link). Claude will check the deploy,
save the evidence and tick task 1 in `docs/module-roadmap.md`. Next is task 2: tagging
release `v1.0.0` — that needs your "go".
