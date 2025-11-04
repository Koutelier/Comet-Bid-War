import { Network } from "@fleet-sdk/common";
import { RECOMMENDED_MIN_FEE_VALUE } from "@fleet-sdk/core";
import { getNetworkType } from "./utils";

export const ERG_TOKEN_ID = "ERG";
export const MIN_FEE = RECOMMENDED_MIN_FEE_VALUE * 2n;
export const ERG_DECIMALS = 9;
export const EXPLORER_URL =
  getNetworkType() === Network.Mainnet
    ? "https://explorer.ergoplatform.com/"
    : "https://testnet.ergoplatform.com/";

// COMET Auction Contract V2 Constants
export const COMET_TOKEN_ID = "0cd8c9f416e5b1ca9f986a7f10a84191dfb85941619e49e53c0dc30ebf83324b";
export const COMET_ENTRY_FEE = 100000n; // 0.1 COMET
export const ERG_ENTRY_FEE = 1000000000n; // 1 ERG
export const BID_DURATION = 360n; // blocks (~12 hours)
export const MIN_BOX_VALUE = 1000000n; // 0.001 ERG
export const BASE_COMET_AMOUNT = 1n; // 1 unit of COMET
export const BASE_ERG_AMOUNT = MIN_BOX_VALUE; // 0.001 ERG
export const DEV_FEE_PERCENT = 5n; // 5%
export const COMET_DECIMALS = 0; // COMET has 0 decimals

// Contract addresses (public keys)
export const OWNER_PK = "9f1Ljmvb5Lt9735AGLUvRydbaiaREutTkiB6LcFU9JNrydP56wE";
export const BOT_PK = "9fpouCDMTYxU4ZU4CRfgnZaQRf7iV9KCiDPx2Xtxh1z7DqmbqgJ";
