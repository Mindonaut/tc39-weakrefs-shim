import { setImmediate } from "../src/utils/tasks/setImmediate.js";
import { available as weakrefsAvailable } from "../src/index.js";
import globalWeakrefsAvailable from "../src/global/available.js";
import nodeStubAvailable from "../src/node/available.js";

import { FinalizationGroup } from "../src/weakrefs.js";

declare const gc: () => void;

type Holdings = (collected: true) => void;

function taskTurn(): Promise<undefined> {
    return new Promise(resolve => setImmediate(resolve));
}

function makeObserver(): [Promise<true>, Holdings] {
    let resolve: Holdings;
    const collected = new Promise<true>(r => void (resolve = r));
    return [collected, resolve!];
}

export function getTimeoutCanceller(timeout: number): Promise<false> {
    return new Promise(resolve => setTimeout(() => resolve(false), timeout));
}

export function makeGcOf(
    gc: () => void,
    FinalizationGroup: FinalizationGroup.Constructor
) {
    const finalizationGroup = new FinalizationGroup<Holdings>(resolvers => {
        for (const resolve of resolvers) {
            resolve(true);
        }
    });

    return async function gcOfWithCancellation(
        target?: object,
        cancelPromise?: Promise<false>
    ): Promise<boolean> {
        // Avoid creating a closure which may captures target
        const [collected, holding] = makeObserver();
        finalizationGroup.register(target || {}, holding);
        target = undefined;

        // Need to run gc on next task, as it often cannot run multiple times per task
        // Also need to allow caller to remove its own target references before calling gc
        await taskTurn();
        gc();
        const result = await Promise.race(
            cancelPromise ? [collected, cancelPromise] : [collected]
        );

        // Make sure the client's finalization own callback has been called
        await taskTurn();

        return result;
    };
}

export function makeAggressiveGcOf(
    gc: () => void,
    FinalizationGroup: FinalizationGroup.Constructor
) {
    const finalizationGroup = new FinalizationGroup<Holdings>(resolvers => {
        for (const resolve of resolvers) {
            resolve(true);
        }
    });

    return async function gcOfWithCancellation(
        target?: object,
        cancelPromise?: Promise<false>
    ): Promise<boolean> {
        const [collected, holding] = makeObserver();
        finalizationGroup.register(target || {}, holding);
        target = undefined;

        let result: boolean | undefined;
        // Careful to no move the await into the while body
        // see https://bugs.chromium.org/p/v8/issues/detail?id=9101
        while (
            (result = await Promise.race(
                cancelPromise
                    ? [collected, cancelPromise, taskTurn()]
                    : [collected, taskTurn()]
            )) === undefined
        ) {
            gc();
        }

        // Make sure the client's finalization own callback has been called
        await taskTurn();

        return result;
    };
}

export function gcTask() {
    return new Promise<void>(resolve =>
        setImmediate(() => {
            if (gcAvailable) gc();
            resolve();
        })
    );
}

export const gcAvailable = typeof gc == "function";

const globalGc = gcAvailable ? gc : undefined;
export { globalGc as gc };

// Uses any shim available
export const gcOfPromise =
    gcAvailable && weakrefsAvailable
        ? (async () => {
              const { FinalizationGroup } = await import("../src/index.js");

              return makeGcOf(gc, FinalizationGroup);
          })()
        : undefined;

// Uses the primitives of the platform
// Or the shim if available
export const gcOfRawPromise =
    weakrefsAvailable && gcAvailable
        ? (async () => {
              let weakrefs;
              if (globalWeakrefsAvailable) {
                  weakrefs = import("../src/global/index.js");
              } else if (nodeStubAvailable) {
                  weakrefs = import("../src/node/stub.js");
              } else if (weakrefsAvailable) {
                  weakrefs = import("../src/index.js");
              } else {
                  throw new Error("Implementation not available");
              }

              const { FinalizationGroup } = await weakrefs;

              return makeGcOf(gc, FinalizationGroup);
          })()
        : undefined;
