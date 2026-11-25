# VEX Backend Architecture

## Project Structure

```
backend/
├── src/
│   ├── server.js                 # Clean entry point - routes only
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── models/
│   │   ├── User.js
│   │   ├── RideRequest.js
│   │   ├── Match.js
│   │   ├── Payment.js
│   │   ├── Group.js
│   │   ├── GroupMember.js
│   │   └── index.js
│   ├── migrations/
│   │   └── 001-initial-schema.js
│   ├── controllers/              # Business logic controllers
│   │   ├── userController.js    # User management
│   │   ├── rideController.js    # Ride matching & booking
│   │   ├── matchController.js   # Match confirmation
│   │   ├── paymentController.js # Payment processing
│   │   └── groupController.js   # Group management
│   └── utils/
│       └── helpers.js           # Shared utilities & helpers
├── package.json
└── ARCHITECTURE.md (this file)
```

## Architecture Overview

### server.js
Clean entry point that:
- Sets up Express and Socket.io
- Imports and initializes controllers
- Defines route mappings
- Handles database initialization
- Exports app, server, and io instances

### Controllers

#### userController.js
- `getOrCreateUser()` - Get or create user
- `getUserById()` - Fetch user by ID

#### rideController.js
- `findRide()` - Create a request and automatically match a compatible pending ride
- Marketplace and connection handlers - Discover riders, request to join, and accept or decline
- Group request handlers - Finalize groups, confirm riders, and share live locations
- Internal helpers: `createRideRequestRecord()`, `findMatchingRide()`, `getMarketplaceRequests()`

#### matchController.js
- `confirmMatch()` - Confirm a matched ride

#### paymentController.js
- `processPayment()` - Initialize Paystack payment
- `verifyPayment()` - Verify payment reference
- `paystackCallback()` - Handle payment callback
- Internal helpers: `createPaymentRecord()`, `initializePaystackTransaction()`, `verifyPaystackReference()`

#### groupController.js
- `createGroup()` - Create a new ride group
- `browseGroups()` - List all groups
- `joinGroup()` - Join an existing group
- `bookGroupRide()` - Book a ride for the group
- Internal helpers: `serializeGroup()`

### utils/helpers.js
Shared utilities:
- `parseRideTime()` - Parse time strings
- `ensureUser()` - Get or create user
- `findUserById()` - Fetch user
- Database state management: `setDbReady()`, `getDbReady()`, `setMemoryStore()`, `getMemoryStore()`

## Key Design Principles

✅ **Separation of Concerns** - Each controller handles one domain  
✅ **Clean Server** - server.js is focused on routes and setup only  
✅ **Reusable Helpers** - Shared logic in utils/helpers.js  
✅ **Socket.io Integration** - Controllers receive io instance via `setIO()`  
✅ **Database Abstraction** - Fallback to in-memory store if DB is unavailable  

## Routes

### User
- `POST /auth/signup` - Create an account
- `POST /auth/login` - Sign in
- `POST /auth/logout` - Sign out
- `POST /user/getOrCreate` - Create or get user
- `GET /user/:userId` - Get user details

### Ride discovery and groups
- `POST /findRide` - Create a request and automatically match a pending rider within 2.5 km and 30 minutes
- `GET /api/marketplace?userId=...&requestId=...` - Find compatible ride requests
- `POST /api/connections` - Ask to join a ride
- `GET /api/connections?userId=...` - List sent and received requests
- `PATCH /api/connections/:id` - Accept, decline, or cancel a connection
- `POST /cancelRide` - Cancel an open ride request
- `GET /api/requests?userId=...` - List a rider's requests
- `GET /api/requests/:id` - Get a ride request
- `PATCH /api/requests/:id` - Update a request or finalize a group
- `POST /api/requests/:id/confirm` - Confirm a finalized group
- `GET /api/requests/:id/live?userId=...` - Get group live locations
- `POST /location/update` - Update a rider's current location
- `GET /match/:matchId/live` - Get pair-match live locations

### Matches and chat
- `POST /confirmMatch` - Confirm a pair match
- `POST /confirmRideCompleted` - Confirm ride completion
- `POST /updatePaymentStatus` - Update match payment status
- `GET /activeRides/:userId` - List confirmed and completed rides
- `GET /match/:matchId/chat` - Load pair-chat messages
- `GET /api/requests/:id/chat?userId=...` - Load group-chat messages
- `PATCH /messages/:messageId/seen` - Mark a message as seen
- `GET /messages/unread/:userId` - Get unread message counts

### Payments
- `POST /processPayment` - Initialize payment
- `POST /transaction/initialize` - Initialize payment (alias)
- `GET /verifyPayment/:reference` - Verify payment
- `GET /transaction/verify/:reference` - Verify payment (alias)
- `GET /paystack/callback` - Payment callback

### Groups
- `POST /createGroup` - Create a group
- `GET /browseGroups` - List groups
- `POST /joinGroup` - Join a group
- `POST /bookGroupRide` - Book a group ride

- `GET /places/search?q=...`, `GET /places/reverse?lat=...&lon=...`, and `GET /places/ip` provide location lookup.
- `GET /health` reports server health.
- `POST /reset-app-data` is registered only outside production.
## Running the Server

```bash
npm start              # Production mode
npm run dev           # Development with nodemon
```

The server listens on port 4000 (or PORT environment variable).
