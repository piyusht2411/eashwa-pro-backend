# Eashwa Backend API Integration Guide

Base URL:

```text
http://localhost:5000
```

Production base URL depends on deployment. All API routes below are relative to the base URL.

## Auth

Protected APIs need:

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

Login also sets an HTTP-only `refreshToken` cookie. Frontend should send requests with credentials enabled if using cookie refresh:

```js
fetch(url, { credentials: "include" })
```

Roles used by this backend:

```text
admin, team, pdi
```

Team model:

- `admin` creates all users/teams.
- `team` means one production team/user. Admin can create multiple production teams.
- `pdi` means the single PDI team/user. Backend allows only one PDI user.
- There is no parent/child team hierarchy. Do not send `assignedTo`, `parentTeam`, `teamLead`, or similar fields.

Common error responses:

```json
{ "message": "No token provided" }
```

```json
{ "message": "Access denied. Required role(s): admin" }
```

```json
{ "message": "Validation or server error message" }
```

## Health

### GET `/`

Public health check.

Example response:

```json
{
  "message": "Eashwa Production Management API",
  "version": "2.0.0",
  "status": "running",
  "routes": {
    "user": "/api/user",
    "containers": "/api/containers",
    "productionLogs": "/api/production-logs",
    "pdiVerification": "/api/pdi",
    "payments": "/api/payments"
  }
}
```

## User APIs

### POST `/api/user/register`

Protected: `admin`. Creates an admin user, a production team/user, or the single PDI team/user.

Use `role: "team"` when admin creates a production team. Each production team is represented as one user.

Example body:

```json
{
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "password": "Password@123",
  "role": "team",
  "phone": "9876543210"
}
```

Example response:

```json
{
  "message": "User created successfully",
  "user": {
    "_id": "6630f3f9a4c9b2a001234001",
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "role": "team"
  }
}
```

Example body to create the single PDI team:

```json
{
  "name": "PDI Team",
  "email": "pdi@example.com",
  "password": "Password@123",
  "role": "pdi",
  "phone": "9876543210"
}
```

If a PDI team already exists:

```json
{ "message": "PDI team already exists" }
```

### POST `/api/user/login`

Public. Logs in and returns JWT token.

Example body:

```json
{
  "email": "rahul@example.com",
  "password": "Password@123"
}
```

