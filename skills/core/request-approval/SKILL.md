---
name: Request Human Approval
slug: request-approval
version: 1.0.0
description: Standard operational skill to halt automated execution and escalate a proposed action to human reviewers when policy limits are exceeded.
purpose: Ensure human oversight for sensitive, high-value, or high-risk operations.
when_to_use:
  - When a deterministic policy decision results in HUMAN_REQUIRED
  - When financial spending limits exceed the agent's autonomous threshold
  - When customer data or external emails require verification
when_not_to_use:
  - For standard routine automated tasks within approved limits
  - For simple read-only queries
inputs:
  action_name: string
  amount: number
  reason: string
  context: object
outputs:
  approval_id: string
  status: string
tools:
  - Messaging
  - ControlCenter
knowledge:
  - Corporate Governance Policy
is_shared: true
---

# Request Human Approval Skill

## Instructions
1. Package the proposed action with all relevant contextual parameters (vendor, amount, tax IDs, justification).
2. Invoke the AiOS Approval Service to create a pending approval entry.
3. Pause the active workflow run into state `WAITING_APPROVAL`.
4. Notify assigned human operators via Control Center and messaging channels.
5. Await resumption signal with human decision (`APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, or `TAKEN_OVER`).
