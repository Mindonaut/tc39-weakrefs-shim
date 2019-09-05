import { describe } from "../../tests/setup.js";
import { shouldBehaveAsFinalizationGroupAccordingToSpec } from "../tests/FinalizationGroup.shared.js";
import { shouldBehaveAsWeakRefAccordingToSpec } from "../tests/WeakRef.shared.js";
import { gc, gcAvailable } from "../../tests/collector-helper.js";
import available from "./available.js";

if (available)
    describe("Weakrefs node stub", function() {
        const shimDetails = import("./stub.js").then(exports => ({
            gc,
            ...exports,
        }));

        shouldBehaveAsWeakRefAccordingToSpec(shimDetails, gcAvailable);
        shouldBehaveAsFinalizationGroupAccordingToSpec(
            shimDetails,
            gcAvailable
        );
    });
