# Smart Indoor College Navigation (SICN)
### Bishop Jerome Institute, Kollam

SICN is a full-stack indoor campus navigation and faculty assistance system built with React, Vite, Tailwind CSS, Node.js, Express, MongoDB, Socket.IO, QR checkpoints, and an optional browser-based AR camera guidance view.

## Main modules & routes

- **`/` — Explore & Multi-Floor Map:** Full-screen pan-and-zoom SVG campus map across all **8 floors (`GF` through `7F`)**, floating top search bar with room/category filters, vertical indoor floor selector (`7F` down to `GF`), accessible route toggle, Admin graph editor, and a swipe-up bottom sheet (`peek` / `half` / `full`) for turn-by-turn A* directions.
- **`/scan` — QR Checkpoint Scanner:** Live mobile camera QR scanner (`html5-qrcode`), QR image upload, floor-filtered checkpoint simulator (`GF`–`7F`), and printable campus QR plaques.
- **`/schedule` — Faculty & Timetable Assistance:** Resolves a faculty member's active classroom or default cabin from live schedule entries, with role-gated timetable management for Teachers and Admins.
- **`/profile` — Account, Security & RBAC:** JWT session management, mandatory first-login password rotation, role permission overview (`Admin`, `Teacher`, `Student`, `Normal_User`), and Admin-only account provisioning.
- **Live Location Sharing (Socket.IO):** Short-lived 6-digit sharing rooms that broadcast scanned QR checkpoints to room members in real time.
- **Camera / AR Guidance:** WebRTC camera preview with a compass-aligned directional overlay when supported sensors and permissions are available, with automatic fallback to 2D floor guidance.

## Eight-floor campus architecture & 3D A* routing

The Bishop Jerome Institute Main Block spatial graph spans **8 levels — Ground Floor (`0` / `GF`) through 7th Floor (`7` / `7F`)**:

- **Blueprint-derived spatial dataset:** `133` nodes and `154` bidirectional/vertical edges generated and validated by `backend/src/scripts/buildCampusGraph.js` and persisted in `backend/src/data/seedData.json`.
- **Floor-by-floor coverage (`3.9m` floor-to-floor elevation, `0m` to `27.3m`):**
  - **Ground Floor (`GF`) & 1st Floor (`1F`):** Main Entrance, Central Foyer, CAD/Computer Labs, Classrooms, Staff Room, KTU Exam Cell, Dept. Library, Principal Office, Admin Office, Conference Hall, and HOD/Senior Professor Cabins.
  - **2nd, 3rd & 4th Floors (`2F`–`4F`):** Multi-wing Lecture Classrooms (`201`–`406`), Faculty Cabins, Drawing Halls, Tutorial Rooms, and Restrooms.
  - **5th Floor (`5F`):** Classrooms (`501`–`504`), Project/Research Labs, and the **5th Floor East Open Terrace**.
  - **6th Floor (`6F`):** **Main Block Seminar Hall**, Faculty/Coordinator Cabins, Classrooms, and **6th Floor Open Terrace**.
  - **7th Floor (`7F`):** Rooftop **Central, West, and East Open Terraces** and service lobbies.
- **Four continuous vertical transport cores (`28` vertical shaft links):**
  - `STAIR-A` (Main West Staircase, `GF ↔ 7F`, `7.0m` vertical edge cost, `accessible: false`)
  - `STAIR-B` (East Wing Staircase, `GF ↔ 7F`, `7.0m` vertical edge cost, `accessible: false`)
  - `LIFT-1` (Main Passenger Lift 1, `GF ↔ 7F`, `4.0m` vertical edge cost, `accessible: true`)
  - `LIFT-2` (East Passenger Lift 2, `GF ↔ 7F`, `4.0m` vertical edge cost, `accessible: true`)
- **3D-aware A* pathfinding (`backend/src/algorithms/aStar.js`):** Uses an admissible 3D Euclidean heuristic ($\sqrt{\Delta x^2 + \Delta y^2 + \Delta z^2}$ with $z = \text{floor} \times 3.9\text{ m} \le 4.0\text{ m}$ minimum vertical edge cost) and supports `accessibleOnly: true` to exclude staircases and route strictly through `LIFT-1` / `LIFT-2` and accessible corridors.

## Installation and local setup

Requirements: **Node.js 22+**, **MongoDB**, and a modern browser.

1. **Install dependencies:**

   ```bash
   cd backend && npm ci
   cd ../frontend && npm ci
   ```

2. **Configure environment variables (`backend/.env`):**

   Copy `backend/.env.example` to `backend/.env` and set:
   - `MONGODB_URI` — MongoDB connection string (e.g., `mongodb://localhost:27017/indoor_navigation`).
   - `JWT_SECRET` — Unique secret of **at least 32 characters** (do not use placeholder `replace-...` values). Generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `CLIENT_ORIGIN=http://localhost:3000` — Allowed frontend origin for Express CORS and Socket.IO.
   - `PORT=5000` — Backend HTTP/WebSocket port.
   - Optional bootstrap overrides: `BOOTSTRAP_ADMIN_EMAIL` (default `admin@bji.ac.in`), `BOOTSTRAP_ADMIN_NAME` (default `Campus Administrator`).
   - Optional disposable-dev flag: `ALLOW_DESTRUCTIVE_SEED=false` (keep `false` unless explicitly resetting campus collections in a disposable dev DB).

3. **Seed / synchronize the 8-floor campus database:**

   ```bash
   npm --prefix backend run seed
   ```

   `seedDb.js` regenerates and validates `seedData.json` via `buildCampusGraph.js`, idempotently upserts all `133` nodes, `154` edges, `6` faculty profiles, and `21` timetable slots across `GF`–`7F`, and verifies multi-floor A* routing. Re-running `npm --prefix backend run seed` is safe: it never creates duplicate campus records and never deletes or overwrites `User` or `Admin` accounts.

