# Health API

A lightweight service monitoring application built with Node.js, Express, and PostgreSQL.

Health API lets you register HTTP/HTTPS services and check their availability from a simple web dashboard or through the REST API.

## Features

- Service registration and management
- HTTP/HTTPS health checks
- PostgreSQL persistence
- REST API
- Web-based monitoring dashboard
- Add, edit, and delete services
- Search services by name or URL
- Light and dark themes
- Dockerized development and deployment
- Automated tests
- ESLint and Prettier
- GitHub Actions CI
- Container images published to GitHub Container Registry

## Tech Stack

- **Runtime:** Node.js 24
- **Backend:** Express 5
- **Database:** PostgreSQL 17
- **Database client:** `pg`
- **Testing:** Jest + Supertest
- **Linting:** ESLint
- **Formatting:** Prettier
- **Containerization:** Docker / Docker Compose
- **CI/CD:** GitHub Actions
- **Container registry:** GitHub Container Registry

## Getting Started

### Prerequisites

- Node.js 24+
- npm
- Docker and Docker Compose

### Clone the repository

```bash
git clone https://github.com/alirezajafarlou/health-api.git
cd health-api
````

### Run with Docker Compose

The easiest way to run the complete application is with Docker Compose:

```bash
docker compose up -d
```

This starts:

* the Health API on port `3000`
* PostgreSQL 17
* a persistent PostgreSQL volume

The API is available at:

```text
http://localhost:3000
```

The monitoring dashboard is available at:

```text
http://localhost:3000/dashboard
```

To stop the application:

```bash
docker compose down
```

> `docker compose down` stops and removes the containers while the PostgreSQL data remains in the named `postgres_data` volume.

## Local Development

Install dependencies:

```bash
npm ci
```

The application expects PostgreSQL connection settings through environment variables:

```text
PORT
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

Then start the application:

```bash
npm start
```

## API

### Application status

```http
GET /
```

Returns:

```json
{
  "message": "health-api is running"
}
```

### Health check

```http
GET /health
```

Returns:

```json
{
  "status": "healthy"
}
```

### About

```http
GET /about
```

Returns basic application information.

### List services

```http
GET /services
```

Returns all registered services.

### Get a service

```http
GET /services/:id
```

### Add a service

```http
POST /services
Content-Type: application/json
```

Request body:

```json
{
  "name": "Example",
  "url": "https://example.com"
}
```

### Update a service

```http
PATCH /services/:id
Content-Type: application/json
```

You can update either the name, URL, or both:

```json
{
  "name": "Updated Example",
  "url": "https://example.com"
}
```

### Delete a service

```http
DELETE /services/:id
```

### Check service health

```http
GET /services/:id/health
```

The API performs a GET request against the configured service URL and reports whether the response is healthy, unhealthy, or unreachable.

Health checks use a 10-second request timeout.

## Dashboard

The application includes a browser-based dashboard at:

```text
/dashboard
```

The dashboard provides:

* Service overview
* Total / healthy / unhealthy counts
* Manual health checks
* Service search
* Service creation
* Service editing
* Service deletion
* Theme switching

The frontend is served directly by the Express application from the `frontend/` directory.

## Database

PostgreSQL is used to persist registered services.

When running with Docker Compose, the database is initialized from:

```text
db/schema.sql
```

Database data is stored in the Docker named volume:

```text
postgres_data
```

The API waits for PostgreSQL's health check before starting.

## Testing

Run the test suite with:

```bash
npm test
```

Tests are executed with Jest in-band.

## Code Quality

Run ESLint:

```bash
npm run lint
```

Check formatting:

```bash
npm run format:check
```

Format the project:

```bash
npm run format
```

## Docker

Build the application image:

```bash
docker build -t health-api .
```

Run it:

```bash
docker run -d \
  --name health-api \
  -p 3000:3000 \
  health-api
```

The production image is based on:

```text
node:24-bookworm-slim
```

and installs production dependencies only.

## Container Image

Images are published to GitHub Container Registry.

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

## CI

GitHub Actions runs automatically for pushes to `main` and pull requests targeting `main`.

The pipeline:

1. Checks out the repository
2. Sets up Node.js 24
3. Installs dependencies
4. Runs the test suite
5. Authenticates with GHCR
6. Builds the Docker image
7. Publishes the image to GitHub Container Registry

## Project Structure

```text
health-api/
├── .github/
│   └── workflows/
│       └── ci.yml
├── db/
│   └── schema.sql
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── .dockerignore
├── .gitignore
├── .prettierignore
├── .prettierrc
├── Dockerfile
├── docker-compose.yml
├── eslint.config.js
├── index.js
├── index.test.js
├── package.json
└── package-lock.json
```

## License

This project is available for educational and personal development purposes.
