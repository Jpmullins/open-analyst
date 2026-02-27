#!/usr/bin/env python3
"""
Generate an ARLIS Insights Bulletin by cloning the official template
and replacing placeholder content with analytic text.

Usage:
    python generate_bulletin.py \
        --template path/to/template.docx \
        --output path/to/output.docx \
        --title "Analytic Title Here" \
        --date "18 February 2026" \
        --what-lead "Bold italic BLUF for the What section." \
        --what-context "Second sentence providing context." \
        --what-bullets "Bullet 1" "Bullet 2" "Bullet 3" \
        --sowhat-lead "Bold italic lead for the So What section." \
        --sowhat-context "Second sentence providing context." \
        --sowhat-bullets "Bullet 1" "Bullet 2" "Bullet 3" \
        --endnotes "Full citation 1." "Citation 2." "Citation 3."

The script preserves all template formatting (ARLIS logo, headers, footers,
classification markings, boilerplate) and only replaces the body content.
"""

import argparse
import copy
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

# XML namespaces used in OOXML
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
}

for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)

# Also register all the other namespaces we might encounter
EXTRA_NS = {
    'wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
    'cx': 'http://schemas.microsoft.com/office/drawing/2014/chartex',
    'cx1': 'http://schemas.microsoft.com/office/drawing/2015/9/8/chartex',
    'cx2': 'http://schemas.microsoft.com/office/drawing/2015/10/21/chartex',
    'cx3': 'http://schemas.microsoft.com/office/drawing/2016/5/9/chartex',
    'cx4': 'http://schemas.microsoft.com/office/drawing/2016/5/10/chartex',
    'cx5': 'http://schemas.microsoft.com/office/drawing/2016/5/11/chartex',
    'cx6': 'http://schemas.microsoft.com/office/drawing/2016/5/12/chartex',
    'cx7': 'http://schemas.microsoft.com/office/drawing/2016/5/13/chartex',
    'cx8': 'http://schemas.microsoft.com/office/drawing/2016/5/14/chartex',
    'aink': 'http://schemas.microsoft.com/office/drawing/2016/ink',
    'am3d': 'http://schemas.microsoft.com/office/drawing/2017/model3d',
    'o': 'urn:schemas-microsoft-com:office:office',
    'oel': 'http://schemas.microsoft.com/office/2019/extlst',
    'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'v': 'urn:schemas-microsoft-com:vml',
    'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'w10': 'urn:schemas-microsoft-com:office:word',
    'w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
    'w16cex': 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
    'w16cid': 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
    'w16': 'http://schemas.microsoft.com/office/word/2018/wordml',
    'w16du': 'http://schemas.microsoft.com/office/word/2023/wordml/word16du',
    'w16sdtdh': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
    'w16sdtfl': 'http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock',
    'w16se': 'http://schemas.microsoft.com/office/word/2015/wordml/symex',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'wpi': 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
    'wne': 'http://schemas.microsoft.com/office/word/2006/wordml',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'a14': 'http://schemas.microsoft.com/office/drawing/2010/main',
}
for prefix, uri in EXTRA_NS.items():
    ET.register_namespace(prefix, uri)


def escape_xml(text: str) -> str:
    """Escape text for XML, converting smart quotes to XML entities."""
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    # Convert straight quotes/apostrophes to smart quotes
    text = text.replace("\u2018", "&#x2018;")  # left single
    text = text.replace("\u2019", "&#x2019;")  # right single / apostrophe
    text = text.replace("\u201C", "&#x201C;")  # left double
    text = text.replace("\u201D", "&#x201D;")  # right double
    return text


def make_spacer_p() -> str:
    """Create a spacer paragraph XML string."""
    return '''<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr>
        <w:spacing w:before="0" w:beforeAutospacing="off" w:after="0" w:afterAutospacing="off"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
        </w:rPr>
        <w:t xml:space="preserve"> </w:t>
      </w:r>
    </w:p>'''


def make_title_p(title: str) -> str:
    """Create the title paragraph."""
    return f'''<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr>
        <w:spacing w:before="0" w:beforeAutospacing="off" w:after="0" w:afterAutospacing="off"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:b w:val="1"/>
          <w:bCs w:val="1"/>
          <w:color w:val="C00000"/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
        </w:rPr>
        <w:t>{escape_xml(title)}</w:t>
      </w:r>
    </w:p>'''


def make_date_p(date: str) -> str:
    """Create the date paragraph."""
    return f'''<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr>
        <w:spacing w:before="0" w:beforeAutospacing="off" w:after="0" w:afterAutospacing="off"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:color w:val="C00000"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
        </w:rPr>
        <w:t>{escape_xml(date)}</w:t>
      </w:r>
    </w:p>'''


