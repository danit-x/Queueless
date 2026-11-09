# Lab Server Setup (no sudo)

The lab PC (Ubuntu, Docker and Git preinstalled, internet access, no sudo) is our
deployment server. A **GitHub self-hosted runner** runs on it as our normal user.
It connects *out* to GitHub, so we need no SSH access and no open inbound ports
for deployment.

```text
git push main ──▶ GitHub Actions: CI (ubuntu-latest)
                        │ passes
                        ▼
              Deploy to Lab Server (self-hosted runner on lab PC)
                        │ docker compose up -d --build
                        ▼
              http://<LAB-PC-IP>:8080
```

## 1. Check the lab PC (2 minutes)

Open a terminal on the lab PC and run:

```bash
docker ps
```

- Prints a table (even an empty one): good, our user can use Docker.
- `permission denied ... docker.sock`: our user is **not** in the `docker`
  group. Ask the lab admin to run `sudo usermod -aG docker <our-username>`,
  then log out and back in. Nothing below works until this is fixed.

```bash
docker compose version
git --version
hostname -I
```

Write down the first IP address from `hostname -I`. That is `<LAB-PC-IP>`.

## 2. Manual first deploy (proves the machine works)

```bash
cd ~
git clone https://github.com/danit-x/Queueless.git
cd Queueless
cp .env.example .env
nano .env
```

In `.env`, set at least:

```env
POSTGRES_PASSWORD=<a strong password>
JWT_SECRET=<64 random characters>
FRONTEND_PORT=8080
CLIENT_ORIGIN=http://<LAB-PC-IP>:8080
```

Generate a JWT secret without Node:

```bash
openssl rand -hex 48
```

Start the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Open `http://localhost:8080` on the lab PC. Then try
`http://<LAB-PC-IP>:8080` from a teammate's laptop on the lab network. If it
works locally but not from the laptop, the lab firewall or network blocks port
8080. Ask the admin which port is allowed and change `FRONTEND_PORT`.

When it works, stop this manual copy so it does not clash with the runner's
copy. The database volume is kept.

```bash
docker compose -f docker-compose.prod.yml down
```

## 3. Install the self-hosted runner (no sudo)

1. On GitHub, open **Settings → Actions → Runners → New self-hosted runner**
   and choose **Linux / x64**.
2. On the lab PC, run the **Download** commands GitHub shows (they install into
   `~/actions-runner`, which needs no sudo).
3. Run the **Configure** command GitHub shows, and add our label:

   ```bash
   ./config.sh --url https://github.com/danit-x/Queueless --token <TOKEN> \
     --name queueless-lab --labels queueless-lab --unattended
   ```

4. Start it in the background. It keeps running after you log out:

   ```bash
   cd ~/actions-runner
   nohup ./run.sh > runner.log 2>&1 &
   ```

   Do **not** use `sudo ./svc.sh install`. That needs sudo.

5. Restart it automatically after a reboot with a user crontab (no sudo):

   ```bash
   crontab -e
   ```

   Add this line:

   ```text
   @reboot cd $HOME/actions-runner && nohup ./run.sh > runner.log 2>&1 &
   ```

The runner should now show as **Idle** on the GitHub Runners page.

## 4. Add secrets and variables on GitHub

Open **Settings → Secrets and variables → Actions**.

| Kind     | Name                | Value                                   |
| -------- | ------------------- | --------------------------------------- |
| Secret   | `POSTGRES_PASSWORD` | strong password                         |
| Secret   | `JWT_SECRET`        | output of `openssl rand -hex 48`        |
| Variable | `CLIENT_ORIGIN`     | `http://<LAB-PC-IP>:8080`               |
| Variable | `FRONTEND_PORT`     | `8080` (optional, this is the default)  |

Use the **same** `POSTGRES_PASSWORD` as in step 2. Postgres stores the password
when it first creates the volume and ignores later changes.

## 5. Lock down the public repo

The repo is public, and the runner executes code on the lab PC. So only our own
commits may run on it:

- **Settings → Actions → General → Fork pull request workflows from outside
  collaborators**: choose **Require approval for all external contributors**.
- Only `deploy.yml` targets the `queueless-lab` label. CI and smoke tests stay
  on GitHub's `ubuntu-latest` machines.

## 6. Deploy

- Push to `main`. When **CI** passes, **Deploy to Lab Server** runs on the lab PC.
- To deploy by hand: **Actions → Deploy to Lab Server → Run workflow**.

The deploy builds the images on the lab PC, runs `docker compose up -d`, waits
for the backend health check, and checks `/api/health` through nginx.

## Troubleshooting

| Problem                                   | Fix                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Deploy job stuck on "Waiting for runner"  | Runner stopped. Run step 3.4 again; check `~/actions-runner/runner.log`. |
| `permission denied ... docker.sock`       | User is not in the `docker` group (see step 1).                      |
| Backend unhealthy, password errors in log | `POSTGRES_PASSWORD` differs from the one the volume was created with. |
| Works on lab PC, not from other laptops   | Port blocked on the lab network; ask the admin or change the port.   |
| Reset the database completely             | `docker compose -f docker-compose.prod.yml down -v` (deletes all data). |
