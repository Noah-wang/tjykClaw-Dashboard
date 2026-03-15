# Backup And Restore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a user-controlled backup and restore MVP to the dashboard so operators can create snapshots, browse them, configure automatic backup behavior, and restore a prior state from the web UI.

**Architecture:** Extend the existing `real-device-bridge.mjs` HTTP server with backup configuration, snapshot lifecycle helpers, and restore endpoints that operate on `~/.openclaw`, `~/.tjykclaw-dashboard-bridge`, and an optional storage directory. Surface those capabilities in the current React UI by adding backup types and API methods, then place operational controls in the device page and policy controls in the settings page.

**Tech Stack:** Node.js HTTP server, filesystem utilities, system `tar`/`shasum`, React, TypeScript, Vite

---

### Task 1: Model backup configuration and snapshot metadata

**Files:**
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/real-device-bridge.mjs`
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/src/lib/types.ts`

**Step 1: Add backup defaults to bridge state**

Include backup settings, operational status, and last-result summaries in the bridge state schema so settings and results survive restarts.

**Step 2: Add frontend types**

Define `BackupConfig`, `BackupSnapshot`, and `BackupStatus` so the UI can render configuration, snapshot lists, and in-flight operations safely.

### Task 2: Implement snapshot helpers in the bridge

**Files:**
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/real-device-bridge.mjs`

**Step 1: Add filesystem helpers**

Add helpers to ensure the backup root exists, build snapshot ids/directories, compute checksums, and read manifests from disk.

**Step 2: Add create/verify helpers**

Implement snapshot creation using a compressed archive containing the selected source directories plus metadata, and implement checksum verification.

**Step 3: Add restore helper**

Implement restore by stopping the gateway, optionally creating a pre-restore snapshot, extracting the target archive into a temporary directory, replacing target directories, reloading state, and restarting the gateway when appropriate.

### Task 3: Expose backup REST endpoints

**Files:**
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/real-device-bridge.mjs`

**Step 1: Add config/status routes**

Add `GET/PUT /api/backups/config` and `GET /api/backups/status`.

**Step 2: Add snapshot routes**

Add `GET/POST /api/backups/snapshots`, `GET /api/backups/snapshots/:id`, `POST /api/backups/snapshots/:id/verify`, `POST /api/backups/snapshots/:id/restore`, and `DELETE /api/backups/snapshots/:id`.

### Task 4: Add frontend API client methods

**Files:**
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/src/lib/device-api.ts`

**Step 1: Add backup fetch wrappers**

Expose functions for reading config and status, listing snapshots, creating a snapshot, verifying, restoring, and deleting.

### Task 5: Add UI controls

**Files:**
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/src/pages/DevicePage.tsx`
- Modify: `/Users/noahwang/Documents/Code/tjykClaw-Dashboard/src/pages/SettingsPage.tsx`

**Step 1: Device page**

Add a backup operations card and snapshot list with immediate actions and latest-result indicators.

**Step 2: Settings page**

Add backup policy inputs for enablement, schedule label, retention count, included scopes, and backup directory.

### Task 6: Verify

**Files:**
- Modify as needed based on build feedback

**Step 1: Build**

Run `pnpm build`.

**Step 2: Sanity-check**

Verify the new routes compile, the UI renders, and the snapshot actions have valid types.
