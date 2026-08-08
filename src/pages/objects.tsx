import { Hono } from "hono";
import type { FC } from "hono/jsx";

const ObjectsPage: FC = () => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Objects and uploads</title>
      <style>
        {`body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px}section{border:1px solid #ddd;border-radius:8px;padding:20px;margin:20px 0}button{margin:8px 0;padding:8px 14px}textarea{width:100%;min-height:120px}li{margin:8px 0}`}
      </style>
    </head>
    <body>
      <main>
        <h1>Objects and uploads</h1>
        <p>Try single and multipart uploads with a Lorem ipsum sample.</p>
        <section>
          <h2>Upload</h2>
          <textarea id="sample">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </textarea>
          <br />
          <button id="single" type="button">Upload single</button>
          <button id="multipart" type="button">Upload multipart</button>
          <button id="cleanup" type="button">Run cleanup</button>
          <p id="status" role="status"></p>
        </section>
        <section>
          <h2>Uploaded objects</h2>
          <ul id="objects"></ul>
        </section>
      </main>
      <script src="/objects.js"></script>
    </body>
  </html>
);

const clientScript = `
const status = document.querySelector("#status");
const objects = document.querySelector("#objects");
const saved = JSON.parse(localStorage.getItem("objects") || "[]");
function render() {
  objects.innerHTML = saved.map(({key}) => '<li><a href="/api/objects/' + encodeURIComponent(key).replaceAll("%2F", "/") + '" target="_blank">' + key + '</a></li>').join("") || "<li>No objects yet.</li>";
}
function add(key) {
  if (!saved.some((item) => item.key === key)) saved.push({key});
  localStorage.setItem("objects", JSON.stringify(saved));
  render();
}
async function upload(strategy) {
  const body = new TextEncoder().encode(document.querySelector("#sample").value);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  status.textContent = "Creating " + strategy + " upload...";
  const created = await fetch("/api/uploads", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({size:body.byteLength,contentType:"text/plain",contentDigest:digest,strategy})}).then((r) => r.json());
  if (strategy === "single") {
    await fetch(created.url, {method:"PUT",headers:{"content-type":"text/plain"},body});
  } else {
    const part = await fetch("/api/uploads/" + created.uploadId + "/parts/1", {method:"POST"}).then((r) => r.json());
    const uploaded = await fetch(part.url, {method:"PUT",body});
    await fetch("/api/uploads/" + created.uploadId + "/complete", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({parts:[{partNumber:1,etag:uploaded.headers.get("etag") || part.etag}]})});
  }
  add(created.key);
  status.textContent = "Upload complete.";
}
document.querySelector("#single").onclick = () => upload("single").catch((error) => status.textContent = error.message);
document.querySelector("#multipart").onclick = () => upload("multipart").catch((error) => status.textContent = error.message);
document.querySelector("#cleanup").onclick = async () => {
  status.textContent = "Running cleanup...";
  const response = await fetch("/api/uploads/cleanup", {method:"POST"});
  const result = await response.json();
  status.textContent = response.ok ? result.status : (result.error || "Cleanup unavailable.");
};
render();
`;

export const objectPageRoutes = new Hono()
  .get("/objects", (c) => c.html(<ObjectsPage />))
  .get("/objects.js", (c) =>
    c.body(clientScript, 200, {
      "content-type": "application/javascript; charset=utf-8",
    }));
