import { createServer } from "./http.mjs";

const port = Number(process.env.DEMO_PORT || 8787);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    process.stderr.write("DEMO_PORT must be a valid port.\n");
    process.exitCode = 1;
} else {
    createServer(process.env).listen(port, "127.0.0.1", () => {
        process.stdout.write(`Demo backend listening on http://127.0.0.1:${port} (loopback only).\n`);
    });
}
