# MediaHub

Media search, 115 share transfers and offline downloads, anime subscriptions,
and media organization in one application.

## Layout

- `web/`: React and Vite frontend.
- `api/`: Go backend with embedded PanSou search.
- `api/third_party/pansou/`: pinned submodule from `a3318375/pansou`.
- `Dockerfile`: frontend and backend multi-stage image build.
- `docker-compose.yml`: single-container deployment.

## Deploy

After the GitHub Actions image build succeeds:

```sh
git clone --recurse-submodules https://github.com/a3318375/MediaHub.git
cd MediaHub
docker compose pull
docker compose up -d
```

Open `http://SERVER_IP:5173`. The first visit creates the administrator account.
Persistent database, encryption key and cache are stored in `./data`.
Preserve the entire data directory when upgrading or migrating.
Do not run multiple API instances against the same data directory.
Private GHCR packages require `docker login ghcr.io` with package read access.

## Development

```sh
git submodule update --init --recursive
```

On Windows, start the API in one terminal:

```powershell
cd api
./scripts/dev.ps1
```

Start the frontend in another terminal:

```sh
cd web
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

The frontend proxies API requests to `127.0.0.1:18080`.
See `api/README.md` for API details and settings.

## Build Locally

Run from the repository root:

```sh
docker build -f Dockerfile --build-context web=./web -t mediahub:local ./api
docker run --rm -p 5175:18080 -v mediahub-test-data:/data mediahub:local
```

The trial uses an independent volume and port 5175.
The final container runs one Go service for frontend and API.

## GitHub Actions

Pushes to `main` or manual workflow runs build both projects and publish
`ghcr.io/a3318375/mediahub:latest` and a commit-specific tag.
No cross-repository frontend token is needed.

To upgrade an existing deployment:

```sh
git pull
docker compose pull
docker compose up -d
```