Example response:

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "6630f3f9a4c9b2a001234001",
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "role": "team",
    "phone": "9876543210"
  }
}
```

### POST `/api/user/logout`

Public. Clears refresh token cookie.

Example body:

```json
{}
```

Example response:

```json
{ "message": "Logged out successfully" }
```

### GET `/api/user/me`

Protected: `admin`, `team`, `pdi`.

Example response:

```json
{
  "user": {
    "_id": "6630f3f9a4c9b2a001234001",
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "role": "team",
    "phone": "9876543210",
    "createdAt": "2026-05-05T08:00:00.000Z",
    "updatedAt": "2026-05-05T08:00:00.000Z"
  }
}
```

### PATCH `/api/user/fcm-token`

Protected: `admin`, `team`, `pdi`. Saves Firebase push token.

Example body:

```json
{
  "fcmToken": "firebase-device-token"
}
```

Example response:

```json
{ "message": "FCM token updated" }
```

### GET `/api/user/all`

Protected: `admin`.

Optional query:

```text
?role=team
```

Example response:

```json
{
  "users": [
    {
      "_id": "6630f3f9a4c9b2a001234001",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "role": "team",
      "phone": "9876543210",
      "createdAt": "2026-05-05T08:00:00.000Z",
      "updatedAt": "2026-05-05T08:00:00.000Z"
    }
  ]
}
```

### GET `/api/user/:id`

Protected: `admin`. Gets one admin, production team/user, or PDI team/user by ID.

Example response:

```json
{
  "user": {
    "_id": "6630f3f9a4c9b2a001234001",
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "role": "team",
    "phone": "9876543210",
    "createdAt": "2026-05-05T08:00:00.000Z",
    "updatedAt": "2026-05-05T08:00:00.000Z"
  }
}
```

If user does not exist:

```json
{ "message": "User not found" }
```

### PATCH `/api/user/:id`

Protected: `admin`. Updates an admin, production team/user, or PDI team/user.

Allowed fields:

```text
name, email, password, role, phone
```

Rules:

- `role` must be `admin`, `team`, or `pdi`.
- Only one user can have `role: "pdi"`.
- If `password` is sent, backend hashes it before saving.
- Do not send hierarchy fields like `assignedTo`, `parentTeam`, or `teamLead`.

Example body:

```json
{
  "name": "Rahul Production Team",
  "email": "rahul.team@example.com",
  "phone": "9876543210",
  "role": "team"
}
```

Example response:

```json
{
  "message": "User updated successfully",
  "user": {
    "_id": "6630f3f9a4c9b2a001234001",
    "name": "Rahul Production Team",
    "email": "rahul.team@example.com",
    "role": "team",
    "phone": "9876543210"
  }
}
```

If updating another user to PDI while PDI already exists:

```json
{ "message": "PDI team already exists" }
```

### DELETE `/api/user/:id`

Protected: `admin`. Deletes an admin, production team/user, or PDI team/user.

Rules:

- Admin cannot delete their own account.
- User cannot be deleted if linked to containers, production logs, PDI verifications, or payments.
- This prevents broken references in existing production/payment records.

Example response:

```json
{ "message": "User deleted successfully" }
```

Example blocked response:

```json
{ "message": "Cannot delete user because they are linked to containers" }
```

## Container APIs

### POST `/api/containers`

Protected: `admin`. Creates a work container/job and assigns it to a team user.

Example body:

```json
{
  "model": "Eashwa Scooter X1",
  "quantity": 100,
  "date": "2026-05-05",
  "ratePerUnit": 500,
  "assignedTeam": "6630f3f9a4c9b2a001234001"
}
```

Example response:

```json
{
  "message": "Container created successfully",
  "container": {
    "_id": "6630f5aca4c9b2a001234010",
    "model": "Eashwa Scooter X1",
    "quantity": 100,
    "date": "2026-05-05T00:00:00.000Z",
    "ratePerUnit": 500,
    "assignedTeam": "6630f3f9a4c9b2a001234001",
    "status": "active",
    "createdBy": "6630f3f9a4c9b2a001234999",
    "createdAt": "2026-05-05T08:10:00.000Z",
    "updatedAt": "2026-05-05T08:10:00.000Z"
  }
}
```

### GET `/api/containers`

Protected: `admin`, `team`, `pdi`.

Notes:

- `team` users only receive their assigned containers.
- `admin` and `pdi` receive all containers.

Example response:

```json
{
  "containers": [
    {
      "_id": "6630f5aca4c9b2a001234010",
      "model": "Eashwa Scooter X1",
      "quantity": 100,
      "date": "2026-05-05T00:00:00.000Z",
      "ratePerUnit": 500,
      "assignedTeam": {
        "_id": "6630f3f9a4c9b2a001234001",
        "name": "Rahul Sharma",
        "email": "rahul@example.com",
        "phone": "9876543210"
      },
      "status": "active",
      "createdBy": {
        "_id": "6630f3f9a4c9b2a001234999",
        "name": "Admin User",
        "email": "admin@example.com"
      },
      "createdAt": "2026-05-05T08:10:00.000Z",
      "updatedAt": "2026-05-05T08:10:00.000Z"
    }
  ]
}
```

### GET `/api/containers/:id`

Protected: `admin`, `team`, `pdi`.

Example response:

```json
{
  "container": {
    "_id": "6630f5aca4c9b2a001234010",
    "model": "Eashwa Scooter X1",
    "quantity": 100,
    "date": "2026-05-05T00:00:00.000Z",
    "ratePerUnit": 500,
    "assignedTeam": {
      "_id": "6630f3f9a4c9b2a001234001",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "phone": "9876543210"
    },
    "status": "active",
    "createdBy": {
      "_id": "6630f3f9a4c9b2a001234999",
      "name": "Admin User",
      "email": "admin@example.com"
    }
  }
}
```

### PATCH `/api/containers/:id/status`

Protected: `admin`.

Allowed status values:

```text
active, completed, cancelled
```

Example body:

```json
{
  "status": "completed"
}
```

Example response:

```json
{
  "message": "Container status updated",
  "container": {
    "_id": "6630f5aca4c9b2a001234010",
    "model": "Eashwa Scooter X1",
    "quantity": 100,
    "status": "completed"
  }
}
```

### DELETE `/api/containers/:id`

Protected: `admin`.

Example response:

```json
{ "message": "Container deleted" }
```

## Production Log APIs

### POST `/api/production-logs`

Protected: `team`. Team submits or updates daily production quantity for assigned active container.

Example body:

```json
{
  "containerId": "6630f5aca4c9b2a001234010",
  "date": "2026-05-05",
  "reportedQuantity": 25
}
```

Example response:

```json
{
  "message": "Production log submitted",
  "log": {
    "_id": "6630f646a4c9b2a001234020",
    "container": "6630f5aca4c9b2a001234010",
    "team": "6630f3f9a4c9b2a001234001",
    "date": "2026-05-05T00:00:00.000Z",
    "reportedQuantity": 25,
    "verifiedQuantity": null,
    "status": "pending",
    "createdAt": "2026-05-05T08:20:00.000Z",
    "updatedAt": "2026-05-05T08:20:00.000Z"
  }
}
```

### GET `/api/production-logs/dashboard`

Protected: `team`.

Example response:

```json
{
  "stats": [
    {
      "container": {
        "_id": "6630f5aca4c9b2a001234010",
        "model": "Eashwa Scooter X1",
        "quantity": 100,
        "date": "2026-05-05T00:00:00.000Z",
        "ratePerUnit": 500,
        "status": "active"
      },
      "totalReported": 50,
      "totalVerified": 45,
      "totalAmount": 22500
    }
  ]
}
```

### GET `/api/production-logs/pending`

Protected: `pdi`. Returns production logs waiting for PDI verification.

Example response:

```json
{
  "logs": [
    {
      "_id": "6630f646a4c9b2a001234020",
      "date": "2026-05-05T00:00:00.000Z",
      "reportedQuantity": 25,
      "verifiedQuantity": null,
      "status": "pending",
      "team": {
        "_id": "6630f3f9a4c9b2a001234001",
        "name": "Rahul Sharma",
        "email": "rahul@example.com"
      },
      "container": {
        "_id": "6630f5aca4c9b2a001234010",
        "model": "Eashwa Scooter X1",
        "quantity": 100,
        "ratePerUnit": 500,
        "assignedTeam": "6630f3f9a4c9b2a001234001"
      }
    }
  ]
}
```

### GET `/api/production-logs/container/:containerId`

Protected: `admin`, `pdi`, `team`.

Notes:

- `team` users only see their own logs.
- Response includes totals.

Example response:

```json
{
  "logs": [
    {
      "_id": "6630f646a4c9b2a001234020",
      "container": "6630f5aca4c9b2a001234010",
      "team": {
        "_id": "6630f3f9a4c9b2a001234001",
        "name": "Rahul Sharma",
        "email": "rahul@example.com"
      },
      "date": "2026-05-05T00:00:00.000Z",
      "reportedQuantity": 25,
      "verifiedQuantity": 22,
      "status": "incomplete"
    }
  ],
  "totalReported": 25,
  "totalVerified": 22
}
```

## PDI Verification APIs

### GET `/api/pdi/dashboard`

Protected: `pdi`.

Example response:

```json
{
  "pendingCount": 3,
  "recentVerifications": [
    {
      "_id": "6630f706a4c9b2a001234030",
      "productionLog": {
        "_id": "6630f646a4c9b2a001234020",
        "date": "2026-05-05T00:00:00.000Z",
        "reportedQuantity": 25
      },
      "container": {
        "_id": "6630f5aca4c9b2a001234010",
        "model": "Eashwa Scooter X1"
      },
      "verifiedQuantity": 22,
      "isIncomplete": true,
      "missingQuantity": 3,
      "remarks": "3 units incomplete",
      "verifiedAt": "2026-05-05T09:00:00.000Z"
    }
  ]
}
```

### POST `/api/pdi/log/:logId`

Protected: `pdi`. Verifies one production log.

Rules:

- `verifiedQuantity` is required.
- `verifiedQuantity` cannot be greater than `reportedQuantity`.
- Already verified logs return conflict.

Example body:

```json
{
  "verifiedQuantity": 22,
  "isIncomplete": true,
  "missingQuantity": 3,
  "remarks": "3 units incomplete"
}
```

Example response:

```json
{
  "message": "Verification saved",
  "verification": {
    "_id": "6630f706a4c9b2a001234030",
    "productionLog": "6630f646a4c9b2a001234020",
    "container": "6630f5aca4c9b2a001234010",
    "verifiedBy": "6630f3f9a4c9b2a001234555",
    "verifiedQuantity": 22,
    "isIncomplete": true,
    "missingQuantity": 3,
    "remarks": "3 units incomplete",
    "verifiedAt": "2026-05-05T09:00:00.000Z",
    "createdAt": "2026-05-05T09:00:00.000Z",
    "updatedAt": "2026-05-05T09:00:00.000Z"
  }
}
```

### GET `/api/pdi/log/:logId`

Protected: `pdi`, `admin`.

Example response:

```json
{
  "verification": {
    "_id": "6630f706a4c9b2a001234030",
    "productionLog": "6630f646a4c9b2a001234020",
    "container": "6630f5aca4c9b2a001234010",
    "verifiedBy": {
      "_id": "6630f3f9a4c9b2a001234555",
      "name": "PDI User",
      "email": "pdi@example.com"
    },
    "verifiedQuantity": 22,
    "isIncomplete": true,
    "missingQuantity": 3,
    "remarks": "3 units incomplete",
    "verifiedAt": "2026-05-05T09:00:00.000Z"
  }
}
```

### GET `/api/pdi/container/:containerId`

Protected: `admin`, `pdi`.

Example response:

```json
{
  "verifications": [
    {
      "_id": "6630f706a4c9b2a001234030",
      "productionLog": {
        "_id": "6630f646a4c9b2a001234020",
        "date": "2026-05-05T00:00:00.000Z",
        "reportedQuantity": 25,
        "status": "incomplete"
      },
      "container": "6630f5aca4c9b2a001234010",
      "verifiedBy": {
        "_id": "6630f3f9a4c9b2a001234555",
        "name": "PDI User",
        "email": "pdi@example.com"
      },
      "verifiedQuantity": 22,
      "isIncomplete": true,
      "missingQuantity": 3,
      "remarks": "3 units incomplete",
      "verifiedAt": "2026-05-05T09:00:00.000Z"
    }
  ],
  "totalVerified": 22
}
```

## Payment APIs

### GET `/api/payments`

Protected: `admin`. Returns all payment ledgers.

Example response:

```json
{
  "payments": [
    {
      "_id": "6630f7bea4c9b2a001234040",
      "container": {
        "_id": "6630f5aca4c9b2a001234010",
        "model": "Eashwa Scooter X1",
        "quantity": 100,
        "ratePerUnit": 500,
        "status": "active",
        "date": "2026-05-05T00:00:00.000Z"
      },
      "team": {
        "_id": "6630f3f9a4c9b2a001234001",
        "name": "Rahul Sharma",
        "email": "rahul@example.com",
        "phone": "9876543210"
      },
      "totalVerifiedQuantity": 22,
      "totalAmount": 11000,
      "paidAmount": 5000,
      "remainingAmount": 6000,
      "payments": [
        {
          "amount": 5000,
          "paidAt": "2026-05-05T10:00:00.000Z",
          "note": "First payment"
        }
      ]
    }
  ]
}
```

### GET `/api/payments/my`

Protected: `team`. Returns logged-in team's payment ledgers and summary.

Example response:

```json
{
  "payments": [
    {
      "_id": "6630f7bea4c9b2a001234040",
      "container": {
        "_id": "6630f5aca4c9b2a001234010",
        "model": "Eashwa Scooter X1",
        "quantity": 100,
        "ratePerUnit": 500,
        "status": "active",
        "date": "2026-05-05T00:00:00.000Z"
      },
      "totalVerifiedQuantity": 22,
      "totalAmount": 11000,
      "paidAmount": 5000,
      "remainingAmount": 6000,
      "payments": [
        {
          "amount": 5000,
          "paidAt": "2026-05-05T10:00:00.000Z",
          "note": "First payment"
        }
      ]
    }
  ],
  "summary": {
    "totalEarned": 11000,
    "totalPaid": 5000,
    "totalRemaining": 6000
  }
}
```

### GET `/api/payments/container/:containerId`

Protected: `admin`. Gets or initializes payment ledger for a container. Totals are recalculated from PDI verifications.

Example response:

```json
{
  "payment": {
    "_id": "6630f7bea4c9b2a001234040",
    "container": {
      "_id": "6630f5aca4c9b2a001234010",
      "model": "Eashwa Scooter X1",
      "quantity": 100,
      "ratePerUnit": 500
    },
    "team": {
      "_id": "6630f3f9a4c9b2a001234001",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "phone": "9876543210"
    },
    "totalVerifiedQuantity": 22,
    "totalAmount": 11000,
    "paidAmount": 0,
    "remainingAmount": 11000,
    "payments": []
  }
}
```

### GET `/api/payments/container/:containerId/summary`

Protected: `admin`. Gets existing payment ledger only. Does not initialize if missing.

Example response:

```json
{
  "payment": {
    "_id": "6630f7bea4c9b2a001234040",
    "container": {
      "_id": "6630f5aca4c9b2a001234010",
      "model": "Eashwa Scooter X1",
      "quantity": 100,
      "ratePerUnit": 500,
      "status": "active",
      "date": "2026-05-05T00:00:00.000Z"
    },
    "team": {
      "_id": "6630f3f9a4c9b2a001234001",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "phone": "9876543210"
    },
    "totalVerifiedQuantity": 22,
    "totalAmount": 11000,
    "paidAmount": 5000,
    "remainingAmount": 6000,
    "payments": [
      {
        "amount": 5000,
        "paidAt": "2026-05-05T10:00:00.000Z",
        "note": "First payment"
      }
    ]
  }
}
```

### POST `/api/payments/container/:containerId/pay`

Protected: `admin`. Records a payment to the team for a container.

Rules:

- `amount` must be positive.
- Payment cannot exceed remaining payable amount.

Example body:

```json
{
  "amount": 5000,
  "note": "First payment"
}
```

Example response:

```json
{
  "message": "Payment recorded successfully",
  "payment": {
    "_id": "6630f7bea4c9b2a001234040",
    "container": "6630f5aca4c9b2a001234010",
    "team": "6630f3f9a4c9b2a001234001",
    "totalVerifiedQuantity": 22,
    "totalAmount": 11000,
    "paidAmount": 5000,
    "remainingAmount": 6000,
    "payments": [
      {
        "amount": 5000,
        "paidAt": "2026-05-05T10:00:00.000Z",
        "note": "First payment"
      }
    ],
    "createdBy": "6630f3f9a4c9b2a001234999"
  }
}
```

## Suggested Frontend Flow

1. Login with `/api/user/login`, store `token`.
2. Send `Authorization: Bearer <token>` on protected APIs.
3. Admin creates multiple production teams with `/api/user/register` and `role: "team"`.
4. Admin creates the single PDI team with `/api/user/register` and `role: "pdi"`.
5. Admin creates containers and assigns each container to one production team using `assignedTeam`.
6. Production team logs in and views assigned containers using `/api/containers`.
7. Production team submits daily production using `/api/production-logs`.
8. PDI team logs in and views pending logs using `/api/production-logs/pending`.
9. PDI team verifies each log using `/api/pdi/log/:logId`.
10. Admin checks payment ledger using `/api/payments/container/:containerId`.
11. Admin records payment using `/api/payments/container/:containerId/pay`.
