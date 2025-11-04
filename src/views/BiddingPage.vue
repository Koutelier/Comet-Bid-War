<script setup lang="ts">
import { GraphQLBoxQuery } from "@fleet-sdk/blockchain-providers";
import { Amount, Box, isEmpty } from "@fleet-sdk/common";
import { computed, reactive, ref, watch } from "vue";
import BigNumber from "bignumber.js";
import {
  COMET_ENTRY_FEE,
  ERG_ENTRY_FEE,
  COMET_DECIMALS,
  ERG_DECIMALS
} from "@/constants";
import { COMET_AUCTION_CONTRACT } from "@/offchain/plugins";
import { TransactionFactory } from "@/offchain/transactionFactory";
import { graphQLService } from "@/services/graphqlService";
import { useChainStore } from "@/stories";
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

// Watch for changes
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
      auctionData.value = null;
      return;
    }

    const box = stringifyBoxAmounts(boxes[0]);
    const tokenIds = box.assets.map((a) => a.tokenId);
    await chain.loadTokensMetadata(tokenIds);

    auctionData.value = parseAuctionBox(
      box,
      chain.tokensMetadata,
      chain.priceRates,
      chain.height,
      wallet.usedAddresses
    );
  } catch (error) {
    console.error("Error loading auction:", error);
    errorMessage.value = `Failed to load auction: ${error}`;
  } finally {
    loading.box = false;
  }
}

async function placeBid() {
  if (!auctionData.value) return;

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    await TransactionFactory.placeBid(
      auctionData.value.box as unknown as Box<Amount>,
      selectedBidType.value
    );

    successMessage.value = `🎉 Bid placed successfully! You're now in the lead!`;
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("Error placing bid:", error);
    errorMessage.value = `Failed to place bid: ${error}`;
  } finally {
    loading.transaction = false;
  }
}

const formattedCometFee = computed(() => formatCometAmount(BigNumber(COMET_ENTRY_FEE.toString())));
const formattedErgFee = computed(() => formatErgAmount(BigNumber(ERG_ENTRY_FEE.toString())));

const canBid = computed(() => {
  return (
    auctionData.value &&
    auctionData.value.status === "active" &&
    wallet.connected &&
    !loading.transaction
  );
});
</script>

