import { Box } from "@fleet-sdk/common";
import { ErgoAddress } from "@fleet-sdk/core";
import { parse } from "@fleet-sdk/serializer";
import BigNumber from "bignumber.js";
import {
  ERG_DECIMALS,
  ERG_TOKEN_ID,
  COMET_TOKEN_ID,
  COMET_DECIMALS,
  BASE_COMET_AMOUNT,
  BASE_ERG_AMOUNT,
  DEV_FEE_PERCENT
} from "@/constants";
import { AssetPriceRates } from "@/services/assetPricingService";
import { StateTokenMetadata } from "@/stories";
import { decimalizeBigNumber, getNetworkType } from "@/utils/otherUtils";

export type AuctionStatus = "active" | "ended" | "claimable";

export type AuctionData = {
  box: Readonly<Box<string>>;
  bidDeadline: number;
  lastBidder: string;
  cometPot: {
    total: BigNumber;
    winnable: BigNumber;
    base: BigNumber;
  };
  ergPot: {
    total: BigNumber;
    winnable: BigNumber;
    base: BigNumber;
  };
  devFee: {
    comet: BigNumber;
    erg: BigNumber;
  };
  winnerPrize: {
    comet: BigNumber;
    erg: BigNumber;
  };
  totalValueUSD?: BigNumber;
  status: AuctionStatus;
  blocksRemaining: number;
  timeRemaining: string;
  isUserLastBidder: boolean;
};

/**
 * Parse an auction box and extract all relevant information
 */
export function parseAuctionBox(
  box: Box<string>,
  metadata: StateTokenMetadata,
  priceRates: AssetPriceRates,
  currentHeight: number,
  ownAddresses: string[]
): AuctionData {
  // Parse registers
  const bidDeadline = parseOr<number>(box.additionalRegisters.R4, 0);
  const lastBidderPK = box.additionalRegisters.R5 || "";
  const lastBidder = lastBidderPK
    ? ErgoAddress.fromPublicKey(lastBidderPK.substring(4)).encode(getNetworkType())
    : "";

  // Parse COMET and ERG amounts - ensure explicit BigInt conversion
  // Box amounts might be string, number, or bigint from different sources
  const rawCometAmount = box.assets[0]?.amount ?? "0";
  const rawErgAmount = box.value ?? "0";

  const totalCometAmount = typeof rawCometAmount === 'bigint'
    ? rawCometAmount
    : BigInt(String(rawCometAmount));

  const totalErgAmount = typeof rawErgAmount === 'bigint'
    ? rawErgAmount
    : BigInt(String(rawErgAmount));

  // Ensure constants are BigInt (they're defined as bigint literals in constants.ts)
  const baseCometBigInt = typeof BASE_COMET_AMOUNT === 'bigint'
    ? BASE_COMET_AMOUNT
    : BigInt(String(BASE_COMET_AMOUNT));

  const baseErgBigInt = typeof BASE_ERG_AMOUNT === 'bigint'
    ? BASE_ERG_AMOUNT
    : BigInt(String(BASE_ERG_AMOUNT));

  const devFeePercentBigInt = typeof DEV_FEE_PERCENT === 'bigint'
    ? DEV_FEE_PERCENT
    : BigInt(String(DEV_FEE_PERCENT));

  // Now all operations are guaranteed to be BigInt to BigInt
  const winnableCometAmount = totalCometAmount - baseCometBigInt;
  const winnableErgAmount = totalErgAmount - baseErgBigInt;

  // Calculate dev fees (5% of winnable pot)
  const devCometFee = (winnableCometAmount * devFeePercentBigInt) / 100n;
  const devErgFee = (winnableErgAmount * devFeePercentBigInt) / 100n;

  // Calculate winner amounts (winnable - dev fee)
  const winnerCometAmount = winnableCometAmount - devCometFee;
  const winnerErgAmount = winnableErgAmount - devErgFee;

  // Convert to decimalized BigNumbers
  const cometPot = {
    total: decimalizeBigNumber(BigNumber(totalCometAmount.toString()), COMET_DECIMALS),
    winnable: decimalizeBigNumber(BigNumber(winnableCometAmount.toString()), COMET_DECIMALS),
    base: decimalizeBigNumber(BigNumber(baseCometBigInt.toString()), COMET_DECIMALS)
  };

  const ergPot = {
    total: decimalizeBigNumber(BigNumber(totalErgAmount.toString()), ERG_DECIMALS),
    winnable: decimalizeBigNumber(BigNumber(winnableErgAmount.toString()), ERG_DECIMALS),
    base: decimalizeBigNumber(BigNumber(baseErgBigInt.toString()), ERG_DECIMALS)
  };

  const devFee = {
    comet: decimalizeBigNumber(BigNumber(devCometFee.toString()), COMET_DECIMALS),
    erg: decimalizeBigNumber(BigNumber(devErgFee.toString()), ERG_DECIMALS)
  };

  const winnerPrize = {
    comet: decimalizeBigNumber(BigNumber(winnerCometAmount.toString()), COMET_DECIMALS),
    erg: decimalizeBigNumber(BigNumber(winnerErgAmount.toString()), ERG_DECIMALS)
  };

  // Calculate total value in USD
  const cometPriceUSD = priceRates[COMET_TOKEN_ID]?.fiat || 0;
  const ergPriceUSD = priceRates[ERG_TOKEN_ID]?.fiat || 0;
  const totalValueUSD = cometPot.total
    .times(cometPriceUSD)
    .plus(ergPot.total.times(ergPriceUSD));

  // Determine auction status
  const blocksRemaining = Math.max(0, bidDeadline - currentHeight);
  const status: AuctionStatus =
    blocksRemaining > 0 ? "active" : lastBidder && ownAddresses.includes(lastBidder) ? "claimable" : "ended";

  // Calculate time remaining
  const timeRemaining = blocksToTime(blocksRemaining);

  // Check if user is the last bidder
  const isUserLastBidder = lastBidder ? ownAddresses.includes(lastBidder) : false;

  return {
    box: Object.freeze(box),
    bidDeadline,
    lastBidder,
    cometPot,
    ergPot,
    devFee,
    winnerPrize,
    totalValueUSD: totalValueUSD.isGreaterThan(0) ? totalValueUSD : undefined,
    status,
    blocksRemaining,
    timeRemaining,
    isUserLastBidder
  };
}

/**
 * Convert blocks to human-readable time
 */
function blocksToTime(blocks: number): string {
  const minutes = blocks * 2; // ~2 minutes per block
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

/**
 * Parse a register value with a fallback
 */
function parseOr<T>(value: string | undefined, or: T): T {
  return parse<T>(value ?? "", "safe") ?? or;
}

/**
 * Format COMET amount for display
 */
export function formatCometAmount(amount: any): string {
  return new BigNumber(amount.toString()).toFormat(COMET_DECIMALS);
}

/**
 * Format ERG amount for display
 */
export function formatErgAmount(amount: any): string {
  return new BigNumber(amount.toString()).toFormat(ERG_DECIMALS > 3 ? 3 : ERG_DECIMALS); // Show up to 3 decimals for ERG
}

/**
 * Calculate the percentage of the pot that the dev fee represents
 */
export function calculateDevFeePercent(): number {
  return Number(DEV_FEE_PERCENT);
}
