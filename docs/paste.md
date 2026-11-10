echo "== containers"; docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}'; echo "== port 8080"; ss -ltnp 2>/dev/null | grep 8080; echo "== compose projects"; docker compose ls -a; echo "== runner"; pgrep -af Runner.Listener; crontab -l; echo "== disk"; df -h ~ | tail -1; docker system df


gh run rerun 42761122756

echo "== containers"; docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}'; echo "== port 8080"; ss -ltnp 2>/dev/null | grep 8080; echo "== compose projects"; docker compose ls -a; echo "== runner"; pgrep -af Runner.Listener; crontab -l; echo "== disk"; df -h ~ | tail -1; docker system df
== containers
NAMES                     STATUS                    PORTS                                         project
queueless-prod-frontend   Created                                                                 queueless-prod
queueless-prod-backend    Up 31 minutes (healthy)   5000/tcp                                      queueless-prod
queueless-frontend        Up 35 minutes (healthy)   0.0.0.0:5173->80/tcp, [::]:5173->80/tcp       queueless
queueless-backend         Up 47 minutes (healthy)   0.0.0.0:5000->5000/tcp, [::]:5000->5000/tcp   queueless
queueless-db              Up 47 minutes (healthy)   0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp   queueless
queueless-prod-db         Up 2 hours (healthy)      5432/tcp                                      queueless-prod
== port 8080
LISTEN 0      50                 *:8080             *:*                                          
== compose projects
NAME                STATUS                   CONFIG FILES
queueless           running(3)               /home/user/devops/Queueless/docker-compose.yml
queueless-prod      created(1), running(2)   /home/user/actions-runner/_work/Queueless/Queueless/docker-compose.prod.yml
== runner
6768 /home/user/actions-runner/bin/Runner.Listener run
@reboot cd /home/user/actions-runner && nohup ./run.sh > runner.log 2>&1 &
== disk
/dev/nvme0n1p6   88G   17G   67G  21% /
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          5         3         931.3MB   227.4MB (24%)
Containers      6         5         151.6kB   8.192kB (5%)
Local Volumes   6         4         200.5MB   98.89MB (49%)
Build Cache     55        0         909.2MB   397.7MB

