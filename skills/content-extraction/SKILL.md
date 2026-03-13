---
name: content-extraction
description: Extracts content ideas from long-form content and organizes them into detailed, platform-specific tables. Produces ready-to-execute briefs with titles, hooks, descriptions, and key points for newsletters, social posts, and more.
tools:
  - read_file
  - write_file
---

# Content Extraction Skill

## Overview

This skill transforms long-form content into a comprehensive content pipeline. It produces detailed, organized tables of content ideas tailored to specific platforms, ready for writing agents to execute.

## When to Use

Use this skill when:
- User has a transcript, video, article, or any long-form content
- User wants to extract multiple content pieces from one source
- User needs organized, actionable content ideas by platform
- User wants to maximize the value from existing content

## Workflow

### Step 1: Clarify Platform Targets

Ask the user in normal chat which platforms they want content for before drafting outputs when the target platforms are still ambiguous:

```
Which platforms do you want content ideas for? (Select all that apply)

- Newsletters (thought leadership, how-to guides)
- Substack Notes (short-form insights)
- Twitter/X (threads and standalone posts)
- LinkedIn (professional posts)
- YouTube Shorts / Reels (short-form video)
- Other (specify)

Also helpful to know:
- How many ideas per platform do you want? (Default: 5-10)
- Any specific angles or themes to prioritize?
```

### Step 2: Deep Content Analysis

Analyze the source content looking for:

**High-Value Insights**
- Unique perspectives not commonly shared
- Contrarian takes with solid reasoning
- "Aha moments" that shift thinking
- Quotable statements

**Teachable Content**
- Step-by-step processes
- Frameworks and mental models
- How-to instructions
- Tips and tactics

**Stories & Examples**
- Personal experiences
- Case studies
- Before/after transformations
- Mistakes and lessons learned

**Data & Proof Points**
- Statistics and numbers
- Results and outcomes
- Comparisons and benchmarks

**Emotional Hooks**
- Pain points addressed
- Aspirations touched
- Fears acknowledged
- Desires activated

### Step 3: Map Ideas to Platforms

Different content works better on different platforms:

| Content Type | Best Platforms |
|--------------|----------------|
| Deep frameworks | Newsletter, LinkedIn article |
| Quick tips | Twitter, Substack Notes |
| Step-by-step processes | Newsletter (how-to), Twitter thread |
| Personal stories | LinkedIn, Newsletter |
| Contrarian takes | Twitter, Substack Notes |
| Data/stats | LinkedIn, Twitter |
| Quotable wisdom | Substack Notes, Twitter |
| Visual concepts | Short-form video |

### Step 4: Generate Platform Tables

For each selected platform, produce a detailed table with platform-specific fields.

---

## Output Format

### Summary Section

```
# Content Extraction Report

**Source:** [Name/description of source content]
**Platforms:** [List of platforms requested]
**Total Ideas Extracted:** [Number]

## Source Overview
[2-3 sentence summary of the source content and its main themes]

## Audience Alignment
These ideas target:
- **Primary pain points addressed:** 
- **Key desires/aspirations:**
- **Language/tone match:**
```

### Newsletter Ideas Table

```
## Newsletter Ideas

| # | Title | Subject Line | Type | Description | Key Points | Word Count |
|---|-------|--------------|------|-------------|------------|------------|
| 1 | [Compelling title] | [Email subject that gets opens] | Thought Leadership / How-To | [2-3 sentence description of the angle] | • Point 1 • Point 2 • Point 3 | 800-1200 |
| 2 | ... | ... | ... | ... | ... | ... |

### Top Newsletter Pick
**Recommended:** Idea #[X] - "[Title]"
**Why:** [1-2 sentences on why this would perform well with the target audience]
```

### Substack Notes Table

```
## Substack Notes Ideas

| # | Hook (First Line) | Note Type | Full Note Draft | Why It Works |
|---|-------------------|-----------|-----------------|--------------|
| 1 | [Attention-grabbing opener] | Single-Punch Wisdom / Pattern Observation / etc. | [Complete 3-6 sentence note] | [What makes this shareable] |
| 2 | ... | ... | ... | ... |

### Top Substack Note Pick
**Recommended:** Idea #[X]
**Why:** [1-2 sentences on engagement potential]
```

