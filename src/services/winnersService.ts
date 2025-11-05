import { graphQLService, Transaction } from "./graphqlService";
import { COMET_AUCTION_CONTRACT } from "@/offchain/plugins";
import { COMET_TOKEN_ID, COMET_DECIMALS, ERG_DECIMALS, OWNER_PK, BOT_PK } from "@/constants";
import { ErgoAddress } from "@fleet-sdk/core";
import { getNetworkType } from "@/utils/otherUtils";
import BigNumber from "bignumber.js";

export type WinnerRecord = {
  round: number;
  winner: string;
  cometWon: string;
  ergWon: string;
  timestamp: string;
  txId: string;
  height: number;
  cometWonRaw: bigint;
  ergWonRaw: bigint;
};

export type WinnersStats = {
  totalRounds: number;
  totalCometVolume: string;
  totalErgVolume: string;
  uniqueWinners: number;
};

export type LeaderboardEntry = {
  address: string;
  totalWins: number;
  totalComet: string;
  totalErg: string;
  lastWinTimestamp: string;
};

/**
 * Fetch all historical auction winners from the blockchain
 */
export async function fetchHistoricalWinners(): Promise<WinnerRecord[]> {
  console.log("🔍 Fetching historical winners from blockchain...");

  // TODO: The GraphQL API doesn't support querying transactions by "spent" argument
  // We need to implement an alternative approach using the Ergo Explorer API
  // For now, return empty array to avoid errors
  console.log("⚠️ Transaction history query not yet implemented - GraphQL API limitation");

  return [];

  /* DISABLED UNTIL WE FIND CORRECT API
  const winners: WinnerRecord[] = [];
  let offset = 0;
  const limit = 100;
  let roundNumber = 0;

  try {
    // Fetch transactions in batches
    while (true) {
      const transactions = await graphQLService.getTransactions(
        [COMET_AUCTION_CONTRACT],
        offset,
        limit
      );

      console.log(`📦 Fetched ${transactions.length} transactions at offset ${offset}`);

      if (transactions.length === 0) {
        break;
      }

      // Parse each transaction to extract winner data
      for (const tx of transactions) {
        const winnerData = parseWinnerTransaction(tx, roundNumber);
        if (winnerData) {
          winners.push(winnerData);
          roundNumber++;
        }
      }

      // If we got fewer transactions than the limit, we've reached the end
      if (transactions.length < limit) {
        break;
      }

      offset += limit;
    }

    console.log(`✅ Found ${winners.length} historical winners`);

    // Sort by height (most recent first)
    winners.sort((a, b) => b.height - a.height);

    // Update round numbers to be sequential (most recent = highest round)
    winners.forEach((winner, index) => {
      winner.round = winners.length - index;
    });

    return winners;
  } catch (error) {
    console.error("❌ Error fetching historical winners:", error);
    throw error;
  }
  */
}

/**
 * Parse a transaction to extract winner information
 * Returns null if this is not an auto-distribute transaction
 */
function parseWinnerTransaction(tx: Transaction, roundNumber: number): WinnerRecord | null {
  try {
    // Check if this is an auto-distribute transaction
    // Auto-distribute transactions have:
    // - Input: Auction contract box
    // - Output 0: New auction contract box (reset to base amounts)
    // - Output 1: Winner box (with prizes)
    // - Output 2: Dev fee box

    const hasAuctionInput = tx.inputs.some((input) => input.ergoTree === COMET_AUCTION_CONTRACT);
    const hasAuctionOutput = tx.outputs.some((output) => output.ergoTree === COMET_AUCTION_CONTRACT);

    if (!hasAuctionInput) {
      return null; // Not an auction transaction
    }

    // Look for the winner output (should be output 1 in auto-distribute)
    // Winner output is NOT the auction contract, NOT the dev address
    const ownerAddress = ErgoAddress.fromBase58(OWNER_PK).encode(getNetworkType());
    const botAddress = ErgoAddress.fromBase58(BOT_PK).encode(getNetworkType());

    let winnerOutput = null;
    let winnerAddress = "";

    // If there's a new auction output, this is auto-distribute
    if (hasAuctionOutput) {
      // Output 1 should be the winner
      winnerOutput = tx.outputs[1];
      winnerAddress = winnerOutput?.address || "";
    } else {
      // Manual claim: look for output that's not the dev
      for (const output of tx.outputs) {
        if (output.address !== ownerAddress && output.address !== botAddress) {
          winnerOutput = output;
          winnerAddress = output.address;
          break;
        }
      }
    }

    if (!winnerOutput || !winnerAddress) {
      return null;
    }

    // Skip if winner is the bot (genesis transaction)
    if (winnerAddress === botAddress) {
      return null;
    }

    // Extract COMET and ERG amounts from winner output
    const cometAsset = winnerOutput.assets?.find((a) => a.tokenId === COMET_TOKEN_ID);
    const cometWonRaw = cometAsset ? BigInt(cometAsset.amount) : 0n;
    const ergWonRaw = BigInt(winnerOutput.value);

    // Format amounts for display
    const cometWon = new BigNumber(cometWonRaw.toString())
      .dividedBy(new BigNumber(10).pow(COMET_DECIMALS))
      .toFormat(COMET_DECIMALS);

    const ergWon = new BigNumber(ergWonRaw.toString())
      .dividedBy(new BigNumber(10).pow(ERG_DECIMALS))
      .toFixed(3); // Show 3 decimals for ERG

    // Format timestamp
    const timestamp = new Date(tx.timestamp).toLocaleString();

    return {
      round: roundNumber,
      winner: winnerAddress,
      cometWon,
      ergWon,
      timestamp,
      txId: tx.transactionId,
      height: tx.inclusionHeight,
      cometWonRaw,
      ergWonRaw
    };
  } catch (error) {
    console.error("❌ Error parsing transaction:", tx.transactionId, error);
    return null;
  }
}

