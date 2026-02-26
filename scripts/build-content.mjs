import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import slugify from "slugify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const blogContentDir = path.join(rootDir, "content", "blog");
const blogOutDir = path.join(rootDir, "blog");
const dataOutPath = path.join(rootDir, "data", "blog-index.json");
const templatePath = path.join(rootDir, "templates", "post.html");

marked.setOptions({
  gfm: true,
  breaks: false
});

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTextPost(text) {
  const cleaned = text.trim();
  if (!cleaned) {
    return "<p></p>";
  }

  return cleaned
    .split(/\n\s*\n/g)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function renderMarkdownPost(text) {
  const parsed = marked.parse(text);
  return sanitizeHtml(parsed, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6"
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"]
    }
  });
}

function buildPostHtml(template, { title, date, contentHtml }) {
  return template
    .replaceAll("%%TITLE%%", escapeHtml(title))
    .replaceAll("%%DATE%%", escapeHtml(date))
    .replace("%%CONTENT%%", contentHtml);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanGeneratedPostDirs() {
  const entries = await fs.readdir(blogOutDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => fs.rm(path.join(blogOutDir, entry.name), { recursive: true, force: true }))
  );
}

async function build() {
  await ensureDir(blogContentDir);
  await ensureDir(blogOutDir);
  await ensureDir(path.dirname(dataOutPath));

  const template = await fs.readFile(templatePath, "utf8");
  const entries = await fs.readdir(blogContentDir, { withFileTypes: true });
  const postFiles = entries
    .filter((entry) => entry.isFile() && /\.(md|txt)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  await cleanGeneratedPostDirs();

  const slugSet = new Set();
  const posts = [];

  for (const fileName of postFiles) {
    const filePath = path.join(blogContentDir, fileName);
    const raw = await fs.readFile(filePath, "utf8");
    const { data, content } = matter(raw);

    const title = data.title;
    const date = data.date;
    const summary = data.summary;

    if (!title || !date || !summary) {
      throw new Error(`Missing required metadata in ${fileName}. Required: title, date, summary.`);
    }
    if (!isValidDate(String(date))) {
      throw new Error(`Invalid date in ${fileName}. Use YYYY-MM-DD.`);
    }

    const explicitSlug = typeof data.slug === "string" ? data.slug.trim() : "";
    const fallbackSlugSource = path.basename(fileName, path.extname(fileName));
    const slug = slugify(explicitSlug || fallbackSlugSource, { lower: true, strict: true, trim: true });

    if (!slug) {
      throw new Error(`Could not derive a valid slug for ${fileName}.`);
    }
    if (slugSet.has(slug)) {
      throw new Error(`Duplicate slug \"${slug}\" detected. Check ${fileName}.`);
    }
    slugSet.add(slug);

    const isMarkdown = fileName.toLowerCase().endsWith(".md");
    const bodyHtml = isMarkdown ? renderMarkdownPost(content) : renderTextPost(content);
    const postHtml = buildPostHtml(template, {
      title: String(title).trim(),
      date: String(date).trim(),
      contentHtml: bodyHtml
    });

    const postDir = path.join(blogOutDir, slug);
    await ensureDir(postDir);
    await fs.writeFile(path.join(postDir, "index.html"), postHtml, "utf8");

    posts.push({
      title: String(title).trim(),
      slug,
      date: String(date).trim(),
      summary: String(summary).trim(),
      url: `blog/${slug}/`
    });
  }

  posts.sort((a, b) => b.date.localeCompare(a.date));

  await fs.writeFile(
    dataOutPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        posts
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`Built ${posts.length} blog post(s).`);
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
