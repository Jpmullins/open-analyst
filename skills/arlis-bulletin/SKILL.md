---
name: arlis-bulletin
description: "Create ARLIS Insights Bulletin reports (.docx) from a topic, research notes, or raw data. Produces intelligence-community-style analytic bulletins using the official ARLIS template with proper branding, classification markings, and formatting. Use this skill whenever the user asks to write a bulletin, intelligence brief, analytic report, ARLIS product, threat assessment, technology assessment, or any short-form analytic document following IC writing standards. Also use when the user mentions KIQs, BLUFs, analytic story arcs, or four-sweeps review in the context of creating a written product."
matchPhrases:
  - bulletin
  - analytic bulletin
  - arlis bulletin
  - arlis insights bulletin
  - intelligence brief
  - analytic brief
  - analytic report
  - arlis product
  - threat assessment
  - technology assessment
  - kiq
  - bluf
  - four sweeps
tools:
  - list_directory
  - read_file
  - write_file
  - execute_command
  - capture_artifact
---

# ARLIS Insights Bulletin Skill

This skill produces finished ARLIS Insights Bulletin documents (.docx) by cloning the official template and filling it with analytic content. The output matches the exact branding, formatting, and structure used by ARLIS (University of Maryland Applied Research Laboratory for Intelligence and Security).

## When to Use

Use this skill when the user wants to:
- Write an ARLIS Insights Bulletin on any topic
- Create an intelligence-style analytic brief or assessment
- Turn research notes, data, or raw information into a structured analytic product
- Produce a short-form analytic document following IC writing conventions

## Workflow Overview

1. **Gather input** — Read all available source material (see "Working with Input Files" below)
2. **Read the analytic writing guide** — Read `references/analytic-writing-guide.md` for detailed standards on KIQs, BLUFs, argumentation, and the four-sweeps review
3. **Read the template spec** — Read `references/template-spec.md` for exact formatting details
4. **Formulate the KIQ** — Craft a two-part Key Intelligence Question based on the source material
5. **Draft the content** — Write the BLUF, "What" section, "So What" section, and endnotes following IC analytic writing standards
6. **Generate the document inside the project workspace** — Run `scripts/generate_bulletin.py` to clone the template and inject content. Save the final `.docx` under a workspace-relative folder such as `outputs/<topic-slug>/arlis-bulletin.docx`. Do not write outputs under the agent service directory.
7. **Capture the finished document as a project artifact** — After generating the `.docx`, call `capture_artifact` with the workspace-relative path so the bulletin is registered in the project and stored in the configured artifact backend (local or S3).
8. **Self-review using the four sweeps** — Apply the four-sweeps checklist to verify quality
9. **Visual QA** — Convert to PDF/images and visually inspect

## Working with Input Files

The skill can work from several kinds of input. Before drafting any content, check for source material in the user's workspace:

### Automatic Source Discovery
If the user says something like "write a bulletin from the research in this folder" or "use my notes to create a bulletin," scan the working directory (and common subdirectories like `research/`, `notes/`, `sources/`) for relevant files:

```bash
# Look for markdown, text, docx, and PDF files that might contain research
find <workspace> -maxdepth 2 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.docx" -o -name "*.pdf" \) | head -20
```

Read each file to understand the available source material before formulating the KIQ.

### Supported Input Formats
- **Markdown files (.md)** — Read directly. These often contain structured research notes with sources, data points, and analysis. Look for files named like `source-*.md`, `notes-*.md`, `research-*.md`.
- **Text files (.txt)** — Read directly. May contain raw notes or outlines.
- **Word documents (.docx)** — Extract text using `python -m markitdown file.docx` or unpack and read XML.
- **PDFs (.pdf)** — Extract text using `python -m markitdown file.pdf`.
- **Inline prompt text** — The user may also provide notes directly in their message.

### How to Use Source Material
When working from files:
1. **Read all source files first** — understand the full scope of available evidence
2. **Identify the strongest data points** — look for specific dates, numbers, named actors, institutional sources
3. **Map sources to the analytic story arc** — which data supports "What" vs "So What"
4. **Construct endnote citations from source metadata** — use the source name, author, date, and URL from the file headers to build Chicago-style citations
5. **Synthesize, don't just reorganize** — the bulletin should be an analytic product with original judgments, not a summary of the source files. Apply probabilistic language and make assessments based on the evidence.

### When sources have citation metadata
If research files include structured headers (e.g., Source, URL, Author, Date), use that metadata to construct proper Chicago Manual of Style endnotes. For example, a file header like:
```
**Source**: CNA, September 2025
**URL**: https://www.cna.org/...
```
becomes an endnote like:
```
CNA, "China Readies Drone Swarms for Future War" (Arlington, VA: CNA, September 2025).
```

## Step 1: Formulate the Key Intelligence Question (KIQ)

Every bulletin starts with a KIQ. Read `references/analytic-writing-guide.md` for full guidance. The key points:

