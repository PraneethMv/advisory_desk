# Advisory Desk

A local-first web app for an accounting advisory team. This alpha establishes the workspace, accounts, and project boundaries, with memo and deck intake flows for testing the experience.

**AI is deferred to a later phase.** Memo and deck creation produces deterministic, editable outlines. The app does not generate accounting analysis or call an AI service.

## Run locally

Requires **Node.js 24 or later**. There are no packages to install, external fonts, CDNs, or service accounts to configure. The server uses Node's built-in HTTP, cryptography, and SQLite modules.

```powershell
# Windows — also finds a freshly installed Node.js before PATH is refreshed
.\start.cmd
```

Alternatively, on any supported OS:

```sh
npm start
```

Open **http://127.0.0.1:3000**. Keep the terminal running while using the app.

- **Explore a sample workspace** creates a separate account with six fictional engagements. Sample accounts cannot manage the actual team or access one another's projects.
- **Create workspace** registers the first real account as the super user. First-account setup is restricted to localhost.
- From **Settings → Team & access**, create an email-bound invitation. Share the code with the teammate through your existing internal channel. Codes are shown once, expire after seven days, and are consumed on signup. Creating a new code closes previous invitations for that email.
- After signup, a teammate starts with no project access. A project owner can add them using their registered email from the project's **Team** tab.

## Included in phase one

| Area | Alpha behavior |
| --- | --- |
| Accounts | Signup, login, logout, invitation codes, first-account setup, super-user and member roles |
| Projects | Create projects with a client name or confidential alias, financial year end, engagement type, framework, and description |
| Dashboard | Project cards and list view; client/project search; type and status filters; sorting; actual workspace counts |
| Project access | Explicit memberships, owner-controlled additions/removals, immediate revocation, project activity |
| Resources | Upload/download project-scoped files, 10 MB per file; references and company templates |
| Technical memos | Framework selection, multiple standards, additional guidance, problem statement, project-resource selection |
| Slide decks | Proposal, training, and technical guidance briefs; conditional IPO readiness/PMO and GAAP transition fields |
| Deliverables | Editable Markdown and live preview; Draft → In review → Approved states; conflict detection when saving stale versions |
| Exports | Editable Word `.docx` memos, PowerPoint `.pptx` decks, and Markdown `.md` |
| Super-user settings | Workspace name, invitations, member roles, account activation, and team memo section headings |
| FS sanity checks | Future-module placeholder; no financial statement processing in this phase |

The standards picker contains common labels for intake, rather than a complete or maintained authoritative standards library. Team members supply and verify the relevant guidance.

The interface uses the supplied blue/red/white palette: blue `#23449B`, red `#ED1A3B`, and white surfaces. Theme colours are defined at the top of `public/styles.css`; Word and PowerPoint exports use the same palette. Darker red is used for small text to preserve readability.

## Resources and templates

All files are stored as BLOBs in the local SQLite database. Uploaded PDFs, Office documents, and images are retained for the project team to download. Binary document extraction and importing a Word/PowerPoint template's exact layout are deferred.

Set shared memo headings under **Settings → Memo template**. To use a different structure for a project, upload a Markdown file as **Company memo template**, then select it in the memo brief:

```markdown
# Executive summary
## Transaction background
## Accounting question
## Relevant guidance
## Assessment
## Conclusion
```

The first selected readable Markdown template sets the outline headings. References are listed in the outline; uploaded files are not automatically analyzed. Current Word and PowerPoint exports use a basic Advisory Desk layout. Exports always reflect the last saved version of a draft.

Any project member can edit a draft and change its review status in this alpha. Status changes are tracked in project activity; formal reviewer permissions, approval signatures, and document version history are deferred.

## Data boundaries

The default server binds to **127.0.0.1**. The application has no outbound service integration, telemetry, analytics, or AI calls. Browsers fetch only assets and APIs from the same server; the browser content policy restricts connections to that origin.

Every project detail, membership, resource, draft, and export route checks project membership on the server. Workspace-wide project, deliverable, and activity views join against the signed-in user's memberships. A brief cannot select a resource from another project, even when its author belongs to both projects. Super-user status permits team administration and does not bypass project access. Shared team template settings contain only a template name and section headings.

Passwords use salted scrypt hashes. Session tokens are random, hashed in the database, held in HttpOnly/SameSite=Strict cookies, and expire after eight hours. Mutations require session-specific CSRF tokens; the server also checks host and origin. Login/signup attempts are limited per client address. Deactivation and role changes revoke a user's sessions. Resources are downloaded as attachments.

The database is stored at `data/advisory.sqlite` and ignored by Git. SQLite files and resource contents are not encrypted at rest by the application; protect the directory with host permissions and an approved backup policy. Do not commit or upload runtime data. Sample accounts remain in the local database until it is reset; disable sample mode for a team installation.

## Internal team deployment

Provision the first super-user account from localhost before opening access to the team. An internal rollout requires an internal HTTPS reverse proxy, network egress restrictions, protected storage, and your team's access review. SSO/MFA and password-reset/email-delivery flows are future work.

Copy `.env.example` to `.env` and set your environment. The Windows launcher reads `.env`; for direct startup with a file, use `node --env-file=.env server.mjs`. Existing shell environment variables take precedence.

```dotenv
HOST=0.0.0.0
PORT=3000
ADVISORY_ALLOW_DEMO=0
ADVISORY_SECURE_COOKIE=1
ADVISORY_ORIGIN=https://advisory.internal.example
```

Set `ADVISORY_ORIGIN` to the exact browser-facing origin and configure the reverse proxy to preserve that Host header. Secure cookies require HTTPS. The app makes no network-boundary guarantee about independently installed software, reverse proxies, backups, or later integrations; deploy those within your approved environment.

## Validation

```sh
npm test
npm run check
```

The automated suite exercises authentication, email-bound invitations, CSRF/origin checks, validation, project/resource isolation including super users, resource-selection isolation, collaboration/revocation, draft conflicts, conditional deck briefs, account deactivation, logout, demo separation, Office exports, and local asset headers. Tests use an isolated temporary database and remove it afterward.

No connected browser was available during implementation, so visual layout, accessibility interaction, and a full UI click-through still need verification. Office exports were checked structurally, but have not been rendered in desktop Word or PowerPoint.

## Structure

```text
server.mjs          HTTP API, authentication, SQLite, access control
lib/drafts.mjs      Memo/deck outlines and standard intake labels
lib/exports.mjs     Native Word/PowerPoint/Markdown export
public/index.html   Local app entry point
public/app.js       Dashboard, project, auth, and settings interactions
public/styles.css   Responsive workspace styling
tests/app.test.mjs  Integration and export checks
start.cmd           Windows local launcher
```

## Later phases

AI agents and approved network-contained inference; source extraction and authoritative citations; exact company document/slide layouts; more granular reviewer access and version history; financial-statement checks after their scope is defined.
