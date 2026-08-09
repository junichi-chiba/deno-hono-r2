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
const saved = [];
function render() {
  objects.innerHTML = saved.map(({key}) => '<li><a href="/api/objects/' + encodeURIComponent(key).replaceAll("%2F", "/") + '" target="_blank">' + key + '</a></li>').join("") || "<li>No objects yet.</li>";
}
function add(key) {
  if (!saved.some((item) => item.key === key)) saved.push({key});
  render();
}
function digestHex(bytes) {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
function digestBase64(bytes) {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    btoa(String.fromCharCode(...new Uint8Array(digest)))
  );
}
async function load() {
  const response = await fetch("/api/objects");
  if (!response.ok) throw new Error("Unable to load objects.");
  const loaded = await response.json();
  saved.push(...loaded);
  render();
}
async function upload(strategy) {
  const body = new TextEncoder().encode(document.querySelector("#sample").value);
  const digest = await digestHex(body);
  const checksumSHA256 = await digestBase64(body);
  status.textContent = "Creating " + strategy + " upload...";
  const createResponse = await fetch("/api/uploads", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({size:body.byteLength,contentType:"text/plain",contentDigest:digest,strategy})});
  const created = await createResponse.json();
  if (!createResponse.ok) throw new Error(created.error || "Unable to create upload.");
  if (strategy === "single") {
    const uploaded = await fetch(created.url, {method:"PUT",headers:{"content-type":"text/plain","x-amz-checksum-sha256":checksumSHA256},body});
    if (!uploaded.ok) throw new Error("Single upload failed.");
    const completed = await fetch("/api/uploads/" + created.uploadId + "/complete", {method:"POST"});
    if (!completed.ok) throw new Error("Single completion failed.");
    const result = await completed.json();
    if (result.status === "duplicate") {
      status.textContent = "Duplicate upload retained temporarily.";
      return;
    }
  } else {
    const partResponse = await fetch("/api/uploads/" + created.uploadId + "/parts/1", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contentDigest:digest})});
    const part = await partResponse.json();
    if (!partResponse.ok) throw new Error(part.error || "Unable to create upload part.");
    const uploaded = await fetch(part.url, {method:"PUT",headers:{"x-amz-checksum-sha256":part.checksumSHA256 || checksumSHA256},body});
    if (!uploaded.ok) throw new Error("Multipart upload failed.");
    const completed = await fetch("/api/uploads/" + created.uploadId + "/complete", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({parts:[{partNumber:1,etag:uploaded.headers.get("etag") || part.etag}]})});
    if (!completed.ok) throw new Error("Multipart completion failed.");
    const result = await completed.json();
    if (result.status === "duplicate") {
      status.textContent = "Duplicate upload retained temporarily.";
      return;
    }
  }
  add(created.key);
  status.textContent = "Upload complete.";
}
document.querySelector("#single").onclick = () => upload("single").catch((error) => status.textContent = error.message);
document.querySelector("#multipart").onclick = () => upload("multipart").catch((error) => status.textContent = error.message);
load().catch((error) => status.textContent = error.message);
`;

export const objectPageRoutes = new Hono()
  .get("/objects", (c) => c.html(<ObjectsPage />))
  .get("/objects.js", (c) =>
    c.body(clientScript, 200, {
      "content-type": "application/javascript; charset=utf-8",
    }));
