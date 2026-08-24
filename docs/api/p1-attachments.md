# P1.6 - Transaction Attachments API

## POST /api/attachments/upload
Upload attachment.

**Body:** Multipart form-data with `file` field.

**Permissions:** `transactions:create`

**Accepted types:** `application/pdf`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`

**Max size:** 10 MB

**Validation:** Magic-byte verification (not just extension).

**Response:**
```json
{
  "id": "uuid",
  "fileName": "receipt.jpg",
  "fileSize": 123456,
  "mimeType": "image/jpeg"
}
```

**Storage:** R2 bucket `BACKUP_BUCKET`, key `attachments/{orgId}/{attachmentId}`.

---

## GET /api/attachments/:id/download
Download attachment.

**Permissions:** `transactions:read`

**Response:** Binary file with `Content-Type` and `Content-Disposition` headers.

---

## DELETE /api/attachments/:id
Delete attachment.

**Permissions:** `transactions:create`

**Response:** `{ success: true }`

---

## GET /api/attachments/
List attachments.

**Permissions:** `transactions:read`

**Response:** `{ attachments: Attachment[] }`

**Audit:** Upload and deletion logged to `audit_logs`.
