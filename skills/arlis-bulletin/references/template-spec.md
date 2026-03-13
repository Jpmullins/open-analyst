# ARLIS Bulletin Template Specification

This documents the exact formatting and structure of the ARLIS Insights Bulletin template.

## Page Layout
- Page size: US Letter (12240 x 15840 DXA = 8.5" x 11")
- Margins: 1" all sides (1440 DXA)
- Header margin: 432 DXA (0.3")
- Footer margin: 288 DXA (0.2")
- First page is special (`<w:titlePg/>` enabled)
- Portrait orientation

## Fonts
- **All text**: Arial
- **Default size**: 12pt (sz val="24" in half-points)
- **Endnotes**: 10pt (sz val="20")

## Color Scheme
- **Title**: Dark red `#C00000`, 18pt (sz=36), bold
- **Date**: Dark red `#C00000`, 12pt (sz=24), regular weight
- **"About ARLIS Insights" heading**: Dark red `#C00000`, 12pt, on gray background (`#DFDFDF` shading)
- **"Technical Point of Contact"**: Dark red `#C00000`, 12pt
- **Endnote reference links**: Blue `#0000EE`, superscript, underlined
- **Body text**: Black (default), 12pt
- **Email link**: Blue `#0000EE`, underlined

## Document Structure

### First Page Header
- ARLIS Insights logo (TIFF image, anchored to left margin)
- "UNCLASSIFIED" centered
- "NOT FOR PUBLIC RELEASE" centered below

### Body Content (in order)

1. **Empty paragraph** (spacer)
2. **Title** — Bold, dark red (#C00000), 18pt Arial
3. **Date** — Dark red (#C00000), 12pt Arial, format: "DD Month YYYY"
4. **Spacer paragraph**
5. **"What" lead sentence** — First part bold+italic, second part regular. 12pt Arial. The bold+italic portion is the analytic BLUF. The regular portion provides context or key evidence.
6. **Spacer paragraph**
7. **Bullet 1** (What section) — ListParagraph style, numId=15, indent left=720 hanging=360. 12pt Arial. Includes superscript endnote reference `[1]` as hyperlink.
8. **Spacer paragraph**
9. **Bullet 2** (What section) — Same formatting, endnote `[2]`
10. **Spacer paragraph**
11. **Bullet 3** (What section) — Same formatting, endnote `[3]`
12. **Spacer paragraph**
13. **"So What" lead sentence** — Same formatting as "What" lead (bold+italic first part, regular second part). 12pt Arial.
14. **Spacer paragraph**
15. **Bullet 1** (So What section) — ListParagraph, numId=16 (separate numbering group), same indent
16. **Spacer paragraph**
17. **Bullet 2** (So What section)
18. **Spacer paragraph**
19. **Bullet 3** (So What section)
20. **Two spacer paragraphs**
21. **"About ARLIS Insights"** — Dark red on gray background shading (#DFDFDF). DO NOT MODIFY this section.
22. **Boilerplate text** — Standard ARLIS description. DO NOT MODIFY.
23. **Spacer paragraph**
24. **"Technical Point of Contact:"** — Dark red
25. **"ARLIS Insights"** — Regular black
26. **"insights@arlis.umd.edu"** — Blue hyperlink
27. **Two spacer paragraphs**
28. **Endnote [1]** — Superscript reference link + 10pt citation text (Chicago Manual of Style)
29. **Endnote [2]** — Same format
30. **Endnote [3]** — Same format

### Non-First-Page Header
- "UNCLASSIFIED" centered
- "NOT FOR PUBLIC RELEASE" centered

### Footer (all pages)
- "UNCLASSIFIED" centered
- "NOT FOR PUBLIC RELEASE" centered
- Page number right-aligned (page 2+ only)
- "© 2026 UMD/ARLIS. All rights reserved." right-aligned, 10pt

## Bullet Formatting Details
- Style: ListParagraph
- "What" bullets use numId="15", "So What" bullets use numId="16"
- Indent: left=720, hanging=360 (standard 0.5" indent with 0.25" hanging)
- Spacing: before=0, after=0 (spacer paragraphs between bullets provide visual separation)
- Each bullet can have a superscript endnote reference as a hyperlink

## Lead Sentence Formatting
The lead sentence in each section has two text runs:
1. **Run 1**: Bold + Italic (`<w:b val="1"/><w:i val="1"/>`) — the analytic judgment
2. **Run 2**: Regular weight — supporting context or evidence

In the China Embodied AI example bulletin, the second section's lead was formatted differently: the bold+italic portion was longer and flowed into the regular text as a single continuous paragraph (no second sentence on a separate run). Both approaches are acceptable.

## Endnote Format
- Chicago Manual of Style (ODNI standard)
- Superscript reference number in brackets: [1], [2], [3]
- Full citation on first use, short form on subsequent uses
- 10pt font (sz=20 in half-points)
- Book: Author, *Title*, Edition ed. (City: Publisher, Year), Page.
- Report: Author, "Title" (City: Institution, Month Year).
- Short form: Author, *Short Title*, Page.

## What NOT to Modify
The following are baked into the template and should be preserved as-is:
- ARLIS Insights logo in the first-page header
- "UNCLASSIFIED / NOT FOR PUBLIC RELEASE" classification markings
- "About ARLIS Insights" boilerplate section
- Contact information block
- Footer copyright and page numbers
- All header/footer XML
