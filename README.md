# openclaw-assistant-ui

React frontend for `openclaw-assistant`.

## Local Development

```sh
cp .env.example .env
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
```

The UI calls the Go API at `VITE_API_BASE_URL`, which defaults to:

```txt
http://localhost:8080
```

## Docker

From the parent `openclaw` directory:

```sh
docker compose up --build
```

The composed UI is served at:

```txt
http://localhost:3000
```
