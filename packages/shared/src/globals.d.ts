// structuredClone exists in browsers and Node 17+. Declared here so the shared package needs neither DOM nor Node types.
declare function structuredClone<T>(value: T): T;
