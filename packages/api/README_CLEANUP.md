# Avatar Cleanup Configuration

Configure automatic cleanup of unused avatar files.

Environment variables:
- `AVATAR_CLEANUP_MAX_AGE_MS`: Milliseconds threshold. Files older than this and not referenced by any user will be removed. Default: `86400000` (24h).
- `AVATAR_CLEANUP_INTERVAL_MS`: Milliseconds interval for periodic cleanup. Default: `21600000` (6h).

Manual trigger (Admin only):
- `POST /api/admin/maintenance/cleanup-avatars`
  - Body: `{ "maxAgeMs": 3600000 }` (optional override for one-off run)
  - Response: `{ success: true, data: { removed: <number> } }`

Behavior:
- Only files starting with `avatar-` inside the `/uploads` directory are considered.
- Files referenced by any user's `avatarUrl` are skipped.
- New files (< `AVATAR_CLEANUP_MAX_AGE_MS`) are skipped to avoid removing avatars just uploaded but not yet saved.
