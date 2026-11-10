echo "== containers"; docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}'; echo "== port 8080"; ss -ltnp 2>/dev/null | grep 8080; echo "== compose projects"; docker compose ls -a; echo "== runner"; pgrep -af Runner.Listener; crontab -l; echo "== disk"; df -h ~ | tail -1; docker system df


gh run rerun 42761122756

gh variable set FRONTEND_PORT --body 8081
gh variable set CLIENT_ORIGIN --body http://10.50.80.174:8081
cd /home/user/devops/Queueless && docker compose down

curl -sI http://localhost:8080 | head -5; echo "== 8081"; ss -ltn | grep -E ':8081\b' || echo "8081 is free"

