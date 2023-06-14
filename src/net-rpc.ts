import * as net from "net";
import { Pushable, pushable } from "it-pushable";

import { JSONRPCPeer } from "./JSONRPCPeer.js";
import { parseSocket } from "./utils.js";

export interface NetServer {
	rpc: JSONRPCPeer<number>
	server: net.Server
	close: () => Promise<void>
}

export interface NetClient {
	rpc: JSONRPCPeer<void>
	client: net.Socket
	close: () => void
}

export const createNetClient = (path: string): NetClient => {
	const client = net.connect({ path });
	const writer = pushable<unknown>({ objectMode: true });

	const rpc = new JSONRPCPeer(async request => {
		writer.push(request);
	});

	const close = () => {
		writer.end();
		client.destroy();
	};

	(async () => {
		try {
			for await (const data of parseSocket(writer, client)) {
				rpc.receiveAndSend(data);
			}
		} catch (error) {
			// Ignore errors because we will close immediately after.
			console.error(error);
		}

		close();
	})();

	return { rpc, client, close };
};

export const createNetServer = async (path: string): Promise<NetServer> => {
	const sockets = new Map<number, net.Socket>();
	const writers = new Map<number, Pushable<unknown>>();

	const generateId: () => number = (() => {
		let id = 0;

		return () => id++ % 65536;
	})();

	const rpc = new JSONRPCPeer(
		async (request, id: number) => {
			const writer = writers.get(id);

			if (writer == null) {
				throw new Error("invalid client ID");
			}

			writer.push(request);
		}
	);

	const server = net.createServer(async (socket) => {
		const id = generateId();
		const writer = pushable({ objectMode: true });

		sockets.set(id, socket);
		writers.set(id, writer);

		try {
			for await (const data of parseSocket(writer, socket)) {
				rpc.receiveAndSend(data, id, id);
			}
		} catch (error) {
			// Ignore errors because we will close immediately after.
			console.error(error);
		}

		// Socket was closed
		writer.end();
		socket.destroy();

		sockets.delete(id);
		writers.delete(id);
	});

	const close = async () => {
		await new Promise<void>((resolve, reject) => {
			server.close(error => error ? reject(error) : resolve());

			for (const [id, writer] of writers.entries()) {
				writer.end();
				writers.delete(id);
			}

			for (const [id, socket] of sockets.entries()) {
				socket.destroy();
				sockets.delete(id);
			}
		});
	};

	await new Promise<void>(resolve => server.listen(path, resolve));

	return { rpc, server, close };
};
