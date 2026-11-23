# Jenkins pipeline — setup and run (lab PC)

QueueLess uses **Jenkins** for CI/CD. The `Jenkinsfile` in the repo root is a
**declarative pipeline written in Groovy**. It runs on the Jenkins agent you
set up in the lab with the *Jenkins + Rootless Docker* guide (steps 1–5).
This file starts where that guide ends.

| Item | Value |
| --- | --- |
| Lab PC | `10.50.80.174` (Linux account `user`, no sudo) |
| Jenkins | `http://10.50.80.174:8080` |
| Agent node / label | `rootless-user-agent` / `rootless-docker` |
| Docker | Rootless Docker (`docker context show` → `rootless`) |
| QueueLess app | **`http://10.50.80.174:8082`** (Compose project `queueless-prod`) |

Port 8082 follows the lab guide: Rootless Docker cannot use host ports below
1024, and 8080 belongs to Jenkins.

> The awesome-compose test from step 5 of the lab guide also used 8082. Stop it
> first: `cd ~/Desktop/docker-test/awesome-compose/react-express-mysql && docker compose down`.

---

## What the pipeline does

The work is split in three parts (lecturer's order):

1. **CI** — `Jenkinsfile` (this job): test and build images. ✅ now
2. **Docker Hub** — push the images. Next.
3. **CD** — a second Jenkins pipeline that deploys. After that.

```
Checkout → Check tools → ┬ Backend tests  ┬ → Build images
                         └ Frontend build ┘
```

| Stage | What happens |
| --- | --- |
| Checkout | Clones the commit and makes the image tag `jenkins-<build>-<commit>`. |
| Check tools | Prints `whoami`, the Docker context and the Compose version (proves Rootless Docker). |
| Backend tests | Starts a throwaway `postgres:16-alpine`, applies `database/schema.sql`, runs `npm ci`, `npm run check`, `npm test` inside `node:20-alpine`, then removes the database. |
| Frontend build | `npm ci && npm run build` inside `node:20-alpine`; `frontend/dist` is archived on the build page. |
| Build images | `docker build` for `queueless-backend` and `queueless-frontend`, tagged `:<build tag>` and `:latest`. |

No Node.js is needed on the lab PC: everything Node-related runs in containers.

---

## 0. One time: retire the old GitHub Actions runner

GitHub Actions is no longer used. On the lab PC, as `user`:

```bash
crontab -l                      # find the @reboot line for the GitHub runner
crontab -e                      # delete that line
pkill -f Runner.Listener        # stop the runner if it is running
docker ps --format '{{.Names}}\t{{.Ports}}'   # old app was on 8081
```

The old app containers (`queueless-prod-*`) are taken over by the first
Jenkins deploy and move from port 8081 to 8082. The database volume and its
data are kept.

On GitHub: Settings → Actions → Runners → remove `queueless-lab`, and Settings →
Secrets and variables → Actions → delete `POSTGRES_PASSWORD`, `JWT_SECRET`,
`CLIENT_ORIGIN`, `FRONTEND_PORT`.

## 1. Check the agent is online

Manage Jenkins → Nodes → `rootless-user-agent` must be online. If it is
offline (after logout or reboot), start it again from `~/jenkins-agent` with
the `java -jar agent.jar …` command shown on the node page (lab guide step 4.3).

## 2. Add the credentials (needed later for Docker Hub and CD, not for CI)

Manage Jenkins → Credentials → System → Global credentials → **Add Credentials**.

| ID (type exactly) | Kind | Value |
| --- | --- | --- |
| `queueless-postgres-password` | Secret text | Any strong password for the app database |
| `queueless-jwt-secret` | Secret text | Random string, **at least 32 characters** |
| `dockerhub-credentials` | Username with password | Docker Hub username + an **access token** (only needed for `PUSH_IMAGES`) |

Make random values on the lab PC with:

```bash
openssl rand -hex 24   # database password
openssl rand -hex 48   # JWT secret
```

Docker Hub token: hub.docker.com → Account settings → Personal access tokens →
Generate (Read & Write). Use the token, not your Docker Hub password.

Changing `queueless-jwt-secret` logs every user out (old tokens stop working).
Changing `queueless-postgres-password` is safe: the next deploy applies it.

## 3. Create the job

New Item → name `queueless` → **Pipeline** → OK. Then:

| Setting | Value |
| --- | --- |
| Definition | Pipeline script from SCM |
| SCM | Git |
| Repository URL | `https://github.com/danit-x/Queueless.git` |
| Credentials | none (public repo) |
| Branch Specifier | `*/main` |
| Script Path | `Jenkinsfile` |

Save, then **Build Now**. The first build also registers the parameters and
the `pollSCM` trigger; after that the job shows **Build with Parameters** and
checks GitHub for new commits about every 5 minutes (GitHub webhooks cannot
reach the campus network).

## 4. Build parameters

| Parameter | Default | Use |
| --- | --- | --- |
| `PUSH_IMAGES` | off | Push images to Docker Hub |
| `DEPLOY` | on | Deploy and smoke test on the lab PC |
| `FRONTEND_PORT` | `8082` | Host port of the app (≥ 1024, not 8080 — that is Jenkins) |
| `CLIENT_ORIGIN` | `http://10.50.80.174:8082` | Browser URL; must match the port |

## 5. Evidence for the report

- Screenshot the **Stage View** of a green build.
- Console Output showing `whoami` → `user`, `docker context show` → `rootless`,
  the test summary (`# pass …`, `# fail 0`) and `App is healthy at …`.
- Browser at `http://10.50.80.174:8082` (e.g. from the other lab PC, 10.50.80.173).
- If pushed: the two repositories on Docker Hub with the `jenkins-…` and `latest` tags.

Do not screenshot the agent secret or any credential value.

## Useful commands on the lab PC

```bash
cd ~/jenkins-agent/workspace/queueless
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 backend
docker image ls 'queueless-*'
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Build waits: "There are no nodes with the label 'rootless-docker'" | Agent is offline: restart `agent.jar` (step 1). |
| `permission denied … docker.sock` | The agent is not using Rootless Docker. As `user`: `docker context use rootless`, then restart the agent. Never use `sudo` or the docker group. |
| `Could not find credentials entry with ID …` | Credential ID is mistyped; it must match the table in step 2 exactly. |
| `Bind for 0.0.0.0:8082 failed: port is already allocated` | Something else uses 8082 (often the awesome-compose test). Stop it, or build with another `FRONTEND_PORT` and matching `CLIENT_ORIGIN`. |
| `ports below 1024` / `permission denied` on bind | Rootless Docker cannot bind them; keep ports ≥ 1024. |
| Browser shows the app but login fails with a CORS error | `CLIENT_ORIGIN` does not match the address in the browser bar. |

---

## Why Jenkins (for the report)

| | Before: GitHub Actions | Now: Jenkins |
| --- | --- | --- |
| Pipeline file | `.github/workflows/*.yml` (YAML) | `Jenkinsfile` (declarative Groovy) |
| Where it runs | GitHub-hosted runners + a self-hosted runner on the lab PC | Our own Jenkins controller + agent on the lab PC |
| Trigger | Push / PR events | `pollSCM` every ~5 min, or Build Now |
| Test database | `services: postgres` | Throwaway `postgres` container started by the pipeline |
| Secrets | Repository secrets | Jenkins Credentials + `withCredentials` (masked in logs) |
| Registry | GHCR | Docker Hub |
| Docker | Docker on the runner | Rootless Docker, no root or docker group |
| Maintenance | Hosted by GitHub | We run Jenkins, its plugins and the agent |

The GitHub Actions workflows are in the Git history (removed in the commit that
added this file) if they are ever needed again.
