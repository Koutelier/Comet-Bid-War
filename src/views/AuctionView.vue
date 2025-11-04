<script setup lang="ts">
import { GraphQLBoxQuery } from "@fleet-sdk/blockchain-providers";
import { Amount, Box, isEmpty } from "@fleet-sdk/common";
import { computed, reactive, ref, watch } from "vue";
import BigNumber from "bignumber.js";
import {
  COMET_TOKEN_ID,
  ERG_TOKEN_ID,
  COMET_ENTRY_FEE,
  ERG_ENTRY_FEE,
  COMET_DECIMALS,
  ERG_DECIMALS
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
import { stringifyBoxAmounts } from "@/utils";

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
    const box = stringifyBoxAmounts(boxes[0]);

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
    console.error("Error loading auction box:", error);
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

const formattedCometFee = computed(() => formatCometAmount(BigNumber(COMET_ENTRY_FEE.toString())));
const formattedErgFee = computed(() => formatErgAmount(BigNumber(ERG_ENTRY_FEE.toString())));
</script>

<template>
  <div class="auction-view">
    <div class="container mx-auto px-4 py-8">
      <h1 class="text-4xl font-bold mb-8 text-center">COMET Auction</h1>

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
      <div v-else class="alert alert-warning">
        <span>No active auction found</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auction-view {
  min-height: calc(100vh - 4rem);
}
</style>
