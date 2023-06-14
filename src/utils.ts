import { pipe } from "it-pipe";
import * as lp from "it-length-prefixed";
import { map, writeToStream } from "streaming-iterables";
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from "uint8arrays";
import type { Uint8ArrayList } from "uint8arraylist";
import type { Duplex } from "stream";

export const toUint8Array = map((value: string) => uint8ArrayFromString(value));
export const fromUint8Array = map((value: Uint8Array) => uint8ArrayToString(value));
export const fromJSON = map((value: unknown) => JSON.stringify(value));
export const toJSON = map((value: string) => JSON.parse(value));
export const toDiscrete = map((value: Uint8Array | Uint8ArrayList) => value.subarray());

export const parseSocket = (itr: Iterable<unknown> | AsyncIterable<unknown>, stream: Duplex): AsyncIterable<unknown> => {
	pipe(
		itr,
		fromJSON,
		toUint8Array,
		lp.encode,
		writeToStream(stream)
	).catch(error => {
		console.error(error);
		stream.destroy();
	});

	return pipe(
		stream,
		lp.decode,
		toDiscrete,
		fromUint8Array,
		toJSON
	);
};
