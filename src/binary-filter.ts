/**
 * Binary Filter for MCP Manager
 *
 * Intercepts MCP responses containing binary data (base64 images),
 * writes them to temp files, and returns file path references instead.
 * This enables proxying of browser MCP and other servers that return binary data.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Use SCREENSHOT_DIR env var if set, otherwise fall back to temp directory
const BINARY_TEMP_DIR = process.env.SCREENSHOT_DIR || join(tmpdir(), "mcp-manager-binary");

// Ensure directory exists
if (!existsSync(BINARY_TEMP_DIR)) {
  mkdirSync(BINARY_TEMP_DIR, { recursive: true });
}

// Counter for unique filenames
let fileCounter = 0;

/**
 * MCP content item types
 */
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;      // base64 encoded
  mimeType: string;  // e.g., "image/png", "image/jpeg"
}

interface ResourceContent {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;  // base64 encoded
  };
}

type ContentItem = TextContent | ImageContent | ResourceContent | Record<string, any>;

/**
 * Get file extension from MIME type
 */
function getExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "application/octet-stream": ".bin",
  };
  return mimeToExt[mimeType] || ".bin";
}

/**
 * Generate unique filename with timestamp
 */
function generateFilename(prefix: string, ext: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  fileCounter++;
  return `${prefix}_${timestamp}_${fileCounter}${ext}`;
}

/**
 * Write base64 data to temp file and return the path
 */
function writeBase64ToFile(data: string, mimeType: string, prefix: string = "image"): string {
  const ext = getExtension(mimeType);
  const filename = generateFilename(prefix, ext);
  const filepath = join(BINARY_TEMP_DIR, filename);

  // Decode base64 and write
  const buffer = Buffer.from(data, "base64");
  writeFileSync(filepath, buffer);

  return filepath;
}

/**
 * Process a single content item, converting binary to file references
 */
function processContentItem(item: ContentItem, serverName: string): ContentItem {
  // Handle image content
  if (item.type === "image" && "data" in item && typeof item.data === "string") {
    const imageItem = item as ImageContent;
    const filepath = writeBase64ToFile(
      imageItem.data,
      imageItem.mimeType || "image/png",
      `${serverName}_screenshot`
    );

    // Return text content with file path
    return {
      type: "text",
      text: `[Image saved to: ${filepath}]\n(MIME: ${imageItem.mimeType || "image/png"}, Size: ${Math.round(imageItem.data.length * 0.75 / 1024)}KB)`
    };
  }

  // Handle resource content with blob
  if (item.type === "resource" && "resource" in item) {
    const resourceItem = item as ResourceContent;
    if (resourceItem.resource.blob && typeof resourceItem.resource.blob === "string") {
      const filepath = writeBase64ToFile(
        resourceItem.resource.blob,
        resourceItem.resource.mimeType || "application/octet-stream",
        `${serverName}_resource`
      );

      return {
        type: "text",
        text: `[Resource saved to: ${filepath}]\n(URI: ${resourceItem.resource.uri}, MIME: ${resourceItem.resource.mimeType || "unknown"})`
      };
    }
  }

  // Check for large base64 strings in any field (fallback detection)
  if (typeof item === "object" && item !== null) {
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === "string" && value.length > 10000) {
        // Check if it looks like base64
        if (/^[A-Za-z0-9+/]+=*$/.test(value.slice(0, 1000))) {
          const filepath = writeBase64ToFile(
            value,
            "application/octet-stream",
            `${serverName}_${key}`
          );

          // Return modified item with file reference
          return {
            ...item,
            [key]: `[Binary data saved to: ${filepath}]`
          } as ContentItem;
        }
      }
    }
  }

  // Return unchanged
  return item;
}

/**
 * Process MCP response content array, converting binary data to file references
 *
 * @param content - Array of MCP content items
 * @param serverName - Name of the source server (for filename prefix)
 * @returns Processed content array with binary data replaced by file paths
 */
export function processBinaryContent(
  content: ContentItem[] | undefined,
  serverName: string
): ContentItem[] {
  if (!content || !Array.isArray(content)) {
    return content || [];
  }

  return content.map(item => processContentItem(item, serverName));
}

/**
 * Check if content contains binary data that needs processing
 */
export function hasBinaryContent(content: ContentItem[] | undefined): boolean {
  if (!content || !Array.isArray(content)) {
    return false;
  }

  return content.some(item => {
    // Check for image type
    if (item.type === "image" && "data" in item) {
      return true;
    }

    // Check for resource with blob
    if (item.type === "resource" && "resource" in item) {
      const resourceItem = item as ResourceContent;
      if (resourceItem.resource.blob) {
        return true;
      }
    }

    // Check for large base64 strings
    if (typeof item === "object" && item !== null) {
      for (const value of Object.values(item)) {
        if (typeof value === "string" && value.length > 10000) {
          if (/^[A-Za-z0-9+/]+=*$/.test(value.slice(0, 1000))) {
            return true;
          }
        }
      }
    }

    return false;
  });
}

/**
 * Get the temp directory path for binary files
 */
export function getBinaryTempDir(): string {
  return BINARY_TEMP_DIR;
}
