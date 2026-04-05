import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

export function resolveBehaviorId(
  displayName: string,
  behaviors: GetBehaviorDetailsResponse[]
): number | undefined {
  return behaviors.find((b) => b.displayName === displayName)?.id;
}