4. **Start the backend server:**

   ```bash
   npm run server
   ```

5. **Start the frontend dev server (in a second terminal):**

   ```bash
   cd frontend && npm run dev -- --host 0.0.0.0
   ```

   Open `http://localhost:3000`.

## Bootstrap admin & first-login password rotation

- On startup, `ensureBootstrapAdmin.js` checks whether an `Admin` user exists:
  - If none exists, it creates the single bootstrap administrator (`BOOTSTRAP_ADMIN_EMAIL`) with a cryptographically random temporary password and sets `mustChangePassword: true`.
  - If legacy unrotated accounts from older seeds exist (Admin lacking `bootstrapAdminInitializedAt` or known legacy demo emails lacking `credentialsRotatedAt`), their passwords are rotated **once** to random temporary credentials with `mustChangePassword: true`. Subsequent server restarts never reset initialized accounts or create duplicate admins.
- The temporary password is printed **once** in the backend console. Sign in and change it immediately on `/profile`.
- While `mustChangePassword` is `true`, API middleware and Socket.IO block normal privileged operations (`403 PASSWORD_CHANGE_REQUIRED`) until `PUT /api/auth/password` completes.
- **Account provisioning & RBAC:**
  - Public `/api/auth/register` creates **`Normal_User`** accounts only.
  - Authenticated **Admins** can provision `Teacher`, `Student`, and `Normal_User` accounts via `/profile` (`/api/auth/provision`). `Teacher` accounts must link to a valid `Teacher` profile (`teacherId`).
  - `Admin` role assignment is blocked on both public registration and the provisioning endpoint.

## Camera and AR limitations & HTTPS requirements

- Live camera QR scanning and AR camera navigation require a **secure context (`HTTPS`, or `localhost`)** and explicit user-gesture permission prompts.
- Compass-aligned 3D arrows require device orientation sensors:
  - **iOS 13+ Safari** requires an explicit tap on **"Start AR Session"** to invoke `DeviceOrientationEvent.requestPermission()`. Ensure *Motion & Orientation Access* is enabled in Safari settings.
  - **Android Chrome** generally provides `deviceorientationabsolute` / `deviceorientation` over HTTPS when camera and motion permissions are granted.
  - **Desktops / devices without magnetometers** automatically fall back to step-by-step guidance or the 2D SVG floor map.
- SICN anchors indoor position via physical QR checkpoints; it is **not** continuous SLAM, visual-inertial odometry, or UWB indoor positioning, and indoor steel/concrete structures can affect compass headings.

### Test AR on an iPhone over HTTPS (local development)

A LAN address such as `http://192.168.1.57:3000` is **not a secure context**. iOS Safari blocks camera access and motion/orientation sensors on that URL. Do not try to solve this by changing browser permission code; open the development server through HTTPS instead.

For a quick temporary test tunnel:

1. Start MongoDB, the backend, and the Vite frontend as described above.
2. Install Cloudflare Tunnel on the development computer (Windows: `winget install --id Cloudflare.cloudflared`; other platforms: install `cloudflared` using Cloudflare's official installation guide).
3. In a new terminal, run:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
4. Copy the generated `https://….trycloudflare.com` URL and open that exact HTTPS URL in **Safari on the iPhone**. Keep the tunnel terminal running while testing.
5. Add the generated origin to `CLIENT_ORIGIN` in `backend/.env` (keep localhost too), for example:
   ```env
   CLIENT_ORIGIN=http://localhost:3000,https://YOUR-TUNNEL.trycloudflare.com
   ```
   Restart the backend after changing the environment variable. The backend uses this allow-list for both Express CORS and Socket.IO.
6. In iPhone Settings, enable Safari's **Motion & Orientation Access** (where available). In Safari, open the site's page settings and allow **Camera**. Reload the HTTPS page, choose a route, tap **AR Live View**, then tap **Start AR Session** and accept the permission prompts.

The free quick-tunnel hostname changes when a new tunnel is started; update `CLIENT_ORIGIN` to match the new origin each time. A quick tunnel is publicly reachable while running: use test accounts and non-sensitive data only, do not expose production credentials, and stop the tunnel when finished. This is a development testing path, not a production deployment recommendation.

## Security requirements & deployment notes

- Never commit `.env` files, JWT secrets, temporary bootstrap passwords, or database credentials.
- `server.js` refuses to start if `JWT_SECRET` is missing, shorter than 32 characters, or starts with `replace-`, and requires `CLIENT_ORIGIN` in production (`NODE_ENV=production`).
- Rate limiting protects login, registration, password changes, and account provisioning endpoints.
- Socket.IO authenticates JWT tokens when provided, blocks `mustChangePassword` tokens, treats unauthenticated sockets strictly as `Normal_User`, enforces room member caps, and expires sharing rooms after 1 hour.
- `POST /api/seed` requires `Admin` authentication and returns `403` in production or whenever `ALLOW_DESTRUCTIVE_SEED !== 'true'`.

## Verification & test commands

```bash
# Root development & build scripts
npm run server
npm run client
npm run build

# Backend seeding & routing verification
npm --prefix backend run seed
npm --prefix backend run test:route
npm --prefix backend run test:multifloor

# Backend RBAC, security & Socket.IO smoke suite (requires running backend + rotated admin password)
TEST_ADMIN_EMAIL=admin@bji.ac.in TEST_ADMIN_PASSWORD=your-current-admin-password npm --prefix backend run test:overhaul

# Frontend lint & production bundle
npm --prefix frontend run lint
npm --prefix frontend run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs `oxlint`, `vite build`, and `node --check` syntax verification across all backend modules.
