import { Hono } from "hono";
import type { FC } from "hono/jsx";

const Welcome: FC = () => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Deno Hono R2</title>
    </head>
    <body>
      <main>
        <h1>Deno Hono R2</h1>
        <p>Welcome to the Deno Deploy object storage API.</p>
      </main>
    </body>
  </html>
);

const welcome = new Hono().get("/", (c) => c.html(<Welcome />));

export default welcome;