def make_lead_p(bold_italic_text: str, context_text: str) -> str:
    """Create a lead sentence paragraph with bold+italic first part and regular second part."""
    parts = f'''<w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:b w:val="1"/>
          <w:bCs w:val="1"/>
          <w:i w:val="1"/>
          <w:iCs w:val="1"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
        </w:rPr>
        <w:t>{escape_xml(bold_italic_text)}</w:t>
      </w:r>'''

    if context_text:
        parts += f'''
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
        </w:rPr>
        <w:t xml:space="preserve"> {escape_xml(context_text)}</w:t>
      </w:r>'''

    return f'''<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr>
        <w:spacing w:before="0" w:beforeAutospacing="off" w:after="0" w:afterAutospacing="off"/>
      </w:pPr>
      {parts}
    </w:p>'''


def make_bullet_p(text: str, num_id: str, endnote_num: int = None) -> str:
    """Create a bullet point paragraph with optional endnote reference."""
    endnote_ref = ""
    if endnote_num is not None:
        endnote_ref = f'''<w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:color w:val="0000EE"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
          <w:u w:val="single"/>
          <w:vertAlign w:val="superscript"/>
        </w:rPr>
        <w:t>[{endnote_num}]</w:t>
      </w:r>'''

    return f'''<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr>
        <w:pStyle w:val="ListParagraph"/>
        <w:numPr>
          <w:ilvl w:val="0"/>
          <w:numId w:val="{num_id}"/>
        </w:numPr>
        <w:spacing w:before="0" w:beforeAutospacing="off" w:after="0" w:afterAutospacing="off"/>
        <w:ind w:left="720" w:right="0" w:hanging="360"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
        </w:rPr>
        <w:t>{escape_xml(text)}</w:t>
      </w:r>{endnote_ref}
    </w:p>'''


def make_endnote_p(num: int, citation: str) -> str:
    """Create an endnote paragraph."""
    return f'''<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:pPr>
        <w:spacing w:before="0" w:beforeAutospacing="off" w:after="0" w:afterAutospacing="off"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:color w:val="0000EE"/>
          <w:sz w:val="20"/>
          <w:szCs w:val="20"/>
          <w:u w:val="single"/>
          <w:vertAlign w:val="superscript"/>
        </w:rPr>
        <w:t>[{num}]</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>
          <w:sz w:val="20"/>
          <w:szCs w:val="20"/>
        </w:rPr>
        <w:t xml:space="preserve"> {escape_xml(citation)}</w:t>
      </w:r>
    </w:p>'''


