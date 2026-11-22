// QueueLess — Jenkins declarative pipeline (Groovy). This is the project's
// only CI/CD pipeline.
//
// Runs on the lab PC's Jenkins agent (label "rootless-docker"), which uses
// Rootless Docker as the Linux account "user": no sudo, no docker group.
// Node.js is NOT needed on the agent; tests and the frontend build run inside
// node:20-alpine containers.
//
// Stages: Checkout → Check tools → Test & build (parallel) → Build images
//         → Push to Docker Hub (optional) → Deploy → Smoke test
//
// Ports on the lab PC (Jenkins + Rootless Docker lab guide):
//   Jenkins       8080 / 8081 (given by the instructor)
//   QueueLess app 8082        (Rootless Docker cannot bind ports below 1024)
//
// Setup (credentials, job, agent): docs/jenkins-setup.md

pipeline {
  agent { label 'rootless-docker' }

  options {
    buildDiscarder(logRotator(numToKeepStr: '15'))
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  // The lab PC is on the campus LAN, so GitHub webhooks cannot reach it.
  // Jenkins asks GitHub for new commits instead (about every 5 minutes).
  triggers {
    pollSCM('H/5 * * * *')
  }

  parameters {
    booleanParam(name: 'PUSH_IMAGES', defaultValue: false,
      description: 'Push both images to Docker Hub (needs the dockerhub-credentials credential).')
    booleanParam(name: 'DEPLOY', defaultValue: true,
      description: 'Deploy the stack on this agent after the images are built.')
    string(name: 'FRONTEND_PORT', defaultValue: '8082',
      description: 'Host port for the app. Keep it >= 1024 and different from the Jenkins port.')
    string(name: 'CLIENT_ORIGIN', defaultValue: 'http://10.50.80.174:8082',
      description: 'URL the browser uses to open the app (CORS origin). Must match FRONTEND_PORT.')
  }

  environment {
    // Docker Compose reads this instead of a -f flag. The file names the
    // project "queueless-prod" (containers queueless-prod-*).
    COMPOSE_FILE  = 'docker-compose.prod.yml'
    FRONTEND_PORT = "${params.FRONTEND_PORT}"
    CLIENT_ORIGIN = "${params.CLIENT_ORIGIN}"
    // Throwaway test database, unique per build so builds never share state.
    TEST_NET      = "ql-test-net-${env.BUILD_NUMBER}"
    TEST_DB       = "ql-test-db-${env.BUILD_NUMBER}"
    // Named volume that keeps npm's download cache between builds.
    NPM_CACHE     = 'queueless-jenkins-npm-cache'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          def shortSha = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()
          // e.g. jenkins-42-ab12cd3: build number + commit.
          env.IMAGE_TAG = "jenkins-${env.BUILD_NUMBER}-${shortSha}"
          currentBuild.description = env.IMAGE_TAG
        }
        echo "Image tag: ${env.IMAGE_TAG}"
      }
    }

    stage('Check tools') {
      steps {
        sh '''
          whoami
          docker context show
          docker info --format 'Docker {{.ServerVersion}}, security: {{.SecurityOptions}}'
          docker compose version
        '''
      }
    }

    stage('Test & build') {
      parallel {
        stage('Backend tests') {
          steps {
            sh '''
              docker network create "$TEST_NET"
              docker run -d --name "$TEST_DB" --network "$TEST_NET" \
                -e POSTGRES_USER=queueless -e POSTGRES_PASSWORD=queueless \
                -e POSTGRES_DB=queueless_test postgres:16-alpine

              echo "Waiting for the test database..."
              for i in $(seq 1 30); do
                docker exec "$TEST_DB" pg_isready -U queueless -d queueless_test -q && break
                [ "$i" = 30 ] && { echo "Test database did not start"; exit 1; }
                sleep 2
              done

              docker exec -i "$TEST_DB" psql -U queueless -d queueless_test \
                -v ON_ERROR_STOP=1 -q < database/schema.sql

              # The whole repo is mounted: the tests read database/schema.sql.
              # JWT_SECRET is a throwaway value for this test database only.
              docker run --rm --network "$TEST_NET" \
                -v "$WORKSPACE":/repo -w /repo/backend \
                -v "$NPM_CACHE":/root/.npm \
                -e NODE_ENV=test \
                -e DATABASE_URL="postgres://queueless:queueless@$TEST_DB:5432/queueless_test" \
                -e JWT_SECRET=jenkins-only-test-secret-not-used-anywhere-else-0123 \
                -e BCRYPT_ROUNDS=4 \
                node:20-alpine sh -c 'npm ci --no-audit --no-fund && npm run check && npm test'
            '''
          }
          post {
            always {
              sh '''
                docker rm -f "$TEST_DB" >/dev/null 2>&1 || true
                docker network rm "$TEST_NET" >/dev/null 2>&1 || true
              '''
            }
          }
        }

        stage('Frontend build') {
          steps {
            sh '''
              docker run --rm \
                -v "$WORKSPACE":/repo -w /repo/frontend \
                -v "$NPM_CACHE":/root/.npm \
                -e VITE_API_URL=/api \
                node:20-alpine sh -c 'npm ci --no-audit --no-fund && npm run build'
            '''
            archiveArtifacts artifacts: 'frontend/dist/**', fingerprint: true
          }
        }
      }
    }

    stage('Build images') {
      steps {
        // ":latest" is what docker-compose.prod.yml runs; the build tag keeps
        // a traceable name for this exact commit.
        sh '''
          docker build --pull --target runtime \
            -t "queueless-backend:$IMAGE_TAG" -t queueless-backend:latest ./backend
          docker build --pull --target runtime \
            --build-arg VITE_API_URL=/api \
            -t "queueless-frontend:$IMAGE_TAG" -t queueless-frontend:latest ./frontend
          docker image ls --filter "reference=queueless-*:$IMAGE_TAG"
        '''
      }
    }

    stage('Push to Docker Hub') {
      when { expression { params.PUSH_IMAGES } }
      steps {
        // Username + access token from Docker Hub, stored in Jenkins as a
        // "Username with password" credential. Jenkins masks it in the log.
        withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials',
                                          usernameVariable: 'DOCKERHUB_USER',
                                          passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin
            for app in backend frontend; do
              for tag in "$IMAGE_TAG" latest; do
                docker tag "queueless-$app:$IMAGE_TAG" "$DOCKERHUB_USER/queueless-$app:$tag"
                docker push "$DOCKERHUB_USER/queueless-$app:$tag"
              done
            done
          '''
        }
      }
      post {
        always { sh 'docker logout || true' }
      }
    }

    stage('Deploy') {
      when { expression { params.DEPLOY } }
      steps {
        withCredentials([string(credentialsId: 'queueless-postgres-password', variable: 'POSTGRES_PASSWORD'),
                         string(credentialsId: 'queueless-jwt-secret', variable: 'JWT_SECRET')]) {
          sh '''
            [ ${#JWT_SECRET} -ge 32 ] || { echo "queueless-jwt-secret must be at least 32 characters"; exit 1; }

            docker compose up -d --wait db

            # Postgres keeps the password from when its volume was first
            # created. Set it to the Jenkins credential on every deploy, so a
            # changed credential (or an old volume) cannot lock the API out.
            # Runs over the container's local socket, which needs no password;
            # the value comes from an environment variable, not the command line.
            docker compose exec -T -e NEW_DB_PASSWORD="$POSTGRES_PASSWORD" db \
              psql -v ON_ERROR_STOP=1 -q -U postgres -d queueless <<'SQL'
\\getenv new_pw NEW_DB_PASSWORD
ALTER USER postgres WITH PASSWORD :'new_pw';
SQL
            echo "Database password synced"

            # schema.sql is idempotent; apply it before the new backend starts.
            docker compose exec -T db \
              psql -v ON_ERROR_STOP=1 --single-transaction -q \
              -U postgres -d queueless < database/schema.sql
            echo "Schema applied"

            # Images were built in the previous stage, so never build here.
            docker compose up -d --no-build --force-recreate --remove-orphans backend frontend
          '''
        }
      }
    }

    stage('Smoke test') {
      when { expression { params.DEPLOY } }
      steps {
        sh '''
          for i in $(seq 1 30); do
            body=$(curl -fsS "http://127.0.0.1:$FRONTEND_PORT/api/health" 2>/dev/null || true)
            if echo "$body" | grep -q '"status":"ok"'; then
              echo "$body"
              echo "App is healthy at $CLIENT_ORIGIN (attempt $i)"
              curl -fsS -o /dev/null -w "Frontend /healthz: HTTP %{http_code}\\n" "http://127.0.0.1:$FRONTEND_PORT/healthz"
              exit 0
            fi
            sleep 5
          done
          echo "App did not become healthy in time"
          exit 1
        '''
      }
    }
  }

  post {
    always {
      // Compose needs the secrets only to read the file; dummy values are fine for ps/logs.
      sh '''
        export POSTGRES_PASSWORD=unused JWT_SECRET=unused-unused-unused-unused-unused
        docker compose ps || true
      '''
    }
    failure {
      sh '''
        export POSTGRES_PASSWORD=unused JWT_SECRET=unused-unused-unused-unused-unused
        docker compose logs --no-color --tail=200 || true
      '''
    }
    success {
      // Keep this build's tagged images (and :latest); remove older build tags.
      sh '''
        docker image ls --format '{{.Repository}}:{{.Tag}}' \
          | grep -E '(^|/)queueless-(backend|frontend):jenkins-' \
          | grep -v ":$IMAGE_TAG\\$" \
          | xargs -r docker rmi >/dev/null 2>&1 || true
        docker image prune -f >/dev/null
      '''
      echo "QueueLess ${env.IMAGE_TAG} built${params.DEPLOY ? " and running at ${params.CLIENT_ORIGIN}" : ''}"
    }
  }
}
