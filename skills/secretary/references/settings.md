# Settings reference

Settings live in the frontmatter of `<vault>/<root>/Settings.md` (default root
`Secretary`). The pointer file `~/.claude-secretary.json` (or `$SECRETARY_CONFIG`)
stores only `{ "vault": "...", "root": "Secretary" }`.

Set any key non-interactively with `sec init --non-interactive --set key=value`
(lists are comma-separated), or edit the note in Obsidian.

## Profile
| Key | Default | Meaning |
|---|---|---|
| `name` | — | How drafts are signed / how to refer to the user |
| `timezone` | system zone | IANA zone used for all dates |
| `work_days` | mon–fri | Days meetings may be scheduled |
| `work_start` / `work_end` | 09:00 / 17:00 | Default scheduling window |
| `hard_stop` | 21:30 | Never schedule after this, even with `--after-hours` |
| `meeting_buffer_min` | 10 | Gap kept around existing events when finding slots |
| `default_meeting_min` | 30 | Default meeting length |
| `tone` | concise, warm, professional | Voice for drafts |
| `signature` | — | Appended to email drafts if set |
| `vips` | [] | Names/emails always surfaced first |

## Vault
| Key | Default | Meaning |
|---|---|---|
| `organize_by` | folders | `folders` (sub-folders per type) or `tags` (flat, grouped by tag) |
| `tag_prefix` | secretary | Notes get tags `<prefix>/<type>` |

## Calendar
| Key | Default | Meaning |
|---|---|---|
| `calendar_backend` | remote-ics | `remote-ics` or `connector` |
| `calendar_file` | `<root>/calendar.ics` | Local master ICS (remote-ics) |
| `calendar_public_url` | — | URL clients subscribe to; used by `sec ics pull` |
| `calendar_bucket` / `calendar_key` | — | Filled into `{bucket}` / `{key}` |
| `calendar_publish_command` | wrangler R2 put | Upload command; `{file}`, `{bucket}`, `{key}` placeholders |
| `calendar_feeds` | [] | Extra read-only ICS URLs counted as busy (any OS; includes iCloud public calendar `webcal://` links) |
| `calendar_apple` | off | `macos` = also read Apple Calendar (Calendar.app) directly via EventKit. macOS only; other systems skip it with a warning, so a synced Settings.md is safe on a PC |
| `calendar_apple_names` | [] | Calendar titles to read with `calendar_apple` (case-insensitive); empty = all |
| `all_day_is_busy` | false | Whether all-day events block scheduling |

Default publish command:
```
npx --yes wrangler r2 object put "{bucket}/{key}" --file "{file}" --content-type "text/calendar; charset=utf-8" --remote
```
Any command that uploads one file works. Examples (check the flags against
your tool's docs): `rclone copyto "{file}" r2:{bucket}/{key}`, or
`aws s3 cp "{file}" s3://{bucket}/{key} --endpoint-url https://<account-id>.r2.cloudflarestorage.com --content-type text/calendar`.
Values substituted into `{bucket}`/`{key}`/`{file}` may not contain `"`, `` ` ``, `$`, `\` or newlines.

## Backends
| Key | Default | Meaning |
|---|---|---|
| `email_backend` | connector | `connector` or `none` |
| `messaging_backend` | none | `connector` or `none` |

## Permissions
| Key | Default |
|---|---|
| `permission_send_email` | off |
| `permission_send_invites` | off |
| `permission_contact_people` | off |
| `permission_manage_calendar` | ask |

Values: `off`, `ask`, `auto`. Anything else is treated as `off`.

## Other
| Key | Default | Meaning |
|---|---|---|
| `currency` | USD | Default currency for expenses |
| `keep_in_touch_days` | 90 | Suggested cadence when adding a person |