- The KIQ is a two-part, open-ended question
- Part 1: "What" is happening or "why" is something happening
- Part 2: "So what" — why does it matter for the customer/sponsor/national security
- It cannot be a yes/no question
- It scopes the entire product — if something doesn't tie back to the KIQ, cut it

## Step 2: Draft the Content

**CRITICAL WRITING RULES — apply to ALL text in the bulletin:**
- **Never use em dashes (—), en dashes (–), or double hyphens (--).**  Use commas, semicolons, or restructure the sentence instead. The `generate_bulletin.py` script will also strip these automatically, but the content itself should not contain them.
- **Never include inline superscript citation numbers (¹²³) or bracketed references ([1]) in bullet text.** The script adds endnote references automatically. Including them in the text causes duplicate citations.
- **Every analytic judgment must be supported by the source evidence.** Do not upgrade the strength of a source's claim. If a source says "close to matching," the bulletin must not say "outpacing" or "surpassing." Use the source's own framing as a ceiling for your assessment.

The bulletin has a specific structure. Read `references/template-spec.md` for the exact layout, but in brief:

### Title
- Analytic, not descriptive — conveys the key judgment, not just the topic
- Uses an active verb and names the key actor or trend
- **Every claim in the title must be directly supported by the source evidence.** Do not make comparative claims (e.g., "faster than the US") unless sources explicitly support that comparison. If sources say "close to matching," do not upgrade that to "outpacing."
- Bad: "China's Drone Program" / Good: "China's Autonomous UAV Swarm Program Likely Approaches Operational Maturity"

### Section 1: "What" paragraph
- **Lead sentence (BLUF)**: Bold+italic, one sentence, directly answers the KIQ. Uses probabilistic language (probably, likely, almost certainly). Never a statement of fact.
- **Second sentence**: Regular weight, provides critical context or strongest evidence
- **3 bullet points**: Supporting data points with endnote citations. Order by reverse chronological or parallel structure with the lead sentence.

### Section 2: "So What" paragraph
- **Lead sentence**: Bold+italic, explains implications/outlook/opportunities
- **Second sentence**: Regular weight, context or evidence
- **3 bullet points**: Supporting data with citations

### Endnotes
- Chicago Manual of Style format (ODNI standard)
- First citation: full reference. Subsequent citations: short form.
- 10pt font (sz val="20" in DXA)

### Boilerplate
The "About ARLIS Insights" section and contact info are already in the template — do not modify them.

## Step 3: Generate the Document

```bash
python <skill-path>/scripts/generate_bulletin.py \
  --template <skill-path>/assets/template.docx \
  --output <output-path>/bulletin.docx \
  --title "Your Analytic Title Here" \
  --date "DD Month YYYY" \
  --what-lead "Bold italic BLUF for the What section." \
  --what-context "Second sentence with context." \
  --what-bullets "Bullet 1 text" "Bullet 2 text" "Bullet 3 text" \
  --sowhat-lead "Bold italic lead for the So What section." \
  --sowhat-context "Second sentence with context." \
  --sowhat-bullets "Bullet 1 text" "Bullet 2 text" "Bullet 3 text" \
  --endnotes "First endnote full citation." "Second endnote." "Third endnote."
```

The script clones the template, preserving the ARLIS logo, classification markings, headers, footers, and boilerplate, then replaces the placeholder content with your analytic text.

**Important**: The script handles all formatting automatically (bold/italic leads, bullet points, endnote references, font sizes). You provide plain text content and the script applies the correct XML formatting.

If the script doesn't cover a specific need (e.g., more than 3 bullets per section, extra sections), you can also use the docx editing workflow: unpack the template, edit the XML directly, and repack. The bundled bulletin script is the primary path. The `docx` skill is optional for advanced manual editing and QA, not a prerequisite for generating the initial bulletin.

## Step 4: Self-Review (Four Sweeps)

After generating, apply the four-sweeps checklist. Read `references/analytic-writing-guide.md` for the full checklist. Quick summary:

1. **Sweep 1 — Message/Clarity**: One analytic message? Clear KIQ? Clear BLUF? Relevant to readers?
2. **Sweep 2 — Structure/Argumentation**: Follows the analytic story arc? Evidence supports assessments? Facts/assessments/assumptions distinguished?
3. **Sweep 3 — Prose/Writing**: Short sentences? Active voice? Minimal jargon? Probabilistic language?
4. **Sweep 4 — Graphics/Formatting**: Sources cited? Headers/footers correct? Classification markings present?

## Step 5: Visual QA

Convert the output to images and inspect:

```bash
python <docx-skill-path>/scripts/office/soffice.py --headless --convert-to pdf <output>.docx
pdftoppm -jpeg -r 150 <output>.pdf page
```

Check for: correct ARLIS logo placement, classification markings in header/footer, proper text formatting, no placeholder text remaining, page number on page 2+, copyright notice.

## Dependencies

- Python 3 with `python-docx` (`pip install python-docx --break-system-packages`)
- The `docx` skill (for soffice.py conversion and validation tools)
- LibreOffice (for PDF conversion during QA)
