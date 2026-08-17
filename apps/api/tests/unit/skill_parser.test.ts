import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SkillParser } from '../../src/modules/skills/skill.parser.js';

describe('SkillParser SKILL.md Parser', () => {
  const sampleSkillMd = `---
name: Validate Commercial Invoice
slug: validate-invoice
version: 1.2.0
description: Validates vendor invoices and calculates tax deductions.
purpose: Ensure corporate payments are verified before disbursement.
when_to_use:
  - When a new invoice is received
when_not_to_use:
  - For personal reimbursement tickets
inputs:
  vendor: string
  amount: number
outputs:
  valid: boolean
tools:
  - ERP
  - Database
knowledge:
  - Financial SOP
is_shared: true
---

# Validate Commercial Invoice

## Instructions
1. Check invoice number.
2. Verify amount against PO.
3. Validate tax retention.
`;

  test('parses YAML frontmatter and markdown sections accurately', () => {
    const parsed = SkillParser.parse(sampleSkillMd);

    assert.equal(parsed.name, 'Validate Commercial Invoice');
    assert.equal(parsed.slug, 'validate-invoice');
    assert.equal(parsed.version, '1.2.0');
    assert.equal(parsed.is_shared, true);
    assert.deepEqual(parsed.required_tools, ['ERP', 'Database']);
    assert.deepEqual(parsed.required_knowledge, ['Financial SOP']);
    assert.ok(parsed.instructions.includes('Check invoice number.'));
  });

  test('handles markdown without frontmatter gracefully', () => {
    const rawMarkdown = `# Simple Skill
## Purpose
To execute basic math operations.

## Instructions
Sum numbers and return total.
`;
    const parsed = SkillParser.parse(rawMarkdown);
    assert.equal(parsed.name, 'Unnamed Skill');
    assert.ok(parsed.instructions.includes('Sum numbers'));
  });
});
