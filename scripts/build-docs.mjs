import { readFile, writeFile } from "node:fs/promises";
import { Marked } from "marked";

const root = new URL("../", import.meta.url);
const source = "skills/huigou-saas-skills/references/guide.md";
const output = new URL("使用说明.html", root);
const guide = await readFile(new URL(source, root), "utf8");
const include = "<!-- include:capabilities.md -->";
if (guide.split(include).length !== 2) {
    throw new Error("guide.md 必须包含一个功能导航引用：" + include);
}
const capabilities = await readFile(new URL("capabilities.md", new URL(source, root)), "utf8");
const markdown = guide.replace(include, () => capabilities);
const template = await readFile(new URL("scripts/guide-template.html", root), "utf8");
const repo = "https://github.com/shanjing-inc/huigou-saas-demo/blob/master/";
const sections = [];
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const renderer = new Marked({
    renderer: {
        heading({ tokens, depth, text }) {
            const id = `section-${sections.length + 1}`;
            if (depth === 2) sections.push({ id, text });
            return `<h${depth}${depth === 2 ? ` id="${id}"` : ""}>${this.parser.parseInline(tokens)}</h${depth}>\n`;
        },
        link({ href, title, tokens }) {
            // The exported HTML can travel alone; resolve local references to the repository.
            const url = /^(?:https?:|mailto:|#)/.test(href)
                ? href : new URL(href, repo + source).href;
            return `<a href="${escape(url)}"${title ? ` title="${escape(title)}"` : ""}>${this.parser.parseInline(tokens)}</a>`;
        },
    },
});
const content = renderer.parse(markdown);
const nav = sections.map(({ id, text }) => `<a href="#${id}">${escape(text)}</a>`).join("\n");
const html = template.replace("<!-- NAV -->", () => nav).replace("<!-- CONTENT -->", () => content);

if (process.argv.includes("--check")) {
    const existing = await readFile(output, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "";
        throw error;
    });
    if (existing !== html) {
        console.error("使用说明.html 未同步。请运行 pnpm docs:build 并提交生成文件。");
        process.exitCode = 1;
    } else {
        console.log("文档同步检查通过。");
    }
} else {
    await writeFile(output, html);
    console.log("已从 guide.md 生成 使用说明.html。");
}