/**
 * Calculate statistics from winner records
 */
export function calculateStats(winners: WinnerRecord[]): WinnersStats {
  const totalCometRaw = winners.reduce((sum, w) => sum + w.cometWonRaw, 0n);
  const totalErgRaw = winners.reduce((sum, w) => sum + w.ergWonRaw, 0n);

  const totalCometVolume = new BigNumber(totalCometRaw.toString())
    .dividedBy(new BigNumber(10).pow(COMET_DECIMALS))
    .toFormat(COMET_DECIMALS);

  const totalErgVolume = new BigNumber(totalErgRaw.toString())
    .dividedBy(new BigNumber(10).pow(ERG_DECIMALS))
    .toFixed(3);

  const uniqueWinners = new Set(winners.map((w) => w.winner)).size;

  return {
    totalRounds: winners.length,
    totalCometVolume,
    totalErgVolume,
    uniqueWinners
  };
}

/**
 * Generate leaderboard of top winners
 */
export function generateLeaderboard(winners: WinnerRecord[]): LeaderboardEntry[] {
  const leaderboardMap = new Map<string, {
    totalWins: number;
    totalComet: bigint;
    totalErg: bigint;
    lastWinTimestamp: string;
  }>();

  // Aggregate wins by address
  for (const winner of winners) {
    const existing = leaderboardMap.get(winner.winner);
    if (existing) {
      existing.totalWins++;
      existing.totalComet += winner.cometWonRaw;
      existing.totalErg += winner.ergWonRaw;
      // Keep most recent timestamp
      if (new Date(winner.timestamp) > new Date(existing.lastWinTimestamp)) {
        existing.lastWinTimestamp = winner.timestamp;
      }
    } else {
      leaderboardMap.set(winner.winner, {
        totalWins: 1,
        totalComet: winner.cometWonRaw,
        totalErg: winner.ergWonRaw,
        lastWinTimestamp: winner.timestamp
      });
    }
  }

  // Convert to array and format
  const leaderboard: LeaderboardEntry[] = [];
  for (const [address, data] of leaderboardMap) {
    const totalComet = new BigNumber(data.totalComet.toString())
      .dividedBy(new BigNumber(10).pow(COMET_DECIMALS))
      .toFormat(COMET_DECIMALS);

    const totalErg = new BigNumber(data.totalErg.toString())
      .dividedBy(new BigNumber(10).pow(ERG_DECIMALS))
      .toFixed(3);

    leaderboard.push({
      address,
      totalWins: data.totalWins,
      totalComet,
      totalErg,
      lastWinTimestamp: data.lastWinTimestamp
    });
  }

  // Sort by total wins (descending), then by total ERG value
  leaderboard.sort((a, b) => {
    if (b.totalWins !== a.totalWins) {
      return b.totalWins - a.totalWins;
    }
    return parseFloat(b.totalErg) - parseFloat(a.totalErg);
  });

  return leaderboard;
}

/**
 * Filter winners by user addresses
 */
export function filterPersonalWins(winners: WinnerRecord[], userAddresses: string[]): WinnerRecord[] {
  if (userAddresses.length === 0) {
    return [];
  }

  return winners.filter((winner) => userAddresses.includes(winner.winner));
}
