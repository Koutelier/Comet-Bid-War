<script setup lang="ts">
import { GraphQLBoxQuery } from "@fleet-sdk/blockchain-providers";
import { Amount, Box, isEmpty } from "@fleet-sdk/common";
import { ErgoAddress } from "@fleet-sdk/core";
import { computed, reactive, ref, watch } from "vue";
import BigNumber from "bignumber.js";
import {
  COMET_TOKEN_ID,
  ERG_TOKEN_ID,
  COMET_ENTRY_FEE,
  ERG_ENTRY_FEE,
  COMET_DECIMALS,
  ERG_DECIMALS,
  BOT_PK,
  MIN_FEE
} from "@/constants";
import { COMET_AUCTION_CONTRACT } from "@/offchain/plugins";
import { TransactionFactory } from "@/offchain/transactionFactory";
import { graphQLService } from "@/services/graphqlService";
import { useChainStore, getAuctionContractAddress } from "@/stories";
import { useWalletStore } from "@/stories/walletStore";
import {
  parseAuctionBox,
  formatCometAmount,
  formatErgAmount,
  AuctionData
} from "@/utils/auctionUtils";
import { stringifyBoxAmounts, getNetworkType, decimalizeBigNumber } from "@/utils";

const chain = useChainStore();
const wallet = useWalletStore();

const auctionData = ref<AuctionData | null>(null);
const loading = reactive({ box: true, transaction: false });
const selectedBidType = ref<"comet" | "erg">("comet");
const errorMessage = ref<string>("");
const successMessage = ref<string>("");

// Watch for changes in blockchain height and wallet connection
watch(
  () => ({
    height: chain.height,
    walletConnected: wallet.connected
  }),
  async () => {
    await loadAuctionBox();
  },
  { immediate: true }
);

async function loadAuctionBox() {
  try {
    loading.box = true;
    errorMessage.value = "";

    const query: GraphQLBoxQuery = {
      where: {
        ergoTrees: [COMET_AUCTION_CONTRACT]
      }
    };

    const boxes = await graphQLService.getBoxes(query);

    if (isEmpty(boxes)) {
      errorMessage.value = "No active auction found. Please check contract deployment.";
      auctionData.value = null;
      return;
    }

    // Get the first box (there should only be one auction box at a time)
    const rawBox = boxes[0];
    const box = stringifyBoxAmounts(rawBox);

    // Load token metadata if needed
    const tokenIds = box.assets.map((a) => a.tokenId);
    await chain.loadTokensMetadata(tokenIds);

    // Parse auction box
    auctionData.value = parseAuctionBox(
      box,
      chain.tokensMetadata,
      chain.priceRates,
      chain.height,
      wallet.usedAddresses
    );
  } catch (error) {
    console.error("❌ Error loading auction box:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack');
    errorMessage.value = `Failed to load auction: ${error}`;
  } finally {
    loading.box = false;
  }
}

async function placeBid() {
  if (!auctionData.value) {
    return;
  }

  // Check wallet balance before attempting bid
  if (!wallet.connected) {
    errorMessage.value = "Please connect your wallet first";
    return;
  }

  // Validate sufficient balance
  const requiredAmount = selectedBidType.value === "comet" ? COMET_ENTRY_FEE : ERG_ENTRY_FEE;

  // Get wallet balance from wallet store (array of AssetInfo)
  const balance = wallet.balance;

  if (selectedBidType.value === "comet") {
    // Find COMET token in balance
    const cometAsset = balance.find((a) => a.tokenId === COMET_TOKEN_ID);
    const cometAmount = cometAsset ? cometAsset.amount : 0n;

    if (cometAmount < requiredAmount) {
      const formatted = formatCometAmount(decimalizeBigNumber(BigNumber(requiredAmount.toString()), COMET_DECIMALS));
      errorMessage.value = `Insufficient COMET balance. You need ${formatted} COMET to bid.`;
      return;
    }
  } else {
    // Find ERG in balance (tokenId is "ERG")
    const ergAsset = balance.find((a) => a.tokenId === ERG_TOKEN_ID);
    const ergAmount = ergAsset ? ergAsset.amount : 0n;
    const totalRequired = requiredAmount + MIN_FEE; // Include transaction fee

    if (ergAmount < totalRequired) {
      const formatted = formatErgAmount(decimalizeBigNumber(BigNumber(totalRequired.toString()), ERG_DECIMALS));
      errorMessage.value = `Insufficient ERG balance. You need at least ${formatted} ERG (including transaction fee).`;
      return;
    }
  }

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    console.log(`🎯 Placing ${selectedBidType.value.toUpperCase()} bid...`);

    await TransactionFactory.placeBid(
      auctionData.value.box as unknown as Box<Amount>,
      selectedBidType.value
    );

    successMessage.value = `🎉 Successfully placed ${selectedBidType.value.toUpperCase()} bid! You're now in the lead!`;

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("❌ Error placing bid:", error);

    // Extract readable error message
    const errorMsg = (error as any)?.info || (error as any)?.message || String(error);
    errorMessage.value = `Failed to place bid: ${errorMsg}`;
  } finally {
    loading.transaction = false;
  }
}

