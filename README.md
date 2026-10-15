# Advisory Desk

A sovereign, local-first web application designed for technical accounting and advisory teams. Built with a clean, minimal Material 3 aesthetic, Advisory Desk provides an operational workbench for technical accounting memorandums, executive presentation decks, and multi-framework engagement management.

**AI runs locally, and only when switched on.** Memo and deck intake produce deterministic, structured, and editable outlines. Optional AI assistance uses a model running on the same computer through [Ollama](https://ollama.com); it is off until the super user turns it on in **Settings → AI assistance**. The application calls no external cloud APIs and keeps all client facts, evidence, and deliverables contained on your local machine.

---

## Architecture & User Journey

Advisory Desk follows a structured, role-aware workflow:

```
[ Sign-in / Sign-up ] ──► [ Gateway Hub (The Launchpad) ]
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
[ 01 Advisory Desk ]      [ 02 Knowledge Base ]     [ 03 Engagement Manager ]
   (Workbench)               (Coming Soon)             (Master Directory)
         │
         ▼
[ Engagement Workstation ]
  ├── Technical Accounting Memos
  ├── Executive Slide Decks (.pptx)
  ├── Project Evidence & Templates
  └── Team Access & Governance
```

### 1. Authentication & Open Registration (`#auth`)
- **Open Teammate Registration**: Any team member can register without needing an upfront invitation code.
- **Project Boundary Isolation**: New registrations start with zero project access by default. Confidential client engagements, drafts, and evidence remain invisible until an Engagement Manager / Project Owner assigns the teammate's registered email to that project.
- **First Account Bootstrap**: The first account registered on `localhost` automatically becomes the workspace **Super User**.
- **Optional Email-Bound Invitations**: Super users can generate time-limited (7-day), single-use invitation codes for managed corporate provisioning.
- **Forgot Password**: The app sends no email, so password resets use one-time codes. A super user chooses **Reset password** next to a teammate in **Settings → Team & access** and passes the code on directly; the teammate enters it under **Forgot password?** on the sign-in page with a new password. Codes work once, expire after 24 hours, and a new code cancels any earlier one. A reset signs the account out everywhere else.
- **Change Password**: Anyone signed in can choose **Change password** in their account menu. It needs the current password and signs out the account's other sessions.
- **Locked-Out Super User**: If no super user can sign in, run `npm run reset-password -- you@yourfirm.com` on the server computer. It prints a reset code for that account and works only with direct access to the server's data folder.

### 2. The Gateway Hub (`#hub`)
- Serves as the post-login launchpad featuring a personalized welcome header (`Welcome Back, <Name>. What do you want to do today?`).
- Provides three minimal Material 3 interactive cards matching the clean reference design:
  - **`01` Advisory Desk**: Enters the operational Workbench.
  - **`02` Knowledge Base**: Displays the *Coming soon · Phase 2* badge and opens an authoritative accounting standards preview (IFRS, Ind AS, US GAAP).
  - **`03` Engagement Manager**: Routes to the Master Project Registry with entity parameters and governance controls.

### 3. Advisory Desk Workbench (`#desk`)
- **Sidebar-Free Experience**: The landing view inside Advisory Desk is a focused, full-width **Workbench** without sidebar distractions.
- **Dedicated Topbar**: Features the brand logo, a quick return button to the Hub, current view breadcrumbs, and a user profile menu.
- **User Profile Menu**:
  - **Dark / Light Mode Toggle**: Seamlessly switches themes across the entire interface (persisted via `localStorage`).
  - **Sign Out**: Clears session cookies and CSRF tokens, immediately returning to the sign-in screen.
- **Assigned Engagements Overview**:
  - Displays all active engagements the signed-in user belongs to, including client entities, financial year ends, reporting frameworks, deliverables count, and team avatars.
  - If the user has no engagements yet, presents a clear banner:
    > *"You have no active engagements. Please create one or ask the Engagement Manager to invite you to an active engagement"*
    > 
    > Along with a direct **Create Engagement** action.

### 4. In-Engagement Workstation (`#project/:id`)
All core advisory tools and deliverables sit exclusively inside each engagement:
- **Workstream Setup**: Select **New**, choose Memo Builder or Slide Decks, and enter the setup fields. **Setup Workflow** saves the workstream and returns to the engagement dashboard without generating an outline or adding a draft document.
- **Standalone Toolkits**: Open a saved workstream to enter its dedicated toolkit page. Create the memo or deck outline there, then edit, review, and export it. Creating the outline adds the workstream's Markdown draft to Engagement Documents. Edits autosave a moment after you stop typing, and every save updates that draft. **Add to Engagement Documents** creates the Word (`.docx`) memo or PowerPoint (`.pptx`) deck from the latest edits whenever you choose.
- **Document Reading and Indexing**: Text from PDF (page by page), Word, text, Markdown, CSV and JSON documents is read in the background, then split into passages of about 220 words that never cross a page or heading (PDF headings and numbered clauses are recognised). Passages go into a keyword index (SQLite FTS5) straight away and, while AI assistance is on, are embedded by the local `embeddinggemma` model for meaning-based search. Each document in Engagement Documents shows **Reading…**, **Indexing…**, **Ready for search**, **Text ready** (AI assistance is off), **Needs review** (e.g. a scanned or password-protected PDF), **Could not read**, or **Not searchable yet** (Excel, PowerPoint and images); hover for details, and the eye button shows the text that was read. Parsing runs in a separate worker thread with time and memory limits, and nothing inside a document is executed. If the local AI runtime is unavailable, indexing pauses and retries every minute.
- **Document Flow**: Every document (uploads, workstream drafts, and added Word or PowerPoint files) starts in **Engagement Documents**. Select documents there and choose **Move to Final Deliverables**. Final Deliverables can return a document to Engagement Documents. A Markdown draft moved to Final Deliverables is kept as it was, and the workstream starts a new live draft on its next save.
- **Workstream Actions**: Each dashboard row has a three-dot menu for opening its toolkit, adding its document to Engagement Documents, or deleting it. Only the creator or engagement owner can delete a workstream. Deletion requires confirmation and removes its live draft while keeping added documents, reference documents, and anything in Final Deliverables.
- **Technical Accounting Memos (Memo Builder)**: The toolkit runs in three stages, saved together:
  1. **Memo Base**: the preface (To / From / CC / Date and an opening note), the accounting framework (**IFRS**, **Ind AS**, or **US GAAP**) with a dropdown of every standard issued under it, and the engagement documents the memo relies on. These documents will be the source material for the future AI drafting agent.
  2. **Builder**: ordered sections following a standard technical memorandum structure (executive summary, purpose and scope, background, issues, authoritative guidance, analysis, conclusion, financial statement impact, disclosure, internal controls). Each section has drafting guidance and a status (*Not started* → *Drafting* → *Ready for review*). An outline rail tracks progress. You can add, rename, reorder, collapse, or remove sections, and open a full-memo preview with one click.
  3. **Review and Completion**: a read-only review of the sections marked ready, plus the selected framework and standards. Below it is the completion checklist and the Prepared / Reviewed / Approved sign-off. The checklist opens only when every Builder section is *Ready for review*. The server enforces this too.
- **Executive Slide Decks**: Draft presentation outlines for **Proposals** (with conditional IPO Readiness/PMO and GAAP transition fields), **Training sessions**, or **Technical discussions**.
- **FS Sanity Checks**: Coming soon preview for automated casting and cross-referencing.
- **Evidence Repository**: Upload supporting client documents, contracts, and company Markdown memo templates (up to 10 MB per file, stored in SQLite).
- **Deliverables Pipeline**: Live Markdown editor with real-time preview, status workflow (`Draft` → `In review` → `Approved`), and conflict detection for concurrent edits.
- **Assigned Team**: Project owners can add registered teammates by work email or revoke access at any time.

### 5. Engagement Manager (`#project-setup`)
- **Master Directory**: Master list of all engagements containing client entities, reporting frameworks, financial year ends, status states, and team member counts.
- **Parameter Matrix**: Live breakdown of framework distributions (IFRS, Ind AS, US GAAP) and active engagement counts.
- **Filter & Search Toolbar**: Real-time search across project names, clients, and briefs, filterable by framework, engagement type, and lifecycle status.
- **View Toggles**: Switch between Master Matrix Table view and Card Grid view.

---

## Design System & Theme

Advisory Desk is built with modern CSS custom properties adhering to Material 3 principles:
- **Palette**: Brand Blue (`#23449B`), Brand Red (`#ED1A3B`), clean white cards, and subtle tonal surfaces (`#F8FAFC`).
- **Dark Mode**: Complete built-in dark theme (`[data-theme="dark"]`) with deep slate surfaces (`#111827`, `#1A2234`), high-contrast typography, and accessible focus states.
- **Typography & Elevation**: Native system typography stack, subtle 1px outlines (`#E2E8F0`), soft drop shadows, and pill-shaped interactive chips.

---

## Native Office Document Exports

The application generates fully editable Office documents directly in pure Node.js without third-party converters or external headless browser processes:
- **Word (`.docx`)**: Memos export as a structured memorandum: a cover table (addressees, date, subject, client, period, framework, status), numbered section headings, bullet points, and a Role / Name / Signature / Date sign-off table.
- **PowerPoint (`.pptx`)**: Slide decks export as native 16:9 widescreen presentation files with formatted title slides and slide content layouts.
- **Markdown (`.md`)**: Direct plain-text export for version control and documentation workflows.
- **PDF (`.pdf`)**: Memos and decks export as paginated A4 documents with headings, bullets, and a page-numbered footer, generated without external tools.

In a toolkit, every format sits in the **Export** menu (the download icon at the right of the toolbar).

Exports always reflect the latest saved draft version in the database.

---

## Security & Data Isolation Guarantees

1. **Zero External Egress**: The server binds to `127.0.0.1` by default. There are no tracking scripts, analytics, external web fonts, or CDN dependencies. The AI runtime is reached only at a loopback address; the server refuses to start if `ADVISORY_AI_URL` points anywhere else.
2. **Strict Project Sandboxing**: Every request for project details, members, evidence, drafts, and exports verifies project membership on the server. Super users cannot access a project without explicit membership.
3. **Session & Mutation Security**:
   - Passwords hashed using salted `scrypt`.
   - Cryptographically random session tokens stored in `HttpOnly; SameSite=Strict` cookies.
   - Mutating requests require session-scoped `X-CSRF-Token` headers and pass strict Origin/Host validation.
4. **Embedded Local Storage**: Data is persisted in a local SQLite database (`data/advisory.sqlite`), completely contained on the user's filesystem.

---

## Quickstart & Local Execution

### Prerequisites
- **Node.js 24 or later** (uses built-in SQLite, Crypto, and HTTP).
- One npm package: [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (Mozilla's PDF reader, pinned) for reading PDF engagement documents. `start.cmd` installs it on first run; otherwise run `npm install` once. `.npmrc` skips its optional native drawing add-on, which is not needed.

### Starting the Server

```powershell
# Windows (automatically detects Node.js even if PATH is not updated)
.\start.cmd
```

Or via npm / node on any platform:

```sh
npm start
```

Open **http://127.0.0.1:3000** in your browser.

- **Instant Demo**: Click *Explore sample workspace* on the sign-in page to launch pre-seeded fictional engagements without creating a live account.
- **First-Time Setup**: The first registered account automatically becomes the workspace Super User.

### Running the Test Suite

```powershell
npm test
```

The automated test suite runs via Node.js native test runner (`tests/app.test.mjs`), validating:
- Authentication, open registration, and invitation flows
- Password reset codes, password changes, and the locked-out super user command
- Role authorization, CSRF validation, and request origin checks
- Project and resource isolation across user boundaries
- Input sanitization and upload validation (rejects invalid dates, traversal paths, and executable files)
- Deliverable outline generation, concurrent edit conflict detection, and status workflows
- ZIP directory structure and OpenXML compliance for Word (`.docx`) and PowerPoint (`.pptx`) exports
- Security headers and local-first static asset delivery

---

## Project Structure

```text
advisory_desk/
├── server.mjs          # Native HTTP API, authentication, SQLite, access control
├── lib/
│   ├── drafts.mjs      # Technical memo and slide deck outline intake templates
│   └── exports.mjs     # Native OpenXML Word (.docx) & PowerPoint (.pptx) exporters
├── public/
│   ├── index.html      # Single-page application entry point
│   ├── app.js          # Client router, Material 3 views, Hub, and Workbench logic
│   ├── styles.css      # Material 3 minimal styling and dark mode design system
│   └── favicon.svg     # Brand vector mark
├── tests/
│   └── app.test.mjs    # Complete integration and export test suite
├── package.json        # Project metadata and test/start scripts
├── start.cmd           # Windows launcher
└── .env.example        # Environment configuration template
```

---

## Internal Team Deployment

To deploy for an internal advisory team:
1. Copy `.env.example` to `.env`.
2. Configure your environment settings:
   ```dotenv
   HOST=0.0.0.0
   PORT=3000
   ADVISORY_ALLOW_DEMO=0
   ADVISORY_SECURE_COOKIE=1
   ADVISORY_ORIGIN=https://advisory.internal.yourfirm.com
   ```
3. Place behind your organization's internal HTTPS reverse proxy with appropriate firewall and backup policies.

### Local AI runtime (optional)

AI assistance needs [Ollama](https://ollama.com) on the same machine as the server. Install it, then download the models once while connected:

```powershell
ollama pull gemma4:e4b
ollama pull embeddinggemma
```

Turn off Ollama's cloud features with `"disable_ollama_cloud": true` in `~/.ollama/server.json` or `OLLAMA_NO_CLOUD=1`, then restart Ollama. Its log should show `Ollama cloud disabled: true`. Finally, turn AI on in **Settings → AI assistance**, which shows whether the runtime is reachable and both models are installed.

These variables change the defaults:

```dotenv
ADVISORY_AI_URL=http://127.0.0.1:11434      # must be a loopback address
ADVISORY_AI_CHAT_MODEL=gemma4:e4b
ADVISORY_AI_EMBED_MODEL=embeddinggemma
```

On a 16 GB machine without a GPU, `gemma4:e4b` writes about 15–18 tokens per second. Larger models such as `gemma4:12b` did not fit alongside a typical desktop session in testing.

---

## Roadmap

- **Engagement Creation Flow**: Dedicated multi-step wizard for configuring new client advisory workstreams.
- **Knowledge Base (Phase 2)**: Authoritative standards library with offline paragraph indexing across IFRS, Ind AS, and US GAAP (ASC topics).
- **FS Sanity Checks (Phase 2)**: Automated casting, cross-statement referencing, and balance verification.
- **Local AI Agents**: Phase 0 is in place: a local model provider (Ollama, `gemma4:e4b` for drafting and `embeddinggemma` for search), a runtime health check, and the workspace switch. Phase 1 is under way: Engagement Documents are read and indexed into searchable passages. Next: a Sources panel in the Memo Builder, and a **Draft with AI** action on each memo section with checked source citations. See `reference/Accounting_Advisory_Memo_AI_RAG_Implementation_Proposal.md` (v1.1).
