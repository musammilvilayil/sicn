# Smart Indoor College Navigation (SICN)
### Bishop Jerome Institute, Kollam

SICN is a full-stack campus navigation and assistance application built with React, Vite, Tailwind CSS, Node.js, Express, MongoDB, Socket.IO, QR checkpoints and an optional camera-based navigation view.

## Main modules

- **Explore:** multi-floor SVG floor map, room search, accessible route selection and A* turn-by-turn directions.
- **QR checkpoints:** scan a physical QR plaque, upload a QR image, or use the development simulator to set a known indoor position.
- **Faculty and timetable:** resolve a teacher's current classroom or cabin using timetable data.
- **Live sharing:** share checkpoint updates with a short-lived six-digit room code.
- **Camera guidance:** camera preview with a compass-aligned directional overlay when the browser exposes the required sensors; otherwise, step-by-step guidance remains available.
- **Role-based access:** Admin, Teacher, Student and Normal_User permissions.

## Local setup

Requirements: Node.js 22+, MongoDB, and a modern browser.

1. Install dependencies:

   ```bash
   cd backend && npm ci
   cd ../frontend && npm ci
   ```

2. Create `backend/.env` using `backend/.env.example`. Set:
   - `MONGODB_URI`
   - `JWT_SECRET` (generate a unique value with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `CLIENT_ORIGIN=http://localhost:3000`

3. For a new database only, seed campus map, faculty and timetable data:

   ```bash
   cd backend && npm run seed
   ```

   Seeding stops if campus collections already contain data. It never deletes user or administrator accounts.

4. Start the backend:

   ```bash
   npm run server
   ```

   On first startup, the server creates the first Admin account. If a legacy demo Admin exists without a bootstrap marker, its known demo password is rotated once. The username/email and a randomly generated temporary password are printed in the backend terminal. Save them securely and change the password immediately from the Account page. The password is not printed again.

5. Start the frontend in another terminal:

   ```bash
   cd frontend && npm run dev -- --host 0.0.0.0
   ```

   Open the Vite URL (default port 3000).

## Account provisioning

- Public registration creates **Normal_User** accounts only.
- The bootstrap Admin can create Teacher, Student and visitor accounts from the Account page.
- A Teacher account must be linked to an existing faculty profile.
- Admin accounts are not available through public registration or the account-provisioning form.
- Never commit `.env`, passwords, JWT secrets or production credentials.

## Camera and AR support

The camera view requires a secure context (**HTTPS**, except localhost) and explicit camera permission. Compass-aligned arrows additionally require a supported device-orientation sensor and permission.

Browser/device behavior varies:
- Recent Android phones generally provide camera and orientation APIs, subject to browser and manufacturer permissions.
- iPhone/iPad Safari requires a user gesture to request motion permission. Enable Motion & Orientation Access in Safari website settings if prompted.
- Laptops and devices without a compass can still show camera guidance and route-step instructions, but cannot provide a reliable compass-aligned 3D arrow.
- If camera access is unavailable or denied, use the standard floor map and QR checkpoint flow.

SICN uses QR checkpoints to establish known indoor positions. The current browser implementation is **not** continuous SLAM, visual-inertial odometry, UWB positioning or a certified indoor positioning system. Compass direction can be affected by magnetic interference; verify routes against the actual building before operational use.

## Security and deployment notes

- Configure a unique `JWT_SECRET` with at least 32 characters. The backend refuses to start without it.
- Configure `CLIENT_ORIGIN` with the exact production frontend origin.
- Admin passwords are generated once at bootstrap and stored as bcrypt hashes.
- Public registration cannot assign privileged roles.
- Socket.IO uses signed JWT identity when available; guest sockets are always treated as Normal_User. Sharing rooms expire after one hour and have a member limit.
- Database reseeding is disabled in production and by default in development. Do not enable destructive seed operations against real data.
- Use HTTPS, database backups, monitoring and a tested restore procedure before production launch.

## Commands

```bash
# Root commands
npm run server
npm run client
npm run build

# Backend
npm --prefix backend run seed
npm --prefix backend run test:route
npm --prefix backend run test:overhaul

# Frontend
npm --prefix frontend run lint
npm --prefix frontend run build
```

GitHub Actions runs frontend lint/build and backend JavaScript syntax checks. Database-backed integration tests still require a configured MongoDB test database and should be run separately.
