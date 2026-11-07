# Smart Indoor College Navigation and Campus Assistance System
### Main Block — Bishop Jerome Institute, Kollam

A mobile-first, Google Maps-inspired indoor positioning, routing, and real-time campus assistance platform built with **React.js (React Router + Tailwind CSS)**, **Node.js/Express.js**, **Socket.io**, and **MongoDB**.

---

## ✨ Key Capabilities

1. **Google Maps-Like Multi-Page Mobile UI (`react-router-dom` & Tailwind CSS)**
   - **`/` (Explore & Map)**: Full-screen interactive pan-and-zoom SVG campus floor map, floating top search bar with autocomplete & category chips, vertical indoor floor picker (`1F` / `GF`), and a **swipe-up bottom sheet** (`peek` / `half` / `full`) for turn-by-turn A* directions.
   - **`/scan` (QR Checkpoint Scanner)**: Live mobile camera QR scanner (`html5-qrcode`), image upload scanner, interactive checkpoint simulator, and printable campus QR plaques.
   - **`/schedule` (Timetables & Faculty Assistance)**: Dynamic schedule resolver that routes students directly to a teacher's active classroom or default cabin, plus a live Timetable CRUD Studio for Teachers and Admins.
   - **`/profile` (User Profile & RBAC Roles)**: JWT session manager, active role permissions matrix, and 1-tap Demo Role Switcher across all 4 roles.

2. **Role-Based Access Control (RBAC — 4 Exact Roles)**
   - **`Admin`** (`admin@bji.ac.in` / `AdminPassword@123`): Full access including interactive **Map & Node Editor** (tap map to add nodes, edit/delete nodes, connect corridor edges, or reset seed data).
   - **`Teacher`** (`priya.nair@bji.ac.in` / `Teacher@123`): Can create, edit, and delete class slots in their timetable (`/schedule`) in addition to full map and schedule routing.
   - **`Student`** (`student@bji.ac.in` / `Password@123`): Full access to Faculty Finder & Dynamic Timetable Routing as well as point-to-point navigation.
   - **`Normal_User`** (`visitor@bji.ac.in` / `Visitor@123` or Guest): Restricted to basic point-to-point map routing, QR scanning, and Live Friend Sharing (blocked from Timetable/Faculty endpoints via JWT RBAC middleware).

3. **Real-Time Live Location & Friend Sharing (`Socket.io`)**
   - Tap **Share Location** on `/` or `/profile` to generate a unique **6-digit room code**.
   - Friends enter the 6-digit code to join the live Socket.io room.
   - Whenever any member scans a new QR checkpoint on `/scan`, their live `nodeId` and floor coordinates broadcast instantaneously to everyone in the room, smoothly gliding their live avatar across friends' maps.

4. **Augmented Reality (AR) Live Camera Navigation (`A-Frame` & `AR.js`)**
   - Tap **AR Live View** in the bottom navigation bar, top action chips, or turn-by-turn directions drawer.
   - Streams the rear device camera via WebRTC (`getUserMedia`), tracks user compass/gyroscope heading via the `DeviceOrientation` API, and renders a live 3D directional arrow (`aframe` + `@ar-js-org/ar.js`) pointing toward the relative bearing and floor elevation of the next A* path node.
   - Automatically and smoothly falls back to the standard 2D `FloorMap.jsx` view if camera permissions are denied or orientation sensors are unavailable.

---

## 🚀 Quick Commands

```bash
# Seed MongoDB with 43 Nodes, 46 Edges, 4 Teachers, 15 Timetables & 4 RBAC Demo Users
npm run seed

# Run end-to-end verification (RBAC roles + A* routing + Socket.io 6-digit rooms)
npm --prefix backend run test:overhaul

# Build production frontend bundle
npm run build

# Start Backend (Port 5000) & Frontend (Port 3000)
npm run server
npm run client
```
