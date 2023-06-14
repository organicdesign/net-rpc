import { JSONRPCServerAndClient, JSONRPCServer, JSONRPCClient } from "json-rpc-2.0";
import { Pushable, pushable } from "it-pushable";

const ITERATION_METHOD = "rpc.iterable.next";
const ITERATION_END = "rpc.iterable.end";

export class JSONRPCPeer<ID extends number | void = void> extends JSONRPCServerAndClient<ID, ID> {
	private readonly tasks = new Map<number, Pushable<unknown>>();

	private id = 0;

	constructor (send: (request: unknown, id: ID) => Promise<void>) {
		super(
			new JSONRPCServer(),
			new JSONRPCClient(send)
		);

		this.addMethod(ITERATION_END, ({ id }: { id: number }) => {
			const task = this.tasks.get(id);

			if (task == null) {
				throw new Error("Invalid task.");
			}

			this.tasks.delete(id);
			task.end();
		});

		this.addMethod(ITERATION_METHOD, ({ id, value }: { id: number, value: unknown }) => {
			const task = this.tasks.get(id);

			if (task == null) {
				throw new Error("Invalid task.");
			}

			task.push(value);
		});
	}

	addTask <T extends unknown, I extends unknown>(name: string, itr: (params: T) => AsyncIterable<I> | Iterable<I>) {
		this.addMethod(name, ({ id: clientId, params } : { id: number, params: T }, id: ID) => {
			(async () => {
				for await (const value of itr(params)) {
					this.notify(ITERATION_METHOD, { id: clientId, value }, id);
				}

				this.notify(ITERATION_END, { id: clientId }, id);
			})();

			return id;
		});
	}

	runTask (task: string, params: unknown, connection: ID): AsyncIterable<unknown> {
		const id = this.generateId();
		const itr = pushable<unknown>({ objectMode: true });

		this.tasks.set(id, itr);

		this.notify(task, { id, params }, connection);

		return itr;
	}

	private generateId () {
		return ++this.id % 65536;
	}
}
