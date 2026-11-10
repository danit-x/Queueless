echo "== containers"; docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}'; echo "== port 8080"; ss -ltnp 2>/dev/null | grep 8080; echo "== compose projects"; docker compose ls -a; echo "== runner"; pgrep -af Runner.Listener; crontab -l; echo "== disk"; df -h ~ | tail -1; docker system df


gh run rerun 42761122756