<template>
  <div class="bidding-page min-h-screen bg-base-100">
    <div class="container mx-auto px-4 py-8 max-w-4xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-5xl font-bold mb-2">🔥 Degen Bid War</h1>
        <p class="text-xl opacity-80">Place your bid and win the pot!</p>
      </div>

      <!-- Messages -->
      <div v-if="errorMessage" class="alert alert-error mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="successMessage" class="alert alert-success mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>{{ successMessage }}</span>
      </div>

      <!-- Loading -->
      <div v-if="loading.box" class="flex justify-center items-center py-20">
        <div class="loading loading-spinner loading-lg"></div>
      </div>

      <!-- No Auction -->
      <div v-else-if="!auctionData" class="card bg-base-200 shadow-xl">
        <div class="card-body text-center">
          <h2 class="card-title justify-center text-2xl">⏳ No Active Auction</h2>
          <p class="text-lg">The auction hasn't started yet. Check back soon!</p>
        </div>
      </div>

      <!-- Active Auction -->
      <div v-else class="space-y-6">
        <!-- Prize Pool Display -->
        <div class="card bg-gradient-to-br from-primary to-secondary text-primary-content shadow-2xl">
          <div class="card-body">
            <h2 class="card-title justify-center text-3xl mb-4">💰 Current Prize Pool</h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- COMET Prize -->
              <div class="stat bg-base-100 text-base-content rounded-lg">
                <div class="stat-figure text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div class="stat-title">COMET Pot</div>
                <div class="stat-value text-2xl">{{ formatCometAmount(auctionData.cometPot.total) }}</div>
                <div class="stat-desc">Winner gets: {{ formatCometAmount(auctionData.winnerPrize.comet) }}</div>
              </div>

              <!-- ERG Prize -->
              <div class="stat bg-base-100 text-base-content rounded-lg">
                <div class="stat-figure text-secondary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                </div>
                <div class="stat-title">ERG Pot</div>
                <div class="stat-value text-2xl">{{ formatErgAmount(auctionData.ergPot.total) }}</div>
                <div class="stat-desc">Winner gets: {{ formatErgAmount(auctionData.winnerPrize.erg) }}</div>
              </div>
            </div>

            <!-- Total Value USD -->
            <div v-if="auctionData.totalValueUSD" class="text-center mt-4">
              <div class="text-sm opacity-70">Total Value</div>
              <div class="text-4xl font-bold">${{ auctionData.totalValueUSD.toFormat(2) }}</div>
            </div>
          </div>
        </div>

        <!-- Auction Status -->
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="text-lg font-semibold">⏱️ Time Remaining</h3>
                <p class="text-3xl font-bold">{{ auctionData.timeRemaining }}</p>
                <p class="text-sm opacity-70">{{ auctionData.blocksRemaining }} blocks</p>
              </div>
              <div class="text-right">
                <h3 class="text-lg font-semibold">👑 Current Leader</h3>
                <p class="text-sm font-mono break-all">{{ auctionData.lastBidder.substring(0, 20) }}...</p>
                <div v-if="auctionData.isUserLastBidder" class="badge badge-success mt-2">You're Winning! 🎉</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bidding Card -->
        <div class="card bg-base-300 shadow-2xl border-2 border-primary">
          <div class="card-body">
            <h2 class="card-title text-2xl mb-4">🎯 Place Your Bid</h2>

            <!-- Wallet Connection -->
            <div v-if="!wallet.connected" class="alert alert-warning">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>Connect your wallet to place a bid</span>
            </div>

            <div v-else-if="auctionData.status === 'active'" class="space-y-6">
              <!-- Bid Type Selection -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text text-lg font-semibold">Choose Your Bid Type</span>
                </label>
                <div class="grid grid-cols-2 gap-4">
                  <button
                    class="btn btn-lg"
                    :class="selectedBidType === 'comet' ? 'btn-primary' : 'btn-outline'"
                    @click="selectedBidType = 'comet'"
                  >
                    <div class="text-left">
                      <div class="text-sm opacity-70">Bid with</div>
                      <div class="text-xl font-bold">COMET</div>
                      <div class="text-sm">{{ formattedCometFee }}</div>
                    </div>
                  </button>
                  <button
                    class="btn btn-lg"
                    :class="selectedBidType === 'erg' ? 'btn-secondary' : 'btn-outline'"
                    @click="selectedBidType = 'erg'"
                  >
                    <div class="text-left">
                      <div class="text-sm opacity-70">Bid with</div>
                      <div class="text-xl font-bold">ERG</div>
                      <div class="text-sm">{{ formattedErgFee }}</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Bid Button -->
              <button
                class="btn btn-primary btn-lg w-full text-xl"
                :class="{ 'btn-disabled': !canBid }"
                :disabled="!canBid"
                @click="placeBid"
              >
                <span v-if="loading.transaction">
                  <span class="loading loading-spinner"></span>
                  Processing...
                </span>
                <span v-else>
                  🚀 Place {{ selectedBidType === 'comet' ? formattedCometFee + ' COMET' : formattedErgFee + ' ERG' }} Bid
                </span>
              </button>

              <!-- Info -->
              <div class="alert alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <div>
                  <div class="font-bold">Winner Takes 95%!</div>
                  <div class="text-sm">Your bid increases the pot. Last bidder when time runs out wins!</div>
                </div>
              </div>
            </div>

            <div v-else class="alert alert-warning">
              <span>This auction has ended. A new round will start soon.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bidding-page {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
}
</style>
