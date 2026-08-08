# Health API

A lightweight Node.js REST API providing application and health-check endpoints. The project is containerized with Docker and uses GitHub Actions for automated testing and container image publishing.

## Overview

Health API exposes two HTTP endpoints:

| Method | Endpoint  | Description                              |
| ------ | --------- | ---------------------------------------- |
| `GET`  | `/`       | Returns the application status message   |
| `GET`  | `/health` | Returns the health status of the service |

## Technology Stack

* **Runtime:** Node.js 24
* **Framework:** Express
* **Testing:** Jest
* **Containerization:** Docker / Docker Compose
* **CI:** GitHub Actions
* **Container Registry:** GitHub Container Registry (GHCR)

## Getting Started

### Prerequisites

The following software is required to run the project locally:

* Node.js 24+
* npm
* Docker and Docker Compose (for containerized execution)

### Install Dependencies

```bash
npm ci
```

### Run the Application

```bash
node index.js
```

The API will be available at:

```text
http://localhost:3000
```

### Test the API

```bash
curl http://localhost:3000/
```

Expected response:

```json
{
  "message": "health-api is running"
}
```

Health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "healthy"
}
```

## Testing

The project uses Jest for automated endpoint testing.

Run the test suite with:

```bash
npm test
```

## Docker

### Build the Image

```bash
docker build -t health-api .
```

### Run the Container

```bash
docker run -d \
  --name health-api \
  -p 3000:3000 \
  health-api
```

The API will then be available at:

```text
http://localhost:3000
```

### Docker Compose

The application can also be started using Docker Compose:

```bash
docker compose up -d
```

To stop the application:

```bash
docker compose down
```

## Container Image

Production images are published automatically to GitHub Container Registry.

Pull the latest image:

```bash
docker pull ghcr.io/alirezajafarlou/health-api:latest
```

Run it:

```bash
docker run -d \
  --name health-api \
  -p 3000:3000 \
  ghcr.io/alirezajafarlou/health-api:latest
```

## CI Pipeline

The repository uses GitHub Actions to automate the validation and packaging process.

On pushes to `main` and pull requests targeting `main`, the CI workflow:

1. Checks out the repository.
2. Sets up Node.js 24.
3. Installs dependencies with `npm ci`.
4. Runs the automated test suite.
5. Authenticates with GitHub Container Registry.
6. Builds the Docker image.
7. Publishes the image to GHCR.

This ensures that changes are tested automatically before the resulting container image is published.

## Docker Image Optimization

The production image uses the Debian-based slim Node.js image:

```dockerfile
FROM node:24-bookworm-slim
```

Production dependencies are installed without development dependencies:

```dockerfile
RUN npm ci --omit=dev
```

This keeps the runtime image smaller while the full development dependencies remain available to the CI environment for testing.

The optimized image reduced the local image footprint from approximately **1.7 GB to 410 MB** while retaining the same application functionality.

## Project Structure

```text
health-api/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .dockerignore
├── .gitignore
├── Dockerfile
├── index.js
├── index.test.js
├── package.json
└── package-lock.json
```

## Development Workflow

The project follows a simple development workflow:

```text
Code change
    │
    ▼
Git commit / Pull Request
    │
    ▼
GitHub Actions
    │
    ├── Install dependencies
    ├── Run tests
    └── Build Docker image
            │
            ▼
           GHCR
```

## License

This project is available for educational and personal development purposes.

