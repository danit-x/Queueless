// QueueLess — CI pipeline (Jenkins declarative pipeline, Groovy).
//
// Continuous Integration only: test the code and build the Docker images.
// It does NOT deploy; deployment will be a separate CD pipeline.
//
// Runs on the lab PC's Jenkins agent (label "rootless-docker"), which uses
// Rootless Docker as the Linux account "user": no sudo, no docker group.
// Node.js is NOT needed on the agent; tests and the frontend build run inside
// node:20-alpine containers. No host ports are used, so CI never clashes
// with containers already running on the lab PC.
//
// Stages: Checkout → Check tools → Test & build (parallel) → Build images
//
// Setup: docs/jenkins-setup.md

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

  environment {
    // Throwaway test database, unique per build so builds never share state.
    TEST_NET  = "ql-test-net-${env.BUILD_NUMBER}"
    TEST_DB   = "ql-test-db-${env.BUILD_NUMBER}"
    // Named volume that keeps npm's download cache between builds.
    NPM_CACHE = 'queueless-jenkins-npm-cache'
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
        // ":latest" plus a build tag that names this exact commit.
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
  }

  post {
    success {
      // Keep this build's tagged images (and :latest); remove older build tags.
      sh '''
        docker image ls --format '{{.Repository}}:{{.Tag}}' \
          | grep -E '(^|/)queueless-(backend|frontend):jenkins-' \
          | grep -v ":$IMAGE_TAG\\$" \
          | xargs -r docker rmi >/dev/null 2>&1 || true
        docker image prune -f >/dev/null
      '''
      echo "CI passed: images queueless-backend:${env.IMAGE_TAG} and queueless-frontend:${env.IMAGE_TAG}"
    }
  }
}
