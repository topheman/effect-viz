import { Cause, Context, Duration, Effect, Exit, FiberId, Layer } from "effect";
function randomUUID() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return generateUUIDv4();
}
function generateUUIDv4() {
	if (typeof crypto !== "undefined" && crypto.getRandomValues) {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		bytes[6] = bytes[6] & 15 | 64;
		bytes[8] = bytes[8] & 63 | 128;
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		return (c === "x" ? r : r & 3 | 8).toString(16);
	});
}
var TraceEmitter = class extends Context.Tag("TraceEmitter")() {};
const emitStart = (id, label) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		yield* emit({
			type: "effect:start",
			id,
			label,
			timestamp: Date.now()
		});
	});
};
const emitEnd = (id, result, value, error) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		yield* emit({
			type: "effect:end",
			id,
			result,
			value,
			error,
			timestamp: Date.now()
		});
	});
};
const emitRetry = (id, label, attempt, lastError) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		yield* emit({
			type: "retry:attempt",
			id,
			label,
			attempt,
			lastError,
			timestamp: Date.now()
		});
	});
};
const emitFinalizer = (id, label) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		yield* emit({
			type: "finalizer",
			id,
			label,
			timestamp: Date.now()
		});
	});
};
const emitAcquire = (id, label, result, error) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		yield* emit({
			type: "acquire",
			id,
			label,
			result,
			error,
			timestamp: Date.now()
		});
	});
};
const withTrace = (effect, label) => {
	const id = randomUUID();
	return Effect.gen(function* () {
		yield* emitStart(id, label);
		return yield* effect.pipe(Effect.onExit((exit) => Exit.isSuccess(exit) ? emitEnd(id, "success", exit.value) : emitEnd(id, "failure", void 0, Cause.squash(exit.cause))));
	});
};
const makeTraceEmitterLayer = (onEmit) => {
	return Layer.succeed(TraceEmitter, { emit: (event) => Effect.sync(() => onEmit(event)) });
};
const forkWithTrace = (effect, label) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		const parentFiberId = yield* Effect.fiberId;
		const parentId = FiberId.threadName(parentFiberId);
		const fiber = yield* Effect.fork(effect.pipe(Effect.onExit((exit) => Effect.gen(function* () {
			const childFiberId = yield* Effect.fiberId;
			const childId = FiberId.threadName(childFiberId);
			yield* emit({
				type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
				fiberId: childId,
				timestamp: Date.now()
			});
		}))));
		yield* emit({
			type: "fiber:fork",
			fiberId: FiberId.threadName(fiber.id()),
			parentId,
			label,
			timestamp: Date.now()
		});
		return fiber;
	});
};
const runProgramWithTrace = (program, label) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		const rootFiberId = yield* Effect.fiberId;
		const rootId = FiberId.threadName(rootFiberId);
		yield* emit({
			type: "fiber:fork",
			fiberId: rootId,
			label,
			timestamp: Date.now()
		});
		return yield* program.pipe(Effect.onExit((exit) => emit({
			type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
			fiberId: rootId,
			timestamp: Date.now()
		})));
	});
};
const sleepWithTrace = (duration) => {
	return Effect.gen(function* () {
		const { emit } = yield* TraceEmitter;
		const currentFiberId = yield* Effect.fiberId;
		const fiberId = FiberId.threadName(currentFiberId);
		yield* emit({
			type: "sleep:start",
			fiberId,
			duration: Duration.toMillis(Duration.decode(duration)),
			timestamp: Date.now()
		});
		yield* Effect.sleep(duration);
		yield* emit({
			type: "sleep:end",
			fiberId,
			timestamp: Date.now()
		});
	});
};
function retryWithTrace(effect, options) {
	const id = randomUUID();
	return Effect.gen(function* () {
		yield* emitStart(id, options.label);
		let attempt = 1;
		const maxAttempts = 1 + options.maxRetries;
		while (true) {
			const exit = yield* Effect.exit(effect);
			if (Exit.isSuccess(exit)) {
				yield* emitEnd(id, "success", exit.value);
				return exit.value;
			}
			const lastError = Cause.squash(exit.cause);
			if (attempt >= maxAttempts) {
				yield* emitEnd(id, "failure", void 0, lastError);
				return yield* Effect.fail(exit.cause);
			}
			yield* emitRetry(id, options.label, attempt, lastError);
			attempt++;
		}
	});
}
function addFinalizerWithTrace(finalizer, label) {
	return Effect.gen(function* () {
		return yield* Effect.addFinalizer((exit) => Effect.gen(function* () {
			yield* emitFinalizer(randomUUID(), label);
			yield* finalizer(exit);
		}));
	});
}
function acquireReleaseWithTrace(acquire, release, label) {
	return Effect.gen(function* () {
		const id = randomUUID();
		const resource = yield* acquire.pipe(Effect.onExit((exit) => Exit.isSuccess(exit) ? emitAcquire(id, label, "success") : emitAcquire(id, label, "failure", Cause.squash(exit.cause))));
		yield* addFinalizerWithTrace((exit) => Effect.asVoid(release(resource, exit)), `${label}:release`);
		return resource;
	});
}
export { acquireReleaseWithTrace, addFinalizerWithTrace, forkWithTrace, makeTraceEmitterLayer, retryWithTrace, runProgramWithTrace, sleepWithTrace, withTrace };