async function claimWinnings() {
  if (!auctionData.value) {
    return;
  }

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    console.log("🎁 Claiming winnings...");

    await TransactionFactory.claimAuction(auctionData.value.box as unknown as Box<Amount>);

    successMessage.value = "🎉 Successfully claimed your winnings! Congratulations!";

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("❌ Error claiming winnings:", error);
    const errorMsg = (error as any)?.info || (error as any)?.message || String(error);
    errorMessage.value = `Failed to claim winnings: ${errorMsg}`;
  } finally {
    loading.transaction = false;
  }
}

const bidButtonText = computed(() => {
  if (loading.transaction) {
    return "Processing...";
  }
  const cometFee = formatCometAmount(BigNumber(COMET_ENTRY_FEE.toString()));
  const ergFee = formatErgAmount(BigNumber(ERG_ENTRY_FEE.toString()));
  return `Bid ${selectedBidType.value === "comet" ? cometFee : ergFee} ${selectedBidType.value.toUpperCase()}`;
});

const canBid = computed(() => {
  return (
    auctionData.value &&
    auctionData.value.status === "active" &&
    wallet.connected &&
    !loading.transaction
  );
});

const canClaim = computed(() => {
  return (
    auctionData.value &&
    auctionData.value.status === "claimable" &&
    auctionData.value.isUserLastBidder &&
    wallet.connected &&
    !loading.transaction
  );
});

const formattedCometFee = computed(() =>
  formatCometAmount(decimalizeBigNumber(BigNumber(COMET_ENTRY_FEE.toString()), COMET_DECIMALS))
);
const formattedErgFee = computed(() =>
  formatErgAmount(decimalizeBigNumber(BigNumber(ERG_ENTRY_FEE.toString()), ERG_DECIMALS))
);

// Check if the connected wallet is the bot wallet
const isBotWallet = computed(() => {
  if (!wallet.connected) {
    return false;
  }

  // Check if changeAddress or any usedAddress matches BOT_PK
  const addresses = [
    wallet.changeAddress,
    ...wallet.usedAddresses
  ].filter(addr => addr); // Remove undefined/empty

  return addresses.some(addr => addr === BOT_PK);
});

// Check if we can start the auction (bot wallet + no auction exists)
const canStartAuction = computed(() => {
  return isBotWallet.value && !auctionData.value && !loading.box && !loading.transaction;
});

async function startAuction() {
  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    console.log("🚀 Starting auction...");

    await TransactionFactory.startAuction();

    successMessage.value = "🚀 Auction started successfully! Let the degen bid war begin!";

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("❌ Error starting auction:", error);
    const errorMsg = (error as any)?.info || (error as any)?.message || String(error);
    errorMessage.value = `Failed to start auction: ${errorMsg}`;
  } finally {
    loading.transaction = false;
  }
}

// Check if bot can auto-distribute (auction ended)
const canAutoDistribute = computed(() => {
  return (
    isBotWallet.value &&
    auctionData.value &&
    auctionData.value.status === "ended" &&
    !loading.transaction
  );
});

