import { createServer, listenHost } from "./http.mjs";

const port = Number(process.env.DEMO_PORT || 8787);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    process.stderr.write("DEMO_PORT must be a valid port.\n");
    process.exitCode = 1;
} else {
    const host = listenHost(process.env);
    createServer(process.env).listen(port, host, () => {
        process.stdout.write(`Demo backend listening on http://${host}:${port}${host === "127.0.0.1" ? " (loopback only)" : " (private-network debug only)"}.\n`);
    });
}
