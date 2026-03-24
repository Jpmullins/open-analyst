# Runtime Context And Stream UI Remediation

> Status: implemented. This document is retained as a completed engineering record, not as an active migration plan.

## Summary

This work addressed two issues:

1. typed runtime context leaking into Agent Server serialization paths that expected JSON-like `context`
2. browser main-thread pressure during planner and drafter-heavy runs

## Implemented Changes

### Runtime context serialization

- normalized runtime context to a plain mapping at Agent Server boundaries
- removed reliance on `BaseModel` objects in the main runtime request path
- ensured run enrichment injects JSON-like context payloads

### Main thread stream performance

- bounded live thread history
- added moderate stream throttling
- stabilized fallback message IDs
- preserved timestamps per stable message
- precomputed subagent groupings outside the hot render path
- reduced repeated interrupt extraction work

## Verification

- planner-heavy and drafter-heavy browser runs remain responsive
- reconnecting to in-progress runs still works
- approvals still surface correctly
- subagent cards remain attached to the correct assistant messages
- `pnpm lint` and `pnpm build` pass

## Follow-On Rule

When the chat view changes, keep the stream path bounded and avoid rebuilding expensive derived structures on every event tick.
