import { createServer } from "./http.mjs";
import { listenAddress, writeMiniappConfig } from "./address.mjs";

let server;
try {
    const address = listenAddress(process.env);
    server = createServer(process.env);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(address.port, address.host, resolve);
    });
    // A failed bind must not replace the config for an already-running backend.
    await writeMiniappConfig(address);
    process.stdout.write(`Demo backend listening on ${address.baseUrl}${address.host === "127.0.0.1" ? " (loopback only)" : " (private-network debug only)"}. Miniapp address generated; recompile or update the phone preview.\n`);
} catch (error) {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    process.stderr.write(`Demo backend startup failed (${error.code || "CONFIG"}). Check DEMO_LAN_HOST, DEMO_PORT and write access to miniprogram/packages/rebate/config.\n`);
    process.exitCode = 1;
}
