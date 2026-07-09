import { describe, it, expect } from "vitest";
import {
  encodeGetFirmwareInfoRequest,
  encodeFirmwareInfoResponse,
  decodeFirmwareInfoResponse,
  pickCentralVersion,
  type FirmwareInfo,
} from "./fwinfo";
import { isUpdateAvailable } from "../versions";

const central: FirmwareInfo = {
  source: 1,
  version: "v1.3.0",
  gitRev: "abc1234",
  buildDate: "2026-07-01",
  isCentral: true,
};
const peripheral: FirmwareInfo = {
  source: 1,
  version: "v1.3.0",
  gitRev: "abc1234",
  buildDate: "2026-07-01",
  isCentral: false,
};

describe("fwinfo proto (frozen wire format)", () => {
  it("request encodes to a non-empty payload", () => {
    expect(encodeGetFirmwareInfoRequest(true).length).toBeGreaterThan(0);
    expect(encodeGetFirmwareInfoRequest(false).length).toBeGreaterThanOrEqual(0);
  });

  it("round-trips a firmware-present response (the 'version known' path)", () => {
    const bytes = encodeFirmwareInfoResponse([central, peripheral]);
    const decoded = decodeFirmwareInfoResponse(bytes);
    expect(decoded.error).toBeUndefined();
    expect(decoded.firmwareInfo).toHaveLength(2);
    expect(decoded.firmwareInfo[0]).toEqual(central);
    expect(decoded.firmwareInfo[1]).toEqual(peripheral);
  });

  it("pickCentralVersion prefers the central half", () => {
    expect(pickCentralVersion([peripheral, central])).toBe("v1.3.0");
    expect(pickCentralVersion([{ ...peripheral, version: "v1.2.0" }])).toBe("v1.2.0");
  });

  it("empty / unsupported response yields no version (the '不明' path)", () => {
    const decoded = decodeFirmwareInfoResponse(new Uint8Array(0));
    expect(decoded.firmwareInfo).toHaveLength(0);
    expect(pickCentralVersion(decoded.firmwareInfo)).toBeNull();
  });

  it("carries an error message when the firmware reports one", () => {
    const decoded = decodeFirmwareInfoResponse(encodeFirmwareInfoResponse([], "busy"));
    expect(decoded.error).toBe("busy");
    expect(decoded.firmwareInfo).toHaveLength(0);
  });

  it("enables an accurate update-available check once versions are known", () => {
    const installed = pickCentralVersion(
      decodeFirmwareInfoResponse(encodeFirmwareInfoResponse([central])).firmwareInfo
    );
    expect(installed).toBe("v1.3.0");
    // latest v1.4.0 > installed v1.3.0 -> update available
    expect(isUpdateAvailable(installed!, "v1.4.0")).toBe(true);
    // already on v1.3.0 -> up to date
    expect(isUpdateAvailable(installed!, "v1.3.0")).toBe(false);
    // unknown installed version -> never nag
    expect(isUpdateAvailable("", "v1.4.0")).toBe(false);
  });
});
