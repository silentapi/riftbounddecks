# Users API

User account management endpoints.

## Authentication

All user endpoints require authentication via JWT token:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Change Password

**POST** `/api/user/change-password`

Change user password.

**Request:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password changed successfully"
}
```

**Validation:**
- `currentPassword`: Required
- `newPassword`: Minimum 8 characters, at least one letter and one number

**Status Codes:**
- `200 OK` - Password changed successfully
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid current password or missing token
- `404 Not Found` - User not found

