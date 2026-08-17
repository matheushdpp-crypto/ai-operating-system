---
name: Validate Financial Limit
slug: validate-financial-limit
version: 1.0.0
description: Validates transaction amounts against autonomous spending thresholds and organizational financial policies.
purpose: Prevent unauthorized financial disbursements and ensure compliance with delegation of authority rules.
when_to_use:
  - Prior to approving or initiating any corporate payment, expense reimbursement, or purchase order
when_not_to_use:
  - For non-monetary requests or catalog browsing
inputs:
  amount: number
  currency: string
  category: string
outputs:
  is_within_limit: boolean
  requires_approval: boolean
  max_allowed: number
tools:
  - ERP
  - PolicyEngine
knowledge:
  - Financial Policy SOP
is_shared: true
---

# Validate Financial Limit Skill

## Instructions
1. Retrieve agent approval limits and organizational policy rules for the specified category.
2. Compare requested transaction amount against the authorized ceiling.
3. If amount <= limit, set `is_within_limit: true` and `requires_approval: false`.
4. If amount > limit, set `is_within_limit: false`, `requires_approval: true`, and calculate required approver hierarchy.
