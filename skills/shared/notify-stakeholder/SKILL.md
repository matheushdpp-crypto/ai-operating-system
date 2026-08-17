---
name: Notify Stakeholder
slug: notify-stakeholder
version: 1.0.0
description: Sends formatted real-time operational notifications and alerts to stakeholders across Slack, Teams, WhatsApp, and Email.
purpose: Keep relevant human operators and management informed about critical workflow transitions.
when_to_use:
  - When an approval request is generated
  - When a high-risk policy violation occurs
  - When a long-running batch job finishes
when_not_to_use:
  - For continuous low-level logging
inputs:
  recipient: string
  channel: string
  subject: string
  message: string
  priority: string
outputs:
  delivered: boolean
  delivery_timestamp: string
tools:
  - Messaging
  - Email
knowledge: []
is_shared: true
---

# Notify Stakeholder Skill

## Instructions
1. Format message with clear context, action required, and direct link to AiOS Control Center.
2. Select appropriate channel based on recipient preferences and alert priority.
3. Dispatch notification and record delivery receipt.