def generate_bulletin(template_path: str, output_path: str,
                      title: str, date: str,
                      what_lead: str, what_context: str, what_bullets: list,
                      sowhat_lead: str, sowhat_context: str, sowhat_bullets: list,
                      endnotes: list):
    """
    Clone the ARLIS template and replace placeholder content.

    Strategy: We unpack the docx, rebuild the document.xml body content
    between the first empty paragraph and the "About ARLIS Insights" section,
    then repack. This preserves all headers, footers, media, and boilerplate.
    """
    # Create a temp directory for unpacking
    tmpdir = tempfile.mkdtemp(prefix="arlis_bulletin_")
    try:
        # Unpack the template
        with zipfile.ZipFile(template_path, 'r') as z:
            z.extractall(tmpdir)

        # Read document.xml as raw text (to preserve all namespace declarations)
        doc_path = os.path.join(tmpdir, 'word', 'document.xml')
        with open(doc_path, 'r', encoding='utf-8') as f:
            doc_xml = f.read()

        # Parse to find the structure
        tree = ET.parse(doc_path)
        root = tree.getroot()
        body = root.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body')

        # Find the "About ARLIS Insights" paragraph and everything after it
        paragraphs = list(body)
        about_idx = None
        for i, p in enumerate(paragraphs):
            # Look for the "About ARLIS Insights" text
            for r in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                if r.text and 'About ARLIS Insights' in r.text:
                    about_idx = i
                    break
            if about_idx is not None:
                break

        if about_idx is None:
            print("ERROR: Could not find 'About ARLIS Insights' in template. Aborting.")
            sys.exit(1)

        # Find the sectPr (section properties) - always the last element
        sect_pr = paragraphs[-1]

        # Preserve the "About ARLIS Insights" section through the end
        # That includes: About heading, boilerplate, contact info, email, spacers, endnotes section, and sectPr
        boilerplate_elements = paragraphs[about_idx:]

        # Now rebuild: remove all body children
        for child in list(body):
            body.remove(child)

        # Build new content paragraphs as XML strings
        content_parts = []

        # Initial spacer
        content_parts.append(make_spacer_p())

        # Empty line
        content_parts.append(make_spacer_p())

        # Title
        content_parts.append(make_title_p(title))

        # Date
        content_parts.append(make_date_p(date))

        # Spacer
        content_parts.append(make_spacer_p())

        # "What" lead sentence
        content_parts.append(make_lead_p(what_lead, what_context))

        # "What" bullets with endnote references
        for i, bullet in enumerate(what_bullets):
            content_parts.append(make_spacer_p())
            endnote_num = i + 1 if i < len(endnotes) else None
            content_parts.append(make_bullet_p(bullet, "15", endnote_num))

        # Spacer
        content_parts.append(make_spacer_p())

        # "So What" lead sentence
        content_parts.append(make_lead_p(sowhat_lead, sowhat_context))

        # "So What" bullets
        what_endnote_count = len(what_bullets)
        for i, bullet in enumerate(sowhat_bullets):
            content_parts.append(make_spacer_p())
            endnote_idx = what_endnote_count + i
            endnote_num = endnote_idx + 1 if endnote_idx < len(endnotes) else None
            content_parts.append(make_bullet_p(bullet, "16", endnote_num))

        # Two spacers before boilerplate
        content_parts.append(make_spacer_p())
        content_parts.append(make_spacer_p())

        # Parse and add new content
        for xml_str in content_parts:
            elem = ET.fromstring(xml_str)
            body.append(elem)

        # Re-add boilerplate elements (About ARLIS through contact info)
        # But we need to replace the endnotes section
        endnote_section_started = False
        for elem in boilerplate_elements:
            # Check if this is an endnote paragraph (contains [1], [2], etc.)
            is_endnote = False
            for r in elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                if r.text and re.match(r'^\[\d+\]$', r.text.strip()):
                    is_endnote = True
                    endnote_section_started = True
                    break

            # Check if this is the sectPr
            is_sectpr = elem.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sectPr'

            if is_endnote:
                continue  # Skip old endnotes
            elif endnote_section_started and not is_sectpr:
                # Check if it's a spacer between/after endnotes
                texts = [r.text for r in elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if r.text]
                if all(t.strip() == '' for t in texts) or not texts:
                    continue
                # This is actual endnote content (citation text), skip it
                has_small_font = False
                for rpr in elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sz'):
                    if rpr.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') == '20':
                        has_small_font = True
                if has_small_font:
                    continue
                endnote_section_started = False
                body.append(elem)
            elif is_sectpr:
                # Before the sectPr, add our new endnotes
                for idx, citation in enumerate(endnotes):
                    endnote_xml = make_endnote_p(idx + 1, citation)
                    body.append(ET.fromstring(endnote_xml))
                # Add empty paragraph before sectPr
                body.append(ET.fromstring(make_spacer_p()))
                body.append(elem)
            else:
                body.append(elem)

        # Write the modified document.xml
        tree.write(doc_path, xml_declaration=True, encoding='UTF-8')

        # Repack into a new docx
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for root_dir, dirs, files in os.walk(tmpdir):
                for f in files:
                    file_path = os.path.join(root_dir, f)
                    arcname = os.path.relpath(file_path, tmpdir)
                    zout.write(file_path, arcname)

        print(f"Bulletin generated: {output_path}")

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Generate ARLIS Insights Bulletin")
    parser.add_argument('--template', required=True, help='Path to template .docx')
    parser.add_argument('--output', required=True, help='Output .docx path')
    parser.add_argument('--title', required=True, help='Bulletin title (analytic, not descriptive)')
    parser.add_argument('--date', required=True, help='Date in "DD Month YYYY" format')
    parser.add_argument('--what-lead', required=True, help='Bold+italic BLUF for the "What" section')
    parser.add_argument('--what-context', default='', help='Context sentence for the "What" section')
    parser.add_argument('--what-bullets', nargs='+', required=True, help='Supporting bullets for "What" (3 recommended)')
    parser.add_argument('--sowhat-lead', required=True, help='Bold+italic lead for the "So What" section')
    parser.add_argument('--sowhat-context', default='', help='Context sentence for the "So What" section')
    parser.add_argument('--sowhat-bullets', nargs='+', required=True, help='Supporting bullets for "So What" (3 recommended)')
    parser.add_argument('--endnotes', nargs='+', required=True, help='Endnote citations (Chicago Manual of Style)')

    args = parser.parse_args()

    generate_bulletin(
        template_path=args.template,
        output_path=args.output,
        title=args.title,
        date=args.date,
        what_lead=args.what_lead,
        what_context=args.what_context,
        what_bullets=args.what_bullets,
        sowhat_lead=args.sowhat_lead,
        sowhat_context=args.sowhat_context,
        sowhat_bullets=args.sowhat_bullets,
        endnotes=args.endnotes,
    )


if __name__ == '__main__':
    main()