### Twitter/X Ideas Table

```
## Twitter/X Ideas

### Threads

| # | Hook Tweet | Thread Structure | Key Points | Engagement Angle |
|---|------------|------------------|------------|------------------|
| 1 | [First tweet that stops the scroll] | [Number] tweets: Hook → Setup → Points → CTA | • Point 1 • Point 2 • Point 3 | [Why people will engage] |
| 2 | ... | ... | ... | ... |

### Standalone Posts

| # | Tweet | Type | Why It Works |
|---|-------|------|--------------|
| 1 | [Full tweet, ≤280 chars] | Hot take / Insight / Tip | [Engagement reasoning] |
| 2 | ... | ... | ... |

### Top Twitter Pick
**Recommended:** [Thread/Post] #[X]
**Why:** [1-2 sentences on virality potential]
```

### LinkedIn Ideas Table

```
## LinkedIn Post Ideas

| # | Opening Line | Angle | Key Points | CTA | Post Type |
|---|--------------|-------|------------|-----|-----------|
| 1 | [Hook that stops LinkedIn scroll] | [Professional angle] | • Point 1 • Point 2 • Point 3 | [What action to prompt] | Story / Insight / Lesson / List |
| 2 | ... | ... | ... | ... | ... |

### Top LinkedIn Pick
**Recommended:** Idea #[X]
**Why:** [1-2 sentences on why this fits LinkedIn's audience]
```

### Short-Form Video Ideas Table

```
## Short-Form Video Ideas (YouTube Shorts / Reels / TikTok)

| # | Hook (First 3 Sec) | Concept | Script Outline | Duration | Visual Notes |
|---|-------------------|---------|----------------|----------|--------------|
| 1 | [What you say/show immediately] | [Core concept] | 1. Hook 2. Setup 3. Payoff | 30s / 60s / 90s | [Any visual suggestions] |
| 2 | ... | ... | ... | ... | ... |

### Top Video Pick
**Recommended:** Idea #[X]
**Why:** [1-2 sentences on video performance potential]
```

---

## Execution Roadmap

At the end, provide a prioritized execution plan:

```
## Execution Roadmap

### Immediate (This Week)
1. **[Platform]:** [Idea title] - [Why prioritize]
2. **[Platform]:** [Idea title] - [Why prioritize]

### Short-Term (Next 2 Weeks)
3. **[Platform]:** [Idea title]
4. **[Platform]:** [Idea title]
5. **[Platform]:** [Idea title]

### Content Calendar Suggestion
- **Monday:** [Platform/content type]
- **Wednesday:** [Platform/content type]
- **Friday:** [Platform/content type]

### Agent Handoff
To execute these ideas, hand the briefs to:
- Newsletter ideas → newsletter-writer agent
- Social media ideas → social-media-writer agent
- Video scripts → [manual or future agent]
```

---

## Quality Standards

Every extracted idea must:

**Be Traceable**
- Directly sourced from the content (not invented)
- Include enough context to be standalone

**Be Specific**
- Not "write about topic X"
- Includes hook, angle, key points

**Be Platform-Native**
- Formatted for how that platform works
- Right length and structure

**Be Audience-Aligned**
- Speaks to pain points
- Uses their language
- Addresses their aspirations

**Be Actionable**
- Detailed enough for a writing agent to execute
- No ambiguity about the angle or approach

---

## Tips for Maximum Extraction

1. **One source, many angles** - The same insight can become a newsletter deep-dive AND a punchy tweet AND a LinkedIn story

2. **Repurpose, don't repeat** - Each platform version should feel native, not copy-pasted

3. **Lead with pain points** - Ideas that address struggles will always outperform

4. **Include contrarian takes** - These drive engagement across all platforms

5. **Don't force it** - If the source doesn't have enough meat for a platform, note it rather than creating weak ideas
