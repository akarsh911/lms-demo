'use client';

import * as React from 'react';

import { useLabFeatures } from '@labs/hooks/query/use-lab-features';
import { labFeature, type LabFeatureFlags, type LabFeatureName } from '@labs/types/labs';

/**
 * WHICH TEACHING LAYERS THIS BENCH IS RUNNING WITH.
 *
 * An administrator's decision, arriving from the lab engine's service. Not a
 * CAS feature key: CAS decides whether the labs widget exists at all, this
 * decides what is inside one.
 *
 * The contract every caller must keep is the one the spec states — GUARD THE
 * RENDER, NOT THE HANDLER. A flag that is off means the control is never
 * rendered, its state is never built, and its code path is never entered, so a
 * student cannot tell the feature exists. Disabling a button is not enough:
 * it tells the student there is something they are not being given.
 *
 * Unknown and absent flags are ON, so a bench never loses a layer because the
 * front end and the service disagree about what exists yet.
 */
const Ctx = React.createContext<LabFeatureFlags>({});

export function LabFeaturesProvider({
  bench,
  pending = null,
  children,
}: {
  bench: string;
  /** Shown until the flags are known. */
  pending?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const { data, isPending } = useLabFeatures(bench);
  // Identity matters: every `useLabFeature` below re-reads on a new object.
  const flags = data?.features;
  const value = React.useMemo(() => flags ?? {}, [flags]);

  // Children do not mount until the answer is in. A bench decides at its very
  // first render whether to open the tutorial, so a flag arriving one render
  // later would mean the tour had already started — the feature's code path
  // entered, which is the one thing a flag that is off must never allow. A
  // request that FAILS settles too, and everything runs, as `labFeature` says.
  if (isPending) return <>{pending}</>;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** One flag. Everything is on until the service says otherwise. */
export function useLabFeature(name: LabFeatureName): boolean {
  return labFeature(React.useContext(Ctx), name);
}

/** All of them, for a component that reads several. */
export function useLabFeatureFlags(): LabFeatureFlags {
  return React.useContext(Ctx);
}
