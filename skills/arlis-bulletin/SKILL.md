---
name: arlis-bulletin
description: "Create ARLIS Insights Bulletin reports (.docx) from a topic, research notes, or raw data. Produces intelligence-community-style analytic bulletins using the official ARLIS template with proper branding, classification markings, and formatting. Use this skill whenever the user asks to write a bulletin, intelligence brief, analytic report, ARLIS product, threat assessment, technology assessment, or any short-form analytic document following IC writing standards. Also use when the user mentions KIQs, BLUFs, analytic story arcs, or four-sweeps review in the context of creating a written product."
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

1. **Understand the topic** — Read the user's notes, research, or topic description
2. **Formulate the KIQ** — Craft a two-part Key Intelligence Question
3. **Draft the content** — Write the BLUF, "What" section, "So What" section, and endnotes following IC analytic writing standards
4. **Read the analytic writing guide** — Read `references/analytic-writing-guide.md` for detailed standards on KIQs, BLUFs, argumentation, and the four-sweeps review
5. **Read the template spec** — Read `references/template-spec.md` for exact formatting details
6. **Generate the document** — Run `scripts/generate_bulletin.py` to clone the template and inject content
7. **Self-review using the four sweeps** — Apply the four-sweeps checklist to verify quality
8. **Visual QA** — Convert to PDF/images and visually inspect

## Step 1: Formulate the Key Intelligence Question (KIQ)

Every bulletin starts with a KIQ. Read `references/analytic-writing-guide.md` for full guidance. The key points:

- The KIQ is a two-part, open-ended question
- Part 1: "What" is happening or "why" is something happening
- Part 2: "So what" — why does it matter for the customer/sponsor/national security
- It cannot be a yes/no question
- It scopes the entire product — if something doesn't tie back to the KIQ, cut it

## Step 2: Draft the Content

The bulletin has a specific structure. Read `references/template-spec.md` for the exact layout, but in brief:

### Title
- Analytic, not descriptive — conveys the key judgment, not just the topic
- Uses an active verb and names the key actor or trend
- Bad: "China's Drone Program" / Good: "China's Embodied AI Ambitions Probably Outpace Fielded Capabilities"

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

If the script doesn't cover a specific need (e.g., more than 3 bullets per section, extra sections), you can also use the docx editing workflow: unpack the template, edit the XML directly, and repack. Read the `docx` skill's editing documentation for that approach.

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
