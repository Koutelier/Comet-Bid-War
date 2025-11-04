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
  BOT_PK
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

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    await TransactionFactory.placeBid(
      auctionData.value.box as unknown as Box<Amount>,
      selectedBidType.value
    );

    successMessage.value = `Successfully placed ${selectedBidType.value.toUpperCase()} bid!`;

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("Error placing bid:", error);
    errorMessage.value = `Failed to place bid: ${error}`;
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

    await TransactionFactory.claimAuction(auctionData.value.box as unknown as Box<Amount>);

    successMessage.value = "Successfully claimed your winnings!";

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("Error claiming winnings:", error);
    errorMessage.value = `Failed to claim winnings: ${error}`;
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

    await TransactionFactory.startAuction();

    successMessage.value = "Auction started successfully! Let the degen bid war begin! 🚀";

    // Reload auction box after transaction
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("Error starting auction:", error);
    errorMessage.value = `Failed to start auction: ${error}`;
  } finally {
    loading.transaction = false;
  }
}
</script>

<template>
  <div class="auction-view">
    <div class="container mx-auto px-4 py-8">
      <h1 class="text-4xl font-bold mb-8 text-center">COMET Auction</h1>

      <!-- Debug Panel (ALWAYS shown when wallet connected - persistent) -->
      <div v-if="wallet.connected" class="card bg-base-300 shadow-xl mb-4 border-2 border-warning">
        <div class="card-body">
          <h3 class="card-title text-sm">🔧 Debug Info (Bot Detection)</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <strong>Connected:</strong> {{ wallet.connected ? '✅' : '❌' }}
            </div>
            <div>
              <strong>Loading Box:</strong> {{ loading.box ? '⏳' : '✅' }}
            </div>
            <div class="md:col-span-2">
              <strong>Change Address:</strong><br/>
              <span class="text-xs break-all bg-base-100 p-1 rounded">{{ wallet.changeAddress || 'N/A' }}</span>
            </div>
            <div class="md:col-span-2">
              <strong>Expected Bot PK:</strong><br/>
              <span class="text-xs break-all bg-base-100 p-1 rounded">{{ BOT_PK }}</span>
            </div>
            <div>
              <strong>Addresses Match:</strong> {{ wallet.changeAddress === BOT_PK ? '✅ YES' : '❌ NO' }}
            </div>
            <div>
              <strong>Is Bot Wallet:</strong>
              <span :class="isBotWallet ? 'text-success font-bold' : 'text-error font-bold'">
                {{ isBotWallet ? '✅ YES' : '❌ NO' }}
              </span>
            </div>
            <div class="md:col-span-2">
              <strong>All Used Addresses ({{ wallet.usedAddresses.length }}):</strong><br/>
              <div class="text-xs break-all bg-base-100 p-1 rounded max-h-20 overflow-y-auto">
                {{ wallet.usedAddresses.length > 0 ? wallet.usedAddresses.join('\n') : 'None loaded yet' }}
              </div>
            </div>
            <div>
              <strong>Has Auction Data:</strong> {{ auctionData ? '✅ YES' : '❌ NO' }}
            </div>
            <div>
              <strong>Can Start Auction:</strong>
              <span :class="canStartAuction ? 'text-success font-bold' : 'text-error font-bold'">
                {{ canStartAuction ? '✅ YES' : '❌ NO' }}
              </span>
            </div>
          </div>
          <div class="text-xs opacity-70 mt-2 border-t pt-2">
            💡 <strong>Tip:</strong> Open browser console (F12) for detailed logs on every state change
          </div>
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
              <div>
                <span
                  class="badge"
                  :class="{
                    'badge-success': auctionData.status === 'active',
                    'badge-error': auctionData.status === 'ended',
                    'badge-warning': auctionData.status === 'claimable'
                  }"
                >
                  {{ auctionData.status.toUpperCase() }}
                </span>
              </div>

              <!-- Time Remaining -->
              <div class="stat">
                <div class="stat-title">Time Remaining</div>
                <div class="stat-value text-2xl">{{ auctionData.timeRemaining }}</div>
                <div class="stat-desc">{{ auctionData.blocksRemaining }} blocks</div>
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
                    COMET ({{ formattedCometFee }})
                  </button>
                  <button
                    class="btn flex-1"
                    :class="{ 'btn-active': selectedBidType === 'erg' }"
                    @click="selectedBidType = 'erg'"
                  >
                    ERG ({{ formattedErgFee }})
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
                <span>Congratulations! You won the auction!</span>
              </div>

              <button
                class="btn btn-success btn-lg w-full"
                :disabled="!canClaim"
                @click="claimWinnings"
              >
                {{ loading.transaction ? "Processing..." : "Claim Winnings" }}
              </button>
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
