---
name: Process Invoice
slug: process-invoice
version: 1.0.0
description: End-to-end processing of corporate invoices including 3-way matching, line-item verification, tax retention checks, and ERP reconciliation.
purpose: Automate corporate accounts payable workflows while enforcing compliance limits.
when_to_use:
  - Inbound invoice PDF or XML received via email or API trigger
when_not_to_use:
  - For outgoing invoices or general accounting ledger queries
inputs:
  vendor: string
  invoice_number: string
  amount: number
  currency: string
  due_date: string
  line_items: array
outputs:
  status: string
  matched: boolean
  payment_scheduled: boolean
tools:
  - ERP
  - Database
  - Storage
knowledge:
  - Financial Policy SOP
  - Tax Compliance Guide
is_shared: false
---

# Process Invoice Skill

## Instructions
1. Parse invoice headers, tax registrations, and line-item details.
2. Query ERP system to match invoice against purchase order and goods receipt note.
3. Validate payment total against organizational threshold.
4. If within limits and matched, generate ERP payment record.
5. If mismatched or over policy limit, invoke `request-approval` skill.