async function autoDistribute() {
  if (!auctionData.value) return;

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    console.log("🤖 Auto-distributing auction...");

    await TransactionFactory.autoDistributeAuction(
      auctionData.value.box as unknown as Box<Amount>
    );

    successMessage.value = "🎉 Auction distributed! Winner paid & new round started! 🚀";

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error: any) {
    console.error("❌ Error auto-distributing:", error);

    const errorMsg = error?.info || error?.message || String(error);
    errorMessage.value = `Failed to auto-distribute: ${errorMsg}`;
  } finally {
    loading.transaction = false;
  }
}
</script>

<template>
  <div class="auction-view">
    <div class="container mx-auto px-4 py-8">
      <h1 class="text-4xl font-bold mb-8 text-center">COMET Auction</h1>

      <!-- Bot Auto-Distribute Panel -->
      <div v-if="canAutoDistribute" class="card bg-gradient-to-r from-success to-info text-white shadow-2xl mb-4 border-4 border-success animate-pulse">
        <div class="card-body">
          <h3 class="card-title text-2xl">🤖 Bot Action Required</h3>
          <p class="text-lg">
            Auction has ended! Click below to distribute winnings to the winner and start a new round.
          </p>
          <button
            class="btn btn-success btn-lg w-full"
            :disabled="loading.transaction"
            @click="autoDistribute"
          >
            {{ loading.transaction ? "Processing..." : "🎉 Distribute & Start New Round" }}
          </button>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="errorMessage" class="alert alert-error mb-4">
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Success Message -->
      <div v-if="successMessage" class="alert alert-success mb-4">
        <span>{{ successMessage }}</span>
      </div>

      <!-- Loading State -->
      <div v-if="loading.box" class="flex justify-center items-center py-12">
        <div class="loading loading-spinner loading-lg"></div>
      </div>

      <!-- Auction Data -->
      <div v-else-if="auctionData" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Auction Status Card -->
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">Auction Status</h2>

            <div class="space-y-4">
              <!-- Status Badge -->
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="badge badge-lg"
                  :class="{
                    'badge-success': auctionData.status === 'active',
                    'badge-error': auctionData.status === 'ended',
                    'badge-warning': auctionData.status === 'claimable',
                    'badge-info': auctionData.status === 'grace_period',
                    'badge-secondary': auctionData.status === 'claimed'
                  }"
                >
                  {{ auctionData.status === 'grace_period' ? 'GRACE PERIOD' : auctionData.status.toUpperCase() }}
                </span>

                <!-- V3: Winner Claimed Status -->
                <span
                  v-if="auctionData.winnerClaimed"
                  class="badge badge-lg badge-success"
                >
                  ✅ Claimed
                </span>
                <span
                  v-else-if="auctionData.status === 'claimable' || auctionData.status === 'grace_period'"
                  class="badge badge-lg badge-error"
                >
                  🔴 Unclaimed
                </span>
              </div>

              <!-- V3: Bid Count -->
              <div class="stat bg-base-300 rounded-lg">
                <div class="stat-title">Bid Count</div>
                <div class="stat-value text-2xl">
                  {{ auctionData.bidCount }} / {{ auctionData.maxBids }}
                  <span v-if="auctionData.bidCount >= Math.floor(auctionData.maxBids * 0.9)" class="text-warning">⚠️</span>
                </div>
                <div class="stat-desc">
                  {{ Math.max(0, auctionData.maxBids - auctionData.bidCount) }} bids remaining
                </div>
              </div>

              <!-- Time Remaining -->
              <div class="stat bg-base-300 rounded-lg">
                <div class="stat-title">
                  {{ auctionData.status === 'active' ? 'Time Remaining' : 'Auction Ended' }}
                </div>
                <div class="stat-value text-2xl">{{ auctionData.timeRemaining }}</div>
                <div class="stat-desc">{{ auctionData.blocksRemaining }} blocks</div>
              </div>

              <!-- V3: Grace Period Countdown -->
              <div v-if="auctionData.status === 'grace_period'" class="stat bg-info text-info-content rounded-lg">
                <div class="stat-title">⏳ Grace Period</div>
                <div class="stat-value text-2xl">{{ auctionData.graceTimeRemaining }}</div>
                <div class="stat-desc">{{ auctionData.blocksUntilGraceEnd }} blocks until auto-claim</div>
              </div>

              <!-- V3: Time Since Last Bid -->
              <div v-if="auctionData.lastBidder" class="stat bg-base-300 rounded-lg">
                <div class="stat-title">Last Bid</div>
                <div class="stat-value text-lg">{{ auctionData.timeSinceLastBid }} ago</div>
                <div class="stat-desc">{{ auctionData.blocksSinceLastBid }} blocks ago</div>
              </div>

              <!-- Last Bidder -->
              <div>
                <div class="text-sm opacity-70">Last Bidder</div>
                <div class="font-mono text-xs break-all">
                  {{ auctionData.lastBidder || "No bids yet" }}
                </div>
                <div v-if="auctionData.isUserLastBidder" class="badge badge-success mt-2">
                  You are winning!
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Prize Pool Card -->
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">Prize Pool</h2>

            <div class="space-y-3">
              <!-- COMET Pot -->
              <div class="stat">
                <div class="stat-title">COMET Pot</div>
                <div class="stat-value text-xl">
                  {{ formatCometAmount(auctionData.cometPot.total) }}
                </div>
                <div class="stat-desc">
                  Winner gets: {{ formatCometAmount(auctionData.winnerPrize.comet) }}
                </div>
              </div>

              <!-- ERG Pot -->
              <div class="stat">
                <div class="stat-title">ERG Pot</div>
                <div class="stat-value text-xl">
                  {{ formatErgAmount(auctionData.ergPot.total) }}
                </div>
                <div class="stat-desc">
                  Winner gets: {{ formatErgAmount(auctionData.winnerPrize.erg) }}
                </div>
              </div>

              <!-- Total Value USD -->
              <div v-if="auctionData.totalValueUSD" class="stat">
                <div class="stat-title">Total Value</div>
                <div class="stat-value text-lg text-success">
                  ${{ auctionData.totalValueUSD.toFormat(2) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bidding Card -->
        <div class="card bg-base-200 shadow-xl lg:col-span-2">
          <div class="card-body">
            <h2 class="card-title">Place Your Bid</h2>

            <div v-if="!wallet.connected" class="alert alert-warning">
              <span>Please connect your wallet to place a bid</span>
            </div>

            <div v-else-if="auctionData.status === 'active'" class="space-y-4">
              <!-- V3: Dynamic Minimum Bid Display -->
              <div class="alert alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <div class="font-bold">Minimum Bid Requirements (10% of pot)</div>
                  <div class="text-sm">
                    <span class="font-mono">COMET: {{ auctionData.minCometBidFormatted }}</span> |
                    <span class="font-mono">ERG: {{ auctionData.minErgBidFormatted }}</span>
                  </div>
                </div>
              </div>

              <!-- Bid Type Selection -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text">Bid Type</span>
                </label>
                <div class="btn-group w-full">
                  <button
                    class="btn flex-1"
                    :class="{ 'btn-active': selectedBidType === 'comet' }"
                    @click="selectedBidType = 'comet'"
                  >
                    <div class="flex flex-col items-center">
                      <span>COMET</span>
                      <span class="text-xs opacity-70">Min: {{ auctionData.minCometBidFormatted }}</span>
                    </div>
                  </button>
                  <button
                    class="btn flex-1"
                    :class="{ 'btn-active': selectedBidType === 'erg' }"
                    @click="selectedBidType = 'erg'"
                  >
                    <div class="flex flex-col items-center">
                      <span>ERG</span>
                      <span class="text-xs opacity-70">Min: {{ auctionData.minErgBidFormatted }}</span>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Bid Button -->
              <button
                class="btn btn-primary btn-lg w-full"
                :disabled="!canBid"
                @click="placeBid"
              >
                {{ bidButtonText }}
              </button>
            </div>

            <div v-else-if="auctionData.status === 'claimable'" class="space-y-4">
              <div class="alert alert-success">
                <span>🎉 Congratulations! You won the auction!</span>
              </div>

              <button
                class="btn btn-success btn-lg w-full"
                :disabled="!canClaim"
                @click="claimWinnings"
              >
                {{ loading.transaction ? "Processing..." : "🎁 Claim Winnings" }}
              </button>
            </div>

            <!-- V3: Grace Period Status -->
            <div v-else-if="auctionData.status === 'grace_period'" class="space-y-4">
              <div v-if="auctionData.isUserLastBidder" class="alert alert-success">
                <div>
                  <div class="font-bold">🎉 You Won! Grace Period Active</div>
                  <div class="text-sm">Claim your winnings within {{ auctionData.graceTimeRemaining }} or it will be auto-distributed</div>
                </div>
              </div>
              <div v-else class="alert alert-info">
                <div>
                  <div class="font-bold">⏳ Grace Period Active</div>
                  <div class="text-sm">Winner has {{ auctionData.graceTimeRemaining }} to claim before auto-distribution</div>
                </div>
              </div>

              <button
                v-if="auctionData.isUserLastBidder"
                class="btn btn-success btn-lg w-full"
                :disabled="!canClaim"
                @click="claimWinnings"
              >
                {{ loading.transaction ? "Processing..." : "🎁 Claim Winnings Now" }}
              </button>
            </div>

            <!-- V3: Claimed Status -->
            <div v-else-if="auctionData.status === 'claimed'" class="alert alert-success">
              <div>
                <div class="font-bold">✅ Winner Claimed!</div>
                <div class="text-sm">This round has been completed. A new round should start soon.</div>
              </div>
            </div>

            <div v-else-if="auctionData.status === 'ended'" class="alert alert-info">
              <span>This auction has ended. A new round will start soon.</span>
            </div>
          </div>
        </div>
      </div>

      <!-- No Auction Found -->
      <div v-else class="max-w-2xl mx-auto">
        <!-- Bot Wallet Connected - Show Start Button -->
        <div v-if="isBotWallet" class="card bg-base-200 shadow-xl">
          <div class="card-body text-center">
            <h2 class="card-title justify-center text-2xl">🤖 Bot Wallet Detected</h2>
            <p class="text-lg mb-4">
              Ready to start the degen bid war? Click below to initialize the first auction!
            </p>

            <div class="stats stats-vertical lg:stats-horizontal shadow mb-4">
              <div class="stat">
                <div class="stat-title">Initial COMET</div>
                <div class="stat-value text-success">{{ formattedCometFee }}</div>
                <div class="stat-desc">Base amount</div>
              </div>

              <div class="stat">
                <div class="stat-title">Initial ERG</div>
                <div class="stat-value text-success">0.001</div>
                <div class="stat-desc">Base amount</div>
              </div>

              <div class="stat">
                <div class="stat-title">Auction Duration</div>
                <div class="stat-value text-primary">360</div>
                <div class="stat-desc">blocks (~12h)</div>
              </div>
            </div>

            <button
              class="btn btn-primary btn-lg w-full"
              :disabled="!canStartAuction"
              @click="startAuction"
            >
              {{ loading.transaction ? "Starting Auction..." : "🚀 Start Genesis Auction" }}
            </button>

            <div class="alert alert-info mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>Make sure you have at least 1 COMET token and 0.002 ERG (for box + tx fee)</span>
            </div>
          </div>
        </div>

        <!-- Regular User - Waiting for Auction -->
        <div v-else class="card bg-base-200 shadow-xl">
          <div class="card-body text-center">
            <h2 class="card-title justify-center text-2xl">🎯 Auction Not Started</h2>
            <p class="text-lg mb-4">
              The COMET auction hasn't been initialized yet. The bot will start it soon!
            </p>

            <div class="alert alert-warning">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>Check back soon or contact the team to start the first auction</span>
            </div>

            <div class="divider">Get Ready</div>

            <div class="text-left space-y-2">
              <p>📍 <strong>Entry Fees:</strong></p>
              <ul class="list-disc list-inside ml-4">
                <li>COMET Bid: {{ formattedCometFee }} COMET</li>
                <li>ERG Bid: {{ formattedErgFee }} ERG</li>
              </ul>
              <p class="mt-4">🏆 <strong>Winner Takes:</strong></p>
              <ul class="list-disc list-inside ml-4">
                <li>95% of the total pot (5% dev fee)</li>
                <li>Both COMET and ERG prizes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auction-view {
  min-height: calc(100vh - 4rem);
}
</style>
