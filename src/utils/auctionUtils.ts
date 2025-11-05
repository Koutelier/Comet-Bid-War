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
  DEV_FEE_PERCENT,
  GRACE_PERIOD,
  MAX_BIDS_PER_ROUND,
  COMET_ENTRY_FEE,
  ERG_ENTRY_FEE
} from "@/constants";
import { AssetPriceRates } from "@/services/assetPricingService";
import { StateTokenMetadata } from "@/stories";
import { decimalizeBigNumber, getNetworkType } from "@/utils/otherUtils";

export type AuctionStatus = "active" | "grace_period" | "ended" | "claimable" | "claimed";

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

  // V3 New Fields
  bidCount: number;
  maxBids: number;
  lastBidHeight: number;
  blocksSinceLastBid: number;
  timeSinceLastBid: string;
  winnerClaimed: boolean;
  graceDeadline: number;
  blocksUntilGraceEnd: number;
  graceTimeRemaining: string;
  minCometBid: BigNumber;
  minErgBid: BigNumber;
  minCometBidFormatted: string;
  minErgBidFormatted: string;
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
  // Parse V2 registers
  const bidDeadline = parseOr<number>(box.additionalRegisters.R4, 0);
  const lastBidderPK = box.additionalRegisters.R5 || "";
  const lastBidder = lastBidderPK
    ? ErgoAddress.fromPublicKey(lastBidderPK.substring(4)).encode(getNetworkType())
    : "";

  // Parse V3 registers (with defaults for backwards compatibility)
  const bidCount = parseOr<number>(box.additionalRegisters.R6, 0);
  const lastBidHeight = parseOr<number>(box.additionalRegisters.R7, currentHeight);
  const winnerClaimedFlag = parseOr<number>(box.additionalRegisters.R8, 0);

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

  // Calculate winnable amounts (total minus base that stays in contract)
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

  // V3: Calculate minimum bid increments (10% of winnable pot)
  const minCometBidBigInt = winnableCometAmount > 0n
    ? ((winnableCometAmount * 10n) / 100n > COMET_ENTRY_FEE
      ? (winnableCometAmount * 10n) / 100n
      : COMET_ENTRY_FEE)
    : COMET_ENTRY_FEE;

  const minErgBidBigInt = winnableErgAmount > 0n
    ? ((winnableErgAmount * 10n) / 100n > ERG_ENTRY_FEE
      ? (winnableErgAmount * 10n) / 100n
      : ERG_ENTRY_FEE)
    : ERG_ENTRY_FEE;

  const minCometBid = decimalizeBigNumber(BigNumber(minCometBidBigInt.toString()), COMET_DECIMALS);
  const minErgBid = decimalizeBigNumber(BigNumber(minErgBidBigInt.toString()), ERG_DECIMALS);

  // V3: Calculate grace period information
  const bidDeadlineNum = typeof bidDeadline === 'bigint' ? Number(bidDeadline) : bidDeadline;
  const gracePeriodNum = typeof GRACE_PERIOD === 'bigint' ? Number(GRACE_PERIOD) : GRACE_PERIOD;
  const maxBidsNum = typeof MAX_BIDS_PER_ROUND === 'bigint' ? Number(MAX_BIDS_PER_ROUND) : MAX_BIDS_PER_ROUND;
  const graceDeadline = bidDeadlineNum + gracePeriodNum;

  const blocksRemaining = Math.max(0, bidDeadlineNum - currentHeight);
  const blocksUntilGraceEnd = Math.max(0, graceDeadline - currentHeight);

  // V3: Calculate time since last bid
  const lastBidHeightNum = typeof lastBidHeight === 'bigint' ? Number(lastBidHeight) : lastBidHeight;
  const blocksSinceLastBid = Math.max(0, currentHeight - lastBidHeightNum);
  const timeSinceLastBid = blocksToTime(blocksSinceLastBid);

  // V3: Determine auction status (includes grace period and claimed states)
  let status: AuctionStatus;
  if (blocksRemaining > 0) {
    status = "active";
  } else if (blocksUntilGraceEnd > 0 && winnerClaimedFlag === 0) {
    status = "grace_period"; // Ended but in grace period, winner can claim
  } else if (winnerClaimedFlag === 1) {
    status = "claimed"; // Winner has claimed
  } else if (lastBidder && ownAddresses.includes(lastBidder)) {
    status = "claimable"; // User is winner and can claim
  } else {
    status = "ended"; // Ended, not claimed, user is not winner
  }

  // Calculate time remaining
  const timeRemaining = blocksToTime(blocksRemaining);
  const graceTimeRemaining = blocksToTime(blocksUntilGraceEnd);

  // Check if user is the last bidder
  const isUserLastBidder = lastBidder ? ownAddresses.includes(lastBidder) : false;

  return {
    box: box, // Don't freeze - Fleet SDK needs mutable box for transactions
    bidDeadline: bidDeadlineNum, // Use converted number
    lastBidder,
    cometPot,
    ergPot,
    devFee,
    winnerPrize,
    totalValueUSD: totalValueUSD.isGreaterThan(0) ? totalValueUSD : undefined,
    status,
    blocksRemaining,
    timeRemaining,
    isUserLastBidder,

    // V3 New Fields
    bidCount,
    maxBids: maxBidsNum,
    lastBidHeight: lastBidHeightNum,
    blocksSinceLastBid,
    timeSinceLastBid,
    winnerClaimed: winnerClaimedFlag === 1,
    graceDeadline,
    blocksUntilGraceEnd,
    graceTimeRemaining,
    minCometBid,
    minErgBid,
    minCometBidFormatted: formatCometAmount(minCometBid),
    minErgBidFormatted: formatErgAmount(minErgBid)
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
