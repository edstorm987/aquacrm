import type { Block } from "../types/block";

export const BLOG_POST_BODY_MAX_DEPTH = 12;
export const BLOG_POST_BODY_MAX_NODES = 250;
export const BLOG_POST_BODY_MAX_JSON_CHARS = 250_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validate a body before it can reach the recursive element renderer.
 * Blog-post elements are forbidden inside a post body because each one can
 * fetch and mount another complete post body (including itself). Depth, node,
 * and encoded-size limits make legacy and direct-server inputs finite too.
 */
export function validateBlogPostBody(value: unknown): string | null {
  if (!Array.isArray(value)) return "body must be an array of blocks";

  let encoded: string;
  try { encoded = JSON.stringify(value); }
  catch { return "body must be a finite JSON block tree"; }
  if (encoded.length > BLOG_POST_BODY_MAX_JSON_CHARS) {
    return `body exceeds ${BLOG_POST_BODY_MAX_JSON_CHARS} JSON characters`;
  }

  const stack: Array<{ value: unknown; path: string; depth: number }> = value.map((block, index) => ({
    value: block,
    path: `body[${index}]`,
    depth: 1,
  })).reverse();
  const seen = new WeakSet<object>();
  const ids = new Set<string>();
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!isPlainObject(current.value)) return `${current.path} must be an object`;
    if (seen.has(current.value)) return `${current.path} repeats an existing block object`;
    seen.add(current.value);

    nodes += 1;
    if (nodes > BLOG_POST_BODY_MAX_NODES) {
      return `body exceeds ${BLOG_POST_BODY_MAX_NODES} blocks`;
    }
    if (current.depth > BLOG_POST_BODY_MAX_DEPTH) {
      return `body exceeds ${BLOG_POST_BODY_MAX_DEPTH} nested levels`;
    }

    const id = current.value.id;
    const type = current.value.type;
    if (typeof id !== "string" || id.length === 0 || id.length > 160) {
      return `${current.path}.id must be a non-empty string up to 160 characters`;
    }
    if (ids.has(id)) return `${current.path}.id must be unique`;
    ids.add(id);
    if (typeof type !== "string" || type.length === 0 || type.length > 120) {
      return `${current.path}.type must be a non-empty string up to 120 characters`;
    }
    if (type === "blog-post") {
      return `${current.path}.type cannot be blog-post inside a blog post body`;
    }
    if (current.value.props !== undefined && !isPlainObject(current.value.props)) {
      return `${current.path}.props must be an object`;
    }
    if (current.value.children === undefined) continue;
    if (!Array.isArray(current.value.children)) {
      return `${current.path}.children must be an array`;
    }
    for (let index = current.value.children.length - 1; index >= 0; index -= 1) {
      stack.push({
        value: current.value.children[index],
        path: `${current.path}.children[${index}]`,
        depth: current.depth + 1,
      });
    }
  }

  return null;
}

export function isSafeBlogPostBody(value: unknown): value is Block[] {
  return validateBlogPostBody(value) === null;
}

export class BlogPostBodyValidationError extends Error {
  override name = "BlogPostBodyValidationError";

  constructor(public readonly reason: string) {
    super(reason);
  }
}

export function requireSafeBlogPostBody(value: unknown): asserts value is Block[] {
  const reason = validateBlogPostBody(value);
  if (reason) throw new BlogPostBodyValidationError(reason);
}
