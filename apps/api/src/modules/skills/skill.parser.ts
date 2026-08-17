import yaml from 'yaml';
import { Skill } from '../../types/index.js';

export interface ParsedSkillDoc {
  name: string;
  slug: string;
  version?: string;
  description?: string;
  purpose?: string;
  when_to_use?: string;
  when_not_to_use?: string;
  instructions: string;
  inputs_schema?: Record<string, any>;
  outputs_schema?: Record<string, any>;
  required_tools?: string[];
  required_knowledge?: string[];
  is_shared?: boolean;
}

export class SkillParser {
  /**
   * Parses standard SKILL.md file content containing YAML frontmatter or markdown sections
   */
  public static parse(content: string, filePath?: string): ParsedSkillDoc {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    let metadata: Record<string, any> = {};
    let markdownBody = content;

    if (match) {
      try {
        metadata = yaml.parse(match[1]) || {};
      } catch (err: any) {
        console.warn(`[SkillParser] YAML parse warning in ${filePath}:`, err.message);
      }
      markdownBody = match[2].trim();
    }

    // Extract sections from markdown body if not present in frontmatter
    const extractSection = (headingRegex: RegExp): string | undefined => {
      const secMatch = markdownBody.match(headingRegex);
      return secMatch ? secMatch[1].trim() : undefined;
    };

    const purpose = metadata.purpose || extractSection(/##?\s+Purpose\s*\r?\n([\s\S]*?)(?=\n##|$)/i);
    const when_to_use = metadata.when_to_use || extractSection(/##?\s+When to use\s*\r?\n([\s\S]*?)(?=\n##|$)/i);
    const when_not_to_use = metadata.when_not_to_use || extractSection(/##?\s+When not to use\s*\r?\n([\s\S]*?)(?=\n##|$)/i);
    const instructions = extractSection(/##?\s+Instructions\s*\r?\n([\s\S]*?)(?=\n##|$)/i) || markdownBody;

    const name = metadata.name || 'Unnamed Skill';
    const slug = metadata.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    return {
      name,
      slug,
      version: metadata.version || '1.0.0',
      description: metadata.description || purpose || '',
      purpose,
      when_to_use,
      when_not_to_use,
      instructions,
      inputs_schema: metadata.inputs || metadata.inputs_schema || {},
      outputs_schema: metadata.outputs || metadata.outputs_schema || {},
      required_tools: Array.isArray(metadata.tools) ? metadata.tools : (metadata.required_tools || []),
      required_knowledge: Array.isArray(metadata.knowledge) ? metadata.knowledge : (metadata.required_knowledge || []),
      is_shared: Boolean(metadata.is_shared),
    };
  }
}
